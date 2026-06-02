/**
 * EffectsSystem — translates drug levels into visual + physics distortions.
 *
 * Visual effects (no shader required):
 *   - Screen sway / scrollX drift  (alcohol)
 *   - Double vision ghost pass     (alcohol > 0.8)
 *   - Green tint overlay           (weed)
 *   - White flash pulse            (cocaine)
 *   - Hue-cycling color overlay    (shrooms / lsd)
 *   - Liquefying world projection  (shrooms > 0.7)
 *   - Dark vignette + drooping lids (heroin / fentanyl)
 *   - Tunnel vision                (fentanyl)
 *   - K-hole quad split            (ketamine > 0.8)
 *   - Screen shake                 (crash events)
 *
 * Physics effects (returned as an object read by Player):
 *   - steerDrift     – random sideways drift per frame
 *   - steerSensitivity – multiplier on player input
 *   - speedMult      – max speed multiplier
 *   - extraCurve     – adds phantom curve to road
 *   - inputDelay     – ms delay on steering (ketamine)
 */
import { DRUGS } from '../constants.js';
import { clamp, lerp } from '../utils/Helpers.js';
import { TimeOfDay } from '../world/TimeOfDay.js';
import { Weather }   from '../world/Weather.js';

export class EffectsSystem {
  constructor(scene) {
    this.scene    = scene;
    this.time     = 0;
    this.shakeTimer = 0;

    // Overlay graphics objects (created in GameScene.create)
    this.overlay     = null;  // semi-transparent color overlay
    this.vignetteGfx = null;  // dark vignette
    this.hudFlash    = null;  // bright flash

    // State exposed to Road renderer
    this.doubleVision = 0;
    this.shroomMelt = 0;

    // Delayed input buffer for ketamine
    this._inputBuffer = [];
    this._inputDelay  = 0;

    // LSD transient grayscale-flip scheduling
    this._lsdGrayTimer = 0;
    this._lsdNextGray  = 2 + Math.random() * 3;

    // LSD pastel blob pool — pre-allocated, mutated in place to avoid
    // per-frame GC churn.  Same pattern as the Milky Way puff blobs.
    this._lsdBlobs = [];
    for (let i = 0; i < 16; i++) {
      this._lsdBlobs.push({
        active: false, x: 0, y: 0, color: 0,
        age: 0, lifetime: 0, radius: 0,
      });
    }
    this._lsdBlobSpawnTimer = 0;

    // Rx roulette
    this._rxRoll       = -1;
    this._lastRxBar    = 0;
    this._rxRollExpire = 0;

    // Combo flags (re-derived per update)
    this._comboSnowCone     = false;
    this._comboTranq        = false;
    this._comboPsychedelic  = false;
    this._comboSpeedball    = false;
    this._comboApocalypse   = false;
  }

  setGraphics(overlay, vignetteGfx, hudFlash) {
    this.overlay     = overlay;
    this.vignetteGfx = vignetteGfx;
    this.hudFlash    = hudFlash;
  }

