/**
 * DrugSystem — tracks active drug levels, unlocks, OD state
 *
 * Each drug has a level 0–1.
 * Level fills on pickup, decays over time.
 * At threshold: OD triggers (game over for most drugs).
 * Weed is the exception — cannot OD, just makes you very slow.
 *
 * Unlock tree (checked each update):
 *   cocaine   → alcohol > 0.3 for > 30s total
 *   shrooms   → alcohol > 0.4 AND weed > 0.4 simultaneously
 *   lsd       → shrooms bar ever reached >= 0.75
 *   heroin    → distance > 50% of route
 *   rx        → cocaine > 0.5 (simulates "calming down")
 *   fentanyl  → heroin bar ever reached >= 0.6
 *   ketamine  → lsd bar ever reached >= 0.5
 */
import { DRUGS, DRUG_CONFIG, DRUG_COMBOS } from '../constants.js';
import { Difficulty } from './Difficulty.js';

// Pickup amounts — per the user's drug-design spec.  Hits-to-max varies
// wildly by drug: 14 beers vs 2 fentanyl, etc.  Many drugs also trigger
// cross-drug or per-pickup effects (see DrugSystem.pickup + GameScene).
const PICKUP_AMOUNTS = {
  alcohol:  0.07,    // 7%  — slow build-up of double-vision + swerves
  weed:     0.125,   // 12.5% base; tolerance kicks in past 60%
  cocaine:  0.10,    // 10%
  shrooms:  0.20,    // 20% — fastest visual ramp
  lsd:      0.25,    // 25% — fastest of all
  heroin:   0.30,    // 30%
  rx:       0.085,   // 8.5%
  fentanyl: 0.55,    // 55% — 2 hits OD at ≥1.00
  ketamine: 0.10,    // 10%
  meth:     0.10,    // 10%
};

export class DrugSystem {
  constructor() {
    this.levels    = {};
    this.unlocked  = {};
    this.maxReached = {}; // highest level each drug has ever reached

    // Unlock tracking
    this.totalDrunkTime   = 0;
    this.routeProgress    = 0; // 0–1, updated by GameScene
    // Lifetime NPC-crash counter — feeds the rx unlock gate.
    this.npcCrashesTotal   = 0;
    this.cocainePickupCount = 0; // each pickup permanently raises top speed +4 mph
    this.pickupCounts       = {};
    // Active-combo timestamp tracker — initialised here so getActiveCombos
    // doesn't have to lazy-init on first call (audit caught this).
    this._comboActivatedAt  = {};
    for (const id of Object.values(DRUGS)) this.pickupCounts[id] = 0;

    for (const id of Object.values(DRUGS)) {
      this.levels[id]     = 0;
      this.unlocked[id]   = DRUG_CONFIG[id].unlocked ?? false;
      this.maxReached[id] = 0;
    }
  }

  /** Hydrate persistent unlock state from prior runs (registry-backed).
   *  Once unlocked, drugs stay unlocked through arrests/deaths until the
   *  player ends the game. */
  hydrateUnlocks(savedUnlocks) {
    if (!savedUnlocks || typeof savedUnlocks !== 'object') return;
    for (const id of Object.keys(savedUnlocks)) {
      if (savedUnlocks[id]) this.unlocked[id] = true;
    }
  }

  /** Snapshot current unlocked state — caller stashes into the registry. */
  snapshotUnlocks() {
    return { ...this.unlocked };
  }

  /** Restore meta-progress that gates partial unlocks across scene
   *  restarts.  Right now this is just the meth Phase-1 flag (cocaine has
   *  ever peaked ≥0.40) — without this, taking a rest stop after a coke
   *  spike resets the gate and the player can never get to Phase 2's
   *  30-second clean window. */
  hydrateProgress(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (saved.methPhase1) this._methPhase1 = true;
    if (typeof saved.cocainePeak === 'number') {
      this.maxReached[DRUGS.COCAINE] = Math.max(
        this.maxReached[DRUGS.COCAINE] ?? 0, saved.cocainePeak);
    }
  }

