/**
 * CopSystem — manages wanted level and cop vehicles.
 *
 * Three cop kinds:
 *   • 'pursuit-front'  — same direction as player, sits a few thousand
 *     units ahead, gravitates LATERALLY toward the player to set up PIT
 *     maneuvers and slow the player down so rear cops can close.
 *   • 'rear'           — same direction, behind player, ALWAYS closing
 *     the gap (constant +8% closing rate), tries to rear-end the player.
 *   • 'oncoming'       — head-on, travels in the OPPOSING direction
 *     (negative speed). Spawns in left lanes at 3★, all lanes at 4★+.
 *
 * Bust thresholds (any one trips it → BUSTED):
 *   • 5 rear-end bumps from 'rear' cops
 *   • 3 head-on collisions with 'oncoming' cops
 *   • 3 successful PIT maneuvers (alongside side-swipe by 'pursuit-front')
 *
 * Per-star spawn matrix:
 *   1★  → pursuit-front only
 *   2★  → + rear cops
 *   3★  → + oncoming cops (left lanes only)
 *   4★  → + oncoming cops (any lane, replacing traffic feel)
 *   5★  → all of the above at maximum density
 *
 * Top speed for every cop: COP_TOP_MPH (145).  Rear cops always close
 * unless the player is already faster than that ceiling.
 *
 * F12 tokens (f12_gun / f12_spike / f12_paint / f12_rocket → normalized):
 *   'gun'         — instantly removes one cop in front
 *   'spike_strip' — disables closest rear cop for 8s
 *   'paint_bomb'  — removes closest rear cop, −1 star
 *   'rocket'      — directional (forward / backward / auto), kills ≤4
 *   'grenade'     — kills nearest 3 cops
 *   'disguise'    — resets stars + cops entirely (hitchhiker reward)
 */
import {
  MAX_STARS, STAR_DECAY, MAX_SPEED, ROUTE_SEGS, SEG_LENGTH, TOTAL_ROUTE_MILES,
  COP_REAR_BUMPS_TO_ARREST,
  COP_HEADONS_TO_ARREST, COP_PITS_TO_ARREST, COP_TOP_MPH,
} from '../constants.js';
import { clamp } from '../utils/Helpers.js';
import { Difficulty } from './Difficulty.js';
import { TimeOfDay } from '../world/TimeOfDay.js';
import { Weather }   from '../world/Weather.js';

// Cop top speed in internal world units.  MAX_SPEED is the player's 120 mph
// reference, so 145/120 × MAX_SPEED is the cop's 145 mph cap.
const COP_TOP_UNITS    = MAX_SPEED * (COP_TOP_MPH / 120);
// How fast oncoming traffic closes on the player (negative-direction speed
// in the world frame).  ~70 mph relative to a stationary world.
const ONCOMING_UNITS   = MAX_SPEED * (70 / 120);

// Normalize raw sprite token names → internal names used in useF12Token
const TOKEN_MAP = {
  f12_gun:    'gun',
  f12_spike:  'spike_strip',
  f12_paint:  'paint_bomb',
  f12_rocket: 'rocket',
};

export class CopSystem {
  constructor() {
    this.stars         = 0;
    this.starTimer     = 0;
    this.cops          = [];
    this.f12Tokens     = [];
    // Gun ammunition pool — each pickup adds 6 bullets (cap 18 = 3 pickups
    // max).  The 'gun' token in f12Tokens is present whenever gunAmmo > 0;
    // each fire decrements ammo, and the token is removed when ammo hits 0.
    this.gunAmmo       = 0;
    this.lastStateLine = -1;

    this._spawnCooldown = 0;
    this._flashTimer    = 0;
    this.lightFlash     = false;

    // Arrest tracking — type-specific counters; any one tripping its
    // threshold sets arrestPending true.  bumpCount is the legacy generic
    // total still surfaced in the HUD ("BUMPS x/3" → "x/8" now).
    this.bumpCount       = 0;
    this.rearBumpCount   = 0;
    this.headOnCount     = 0;
    this.pitCount        = 0;
    this.arrestPending   = false;
  }