  update(dt, drugs, camera, ctx = {}) {
    this.time += dt;
    const t = this.time;
    const d = drugs;
    const mile = ctx.mile ?? 0;

    const alc  = d.get(DRUGS.ALCOHOL);
    const weed = d.get(DRUGS.WEED);
    const coke = d.get(DRUGS.COCAINE);
    const shrooms = d.get(DRUGS.SHROOMS);
    const lsd  = d.get(DRUGS.LSD);
    const hero = d.get(DRUGS.HEROIN);
    const rx   = d.get(DRUGS.RX);
    const fent = d.get(DRUGS.FENTANYL);
    const ket  = d.get(DRUGS.KETAMINE);
    const meth = d.get(DRUGS.METH);

    // High-dose mushrooms: smoothly feed a visual-only liquid-world warp
    // into Road.render(). Keeping this in the projection pass bends pavement,
    // scenery, and traffic together without a shader or extra textures.
    const meltRaw = clamp((shrooms - 0.70) / 0.30, 0, 1);
    const meltTarget = meltRaw * meltRaw * (3 - 2 * meltRaw);
    this.shroomMelt = lerp(this.shroomMelt, meltTarget, clamp(dt * 3, 0, 1));

    // ── Rx roulette ─────────────────────────────────────────────────
    // Detect a fresh pickup (rx jumped > 0.05 vs last frame); roll a
    // new effect 0..4 and start a 12s window.  When the window expires
    // _rxRoll = -1 and all rx-roulette physics fields go to 0.
    if (rx > (this._lastRxBar ?? 0) + 0.05) {
      this._rxRoll       = Math.floor(Math.random() * 5);
      this._rxRollExpire = 12;
    }
    this._lastRxBar = rx;
    if (this._rxRollExpire > 0) {
      this._rxRollExpire -= dt;
      if (this._rxRollExpire <= 0) {
        this._rxRoll       = -1;
        this._rxRollExpire = 0;
      }
    }

    // ── Combo detection ─────────────────────────────────────────────
    this._comboSnowCone    = (alc > 0.3 && coke > 0.3);
    this._comboTranq       = (hero > 0.3 && ket > 0.3);
    this._comboPsychedelic = (shrooms > 0.3 && lsd > 0.3);
    this._comboSpeedball   = (coke > 0.3 && hero > 0.3);
    let _activeCount = 0;
    if (alc     > 0.3) _activeCount++;
    if (weed    > 0.3) _activeCount++;
    if (coke    > 0.3) _activeCount++;
    if (shrooms > 0.3) _activeCount++;
    if (lsd     > 0.3) _activeCount++;
    if (hero    > 0.3) _activeCount++;
    if (rx      > 0.3) _activeCount++;
    if (fent    > 0.3) _activeCount++;
    if (ket     > 0.3) _activeCount++;
    if (meth    > 0.3) _activeCount++;
    this._comboApocalypse = (_activeCount >= 4);

    // ── Double Vision (cocaine partially cuts through it) ──────────────
    // Threshold lowered from 0.60 → 0.45 and the ramp tightened so the
    // effect peaks well before the bar is full — at 80%+ alcohol the
    // doubling should be unmistakable, not subtle.
    const alcNet = Math.max(0, alc - coke * 0.5);  // coke sobers you up some
    this.doubleVision = alcNet > 0.45 ? clamp((alcNet - 0.45) / 0.30, 0, 1) : 0;

    // ── Camera Sway (alcohol, reduced by cocaine) ─────────────────────
    const swayAlc = Math.max(0, alc - coke * 0.6);
    if (swayAlc > 0.08) {
      const swayAmp  = swayAlc * 55;
      const swayFreq = 0.8 + swayAlc * 0.8;
      camera.setScroll(Math.sin(t * swayFreq) * swayAmp * swayAlc, 0);
    } else {
      camera.setScroll(lerp(camera.scrollX, 0, 0.1), 0);
    }

    // ── Screen Shake (cocaine burst / crash) ──────────────────────────
    if (coke > 0.7 && Math.random() < 0.02) {
      this.triggerShake(80, 0.006);
    }

    // ── Overlay effects ───────────────────────────────────────────────
    if (this.overlay) {
      this.overlay.clear();

      // Weed: green tint that intensifies into a hot-boxed haze ≥ 60%.
      // At weed ≥ 0.5 the wash "breathes" at ~0.4 Hz — slow inhale/exhale
      // that reads as the hazy/floaty feel without any new visual layers.
      const weedBreath = weed >= 0.5
        ? 1 + Math.sin(t * Math.PI * 2 * 0.4) * 0.25
        : 1;
      if (weed > 0.05) {
        this.overlay.fillStyle(0x224422, weed * 0.22 * weedBreath);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }
      if (weed >= 0.60) {
        const haze = (weed - 0.60) / 0.40;
        this.overlay.fillStyle(0x556b4a, (0.18 + haze * 0.18) * weedBreath);
        this.overlay.fillRect(-150, -150, 1100, 750);
        this.overlay.fillStyle(0xCCDFC2, (0.06 + haze * 0.10) * weedBreath);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Alcohol: red tint at high levels
      if (alc > 0.5) {
        this.overlay.fillStyle(0x440000, (alc - 0.5) * 0.3);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Cocaine: pulsing white flash
      if (coke > 0.15) {
        const pulse = Math.abs(Math.sin(t * 4.5)) * coke * 0.18;
        this.overlay.fillStyle(0xFFFFFF, pulse);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Meth: subtle white contrast pop above 0.4 — sells the wired/sharp
      // feel without flashing the player.  Peaks at ~0.024 alpha.
      if (meth > 0.4) {
        this.overlay.fillStyle(0xFFFFFF, (meth - 0.4) * 0.04);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Shrooms: saturation-pump per dose (8% per pickup, capped at 100%).
      // Implemented as a slow cycling hue overlay whose alpha grows with
      // pickup count — visually "the world's getting more saturated".
      // Alpha bumped 0.32 → 0.55 + a baseline term keyed off the bar
      // itself so saturation reads even on the first pickup.
      if (shrooms > 0.05) {
        const shroomPickups = d.pickupCounts?.[DRUGS.SHROOMS] ?? 0;
        const satBoost = Math.min(1, shroomPickups * 0.08);
        const hue1 = Math.sin(t * 0.4)         * 0.5 + 0.5;
        const hue2 = Math.sin(t * 0.4 + 2.094) * 0.5 + 0.5;
        const hue3 = Math.sin(t * 0.4 + 4.188) * 0.5 + 0.5;
        const r = Math.round(hue1 * 255);
        const g = Math.round(hue2 * 255);
        const b = Math.round(hue3 * 255);
        const col = (r << 16) | (g << 8) | b;
        // satBoost grows with pickups (slow build), bar-baseline kicks
        // in immediately so a single mushroom at 90% bar still tints.
        const a = satBoost * 0.55 + shrooms * 0.18;
        this.overlay.fillStyle(col, a);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Shrooms perceptual: sky rainbow gradient (5 hue bands across upper
      // half, low alpha, hue offset cycles over time).
      if (shrooms > 0.4) {
        const SKY_TOP = -150;
        const SKY_H   = 225 + 150;          // upper half + top margin
        const BANDS   = 5;
        const BAND_W  = 1100 / BANDS;
        const hueShift = t * 0.35;
        for (let i = 0; i < BANDS; i++) {
          const phase = hueShift + i * (Math.PI * 2 / BANDS);
          const rr = Math.round((Math.sin(phase)         * 0.5 + 0.5) * 255);
          const gg = Math.round((Math.sin(phase + 2.094) * 0.5 + 0.5) * 255);
          const bb = Math.round((Math.sin(phase + 4.188) * 0.5 + 0.5) * 255);
          this.overlay.fillStyle((rr << 16) | (gg << 8) | bb, 0.06 * shrooms);
          this.overlay.fillRect(-150 + i * BAND_W, SKY_TOP, BAND_W, SKY_H);
        }
      }

      // Shrooms color-saturation pulse — warm-hue cycling wash, alpha
      // pulses with sin(time).  Pure overlay alpha pulse (no per-pixel sat).
      if (shrooms > 0.3) {
        const pulseAlpha = Math.sin(t * 0.6) * 0.04 * shrooms;
        if (pulseAlpha > 0) {
          const warmPhase = t * 0.25;
          const rr = Math.round((Math.sin(warmPhase)       * 0.3 + 0.7) * 255);
          const gg = Math.round((Math.sin(warmPhase + 1.0) * 0.25 + 0.45) * 255);
          const bb = Math.round((Math.sin(warmPhase + 2.0) * 0.15 + 0.20) * 255);
          this.overlay.fillStyle((rr << 16) | (gg << 8) | bb, pulseAlpha);
          this.overlay.fillRect(-150, -150, 1100, 750);
        }
      }
      // Shrooms ≥ 65% rainbow is now drawn by Road.js immediately after
      // the sky bands so it sits BEHIND road / scenery / NPCs (per user
      // request).  Road.render reads `effects.shroomsBar` to gate it.

      // LSD: per-hit brightness boost (8% per pickup) + geometric lines
      // at higher levels.  Above 90% the screen flips to a heavy grey
      // wash, reading as "everything's gone B&W".
      if (lsd > 0.05) {
        const lsdPickups = d.pickupCounts?.[DRUGS.LSD] ?? 0;
        const brightness = Math.min(1, lsdPickups * 0.08);
        // Flat white wash for the brightness lift.
        this.overlay.fillStyle(0xFFFFFF, brightness * 0.30);
        this.overlay.fillRect(-150, -150, 1100, 750);
        // Geometric lines remain at higher bar levels.
        if (lsd > 0.3) {
          this.overlay.lineStyle(1, 0xFFFFFF, lsd * 0.15);
          for (let i = 0; i < 6; i++) {
            const x = (Math.sin(t * 0.9 + i * 1.05) * 0.5 + 0.5) * 800;
            this.overlay.strokeRect(x - 40, 0, 80, 450);
          }
        }
      }
      if (lsd >= 0.90) {
        // Heavy grey wash leans the world toward greyscale.  Real
        // desaturation needs a shader pipeline (deferred) — this is the
        // arcade-cheap version, and it still reads as "B&W trip".
        const a = Math.min(1, (lsd - 0.90) / 0.10) * 0.60;
        this.overlay.fillStyle(0x808080, a);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // LSD transient grayscale flips — every 2-5 sec a 0.3s burst of
      // 0x808080 at 0.20 alpha.  Psychedelic combo halves the next-burst
      // window so flips fire ~2x as often.
      if (lsd > 0.4) {
        if (this._lsdGrayTimer > 0) {
          this._lsdGrayTimer -= dt;
          this.overlay.fillStyle(0x808080, 0.20);
          this.overlay.fillRect(-150, -150, 1100, 750);
        } else {
          this._lsdNextGray -= dt;
          if (this._lsdNextGray <= 0) {
            this._lsdGrayTimer = 0.3;
            const freqMul = this._comboPsychedelic ? 0.5 : 1.0;
            this._lsdNextGray = (2 + Math.random() * 3) * freqMul;
          }
        }
      }

      // LSD chromatic aberration — small red + blue offsets.
      if (lsd > 0.5) {
        const aberrAlpha = (lsd - 0.5) * 0.18;
        const offset = 4 + Math.sin(t * 1.3) * 2;
        this.overlay.fillStyle(0xFF2030, aberrAlpha);
        this.overlay.fillRect(-150 - offset, -150, 1100, 750);
        this.overlay.fillStyle(0x2040FF, aberrAlpha);
        this.overlay.fillRect(-150 + offset, -150, 1100, 750);
      }

      // LSD slow brightness wash — cycles bright/dim (clamped at 0).
      if (lsd > 0.3) {
        const brightAlpha = Math.sin(t * 0.4) * 0.04 * lsd;
        if (brightAlpha > 0) {
          this.overlay.fillStyle(0xFFFFFF, brightAlpha);
          this.overlay.fillRect(-150, -150, 1100, 750);
        }
      }

      // LSD ≥ 70%: translucent pastel blobs that fade in / hold / fade
      // out at random screen positions.  Same three-pass blob style as
      // the Milky Way puffs — outer halo, mid wash, bright core.  The
      // pool is pre-allocated; we just cycle entries between active
      // and idle so no objects are created per frame.
      if (lsd > 0.7) {
        const lsdMix = Math.min(1, (lsd - 0.7) / 0.3);
        // Spawn cadence ramps with bar level — at lsd=1.0 a new blob
        // every 0.3-0.8s; at lsd=0.7 every 0.6-1.4s.
        this._lsdBlobSpawnTimer -= dt;
        if (this._lsdBlobSpawnTimer <= 0) {
          for (const b of this._lsdBlobs) {
            if (b.active) continue;
            b.active   = true;
            // Spawn anywhere in the visible play area.  Slight bias
            // toward the upper half so blobs feel like they emerge
            // out of the sky / road perspective rather than the HUD.
            b.x        = Math.random() * 800;
            b.y        = Math.random() * 450 * 0.85;
            // Pastel palette — soft saturated tints, no primaries.
            const PASTELS = [
              0xFFB7C5,  // pink
              0xB7E5C9,  // mint
              0xC5B7FF,  // lavender
              0xFFD2B7,  // peach
              0xB7D8FF,  // sky-blue
              0xFFF5B7,  // lemon
              0xE5B7FF,  // orchid
              0xB7FFE0,  // aqua
            ];
            b.color    = PASTELS[Math.floor(Math.random() * PASTELS.length)];
            b.age      = 0;
            b.lifetime = 1.5 + Math.random() * 2.5;     // 1.5–4 s
            b.radius   = 60 + Math.random() * 110;      // 60–170 px
            break;
          }
          // Next-spawn delay — tighter at higher bar levels.
          const minDelay = 0.3 + (1 - lsdMix) * 0.3;    // 0.3–0.6s
          const range    = 0.5 + (1 - lsdMix) * 0.3;    // +0–0.8s
          this._lsdBlobSpawnTimer = minDelay + Math.random() * range;
        }

        // Update + paint active blobs.  Three-pass for soft edges.
        for (const b of this._lsdBlobs) {
          if (!b.active) continue;
          b.age += dt;
          if (b.age >= b.lifetime) { b.active = false; continue; }
          // Fade-in 25%, hold 50%, fade-out 25%.  Smooth via cosine.
          const t01 = b.age / b.lifetime;
          let env;
          if      (t01 < 0.25) env = t01 / 0.25;
          else if (t01 > 0.75) env = (1 - t01) / 0.25;
          else                 env = 1;
          // Smoothstep the envelope so the edges aren't linear.
          env = env * env * (3 - 2 * env);
          const a = env * 0.32 * lsdMix;
          this.overlay.fillStyle(b.color, a * 0.32);
          this.overlay.fillCircle(b.x, b.y, b.radius * 1.4);
          this.overlay.fillStyle(b.color, a * 0.55);
          this.overlay.fillCircle(b.x, b.y, b.radius * 1.0);
          this.overlay.fillStyle(b.color, a * 0.85);
          this.overlay.fillCircle(b.x, b.y, b.radius * 0.45);
        }
      }

      // Heroin: subtle dark-blue dreaminess.  Cut the alpha sharply (was
      // 0.35) so the screen isn't washed dim — the heavy lifting is done
      // by the vignette below, which gives a tunnel-vision closing-in
      // feel rather than a flat dark wash.
      // ── Heroin: continuous "nodding off" envelope ──────────────
      // Replaced the random staged blackouts with a slow nod cycle.
      // (1 − cos(t·ω))/2 gives a smooth 0→1→0 wave; cubing biases the
      // envelope LOW most of the time and spikes high at peak nods, so
      // the player feels mostly heavy with periodic "head dips".
      // Frequency ramps with the hero level (slower nods at low doses,
      // faster as it builds).  Drives vignette boost, eyelid droop,
      // input lag, and throttle sag — exposed via getPhysics().
      const nodFreq = 0.45 + hero * 0.35;
      const nodRaw  = (1 - Math.cos(this.time * nodFreq)) * 0.5;
      const nod     = hero > 0.05
        ? Math.pow(nodRaw, 3) * Math.min(1, hero * 2)
        : 0;
      this._heroNodAmount = nod;

      // Warm dim wash — sedated/heavy room feel, not the prior chemical
      // blue wash.  Vignette + eyelid droop carry most of the visual
      // weight, so this layer stays subtle.
      if (hero > 0.05) {
        this.overlay.fillStyle(0x1A120C, hero * 0.10);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // Ketamine "detachment" — neutral grey wash above 40% pulls the
      // world toward greyscale (cheap pseudo-desaturation).  Reads as
      // "everything's far away" — pairs with the existing tilt + static.
      if (ket > 0.40) {
        this.overlay.fillStyle(0x808080, (ket - 0.40) * 0.08);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // ── World darkness (TimeOfDay) ─────────────────────────────────
      // Drawn LAST in the overlay so it dims everything underneath: road,
      // scenery, NPCs, even the drug-effect washes.  HUD lives on the UI
      // camera so this doesn't dim it.  Easy mode only dims the sky;
      // Normal+ runs a full-world dim (TimeOfDay handles that gating).
      const darkness = TimeOfDay.darkness(mile);
      if (darkness > 0.02) {
        // Wash strength dropped 0.55 → 0.40 so the night sky stays
        // legible (stars + moon are 2×2 px at full alpha; a heavier
        // wash was muting them into the background).
        this.overlay.fillStyle(0x05080F, darkness * 0.40);
        this.overlay.fillRect(-150, -150, 1100, 750);
      }

      // ── Weather particles (rain / snow) ────────────────────────────
      const weatherState = Weather.state(mile);
      const weatherInt   = Weather.intensity(mile);
      if (weatherState === 'rain' && weatherInt > 0.05) {
        // Severity ramps 1.0 (storm leading edge) → 2.4 (deep in it); sevT
        // is the normalized 0..1 form.  Drives BOTH the falling-streak
        // density/opacity and the windshield-drop load so the rain visibly
        // builds into a hard-to-see-through downpour past mile ~35.
        const sev  = Weather.severity?.(mile) ?? 1;
        const sevT = Math.max(0, Math.min(1, (sev - 1) / 1.4));
        // Slanted white streaks falling top → bottom-right.  Spawn area
        // extended into the 150-px margin so a rotated camera still sees
        // rain instead of a sharp boundary at x=0 / 800.  Count + opacity
        // scale with severity: a light sprinkle early, a heavy sheet later.
        const COUNT = Math.floor(110 * weatherInt * (1 + 1.4 * sevT));
        this.overlay.lineStyle(1, 0xC8DAE8, 0.45 + 0.30 * sevT);
        const SLANT  = 18;
        const HEIGHT = 22;
        for (let i = 0; i < COUNT; i++) {
          const seedX = (i * 53) % 1100;
          const seedY = (i * 91) % 750;
          const dropY = -150 + (seedY + t * 720) % 770;
          const x     = -150 + (seedX + (i * 7) % 60) % 1100;
          this.overlay.beginPath();
          this.overlay.moveTo(x,         dropY - HEIGHT);
          this.overlay.lineTo(x + SLANT, dropY);
          this.overlay.strokePath();
        }
        // Windshield droplets — slide UP the screen like raindrops on
        // a moving car's windshield (airflow pushes them up + back over
        // the glass).  Each drop has a stable x seed and a phase offset
        // so they're scattered, then y is animated by gameTime against a
        // fixed scroll period.  Wiper button suppresses the layer.
        // ── Persistent windshield-drop pool ──────────────────────────
        // Each drop has its own x/y/size/alpha and drifts UP the glass
        // toward the top of the windshield.  Wipers DO NOT instantly
        // clear all drops — instead each completed wiper cycle fires a
        // `ctx.wiperSweepPulse` that removes ~45 % of drops and shrinks
        // the survivors by ~35 % size + 30 % alpha.  After 3 sweeps,
        // residual drops are ~17 % count × ~27 % size of the original
        // — small leftovers that read like "fresh rain just started".
        // New drops keep spawning while it's raining, so leaving the
        // wipers off lets the storm build back up.
        if (!this._wsDrops) { this._wsDrops = []; this._wsSpawnT = 0; }
        // Target drop load ramps with the storm (sevT from above): a light
        // scatter at the leading edge → a heavy sheet deep in.  NO bulk
        // pre-fill (the old code snapped 60 drops/sec across the whole glass
        // so rain "appeared instantly").  Drops now accrue at a gentle,
        // severity-scaled rate and spawn in the LOWER band of the glass, so
        // the windshield fills bottom-to-top as the storm builds up over a
        // few seconds instead of covering in one frame.  Post-wipe refill
        // uses the same gentle rate, so it visibly builds back after a sweep.
        const TARGET_DROPS = Math.floor((24 + 220 * sevT) * weatherInt);
        const MAX_DROPS    = 260;
        const SPAWN_PER_SEC = (5 + 34 * sevT) * Math.max(0.2, weatherInt);
        this._wsSpawnT += dt;
        const spawnInterval = 1 / Math.max(0.1, SPAWN_PER_SEC);
        // Full-screen coverage (was 110–420, which left a bare strip at
        // the top + bottom edges per user).  Slight overscan past 0/450
        // absorbs camera shake / rotation so no gap shows.
        const WS_TOP    = -40;
        const WS_BOTTOM = 490;
        const spawnCap  = Math.min(TARGET_DROPS, MAX_DROPS);
        while (this._wsSpawnT >= spawnInterval && this._wsDrops.length < spawnCap) {
          this._wsSpawnT -= spawnInterval;
          this._wsDrops.push({
            x:     Math.random() * 800,
            y:     WS_BOTTOM - Math.random() * (WS_BOTTOM - WS_TOP) * 0.45,
            r:     (1.8 + Math.random() * 2.6) * (1 + 0.5 * sevT),
            alpha: 0.55 + Math.random() * 0.30,
            vy:    -6 - Math.random() * 4 - 4 * sevT,    // up-drift speed
          });
        }
        // Wipe pulse — remove ~45 % of drops + shrink/fade survivors.
        if (ctx.wiperSweepPulse) {
          const survivors = [];
          for (const d of this._wsDrops) {
            if (Math.random() < 0.45) continue;     // remove
            d.r     *= 0.65;
            d.alpha *= 0.70;
            if (d.r > 0.6 && d.alpha > 0.08) survivors.push(d);
          }
          this._wsDrops = survivors;
        }
        // Update + render.  Drops drift up and off the top edge (matches
        // WS_TOP) so they populate the full glass instead of vanishing at 110.
        const TOP_Y = -40;
        for (let i = this._wsDrops.length - 1; i >= 0; i--) {
          const d = this._wsDrops[i];
          d.y += d.vy * dt;
          if (d.y < TOP_Y) {
            // Drop reached the top — remove.  New ones spawn at bottom.
            this._wsDrops.splice(i, 1);
            continue;
          }
          // Streak below.
          this.overlay.fillStyle(0xCFE0EE, Math.min(1, 0.30 * d.alpha));
          this.overlay.fillRect(d.x - d.r * 0.30, d.y, d.r * 0.6, d.r * 2.4);
          // Drop body.
          this.overlay.fillStyle(0xCFE0EE, Math.min(1, 0.55 * d.alpha));
          this.overlay.fillEllipse(d.x, d.y, d.r * 1.5, d.r * 1.9);
          // Specular highlight.
          this.overlay.fillStyle(0xFFFFFF, Math.min(1, 0.85 * d.alpha));
          this.overlay.fillCircle(d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.35);
        }
      } else if (weatherState === 'snow' && weatherInt > 0.05) {
        // Snowflakes — bigger + more varied per user spec.  Five size
        // buckets, alpha keyed to size (smaller = more transparent),
        // larger flakes get a cross sparkle.  Sway split across FOUR
        // distinct zigzag lanes (different frequencies + phases) so the
        // field doesn't read as a single duplicated waveform.
        const COUNT = Math.floor(165 * weatherInt);
        // Four zigzag lanes — distinct frequencies break the lockstep
        // uniform pattern; flakes from different lanes oscillate at
        // different rates so neighbors visibly diverge.
        const LANE_FREQ  = [0.45, 0.85, 1.30, 1.85];
        const LANE_PHASE = [0.0,  1.7,  3.1,  4.6];
        for (let i = 0; i < COUNT; i++) {
          const sizeBucket = i % 5;                   // 0..4
          const r          = 2 + sizeBucket * 1.0;     // 2..6 px
          const alpha      = 0.55 + sizeBucket * 0.10; // 0.55..0.95
          const fallSpeed  = 70 + (4 - sizeBucket) * 12; // 70..118
          const swayAmp    = 4 + sizeBucket * 1.5;     // 4..10 px

          // Pick a zigzag lane.  i*7 % 4 (instead of i % 4) so lane
          // assignment isn't aligned with size-bucket assignment.
          const laneId    = (i * 7) % 4;
          const swayFreq  = LANE_FREQ[laneId];
          const swayPhase = LANE_PHASE[laneId] + (i * 0.31) % (Math.PI * 2);

          const seedX = (i * 47 + (i % 13) * 91) % 1100;   // less grid-like
          const seedY = (i * 71 + (i % 17) * 53) % 800;
          const driftY = -150 + (seedY + t * fallSpeed + (i * 3 % 30)) % 820;
          // Two-octave sway — primary lane wave + a smaller secondary
          // wave at a different rate, so the trajectory isn't a clean
          // sine.  Reads as wind-buffeted drift.
          const sway = Math.sin(t * swayFreq        + swayPhase) * swayAmp
                     + Math.sin(t * swayFreq * 2.6 + swayPhase * 0.7) * swayAmp * 0.35;
          const x    = -150 + (seedX + sway + 1100) % 1100;

          this.overlay.fillStyle(0xFFFFFF, alpha);
          this.overlay.fillCircle(x, driftY, r);

          // Cross sparkle on the larger flakes — gives them an obvious
          // "snowflake" silhouette instead of a uniform dot field.
          if (sizeBucket >= 3) {
            const armL = r * 1.9;
            const armW = Math.max(0.8, r * 0.32);
            this.overlay.fillStyle(0xFFFFFF, alpha * 0.55);
            this.overlay.fillRect(x - armL * 0.5, driftY - armW * 0.5, armL, armW);
            this.overlay.fillRect(x - armW * 0.5, driftY - armL * 0.5, armW, armL);
          }
        }

        // ── Snow ACCUMULATION on windshield (real-snow 2026-06-01) ──────
        // Flakes LAND and STICK, and the pile keeps building the longer you
        // drive — growing in count + size — until the glass is FULLY white,
        // unless you run the wipers.  `_wsSnowCoverage` (0→1) tracks how
        // buried the glass is: it grows with miles in snow and is only
        // knocked back by wiper sweeps.  Coverage scales the flake count +
        // size.  NO uniform white fill — the whiteout is built ENTIRELY from
        // stacked opaque flakes (a flat white sheet reads as fake; per user).
        // At a full pile only thin cracks of glass show through.
        if (this._wsSnowCoverage == null) { this._wsSnowCoverage = 0; this._wsSnowMile = mile; }
        if (!this._wsStuck) { this._wsStuck = []; this._wsStuckT = 0; }
        const sevSn  = Weather.severity?.(mile) ?? 1;
        const sevSnT = Math.max(0, Math.min(1, (sevSn - 1) / 1.4));
        const mileDeltaSn = Math.max(0, mile - (this._wsSnowMile ?? mile));
        this._wsSnowMile = mile;
        // Full whiteout in ~6 mi at peak (faster in heavier snow); a light
        // flurry (low weatherInt) takes proportionally longer.
        const COVER_PER_MILE = 0.17 * weatherInt * (0.7 + 0.3 * sevSnT);
        this._wsSnowCoverage = Math.min(1, this._wsSnowCoverage + mileDeltaSn * COVER_PER_MILE);
        if (ctx.wiperSweepPulse) this._wsSnowCoverage = Math.max(0, this._wsSnowCoverage - 0.34);
        const cov = this._wsSnowCoverage;
        // Flake population grows with coverage (40 → 560); persistent so they
        // stack rather than recycle.  Topped up a few per tick toward target.
        const flakeTarget = Math.floor(40 + 860 * cov);
        this._wsStuckT += dt;
        if (this._wsStuckT >= 0.03) {
          this._wsStuckT = 0;
          const need = flakeTarget - this._wsStuck.length;
          for (let n = 0; n < need && n < 40; n++) {
            this._wsStuck.push({
              x: -40 + Math.random() * 880,   // overscan past 0..800 / 0..450
              y: -40 + Math.random() * 530,
              r: 1.6 + Math.random() * 2.6,
              a: 0.82 + Math.random() * 0.18,  // opaque specks — no haze
            });
          }
        }
        // Wiper sweep clears ~60% of the pile so a few sweeps reset the glass.
        if (ctx.wiperSweepPulse) {
          const survivors = [];
          for (const f of this._wsStuck) {
            if (Math.random() < 0.60) continue;
            f.a *= 0.8;
            if (f.a > 0.08) survivors.push(f);
          }
          this._wsStuck = survivors;
        }
        // Flakes clump LARGER as coverage builds (cov² curve) so by a full
        // pile they overlap into a near-solid snow cake — only thin cracks of
        // glass show through.  This IS the whole whiteout: no white rect fill.
        const grow = 1 + cov * cov * 6;
        for (const f of this._wsStuck) {
          const rr = f.r * grow;
          this.overlay.fillStyle(0xDDE8F2, f.a * 0.5);
          this.overlay.fillCircle(f.x, f.y, rr * 1.5);
          this.overlay.fillStyle(0xFFFFFF, f.a);
          this.overlay.fillCircle(f.x, f.y, rr);
        }
      } else {
        // Not snowing — the pile melts / blows off the glass over a few
        // seconds once you leave the zone.  Reset trackers for re-entry.
        this._wsSnowMile = mile;
        if (this._wsSnowCoverage > 0) this._wsSnowCoverage *= 0.95;
        if (this._wsSnowCoverage < 0.01) this._wsSnowCoverage = 0;
        if (this._wsStuck?.length) {
          for (const f of this._wsStuck) f.a *= 0.95;
          this._wsStuck = this._wsStuck.filter(f => f.a > 0.08);
        }
      }

      // ── Apocalypse combo: red-border flash ─────────────────────
      // 4+ active drugs above 30%.  Pulsing red border tells the player
      // they've stacked too much — it's still drivable but visibly bad.
      if (this._comboApocalypse) {
        const flash = Math.abs(Math.sin(t * 4.0)) * 0.55 + 0.25;
        this.overlay.fillStyle(0xFF0000, flash);
        const BORDER = 22;
        this.overlay.fillRect(-150, -150, 1100, BORDER + 150);
        this.overlay.fillRect(-150, 450 - BORDER, 1100, BORDER + 150);
        this.overlay.fillRect(-150, -150, BORDER + 150, 750);
        this.overlay.fillRect(800 - BORDER, -150, BORDER + 150, 750);
      }
    }

    // ── Vignette (heroin, fentanyl, ketamine K-hole) ───────────────────
    if (this.vignetteGfx) {
      this.vignetteGfx.clear();

      // Ketamine vignette pulses on a 10s cycle: 4s dark / 6s lighter.
      // Base contribution dropped from 0.4 → 0.32 (20% lighter overall);
      // during the "lighter" phase it drops further to 0.13 so the dark
      // doesn't sit on the screen for minutes at a time.
      // Ketamine contributes a SUBTLE screen-edge vignette — the heavy
      // K-hole signal is now the TV static layered below this block,
      // so we only need a mild edge-darkening to frame the noise.
      // (Old: ket × 1.0 with pulse → too dark.  New: ket × 0.45 max —
      // user wanted the rings 50% darker than the prior 0.30 setting.)
      const ketPhase  = this.time % 10;
      const ketPulse  = ketPhase < 4 ? 1.0 : 0.7;
      const ketCore   = Math.max(0, ket - 0.20) * 0.45;
      const ketVig    = ketCore * ketPulse;
      // Track nod cycles for the every-4th full-closure logic below.
      // nodFreq matches the envelope frequency: 0.45 + hero * 0.35.
      {
        const _nodFreq = 0.45 + hero * 0.35;
        const nodCycleIdx = Math.floor(this.time * _nodFreq / (Math.PI * 2));
        if (nodCycleIdx !== this._lastNodCycleIdx) {
          this._lastNodCycleIdx = nodCycleIdx;
          // Every 2nd nod is a "full close" — eyelids slam shut.
          // (Doubled from every-4th per user — full closes hit 50% more
          // often so the visual punctuation is more frequent.)
          this._fullCloseThisCycle = (nodCycleIdx % 2) === 1;
        }
      }
      // Heroin no longer contributes to the rectangular ring-vignette —
      // the perimeter blobs below carry the entire heroin look, since
      // the rectangle in the centre of the screen was reading as a UI
      // artifact.  Fent/ket/rx/tranq still use the ring vignette.
      const rxTunnelBoost = (this._rxRoll === 3) ? 0.25 : 0;
      const tranqBoost    = this._comboTranq ? 0.20 : 0;
      const vigStrength   = clamp(
        fent * 1.8 + ketVig + rxTunnelBoost + tranqBoost,
        0, 1);
      if (vigStrength > 0.02) {
        this._drawVignette(this.vignetteGfx, vigStrength);
      }

      // Fentanyl tunnel vision — extend past screen edges so a rotated
      // camera (ketamine tilt) doesn't reveal black corners outside.
      if (fent > 0.1) {
        const border = fent * 120;
        this.vignetteGfx.fillStyle(0x000000, fent * 0.85);
        this.vignetteGfx.fillRect(-150, -150, border + 150, 750);
        this.vignetteGfx.fillRect(800 - border, -150, border + 150, 750);
        this.vignetteGfx.fillRect(-150, -150, 1100, border * 0.6 + 150);
        this.vignetteGfx.fillRect(-150, 450 - border * 0.6, 1100, border * 0.6 + 150);
        // Flat fent dim — paints the FULL screen (including the otherwise-
        // clear vignette center) so the world goes visibly dimmer the
        // higher the bar climbs.  User feedback (twice): not dark enough.
        // Now ~0.70 black at fent=1.0, on top of the ring vignette.
        this.vignetteGfx.fillStyle(0x000000, fent * 0.70);
        this.vignetteGfx.fillRect(-150, -150, 1100, 750);
        // Center-only second dim — kills the visible "rectangle outline"
        // where the ring vignette's inner clear band meets the first ring.
        // Without this, the screen has a darker frame around a noticeably
        // brighter center pane.  Painted only inside the clear band
        // (matches _drawVignette's startHalfW=180, startHalfH=95 from
        // center 400,225 → roughly x∈[220,580], y∈[130,320]).
        // Center patch matches the innermost ring's alpha (0.50) so the
        // gradient transitions seamlessly from the clear band into the
        // ring zone — no visible "rectangle outline" boundary.
        this.vignetteGfx.fillStyle(0x000000, fent * 0.50);
        this.vignetteGfx.fillRect(220, 130, 360, 190);

        // Heartbeat (≥ 30%) — vignette-edge swell every beat.  Two-beat
        // lub-dub: primary thump + softer echo.  ~60 bpm (1 Hz primary).
        if (fent > 0.30) {
          const beat   = this.time * Math.PI * 2;
          const lub    = Math.max(0, Math.sin(beat));
          const dub    = Math.max(0, Math.sin(beat - 1.05)) * 0.55;
          const heart  = (lub + dub) * (fent - 0.30) / 0.70;
          const hb = 60 * heart;
          this.vignetteGfx.fillStyle(0x000000, Math.min(1, 0.35 + 0.45 * heart));
          this.vignetteGfx.fillRect(-150, -150, hb + 150, 750);
          this.vignetteGfx.fillRect(800 - hb, -150, hb + 150, 750);
          this.vignetteGfx.fillRect(-150, -150, 1100, hb * 0.6 + 150);
          this.vignetteGfx.fillRect(-150, 450 - hb * 0.6, 1100, hb * 0.6 + 150);
        }

        // Severe darkness (≥ 50%) — additional black wash on top.
        if (fent > 0.50) {
          this.vignetteGfx.fillStyle(0x000000, (fent - 0.50) * 0.30);
          this.vignetteGfx.fillRect(-150, -150, 1100, 750);
        }
      }

      // Heroin "tunnel vision" — pulsing translucent grey blobs around
      // the screen perimeter instead of rectangular eyelid bars.  The
      // blobs grow + brighten during each nod, contracting between
      // them so the frame visibly breathes.  Every 4th nod the blobs
      // swell large enough to fully overlap and close the view.
      if (hero > 0.25) {
        const heroIntensity = Math.min(1, (hero - 0.25) / 0.75); // 0..1
        const nod           = this._heroNodAmount ?? 0;
        // Base radius scales with hero level + breathes with the nod.
        // Full-close cycle adds a big extra so the blobs slam shut.
        // Boost bumped from 130 → 195 (50% bigger blobs when fully
        // closing) so the closed state really constricts the view.
        const fullCloseBoost = this._fullCloseThisCycle ? 195 * nod : 0;
        const baseR = 70 + heroIntensity * 35 + nod * 75 + fullCloseBoost;

        // Perimeter blob count per side — top/bottom denser than sides
        // because the screen is wider than tall.
        const NUM_HORIZ = 13;
        const NUM_VERT  = 8;
        const SCR_W     = 800;
        const SCR_H     = 450;

        const drawBlob = (cx, cy, r, color, a) => {
          this.vignetteGfx.fillStyle(color, a);
          this.vignetteGfx.fillCircle(cx, cy, r);
        };

        const drawPerimeterBlob = (cx, cy, idxSeed) => {
          // Per-blob desync — each blob has its own micro-pulse so they
          // don't all expand in lockstep.  ~0.2 amplitude.
          const wobble = 1 + Math.sin(this.time * 1.6 + idxSeed * 1.7) * 0.18;
          const r = baseR * wobble;
          // Two-pass: outer translucent halo + smaller darker core.
          drawBlob(cx, cy, r,        0x1A1A1A, 0.42);
          drawBlob(cx, cy, r * 0.62, 0x2E2E2E, 0.38);
        };

        // Top edge — blobs sit slightly above screen so only their
        // lower halves intrude into the play area.
        for (let i = 0; i < NUM_HORIZ; i++) {
          const fx = (i + 0.5) / NUM_HORIZ;
          const x  = fx * SCR_W;
          drawPerimeterBlob(x, -25, i);
        }
        // Bottom edge.
        for (let i = 0; i < NUM_HORIZ; i++) {
          const fx = (i + 0.5) / NUM_HORIZ;
          const x  = fx * SCR_W;
          drawPerimeterBlob(x, SCR_H + 25, i + 17);
        }
        // Left edge.
        for (let i = 0; i < NUM_VERT; i++) {
          const fy = (i + 0.5) / NUM_VERT;
          const y  = fy * SCR_H;
          drawPerimeterBlob(-25, y, i + 31);
        }
        // Right edge.
        for (let i = 0; i < NUM_VERT; i++) {
          const fy = (i + 0.5) / NUM_VERT;
          const y  = fy * SCR_H;
          drawPerimeterBlob(SCR_W + 25, y, i + 47);
        }

        // Full-close cycle: extra opaque wash in the centre during peak
        // nod so the every-4th nod really does black out (the perimeter
        // blobs alone are translucent and would never fully cover).
        if (this._fullCloseThisCycle && nod > 0.55) {
          const closeAlpha = (nod - 0.55) / 0.45;     // 0..1
          this.vignetteGfx.fillStyle(0x000000, closeAlpha * 0.92);
          this.vignetteGfx.fillRect(-150, -150, 1100, 750);
        }
      }

      // Ketamine TV static — old-CRT "snow" noise that ramps with the
      // bar.  Three bands:
      //    30–85%  → light to moderate snow (count + alpha grow)
      //    85–100% → OVERDRIVE: heavy snow that buries the road, plus
      //              big speck blocks so the screen is genuinely hard
      //              to see through (per user spec).
      if (ket > 0.30) {
        const t01       = clamp((ket - 0.30) / 0.70, 0, 1);    // 0 at 30%, 1 at 100%
        const overdrive = clamp((ket - 0.85) / 0.15, 0, 1);    // 0 below 85%, 1 at 100%
        const COUNT  = Math.floor(150 + 750 * t01 + 2200 * overdrive); // up to ~3000 at peak
        const alpha  = clamp(0.45 + 0.45 * t01 + 0.20 * overdrive, 0, 1);
        const W = 1100, H = 750, X0 = -150, Y0 = -150;
        // Big-block bias grows in the overdrive band so the noise
        // CLUMPS into 4–6 px squares that visually obscure the road.
        const bigBias = overdrive * 0.45;
        for (let i = 0; i < COUNT; i++) {
          const x = X0 + Math.random() * W;
          const y = Y0 + Math.random() * H;
          const v = Math.random();
          const grey = Math.floor(v * 255);
          const col  = (grey << 16) | (grey << 8) | grey;
          // Speck size weighted by overdrive — at peak K, ~half the
          // specks become 4–6 px blocks instead of 1–3 px dots.
          let sz;
          if (Math.random() < bigBias) {
            sz = 4 + Math.floor(Math.random() * 3);             // 4–6 px clumps
          } else {
            sz = v > 0.95 ? 3 : (v > 0.7 ? 2 : 1);
          }
          this.vignetteGfx.fillStyle(col, alpha);
          this.vignetteGfx.fillRect(Math.floor(x), Math.floor(y), sz, sz);
        }
        // Above 85%, paint a few horizontal "roll bars" — wide grey
        // streaks that scroll down each frame.  Sells the dying-CRT vibe.
        if (overdrive > 0.05) {
          const ROLL_BARS = Math.floor(2 + 5 * overdrive);
          for (let i = 0; i < ROLL_BARS; i++) {
            const ry = Y0 + ((this.time * (60 + i * 23) + i * 137) % H);
            const rh = 4 + (i % 3) * 2;
            const rg = 120 + Math.floor(Math.random() * 100);
            const rcol = (rg << 16) | (rg << 8) | rg;
            this.vignetteGfx.fillStyle(rcol, 0.35 + 0.35 * overdrive);
            this.vignetteGfx.fillRect(X0, Math.floor(ry), W, rh);
          }
        }
      }
    }

    // ── Camera Zoom Pulse (weed / shrooms) ────────────────────────────
    // Pulse amplitude bumped — was 0.04 (4% sway, easy to miss).  Now
    // 0.10 base + frequency lifted slightly so the breathing reads as
    // an obvious "world inhaling" rather than a subliminal nudge.
    if (shrooms > 0.15 || weed > 0.3) {
      const zoomBase  = 1 + (shrooms * 0.10 + weed * 0.04);
      const zoomPulse = Math.sin(t * (0.6 + shrooms * 0.9))
                      * (shrooms * 0.10 + weed * 0.02);
      camera.setZoom(clamp(zoomBase + zoomPulse, 0.85, 1.30));
    } else {
      const currZoom = camera.zoom;
      if (Math.abs(currZoom - 1) > 0.001) {
        camera.setZoom(lerp(currZoom, 1, 0.05));
      }
    }

    // ── Ketamine camera tilt (≥ 40%, capped at 20°) ───────────────────
    // Above 40% the bar drives the camera tilt amplitude.  At 40% →
    // ±0°, 50% → ±5°, …, 80% → ±20° cap (margin around the viewport
    // is 150 px; going harder would reveal black corners).  The tilt
    // OSCILLATES between +amp and -amp instead of holding at +amp so
    // the dissociation reads as the head rolling, not just leaning.
    // Period ~6 s feels woozy without making the player nauseous.
    let targetTiltRad = 0;
    if (ket >= 0.40) {
      const ampDeg = Math.min(20, (ket - 0.40) / 0.10 * 5);
      const ampRad = ampDeg * Math.PI / 180;
      // sin(t * ω) gives -1..+1; multiply by amplitude.  Frequency
      // ~0.17 Hz (full +20 → -20 → +20 cycle every ~6 s).
      targetTiltRad = ampRad * Math.sin(this.time * (Math.PI * 2 * 0.17));
    }
    const currentRot = camera.rotation || 0;
    const newRot     = lerp(currentRot, targetTiltRad, 0.08);
    if (Math.abs(newRot - currentRot) > 0.0001) camera.setRotation(newRot);
  }

  _drawVignette(g, strength) {
    // Proper edge-darkening vignette: bright clear ellipse in the centre,
    // progressively darker concentric frame rings extending outward.
    // The OLD implementation paint slices that overlapped at the centre,
    // accidentally inverting the gradient (centre was darkest, edges
    // were lightest) — which is why ketamine "felt pitch black at 70%".
    //
    // Each ring is 4 thin frame strips (top/bottom/left/right) hugging
    // a clear-rect boundary that grows outward.  Outer rings hit fewer
    // strips → less alpha; the screen's outer edges sit inside ALL rings
    // and accumulate the most black.
    const cx = 400, cy = 225;
    // Lots of thin rings = visually smooth gradient (per user request:
    // "make it as smooth of a transition / blend as you can").  Each
    // ring is only a few px wide, so neighbouring alpha steps are too
    // small to read as distinct bands — the eye sees a smooth fade.
    const RINGS = 28;
    // Innermost clear band — the centre stays mostly visible.
    const startHalfW = 180;        // ~45% of screen width clear at minimum
    const startHalfH =  95;
    // Step sizes pick up where the old 7-ring × 60px vignette left off:
    // 28 × 15 = 420 horizontal extension matches the old 7 × 60 = 420.
    const stepHalfW  =  15;
    const stepHalfH  =  10;
    // Per-ring alpha — graduated from 0.50 (innermost) to 0.80 (outermost)
    // at full strength.  With 28 rings the per-step delta is ~0.011, so
    // the whole vignette reads as a smooth blend instead of discrete rings.
    if (strength < 0.05) return;
    const RING_INNER_ALPHA = 0.50;
    const RING_OUTER_ALPHA = 0.80;
    const ringStep = (RING_OUTER_ALPHA - RING_INNER_ALPHA) / Math.max(1, RINGS - 1);
    for (let r = 0; r < RINGS; r++) {
      const ringAlpha = strength * (RING_INNER_ALPHA + r * ringStep);
      g.fillStyle(0x000000, Math.min(1, ringAlpha));
      const innerHalfW = startHalfW + r * stepHalfW;
      const innerHalfH = startHalfH + r * stepHalfH;
      const outerHalfW = innerHalfW + stepHalfW;
      const outerHalfH = innerHalfH + stepHalfH;
      // Top strip — between (cy - outerHalfH) and (cy - innerHalfH),
      // spanning the full outer width.
      const topY    = cy - outerHalfH;
      const botY    = cy + innerHalfH;
      const leftX   = cx - outerHalfW;
      const stripeH = stepHalfH;
      const fullW   = outerHalfW * 2;
      const stripeW = stepHalfW;
      const innerH  = innerHalfH * 2;
      g.fillRect(leftX,           topY,                fullW,   stripeH);   // top strip
      g.fillRect(leftX,           botY,                fullW,   stripeH);   // bottom strip
      g.fillRect(leftX,           cy - innerHalfH,     stripeW, innerH);    // left strip
      g.fillRect(cx + innerHalfW, cy - innerHalfH,     stripeW, innerH);    // right strip
    }
    // Final outer "bleed" — paint solid black BEYOND the last ring out
    // to the painted-margin edge, so the corners get the maximum
    // darkening.  Slightly darker than the outermost ring (0.85 vs 0.80).
    const lastHalfW = startHalfW + RINGS * stepHalfW;
    const lastHalfH = startHalfH + RINGS * stepHalfH;
    g.fillStyle(0x000000, Math.min(1, strength * 0.85));
    // Top bleed
    g.fillRect(-150, -150, 1100, (cy - lastHalfH) - (-150));
    // Bottom bleed
    g.fillRect(-150, cy + lastHalfH, 1100, 600 - (cy + lastHalfH));
    // Left bleed
    g.fillRect(-150, cy - lastHalfH, (cx - lastHalfW) - (-150), lastHalfH * 2);
    // Right bleed
    g.fillRect(cx + lastHalfW, cy - lastHalfH, 950 - (cx + lastHalfW), lastHalfH * 2);
  }

  triggerShake(durationMs, intensity) {
    if (this.scene && this.scene.cameras) {
      this.scene.cameras.main.shake(durationMs, intensity);
    }
  }

  /** Physics modifiers returned as plain object for Player to read */
  getPhysics(drugs) {
    const alc   = drugs.get(DRUGS.ALCOHOL);
    const weed  = drugs.get(DRUGS.WEED);
    const coke  = drugs.get(DRUGS.COCAINE);
    const shrooms = drugs.get(DRUGS.SHROOMS);
    const lsd   = drugs.get(DRUGS.LSD);
    const hero  = drugs.get(DRUGS.HEROIN);
    const fent  = drugs.get(DRUGS.FENTANYL);
    const ket   = drugs.get(DRUGS.KETAMINE);
    const rx    = drugs.get(DRUGS.RX);
    const meth  = drugs.get(DRUGS.METH);

    const t = this.time;

    // Cocaine burns off some of alcohol's debuffs
    const alcCokeNet = Math.max(0, alc - coke * 0.55);
    // Effective alcohol for STEER DRIFT only — first beer (0.07) shouldn't
    // feel impaired.  Deadzone of 0.10 means drift kicks in around the 2nd
    // beer (0.14 → effective 0.04).  Overall magnitude reduced by ⅓
    // vs the pre-deadzone baseline (rescale 1/0.90 × 2/3 ≈ 0.741) so even
    // a full bar drifts gentler than before.
    const alcDriftAmt = Math.max(0, alcCokeNet - 0.10) * (1 / 0.90) * (2 / 3);

    // Weed only slows the car when it's the ONLY drug active
    const weedAlone  = weed > 0.05
      && alc < 0.05 && coke < 0.05 && hero < 0.05 && fent < 0.05
      && shrooms < 0.05 && lsd < 0.05 && rx < 0.05 && ket < 0.05 && meth < 0.05;
    const weedSpeedPenalty = weedAlone ? weed * 0.22 : 0;
    const weedTimePenalty  = weedAlone ? weed * 0.18 : 0;

    // Fentanyl: -10 mph per 10 % of bar (per spec).  Top speed reads
    // 120 mph at multiplier 1.0, so each 10 % fent should drop the
    // multiplier by ~0.083 (10/120).  Applied as a smooth proportional
    // subtraction — no hard cap.
    const baseSpeedMult = clamp(
      1 + coke * 0.55
        + meth * 0.45                   // meth: speed boost (jittery wired)
        - hero * 0.5
        - fent * (10 / 12)              // -10 mph per 10 % fent (from 120 mph cap)
        - weedSpeedPenalty
        - ket  * 0.35
        - rx   * 0.15,
      0.1, 1.8
    );
    let _speedMult = baseSpeedMult;
    // Tranq combo (hero + ket): final speed × 0.85.
    if (this._comboTranq) _speedMult *= 0.85;
    // Speedball combo (coke + hero): cocaine pulse fights heroin nod —
    // brief speed boost at nod TROUGH (when nodAmount low), no boost at
    // peak.  Drives the "fighting" sensation.
    if (this._comboSpeedball) {
      const _nod = this._heroNodAmount ?? 0;
      _speedMult += 0.25 * coke * (1 - _nod);
    }
    const speedMult = _speedMult;

    return {
      speedMult,

      // Cocaine bumped from +0.2 → +0.45 (sharper, brittle precision).
      steerSensitivity: clamp(
        1 - alcCokeNet * 0.4
          - hero * 0.6
          - fent * 0.8
          - ket  * 0.5
          + coke * 0.45
          + meth * 0.35,
        0.1, 1.7
      ),

      // Snow-Cone (alc + coke) suppresses alcohol's swerve 50% but adds
      // a high-freq tremor.  Rx jitter roll bumps swerve too.
      steerDrift: (
          Math.sin(t * 2.1 + 0.5) * alcDriftAmt * 0.80
            * (this._comboSnowCone ? 0.5 : 1.0)
        + Math.sin(t * 0.7 + 1.2) * hero  * 0.3
        + Math.sin(t * 3.2 + 0.9) * fent  * 0.4
        + Math.sin(t * 1.5 + 2.1) * ket   * 0.25
        + Math.sin(t * 12.0 + 0.3) * meth * 0.55
        + Math.sin(t * 17.5 + 1.7) * meth * 0.35
        + (this._comboSnowCone ? Math.sin(t * 8) * 0.2 * alc * coke : 0)
        + ((this._rxRoll === 2) ? Math.sin(t * 9) * 0.4 * rx : 0)
      ),

      // Shrooms back at 0.005 (user wanted the higher road sway restored).
      // Snow-Cone suppresses alcohol curve; Psychedelic combo boosts
      // shrooms 2x.
      extraCurve: Math.sin(t * 1.8) * alcCokeNet * 0.003
                    * (this._comboSnowCone ? 0.5 : 1.0)
                + Math.sin(t * 0.6) * shrooms * 0.005
                    * (this._comboPsychedelic ? 2.0 : 1.0)
                + Math.sin(t * 9.0) * meth    * 0.004,

      invertSteering: lsd > 0.72,

      dtMultiplier: clamp(1 - weedTimePenalty - hero * 0.4, 0.3, 1.2),

      // ── Heroin sedation (ket also lags input, layered) ─────────
      nodAmount:       this._heroNodAmount ?? 0,
      inputLag:        hero * 0.45 + ket * 0.30,
      steerReturnSlow: hero * 0.50 + ket * 0.25,
      microsleep: (hero >= 0.65 && (this._heroNodAmount ?? 0) > 0.85),

      // ── Alcohol overcorrection ─────────────────────────────────
      // After releasing input, steerVelocity holds in last direction
      // briefly — drunk-driver overshoot feel.  Drives a snow-slip-style
      // holdover branch in _updatePlayer.  Uses the deadzoned alcDriftAmt
      // and a reduced 0.30 scale so 4-beer drift isn't catastrophic.
      alcoholHoldover: alcDriftAmt * 0.30,

      // ── Cocaine wired ──────────────────────────────────────────
      cameraTremor:   coke * 1.5,           // tiny per-frame shake amplitude
      cocaineStarMul: 1 + coke * 0.5,       // CopSystem.addStar multiplier

      // ── Meth + LSD HUD flicker (additive) ──────────────────────
      hudFlicker: (meth > 0.5 ? (meth - 0.5) * 0.20 : 0)
                + (lsd  > 0.5 ? (lsd  - 0.5) * 0.15 : 0),

      // ── Weed cushion ───────────────────────────────────────────
      accelMul:           weedAlone ? 1 - weed * 0.30 : 1,
      collisionShakeDamp: weed * 0.5,

      // ── Fentanyl HUD fade ──────────────────────────────────────
      hudAlphaMul: 1 - fent * 0.45,

      // ── Ketamine retinal drift (px lateral on tire shadow) ────
      kRetinalDrift: ket * 4,

      // ── Shrooms world-breathing (consumer not yet wired) ───────
      worldBreathing: shrooms * 0.04,

      // ── Rx roulette (only the active roll's field is non-zero) ─
      // _rxRoll: 0=focus 1=drowsy 2=jitter 3=tunnel 4=traffic-boost
      rxFocus:        (this._rxRoll === 0) ? 0.15                          : 0,
      rxLag:          (this._rxRoll === 1) ? 0.10                          : 0,
      rxJitter:       (this._rxRoll === 2) ? Math.sin(t * 9) * 0.4 * rx    : 0,
      rxTunnel:       (this._rxRoll === 3) ? 0.25                          : 0,
      rxTrafficBoost: (this._rxRoll === 4) ? 1.5                           : 1.0,

      // ── Combo flags ────────────────────────────────────────────
      comboSnowCone:    !!this._comboSnowCone,
      comboTranq:       !!this._comboTranq,
      comboPsychedelic: !!this._comboPsychedelic,
      comboSpeedball:   !!this._comboSpeedball,
      comboApocalypse:  !!this._comboApocalypse,
    };
  }
}