  /** Snapshot meta-progress for the registry. */
  snapshotProgress() {
    return {
      methPhase1:  !!this._methPhase1,
      cocainePeak: this.maxReached[DRUGS.COCAINE] ?? 0,
    };
  }

  /** Top up every unlocked drug bar to a safe 60% — keeps the player from
   *  walking out of a rest stop into an instant fent OD.  Bars already
   *  above 60% are left alone. */
  refillAll() {
    const CAP = 0.60;
    for (const id of Object.values(DRUGS)) {
      if (!this.unlocked[id]) continue;
      // Don't dial back a player who's already higher than the cap.
      if ((this.levels[id] ?? 0) >= CAP) continue;
      this.levels[id] = CAP;
      if (CAP > this.maxReached[id]) this.maxReached[id] = CAP;
    }
  }

  update(dt) {
    let anyActive = false;
    const cokeLevel = this.levels[DRUGS.COCAINE] ?? 0;
    // Custom mode — drug levels are user-set sandbox values, so they
    // hold steady (no decay).  Still tally maxReached + anyActive so
    // bar rendering and combo detection work normally.
    const noDecay = Difficulty.noScore?.() === true;
    // Permastoned hold — once the weed bar hits 100% it should freeze
    // there until the 10-mile timer trips.  We can't gate on
    // `_weedAt100StartPos` because that field is populated by
    // `notePermastonedTick`, which runs AFTER `update()` — so on the
    // first frame at 100% the decay would shave the bar back below 1.0
    // before the timer could even start.  Gate purely on the bar level.
    const weedPermastonedActive = (this.levels[DRUGS.WEED] ?? 0) >= 1.0
      && !this._weedPermastonedLocked;

    for (const id of Object.values(DRUGS)) {
      const cfg   = DRUG_CONFIG[id];
      const level = this.levels[id];

      if (level > 0) {
        anyActive = true;
        if (level > this.maxReached[id]) this.maxReached[id] = level;
        // Custom mode freezes every bar — no decay, no metabolism.
        if (noDecay) continue;
        // Weed bar holds at 100% during the Permastoned window — no decay
        // until the 10-mi mark trips and the bar is force-reset to 0.
        if (id === DRUGS.WEED && weedPermastonedActive) continue;
        let decay = cfg.decayRate;
        // Alcohol asymmetric decay — first 50 % of the bar sticks around
        // (decay ×0.6) so it's easy to stay tipsy; above 50 % the body
        // burns it off faster (decay ramps up to ×2.5 at full bar) so
        // extreme drunkenness wears off quickly.  Net: easier to reach
        // and maintain a buzz, harder to stay maxed.
        if (id === DRUGS.ALCOHOL) {
          if (level <= 0.5) {
            decay *= 0.6;
          } else {
            const t = (level - 0.5) / 0.5;        // 0 at 50 %, 1 at 100 %
            decay *= 0.6 + (2.5 - 0.6) * t;       // 0.6 → 2.5
          }
        }
        // Cocaine speeds up alcohol metabolism (~2× faster at full coke bar)
        if (id === DRUGS.ALCOHOL && cokeLevel > 0.1) {
          decay *= 1 + cokeLevel * 1.2;
        }
        this.levels[id] = Math.max(0, level - decay * dt);
      }
    }

    // Drunk-time tracking (for cocaine unlock)
    if (this.levels[DRUGS.ALCOHOL] > 0.3) {
      this.totalDrunkTime += dt;
    }

    // Unlock checks
    this._checkUnlocks(dt);

    return anyActive;
  }