  /** Triggered by GameScene when the player passes a random roadside cop
   *  with stars ≥ 1.  Spawns a rear-pursuit cop closing in from behind so
   *  the encounter has consequence. */
  _spawnRearFromEncounter(playerPos) {
    this.cops.push({
      id:          Math.random(),
      position:    playerPos - (3000 + Math.random() * 3000),
      laneOffset:  (Math.random() - 0.5) * 0.6,
      speed:       MAX_SPEED * (COP_TOP_MPH / 120),
      baseSpeed:   MAX_SPEED * (COP_TOP_MPH / 120),
      side:        'rear',
      kind:        'rear',
      colorSet:    'police',
      color:       0xFFFFFF,
      alive:       true,
      spiked:      false,
      painted:     false,
      _closeFactor: 0.10 + Math.random() * 0.06,
      _laneDrift:   0.4  + Math.random() * 0.4,
    });
  }

  /** 5★ rolling barricade — 3 stationary cop cars across the road with a
   *  single-lane gap.  Player must thread the gap or take the slow penalty. */
  _spawnBarricade(playerPos) {
    // Position the row ~14k units ahead so the player has time to react.
    const rowZ = playerPos + 14000 + Math.random() * 4000;
    // Pick which lane is the GAP (one of -0.6, -0.2, +0.2, +0.6).
    const gapLanes = [-0.6, -0.2, 0.2, 0.6];
    const gapIdx   = (Math.random() * gapLanes.length) | 0;
    for (let i = 0; i < gapLanes.length; i++) {
      if (i === gapIdx) continue;
      this.cops.push({
        id:          Math.random(),
        position:    rowZ + (Math.random() - 0.5) * 80,    // tiny stagger
        laneOffset:  gapLanes[i],
        speed:       200,                                  // nearly stationary
        baseSpeed:   200,
        side:        'front',
        kind:        'barricade',
        colorSet:    'police',
        color:       0xFFFFFF,
        alive:       true,
        spiked:      false,
        painted:     false,
        _closeFactor: 0,
        _laneDrift:   0,
      });
    }
  }

  /** Pick one of the cop kinds appropriate for the current wanted level.
   *
   *  The proactive `pursuit-front` kind has been removed — same-direction
   *  cops AHEAD of the player only ever come from the random-roadside
   *  cops baked into the route (handled in GameScene).  This system now
   *  only spawns:
   *    1★  → no proactive spawns (pure random encounters drive pursuit)
   *    2★  → rear pursuit cops only (closing from behind)
   *    3★  → + oncoming-left
   *    4★+ → + oncoming-anywhere
   *  At 5★ barricades and the helicopter overlay layer on top. */
  _pickKind() {
    const s = this.stars;
    const r = Math.random();
    if (s < 2) return null;                          // no proactive spawn at 1★
    if (s < 3) return 'rear';                        // 2★ → rear-pursuit only
    if (s < 4) {
      return r < 0.55 ? 'rear' : 'oncoming-left';
    }
    // 4★+: SWAT vans join the mix (~30 % of spawns), they hit harder
    // and use a heavier sprite.  Rest splits between rear pursuit and
    // anywhere-oncoming standard cops.
    if (r < 0.30) return 'swat';
    if (r < 0.65) return 'rear';
    return 'oncoming-any';
  }

  _spawnCop(playerPos) {
    const kindRaw = this._pickKind();
    if (!kindRaw) return;                            // no proactive spawn at 1★
    const isSwat  = kindRaw === 'swat';
    // SWAT vans behave like rear pursuit (chase from behind) but use
    // the heavier 'swat' colorSet so _carTexKey resolves to the
    // car_back_swat / car_front_swat assets and so the damage path
    // can apply the ×2 multiplier.
    const kind    = (kindRaw.startsWith('oncoming')) ? 'oncoming'
                  : (isSwat ? 'rear' : kindRaw);
    let position, laneOffset, speed;

    if (kind === 'rear') {
      // Behind by 6-14k units.  Starts at full top speed so it visibly
      // closes the gap.
      position   = playerPos - (6000 + Math.random() * 8000);
      laneOffset = (Math.random() - 0.5) * 0.6;
      speed      = COP_TOP_UNITS;
    } else {
      // Oncoming — far ahead, will rocket toward the player.
      position   = playerPos + (16000 + Math.random() * 14000);
      if (kindRaw === 'oncoming-left') {
        laneOffset = -(0.30 + Math.random() * 0.50);
      } else {
        laneOffset = -0.80 + Math.random() * 1.50;
      }
      speed = -ONCOMING_UNITS;
    }

    this.cops.push({
      id:          Math.random(),
      position,
      laneOffset,
      speed,
      baseSpeed:   speed,
      side:        kind === 'rear' ? 'rear' : 'front',
      kind,
      colorSet:    isSwat ? 'swat' : 'police',         // drives texture + damage tier
      damageMul:   isSwat ? 2.0 : 1.0,                 // SWAT hits do 2× damage
      color:       0xFFFFFF,
      alive:       true,
      spiked:      false,
      painted:     false,
      _closeFactor: 0.06 + Math.random() * 0.06,
      _laneDrift:   0.4  + Math.random() * 0.4,
    });
  }