  /** Called by GameScene each frame with the player's current world-Z
   *  position.  Tracks the Permastoned window: weed bar at 100% for
   *  10 in-game miles → fire achievement, force-reset weed to 0,
   *  permanently lock weed pickups for the remainder of the run.
   *
   *  `posUnitsPerMile` lets the system convert relative position units
   *  to miles without importing constants. */
  notePermastonedTick(playerPos, posUnitsPerMile) {
    if (this._weedPermastonedLocked) return null;
    const weed = this.levels[DRUGS.WEED] ?? 0;
    if (weed < 1.0) {
      this._weedAt100StartPos = null;
      return null;
    }
    if (this._weedAt100StartPos == null) {
      this._weedAt100StartPos = playerPos;
      return null;
    }
    const milesAt100 = (playerPos - this._weedAt100StartPos) / posUnitsPerMile;
    if (milesAt100 >= 10) {
      this._weedPermastonedLocked = true;
      this.levels[DRUGS.WEED]     = 0;
      this._weedAt100StartPos     = null;
      return { permastoned: true };
    }
    return null;
  }

  isPermastoned() { return !!this._weedPermastonedLocked; }

  /** Per-frame unlock check.  Updated thresholds per player spec:
   *    cocaine   → 30s drunk
   *    shrooms   → both alcohol AND weed have ever been ingested (any pickup)
   *    lsd       → shrooms bar ever hit 0.30
   *    heroin    → 20% route progress
   *    rx        → cocaine bar ever hit 0.30
   *    fentanyl  → heroin bar ever hit 0.50
   *    ketamine  → lsd bar ever hit 0.40
   *    meth      → cocaine bar hit 0.40 then dropped back to 0 for 30s
   *
   *  Once unlocked, drugs stay unlocked for the rest of the run — even
   *  through arrests/deaths.  Unlocks persist via the Phaser registry
   *  (hydrated on each GameScene._doCreate; see drugUnlocks key).
   */
  _checkUnlocks(dt = 0) {
    const u = this.unlocked;

    if (!u[DRUGS.COCAINE] && this.totalDrunkTime > 30) {
      u[DRUGS.COCAINE] = true;
    }

    // Shrooms unlock once both beer AND weed bars are ≥ 30% AT THE SAME
    // TIME (not just historically ingested) — the player has to be drunk
    // and stoned simultaneously, not stage them separately.
    if (!u[DRUGS.SHROOMS]
      && (this.levels[DRUGS.ALCOHOL] ?? 0) >= 0.30
      && (this.levels[DRUGS.WEED]    ?? 0) >= 0.30) {
      u[DRUGS.SHROOMS] = true;
    }

    if (!u[DRUGS.LSD] && this.maxReached[DRUGS.SHROOMS] >= 0.50) {
      u[DRUGS.LSD] = true;
    }

    if (!u[DRUGS.HEROIN] && this.routeProgress >= 0.20) {
      u[DRUGS.HEROIN] = true;
    }

    // Rx unlocks once the player has bumped 50+ NPC cars (the player is
    // generating their own legal mess that begs prescription painkillers).
    // GameScene tracks `npcCrashesTotal` on the registry-shared drugs
    // instance via `recordNpcCrash`.
    if (!u[DRUGS.RX] && (this.npcCrashesTotal ?? 0) >= 50) {
      u[DRUGS.RX] = true;
    }

    if (!u[DRUGS.FENTANYL] && this.maxReached[DRUGS.HEROIN] >= 0.50) {
      u[DRUGS.FENTANYL] = true;
    }

    if (!u[DRUGS.KETAMINE] && this.maxReached[DRUGS.LSD] >= 0.40) {
      u[DRUGS.KETAMINE] = true;
    }

    // Meth — special two-phase gate.  Phase 1 fires once cocaine bar
    // peaks ≥ 0.40.  Phase 2 then waits for the player to clean out
    // (cocaine = 0) and stay clean for 30 sustained seconds.
    if (!u[DRUGS.METH]) {
      if (this.maxReached[DRUGS.COCAINE] >= 0.40) {
        this._methPhase1 = true;
      }
      if (this._methPhase1) {
        if ((this.levels[DRUGS.COCAINE] ?? 0) <= 0.0001) {
          this._methCleanTime = (this._methCleanTime ?? 0) + dt;
          if (this._methCleanTime >= 30) u[DRUGS.METH] = true;
        } else {
          this._methCleanTime = 0;       // reset if any coke shows up again
        }
      }
    }
  }