  addStar(amount = 1) {
    // Sex-worker dirt-on-a-politician buff: while starCapMax is set
    // and the player hasn't passed starCapEndPos yet, the wanted
    // level can't climb above the cap.
    const cap = (this.starCapMax != null) ? this.starCapMax : MAX_STARS;
    // Cocaine "sloppy" multiplier — GameScene stamps phys.cocaineStarMul
    // onto this._starGainMul each frame so we don't have to plumb the
    // multiplier through every addStar call site.
    const mul = this._starGainMul ?? 1;
    this.stars     = clamp(this.stars + amount * mul, 0, Math.min(MAX_STARS, cap));
    this.starTimer = 4;
  }

  /** Per-frame check by GameScene to expire the politician-dirt cap
   *  after the player has driven the buff distance. */
  tickStarCap(playerPos) {
    if (this.starCapEndPos != null && playerPos >= this.starCapEndPos) {
      this.starCapMax    = null;
      this.starCapEndPos = null;
    }
  }

  clearStarsAtStateLine() {
    // Graduated reduction based on current heat:
    //   5★ → 0 (helicopter overhead keeps the pursuit live — town-
    //          crossings don't help, only a paint job clears stars)
    //   4★ → 1
    //   3★ or less → 2 (legacy default)
    const cur = this.stars;
    const reduction = cur >= 4.5 ? 0
                    : cur >= 3.5 ? 1
                    :              2;
    this._lastStateLineReduction = reduction;
    this.stars         = Math.max(0, cur - reduction);
    this.starTimer     = 0;
    // Active cop chases are NOT wiped on a town crossing — the chase
    // persists.  The only exception: SWAT vans require 4★+ to spawn,
    // so if the post-reduction heat dropped below that threshold, any
    // SWAT vans currently in play disappear (they wouldn't be on the
    // road at this lower wanted level).  Regular police keep chasing.
    if (this.stars < 3.5) {
      this.cops = this.cops.filter(c => c.colorSet !== 'swat');
    }
    this.bumpCount     = 0;
    this.rearBumpCount = 0;
    this.headOnCount   = 0;
    this.pitCount      = 0;
    this.arrestPending = false;
  }

  // Generic bump tracker — kept for the per-type registers below to
  // increment the total bump tally.  Legacy COP_BUMPS_TO_ARREST check
  // removed; the per-type counters (rear/headOn/PIT) are authoritative.
  registerBump() {
    this.bumpCount++;
    return this.bumpCount;
  }

  /** A 'rear' cop slammed into the back of the player.  5 = BUSTED. */
  registerRearBump() {
    this.rearBumpCount++;
    if (this.rearBumpCount >= COP_REAR_BUMPS_TO_ARREST) this.arrestPending = true;
    return this.rearBumpCount;
  }

  /** Player hit an 'oncoming' cop head-on.  3 = BUSTED. */
  registerHeadOn() {
    this.headOnCount++;
    if (this.headOnCount >= COP_HEADONS_TO_ARREST) this.arrestPending = true;
    return this.headOnCount;
  }

  /** A 'pursuit-front' cop landed a PIT (alongside side-swipe).  3 = BUSTED. */
  registerPit() {
    this.pitCount++;
    if (this.pitCount >= COP_PITS_TO_ARREST) this.arrestPending = true;
    return this.pitCount;
  }

  // Call after handling an arrest.  Wanted level fully resets to 0 — once
  // the player has done their time, the slate is clean.
  clearArrest() {
    this.arrestPending  = false;
    this.bumpCount      = 0;
    this.rearBumpCount  = 0;
    this.headOnCount    = 0;
    this.pitCount       = 0;
    this.cops           = [];
    this.stars          = 0;
    this.starTimer      = 0;
    this._spawnCooldown = 8;
  }

  addF12Token(rawType) {
    const type = TOKEN_MAP[rawType] ?? rawType;
    if (!this.canCarryMore(type)) return;
    if (type === 'gun') {
      // Each gun pickup grants 6 bullets up to a cap of 18.  The token
      // is present whenever gunAmmo > 0 (driven by the inventory render).
      this.gunAmmo = Math.min(18, this.gunAmmo + 6);
      if (!this.f12Tokens.includes('gun')) this.f12Tokens.push('gun');
      return;
    }
    this.f12Tokens.push(type);
  }

  /** Per-type cap.  Gun caps at 18 bullets (= 3 pickups); other types
   *  cap at 3 tokens. */
  canCarryMore(type) {
    if (type === 'gun') return this.gunAmmo < 18;
    let count = 0;
    for (const t of this.f12Tokens) if (t === type) count++;
    return count < 3;
  }

  /** Inventory count surfaced in the HUD.  Gun returns its ammo total
   *  (so the badge reads ×6/×12/×18); other types return their stack size. */
  countOf(type) {
    if (type === 'gun') return this.gunAmmo;
    let n = 0;
    for (const t of this.f12Tokens) if (t === type) n++;
    return n;
  }