  /** Active named combos: returns array of combo descriptors currently in
   *  effect, ORDERED so the HUD's first pick prefers (1) higher-arity
   *  combos, then (2) the combo whose drugs have the highest summed
   *  levels.  For 2-way combos this naturally selects the pair that
   *  matches the player's two highest bars; for 3+-way combos it surfaces
   *  the most-developed multi-drug name (per user spec). */
  getActiveCombos() {
    if (!this._comboActivatedAt) this._comboActivatedAt = {};
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const out = [];
    for (const [key, combo] of Object.entries(DRUG_COMBOS)) {
      const allActive = combo.drugs.every(id => (this.levels[id] ?? 0) >= combo.threshold);
      if (allActive) {
        if (this._comboActivatedAt[key] == null) this._comboActivatedAt[key] = now;
        const sum = combo.drugs.reduce((s, id) => s + (this.levels[id] ?? 0), 0);
        out.push({ key, ...combo, _t: this._comboActivatedAt[key], _sum: sum });
      } else if (this._comboActivatedAt[key] != null) {
        delete this._comboActivatedAt[key];
      }
    }
    out.sort((a, b) => {
      if (a.drugs.length !== b.drugs.length) return b.drugs.length - a.drugs.length;
      return b._sum - a._sum;
    });
    return out;
  }

  pickup(drugType) {
    const id = this._mapPickupType(drugType);
    if (!id || !this.unlocked[id]) return false;

    // Permastoned lockout — once weed has been Permastoned-locked, the
    // road suppresses weed pickups so this should rarely fire, but the
    // double-check keeps any stray pickup honest.
    if (id === DRUGS.WEED && this._weedPermastonedLocked) return false;

    const cfg    = DRUG_CONFIG[id];
    let amount   = PICKUP_AMOUNTS[id] ?? 0.12;

    // Weed tolerance — 12.5% per hit until the bar hits 60%, then a flat
    // 5% per hit (per user spec).  Below 60% lets the player ramp up
    // quickly; above 60% it takes ~8 more hits to reach the Permastoned
    // 100% lock-in point.
    if (id === DRUGS.WEED) {
      amount = this.levels[id] < 0.60 ? 0.125 : 0.05;
    }

    const prevLevel = this.levels[id];
    const newLevel  = Math.min(1, prevLevel + amount);
    this.levels[id] = newLevel;

    // ── Cross-drug pickup effects ─────────────────────────────────────
    // Beer burns shrooms / LSD by 15 pp each.  Cocaine burns 7 pp off
    // alcohol.  Rx multiplies every OTHER drug bar by 0.9 (10% off the
    // current amount, per user spec).
    const dropBy = (other, delta) => {
      this.levels[other] = Math.max(0, (this.levels[other] ?? 0) - delta);
    };
    if (id === DRUGS.ALCOHOL) {
      dropBy(DRUGS.SHROOMS, 0.15);
      dropBy(DRUGS.LSD,     0.15);
    }
    if (id === DRUGS.COCAINE) {
      dropBy(DRUGS.ALCOHOL, 0.07);
    }
    if (id === DRUGS.RX) {
      for (const otherId of Object.values(DRUGS)) {
        if (otherId === DRUGS.RX) continue;
        this.levels[otherId] = Math.max(0, (this.levels[otherId] ?? 0) * 0.9);
      }
    }

    // Per-pickup permanent stat counters — read by GameScene for cumulative
    // top-speed bonuses (+4 mph / cocaine bag, +4 mph / meth pickup) and
    // for Rx-driven NPC traffic-speed shifts (+/-7 mph / Rx pickup).
    if (id === DRUGS.COCAINE) this.cocainePickupCount += 1;
    this.pickupCounts[id] = (this.pickupCounts[id] ?? 0) + 1;

    // Immediate OD check — bar can safely fill to 100% AND stay there
    // without overdose.  OD only fires if the level somehow exceeds
    // 1.0 (i.e., 101%+).  Since pickup() clamps to 1.0, this strict
    // > 1.0 check effectively never fires from normal play — exactly
    // what the user wants: 100% is a permanent safe zone.
    if (cfg.canOD && this.levels[id] > 1.0) {
      return { overdose: true, drug: id };
    }
    return { overdose: false, drug: id };
  }