  useF12Token(type, playerPos = 0, direction = 'auto', traffic = null) {
    // Each fire consumes one token / one bullet in scored modes.  In
    // custom (sandbox) mode weapons are infinite — neither tokens nor
    // ammo are decremented, so the player can keep firing without
    // picking up resupply.  Heat (25% star roll per fire) is added
    // at the GameScene call site.
    const isCustom = Difficulty.mode?.() === 'custom';
    if (type === 'gun') {
      if (!isCustom) {
        if (this.gunAmmo <= 0) return { ok: false, victims: [], weapon: type };
        this.gunAmmo--;
        if (this.gunAmmo === 0) {
          const i = this.f12Tokens.indexOf('gun');
          if (i !== -1) this.f12Tokens.splice(i, 1);
        }
      } else if (!this.f12Tokens.includes('gun')) {
        // Sandbox safety — gun must always be in the inventory for
        // the HUD to show the slot.  Re-add if it was somehow stripped.
        this.f12Tokens.push('gun');
      }
    } else {
      const idx = this.f12Tokens.indexOf(type);
      if (idx === -1) return { ok: false, victims: [], weapon: type };
      if (!isCustom) this.f12Tokens.splice(idx, 1);
    }

    // Build a unified pool of targets across cops + traffic so every weapon
    // (except spike strips) can affect either kind of car uniformly.
    const pool = [];
    for (const c of this.cops)              pool.push({ obj: c, src: this.cops });
    if (traffic) for (const t of traffic)   pool.push({ obj: t, src: traffic });

    // Capture each victim's position + lane before splicing so the
    // caller (GameScene) can project them to screen space and spawn
    // explosions / wreck-spins / gunshot stars at the right spot.
    const victims = [];
    const removeAll = (entries) => {
      let copKills = 0;
      for (const { obj, src } of entries) {
        victims.push({
          position:   obj.position,
          laneOffset: obj.laneOffset,
          isCop:      src === this.cops,
          colorSet:   obj.colorSet ?? null,
          texColor:   obj.color ?? 0xFFFFFF,
        });
        const i = src.indexOf(obj);
        if (i !== -1) src.splice(i, 1);
        if (src === this.cops) copKills++;
      }
      return copKills;
    };

    const inDirection = (rel, side) =>
      side === 'backward' ? (rel < 0) : (rel > 0);

    switch (type) {
      case 'gun': {
        // Forward OR backward burst — up to 3 cars within 8000 units in the
        // chosen direction.  Cops AND civilian traffic both get hit.
        const side = direction === 'backward' ? 'backward' : 'forward';
        const targets = pool
          .filter(({ obj }) => {
            const rel = obj.position - playerPos;
            return inDirection(rel, side) && Math.abs(rel) < 8000;
          })
          .sort((a, b) =>
            Math.abs(a.obj.position - playerPos) - Math.abs(b.obj.position - playerPos))
          .slice(0, 3);
        const copKills = removeAll(targets);
        this.bumpCount = Math.max(0, this.bumpCount - copKills);
        break;
      }

      case 'spike_strip': {
        // Spike strip wipes EVERY cop behind the player — no range cap,
        // no 8-second crawl, no survivors.  Drops the rear pursuit
        // completely in one drop.  Civilian traffic behind the player
        // is also pulled over.
        const targets = pool.filter(({ obj }) =>
          (obj.position - playerPos) < 0);
        const copKills = removeAll(targets);
        this.bumpCount     = Math.max(0, this.bumpCount - copKills);
        this.rearBumpCount = 0;
        break;
      }

      case 'paint_bomb': {
        // Paint bomb has a tight 50-foot radius (≈ 3000 world units).
        // Fires forward or backward and removes EVERY car (cop or
        // civilian) inside that bubble — no cap.
        const side = direction === 'backward' ? 'backward' : 'forward';
        const RADIUS = 3000;
        const targets = pool.filter(({ obj }) => {
          const rel = obj.position - playerPos;
          return inDirection(rel, side) && Math.abs(rel) < RADIUS;
        });
        const copKills = removeAll(targets);
        this.stars     = Math.max(0, this.stars - 1);
        this.bumpCount = Math.max(0, this.bumpCount - copKills);
        break;
      }

      case 'rocket': {
        // Directional rocket — wipes EVERY car on the chosen side (no
        // cap).  Auto picks whichever side has more targets.
        let side = direction;
        if (side !== 'forward' && side !== 'backward') {
          let front = 0, rear = 0;
          for (const { obj } of pool) {
            if (obj.position - playerPos > 0) front++; else rear++;
          }
          side = front >= rear ? 'forward' : 'backward';
        }
        const targets = pool.filter(({ obj }) =>
          inDirection(obj.position - playerPos, side));
        removeAll(targets);
        this.stars     = Math.max(0, this.stars - 2);
        this.bumpCount = 0;
        this.arrestPending = false;
        break;
      }

      case 'grenade': {
        // Forward OR backward toss — wipes EVERY car on the chosen side.
        const side = direction === 'backward' ? 'backward' : 'forward';
        const targets = pool.filter(({ obj }) =>
          inDirection(obj.position - playerPos, side));
        const copKills = removeAll(targets);
        this.bumpCount = Math.max(0, this.bumpCount - copKills);
        this.stars     = Math.max(0, this.stars - 1);
        break;
      }

      case 'disguise':
        this.stars     = 0;
        this.starTimer = 0;
        this.cops      = [];
        // Zero EVERY bump-counter family — without this, a player who
        // racked 4/5 rear bumps, hit disguise, and took one more rear
        // bump would BUST instantly with no warning.  Disguise is a
        // hard cleanse, so it must reset all four counters.
        this.bumpCount     = 0;
        this.rearBumpCount = 0;
        this.headOnCount   = 0;
        this.pitCount      = 0;
        this.arrestPending = false;
        break;
    }
    // Returns the victim list so GameScene can spawn per-car FX.
    return { ok: true, victims, weapon: type };
  }