  /** Cumulative cocaine speed boost in MPH (additive on top of 120 base).
   *  +4 mph per bag picked up (per user spec). */
  getCocaineSpeedBonusMPH() {
    return this.cocainePickupCount * 4;
  }

  /** Cumulative meth speed boost in MPH (+4 mph per pickup, per spec). */
  getMethSpeedBonusMPH() {
    return (this.pickupCounts[DRUGS.METH] ?? 0) * 4;
  }

  /** Cumulative Rx-driven NPC traffic-speed offset in MPH.  Each Rx pickup
   *  slows oncoming traffic by 7 mph and speeds same-direction traffic by
   *  7 mph — read by GameScene._updateTraffic. */
  getRxNpcSpeedShiftMPH() {
    return (this.pickupCounts[DRUGS.RX] ?? 0) * 7;
  }

  /** Weighted-random pick of an UNLOCKED drug, biased by lifetime pickups
   *  (addiction) AND cross-tolerance (heavy uppers depress downers and vv).
   *  Maps internal IDs back to RouteData/_mapPickupType pickup names. */
  chooseAddictedDrug(routeProgress = 0) {
    const ID_TO_PICKUP = {
      alcohol: 'beer', weed: 'weed', cocaine: 'cocaine', shrooms: 'shrooms',
      lsd: 'lsd', heroin: 'heroin', rx: 'rx', fentanyl: 'fentanyl',
      ketamine: 'ketamine', meth: 'meth',
    };
    const UPPERS  = new Set(['cocaine', 'meth', 'rx']);
    const DOWNERS = new Set(['alcohol', 'weed', 'heroin', 'fentanyl', 'ketamine']);

    // Cross-tolerance ratio
    let upTotal = 0, dnTotal = 0;
    for (const id of Object.values(DRUGS)) {
      const c = this.pickupCounts[id] ?? 0;
      if (UPPERS.has(id))  upTotal += c;
      if (DOWNERS.has(id)) dnTotal += c;
    }
    const upDominant = upTotal > 2 * (dnTotal + 1);
    const dnDominant = dnTotal > 2 * (upTotal + 1);

    const candidates = [];
    let totalW = 0;
    for (const id of Object.values(DRUGS)) {
      if (!this.unlocked[id]) continue;
      // Permastoned lock — no weed pickups for the rest of the run.
      if (id === DRUGS.WEED && this._weedPermastonedLocked) continue;
      const count = this.pickupCounts[id] ?? 0;
      // Base weight 1 + addiction kicker (each pickup adds +0.4)
      let w = 1 + count * 0.4;
      if (upDominant && DOWNERS.has(id)) w *= 0.45;
      if (dnDominant && UPPERS.has(id))  w *= 0.45;
      // Fentanyl is RARE — single hit = 50%, two = OD.  Knock its weight
      // way down so it shows up only occasionally even when the player
      // has piled up an opioid pickup history.
      if (id === DRUGS.FENTANYL) w *= 0.08;
      // Shrooms population reduced 20% per player request — they were
      // showing up too often on the road.
      if (id === DRUGS.SHROOMS)  w *= 0.8;
      candidates.push({ id, w });
      totalW += w;
    }
    if (!candidates.length) return 'beer';

    let r = Math.random() * totalW;
    for (const c of candidates) {
      if ((r -= c.w) <= 0) return ID_TO_PICKUP[c.id] ?? 'beer';
    }
    return ID_TO_PICKUP[candidates[candidates.length - 1].id] ?? 'beer';
  }