  update(dt, playerPos, playerSpeed, playerX = 0) {
    this._flashTimer += dt;
    if (this._flashTimer > 0.25) { this._flashTimer = 0; this.lightFlash = !this.lightFlash; }

    // Bump auto-reset — keeps stale bump counts from old chases from
    // surprising the player with a phantom BUST.
    if (this.cops.length === 0) {
      this._copFreeTime = (this._copFreeTime ?? 0) + dt;
      if (this._copFreeTime > 20) {
        if (this.bumpCount > 0)     this.bumpCount     = 0;
        if (this.rearBumpCount > 0) this.rearBumpCount = 0;
        if (this.headOnCount > 0)   this.headOnCount   = 0;
        if (this.pitCount > 0)      this.pitCount      = 0;
        this.arrestPending = false;
      }
    } else {
      this._copFreeTime = 0;
    }

    if (this.stars > 0) {
      this.starTimer -= dt;
      // One full star decays per minute of real time — 1★ in 60s,
      // 2★ in 120s, up to 4★ in 240s.  5★ is the exception: helicopter
      // is overhead and the wanted level is LOCKED.  Only a rest-stop
      // paint job (`clearStars`) drops the player out of 5★.
      if (this.starTimer <= 0 && !this.helicopterActive) {
        this.stars = Math.max(0, this.stars - dt / 60);
        if (this.stars < 0.5) {
          this.bumpCount = this.rearBumpCount = this.headOnCount = this.pitCount = 0;
          this.arrestPending = false;
        }
      }
    }

    // Spawning — proactive spawns only kick in at 2★+ (rear pursuit and
    // higher).  At 1★ the only way cops show up is via the random-roadside
    // encounters baked into the route (GameScene handles that path).
    // Difficulty.copEscalationMul scales BOTH the active-cop cap and the
    // spawn cooldown — Easy 0.7× cops + slower respawn, Hard 1.5× cops +
    // faster respawn.  TimeOfDay.darkness() adds an extra +30% at full
    // night (graveyard-shift cops are out in force).
    this._spawnCooldown -= dt;
    const escMul = Difficulty.copEscalationMul();
    const _mileForCops = (playerPos / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const nightMul = 1 + TimeOfDay.darkness(_mileForCops) * 0.30;
    const cap = Math.max(2, Math.ceil(this.stars * 2 * escMul * nightMul));
    if (this.stars >= 2 && this._spawnCooldown <= 0 && this.cops.length < cap) {
      this._spawnCop(playerPos);
      this._spawnCooldown = Math.max(0.8, (5.5 - this.stars * 0.9) / (escMul * nightMul));
    }

    // ── 5★ extras: barricades + helicopter ─────────────────────────
    // At max wanted level the highway gets cluttered with rolling
    // road-block formations and a permanent chopper overhead.
    this._barricadeCooldown = (this._barricadeCooldown ?? 0) - dt;
    if (this.stars >= 5 && this._barricadeCooldown <= 0) {
      this._spawnBarricade(playerPos);
      this._barricadeCooldown = 6 + Math.random() * 4;   // every 6-10 sec
    }
    // Single helicopter that lives as long as we're at 5★.
    // Threshold 4.75 (was 4.5): a fractional star bump that landed on
    // exactly 4.5 used to lock the player out of decay forever — the
    // decay branch is gated by !helicopterActive AND helicopterActive
    // only flips off below 4.5, leaving a one-sided stuck state.  By
    // tightening to 4.75 the chopper still locks the player at "true 5★"
    // (display rounds up) while leaving the 4.5/4.75 band decay-able.
    this.helicopterActive = this.stars >= 4.75;
    if (this.helicopterActive) {
      this.helicopterPos     = playerPos + 1500;          // visually ahead-above
      this.helicopterPhase   = (this.helicopterPhase ?? 0) + dt;
    }

    // Drive each cop's behavior by its kind.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      const dist  = cop.position - playerPos;
      const aDist = Math.abs(dist);

      // Disabled overrides — spike-strip stops the car flat for 8s, EMP for
      // a custom timer.
      if (cop.empTimer > 0) {
        cop.empTimer -= dt; cop.speed = 0;
      } else if (cop.spiked) {
        cop.speed = 40;
      } else {
        switch (cop.kind) {
          case 'rear': {
            // ALWAYS closing while behind — but once alongside or ahead,
            // throttle back to the player's pace so we stick to them
            // instead of zooming off into the distance.  The previous
            // "always playerSpeed + closing" formula made cops sail past
            // the player and despawn off-screen, leaving the chase blank.
            const closing = Math.max(playerSpeed * 0.10, 600);
            if (dist > 0) {
              // Cop is AHEAD of player — slow down so the player either
              // catches up or the cop drifts back into PIT range.
              cop.speed = Math.max(0, playerSpeed * 0.92);
            } else if (aDist < 1500) {
              // Alongside / very close behind — match player speed with a
              // tiny forward bias to keep PIT pressure on.
              cop.speed = playerSpeed + 200;
            } else {
              // Far behind — full closing rate.
              cop.speed = Math.min(COP_TOP_UNITS, playerSpeed + closing);
            }
            // Once alongside the player, hold the lateral position so PIT
            // detection in GameScene can fire on side-swipe contact.
            // Pass-3: cops feel weather grip too — on snow/rain they
            // close the lateral gap slower (and thus PIT slower), giving
            // the player a real evasion window in bad weather.
            if (aDist < 800) {
              const _copMile = (cop.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
              const _copGrip = Weather.gripMul?.(_copMile) ?? 1;
              const dx = playerX - cop.laneOffset;
              cop.laneOffset += Math.sign(dx) * Math.min(0.6, Math.abs(dx)) * dt * _copGrip;
              // PIT-arming — sustained alongside lock at close range arms
              // the cop so the next side contact registers as a successful
              // PIT (= BUSTED).  Was previously only on pursuit-front; now
              // belongs on rear cops since pursuit-front is gone.
              const lateralLock = Math.abs(playerX - cop.laneOffset) < 0.18;
              if (lateralLock) {
                cop._pitProgress = (cop._pitProgress ?? 0) + dt;
                if (cop._pitProgress > 0.65) cop._pitArmed = true;
              } else {
                cop._pitProgress = Math.max(0, (cop._pitProgress ?? 0) - dt * 1.4);
                if (cop._pitProgress <= 0) cop._pitArmed = false;
              }
            } else {
              cop._pitProgress = 0;
              cop._pitArmed    = false;
            }
            break;
          }
          case 'oncoming': {
            // Head-on traffic — fixed negative-direction speed.  No lane
            // gravitation; drivers are barreling past, not actively chasing.
            cop.speed = -ONCOMING_UNITS;
            break;
          }
          case 'barricade': {
            // Stationary blockade — cops park across lanes.  Slight crawl
            // forward so they don't appear bolted to the asphalt.
            cop.speed = 200;
            break;
          }
          default:
            cop.speed = playerSpeed;
        }
      }
      cop.position += cop.speed * dt;

      // Despawn rules — different per kind.
      if (cop.kind === 'oncoming') {
        if (dist < -2500) this.cops.splice(i, 1);
      } else if (cop.kind === 'rear') {
        if (dist < -10000 || dist > 30000) this.cops.splice(i, 1);
      } else if (cop.kind === 'barricade') {
        // Once player blows past the barricade, drop it.
        if (dist < -2500) this.cops.splice(i, 1);
      } else {
        if (dist < -3000  || dist > 80000) this.cops.splice(i, 1);
      }
    }
  }

  // Closest cop matching `side` ('front' | 'rear' | 'any').
  _closestCop(playerPos, side = 'any') {
    let best = null, bestDist = Infinity;
    for (const cop of this.cops) {
      if (!cop.alive) continue;
      const rel = cop.position - playerPos;
      if (side === 'front' && rel <= 0) continue;
      if (side === 'rear'  && rel >= 0) continue;
      const d = Math.abs(rel);
      if (d < bestDist) { best = cop; bestDist = d; }
    }
    return best;
  }

  getCopsForRender(playerPos) {
    // Front cops render via the road's vehicle projection; rear cops are
    // shown by GameScene as a "PURSUIT" indicator (see _renderHUD) since
    // the pseudo-3D camera can't display anything behind the player.
    return this.cops
      .map(cop => ({
        relativePos: cop.position - playerPos,
        laneOffset:  cop.laneOffset,
        color:       cop.color,
        side:        cop.side,
        kind:        cop.kind,
        colorSet:    cop.colorSet,
        speed:       cop.speed,
        flash:       this.lightFlash,
      }))
      .filter(c => c.relativePos > 0 && c.relativePos < 50000);
  }

  // Rear cops aren't visible in pseudo-3D; expose count + nearest distance.
  getRearCopInfo(playerPos) {
    let count = 0, nearest = -Infinity;
    for (const cop of this.cops) {
      const rel = cop.position - playerPos;
      if (rel < 0) {
        count++;
        if (rel > nearest) nearest = rel;
      }
    }
    return { count, nearestRelZ: count ? nearest : null };
  }

  // Display the floor — a star only appears once it's been fully earned.
  // Was Math.ceil, which made the HUD jump to "2" the instant raw stars
  // crossed 1.0 + a fractional heat tick.
  get starDisplay() { return Math.floor(this.stars); }
}