  _mapPickupType(type) {
    const map = {
      beer:        DRUGS.ALCOHOL,
      weed:        DRUGS.WEED,
      cocaine:     DRUGS.COCAINE,
      shrooms:     DRUGS.SHROOMS,
      lsd:         DRUGS.LSD,
      heroin:      DRUGS.HEROIN,
      rx:          DRUGS.RX,
      fentanyl:    DRUGS.FENTANYL,
      ketamine:    DRUGS.KETAMINE,
      meth:        DRUGS.METH,
    };
    return map[type] ?? null;
  }

  checkOD() {
    // Per spec: OD only fires on OVERFLOW past 100% — exactly 1.0 is a
    // safe state (the slider in custom mode + the maxed-out achievement
    // both depend on this).  Bars are clamped at 1.0 in pickup() so
    // strict-greater never fires from normal play; the pickup() path
    // itself returns { overdose: true } when a drug pickup happens
    // while already at 1.0.  This frame-level check is now a no-op for
    // any sane state — kept only as a safety net for cases where some
    // future code might push a level above 1.0.
    for (const id of Object.values(DRUGS)) {
      const cfg = DRUG_CONFIG[id];
      if (cfg.canOD && this.levels[id] > 1.0) {
        return id;
      }
    }
    return null;
  }

  /** Total intoxication 0–1 (weighted sum, capped) */
  get totalIntox() {
    const weights = {
      alcohol:  1.0,
      weed:     0.5,
      cocaine:  0.8,
      shrooms:  1.1,
      lsd:      1.3,
      heroin:   1.4,
      rx:       0.6,
      fentanyl: 2.0,
      ketamine: 1.2,
    };
    let total = 0;
    for (const id of Object.values(DRUGS)) {
      total += (this.levels[id] ?? 0) * (weights[id] ?? 1);
    }
    return Math.min(1, total / 2.5);
  }

  get(id)    { return this.levels[id]   ?? 0; }
  isOn(id)   { return this.levels[id]   > 0.05; }
  isUnlocked(id) { return this.unlocked[id] ?? false; }

  /** Score multiplier — additive per drug, weighted by how lit you are.
   *  Each drug's contribution:
   *     bar  ≤ 50%  →  +0.5  (light buzz / mild high)
   *     bar  > 50%  →  +1.0  (deep, full effect)
   *     bar  < 5%   →   0    (trace residue, ignored)
   *  Examples (matching the user spec):
   *     beer 30% + weed 30%        →  1 + 0.5 + 0.5 = 2.0×
   *     beer full + weed full      →  1 + 1.0 + 1.0 = 3.0×
   *     beer 80% + weed 20%        →  1 + 1.0 + 0.5 = 2.5×
   *     one drug at 50%            →  1 + 0.5       = 1.5×
   */
  get scoreMultiplier() {
    let bonus = 0;
    for (const id of Object.values(DRUGS)) {
      const level = this.levels[id] ?? 0;
      if (level < 0.05)      continue;       // trace residue, no score boost
      else if (level <= 0.5) bonus += 0.5;   // first-half buzz
      else                   bonus += 1.0;   // second-half full effect
    }
    return 1 + bonus;
  }

  /** Recovery: hitchhiker gives a sobriety boost */
  applyRecovery(amount = 0.2) {
    for (const id of Object.values(DRUGS)) {
      if (this.levels[id] > 0) {
        this.levels[id] = Math.max(0, this.levels[id] - amount * 0.5);
      }
    }
  }
}
