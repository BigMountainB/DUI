import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { GameScene }    from './scenes/GameScene.js';
import { RestStopScene } from './scenes/RestStopScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { SCREEN_W, SCREEN_H, VEHICLES, getLocationName, TOTAL_ROUTE_MILES, DRUGS, DRUG_CONFIG, REST_STOPS } from './constants.js';
import { Weather } from './world/Weather.js';
import { DRUG_PRICE } from './scenes/RestStopScene.js';
import { AchievementSystem } from './systems/AchievementSystem.js';
import { AudioSystem }       from './systems/AudioSystem.js';

// Audio unlock is installed by an inline <script> at the top of
// index.html so the listener is in place BEFORE the module bundle is
// even fetched.  See window.__audioUnlockCount / __audioUnlockedRunning
// / __audioUnlockDiag for runtime state.

const config = {
  type: Phaser.AUTO,
  width:  SCREEN_W,
  height: SCREEN_H,
  backgroundColor: '#000000',
  scale: {
    mode:            Phaser.Scale.FIT,
    autoCenter:      Phaser.Scale.CENTER_BOTH,
    zoom: window.devicePixelRatio || 1,
  },
  input: {
    activePointers: 3,
  },
  render: {
    antialias:        true,
    pixelArt:         false,
    roundPixels:      false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, GameScene, RestStopScene, GameOverScene],
};

// Run as soon as the DOM is parsed — was previously gated on
// `window.load` which only fires after every image/font has finished
// downloading.  On a slow connection that's seconds during which
// `window.__music` (and the registry) didn't exist, so the iPhone-
// menu music app saw an empty station list and showed "Loading…"
// indefinitely.  DOMContentLoaded is the right trigger — by then
// the body element exists and Phaser can mount its canvas.
const _boot = () => {
  const game = new Phaser.Game(config);

  // ── Text-entry vs. game keyboard ─────────────────────────────────────
  // The game binds driving / hotkeys (W A S D F M R Q, Space, Enter, arrows)
  // through Phaser's keyboard, which CAPTURES them (preventDefault) globally
  // and also runs on('keydown') handlers (dev-warp digits, Shift+L handedness,
  // etc.).  While the player is typing in an HTML field (the license-plate name
  // box, code entry…) that swallows those letters and can trigger game actions
  // mid-type.  So: suspend Phaser's keyboard (handlers + key captures) whenever
  // a text field is focused, and restore it on blur.
  let _savedKeyCaptures = null;
  const _gameKb = () => game.scene?.getScene?.('Game')?.input?.keyboard;
  const _isTextField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  const _suspendGameKeys = () => {
    const k = _gameKb();
    if (!k || _savedKeyCaptures !== null) return;   // already suspended
    try {
      _savedKeyCaptures = k.getCaptures?.() ?? [];
      k.clearCaptures?.();          // stop preventDefault — let letters reach the input
    } catch (_) { _savedKeyCaptures = []; }
    k.enabled = false;              // stop driving/hotkey handlers from firing
  };
  const _resumeGameKeys = () => {
    const k = _gameKb();
    if (k) {
      k.enabled = true;
      try { if (_savedKeyCaptures && _savedKeyCaptures.length) k.addCaptures?.(_savedKeyCaptures); } catch (_) {}
    }
    _savedKeyCaptures = null;
  };
  document.addEventListener('focusin',  (e) => { if (_isTextField(e.target)) _suspendGameKeys(); });
  document.addEventListener('focusout', (e) => { if (_isTextField(e.target)) _resumeGameKeys(); });

  // Register the AudioSystem on the registry IMMEDIATELY so the
  // iPhone-menu music app can read stations without waiting for
  // Phaser's BootScene to finish preloading assets.  BootScene later
  // checks for an existing instance instead of overwriting this one,
  // so save/wallet still get wired up the same way.
  if (!game.registry.get('audio')) {
    const _audio = new AudioSystem();
    game.registry.set('audio', _audio);
    // Expose so the inline unlock script can boot music as soon as
    // iOS lets us — regardless of which button the user tapped first.
    window.__audio = _audio;
    if (window.__audioUnlockedRunning) {
      try { _audio.init?.(); } catch (_) {}
    }
  }

  // Block native touch behavior everywhere EXCEPT inside the
  // phone-menu HTML overlay.  The overlay's modals (music list,
  // trophy list, volume slider) need native scroll + drag, so those
  // touches pass through.  Everything else (the game canvas, the
  // landscape title screen, pause menu) gets preventDefault so
  // Phaser's input pipeline isn't competing with iOS scroll/zoom.
  const _blockGameTouch = (e) => {
    // The phone-menu overlay AND the license-plate modal need native
    // touch (scroll, input focus, the on-screen keyboard, button taps),
    // so their touches pass through untouched.  Everything else (game
    // canvas, landscape title screen) gets preventDefault so iOS
    // scroll/zoom doesn't fight Phaser's input pipeline.  Without the
    // #plate-modal exemption the plate input never focused (no keyboard,
    // so "can't change the name") and the DONE/CANCEL taps were swallowed
    // — the whole picker looked frozen.
    if (e.target?.closest?.('#phone-menu, #plate-modal')) return;
    e.preventDefault();
  };
  document.addEventListener('touchstart', _blockGameTouch, { passive: false });
  document.addEventListener('touchmove',  _blockGameTouch, { passive: false });
  document.addEventListener('touchend',   _blockGameTouch, { passive: false });

  // Phone-as-menu pause/resume.
  // Flow:
  //   portrait → pause Game/RestStop, show HTML menu overlay (CSS does
  //   the visibility flip).
  //   landscape → game stays PAUSED on a "tap anywhere to resume" hold
  //   until the player's first pointerdown.  Lock-pause skips the
  //   tap-resume entirely (player must tap the in-game pause button or
  //   unlock from the portrait menu).
  // iOS dispatches orientationchange BEFORE window.innerWidth/Height
  // update, so the check is deferred to the next animation frame.
  const SCENES_TO_PAUSE = ['Game', 'RestStop'];
  let lockedByPhone = false;
  let pendingTapResume = false;

  // DOM-side handles for the menu overlay JS (lock button, steering
  // mode highlight, player-position dot on the map).
  window.__phoneLock = {
    get: () => lockedByPhone,
    set: (v) => {
      lockedByPhone = !!v;
      // Try the Screen Orientation API first.  Lock the iPhone menu
      // to portrait (the menu's design orientation) using the shorthand
      // 'portrait' literal — iOS Safari is more reliable with the
      // shorthand than with 'portrait-primary'.  Logs failures so the
      // user can verify behavior via Safari remote debug.
      try {
        if (lockedByPhone) {
          const p = screen.orientation?.lock?.('portrait');
          if (p && typeof p.then === 'function') {
            p.then(()  => console.log('[Lock] portrait lock OK'))
             .catch(e => console.warn('[Lock] portrait lock rejected:', e?.message ?? e));
          }
        } else {
          screen.orientation?.unlock?.();
        }
      } catch (e) {
        console.warn('[Lock] orientation API threw:', e?.message ?? e);
      }
      // CSS fallback — body class lets the stylesheet rotate the menu
      // back to a portrait look when iOS won't physically lock the
      // device (Safari outside PWA standalone, older iOS, etc.).
      document.body.classList.toggle('phone-locked', lockedByPhone);
      // While locked we want the game paused even if the player is
      // currently landscape — re-evaluate to enforce it.
      requestAnimationFrame(() => applyOrientation());
    },
  };
  window.__phaserGame = game;          // for the menu's map renderer
  window.__restStops  = REST_STOPS;    // for the phone-map "Next Rest Stop" panel
  // License plate = the ACTIVE player slot's handle (their leaderboard name).
  // Each of the 3 title-screen slots is a full independent save; this bridge
  // always reads/writes whichever slot is currently selected.
  const _sanitizePlate = (v) =>
    String(v || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 8);
  window.__plate = {
    get:        () => game.registry.get('save')?.activePlate ?? '',
    needsEntry: () => !((game.registry.get('save')?.activePlate ?? '').trim()),
    set: (v) => {
      const plate = _sanitizePlate(v);
      if (!plate) return { ok: false };
      game.registry.get('save')?.setActivePlate?.(plate);
      return { ok: true, plate };
    },
  };
  window.__playerMileFrac = () => {
    const s = game.scene.getScene('Game');
    if (!s?.player) return 0;
    const TOTAL = (s.constructor?.TOTAL ?? 0);
    // Use the GameScene's live constants — _odometer is the live mile.
    return Math.max(0, Math.min(1, (s._odometer ?? 0) / 293));
  };
  window.__steeringMode = {
    get: () => game.registry.get('steeringMode') ?? 'flappy',
    set: (m) => {
      m = m === 'lr' ? 'classic' : m;
      // Route through GameScene._setSteeringMode when the scene is
      // live — that's the path that calls _enableTiltSteer() (so the
      // deviceorientation listener actually attaches on desktop and
      // the iOS permission prompt fires through the user-gesture
      // prefetch).  The direct registry.set used previously skipped
      // all of that, leaving tilt mode "selected" but never wired up.
      const scene = game.scene.getScene('Game');
      const restart = () => {
        try { scene?.scene?.restart(); } catch (e) {}
      };
      if (scene && typeof scene._setSteeringMode === 'function') {
        scene._setSteeringMode(m, restart);
      } else {
        // No live scene yet — just persist for the next boot.
        game.registry.set('steeringMode', m);
        const save = game.registry.get('save');
        save?.setMode?.(m);
        restart();
      }
    },
  };

  // Achievements — flat list of every definition + earned tier (or null
  // if not yet unlocked) for the trophy modal in the phone menu.
  window.__achievements = {
    list: () => {
      const drugDefs = AchievementSystem.drugDefs();
      const runDefs  = AchievementSystem.runDefs();
      const earned   = AchievementSystem.earned(game.registry);
      const rows = [];
      // Per-drug "first-hit" achievements.
      for (const drugKey of Object.keys(drugDefs)) {
        const d = drugDefs[drugKey];
        rows.push({
          id:    d.id,
          label: d.label,
          icon:  d.icon,
          desc:  earned[d.id] ? d.desc : (d.unlockHint || ''),
          tier:  earned[d.id] ?? null,
        });
      }
      // Run-tracking achievements.
      for (const id of Object.keys(runDefs)) {
        const r = runDefs[id];
        rows.push({
          id,
          label: r.label,
          icon:  r.icon,
          desc:  r.desc,
          tier:  earned[id] ?? null,
        });
      }
      return rows;
    },
  };

  // Garage data — list of owned vehicles + accessories for the phone
  // menu's Garage modal.  Reads from registry + the active save profile.
  // The asset path for a vehicle's PNG isn't always derivable from its
  // texture key (car_back_truck_blue → car_truck_back_blue.png), so
  // map it explicitly here.
  const VEHICLE_IMG_URL = {
    car_back_white:       'assets/cars/car_back_white.png',
    car_back_blue:        'assets/cars/car_back_blue.png',
    car_back_truck_blue:  'assets/cars/car_truck_back_blue.png',
    car_back_orange:      'assets/cars/car_back_orange.png',
    car_back_green:       'assets/cars/car_back_green.png',
    car_back_blue2:       'assets/cars/car_back_blue2.png',
    codex_beater_back:          'assets/cars/codex/codex_beater_back.png',
    codex_suv4x4_back:          'assets/cars/codex/codex_suv4x4_back.png',
    codex_used_truck_back:      'assets/cars/codex/codex_used_truck_back.png',
    codex_new_truck_back:       'assets/cars/codex/codex_new_truck_back.png',
    codex_ev_truck_back:        'assets/cars/codex/codex_ev_truck_back.png',
    codex_sports_car_back:      'assets/cars/codex/codex_sports_car_back.png',
    codex_bestla_roadster_back: 'assets/cars/codex/codex_bestla_roadster_back.png',
    codex_playdout_s3x_back: 'assets/cars/codex/bestla_playdout_s3x_back.png',
  };
  window.__garage = {
    // The vehicle actually being driven (registry truth) — independent of
    // the OWNED list, so custom-mode sandbox cars (not owned) resolve too.
    // The phone-menu skin sync reads this.
    current: () => game.registry.get('vehicleId')
      ?? (game.registry.get('ownedVehicles') ?? ['beater'])[0],
    list: () => {
      const owned = game.registry.get('ownedVehicles') ?? ['beater'];
      const current = game.registry.get('vehicleId') ?? owned[0];
      const save = game.registry.get('save');
      const accMap = save?.get?.('accessories', {}) ?? {};
      return owned.map(id => {
        const v = VEHICLES[id];
        if (!v) return null;
        const a = accMap[id] ?? {};
        return {
          id,
          label:    v.label,
          hp:       v.hp,
          rangeMi:  v.rangeMi,
          topMph:   v.topMph,
          fuel:     v.fuel,
          drive:    v.drive,
          imageUrl: v.spriteBack ? VEHICLE_IMG_URL[v.spriteBack] : null,
          tint:     v.tint ?? 0xCCCCCC,
          current:  id === current,
          accessories: {
            bumper:   !!a.bumper,
            nos:      a.nos ?? 0,
            traction: !!a.traction,
          },
        };
      }).filter(Boolean);
    },
    select: (id) => {
      if (!VEHICLES[id]) return;
      game.registry.set('vehicleId', id);
      try { game.scene.getScene('Game')?.scene?.restart(); } catch (e) {}
    },
  };

  // Checkpoint warp — restart the live run at the player's last reached
  // rest stop.  Prefers the in-memory _lastCheckpoint (covers mid-run
  // dies) and falls back to the persisted save.lastRestStop.
  // After scene.restart()/start() the new scene comes online RUNNING,
  // which would let the car drive forward while the player is still in
  // the portrait menu.  Defer applyOrientation by a tick so the
  // freshly created scene immediately gets paused (portrait) and the
  // tap-to-resume gate arms when the player rotates back to landscape.
  const reapplyAfterRestart = () => {
    setTimeout(() => applyOrientation(), 50);
    setTimeout(() => applyOrientation(), 250);
  };

  // Handedness — left- or right-handed HUD layout (weapon column,
  // gas/HP/Mi positions, steering dead-zone edge).  Stored on the
  // active save profile so it survives across runs.  Live update —
  // does NOT restart the game; the player's run continues.  Per-frame
  // render code (weapons, gas icon, steering input zone) reads the
  // flag every tick so it flips on next paint; static HUD labels
  // built once in create() keep their position until the next run
  // start, which is an acceptable trade-off for keeping run progress.
  window.__handedness = {
    get: () => {
      const save = game.registry.get('save');
      return save?.get?.('settings.handedness', 'left') ?? 'left';
    },
    set: (v) => {
      const save = game.registry.get('save');
      const next = (v === 'right') ? 'right' : 'left';
      save?.set?.('settings.handedness', next);
      const gs = game.scene.getScene('Game');
      if (gs) gs._leftHanded = (next !== 'right');
    },
    toggle: () => {
      const cur = window.__handedness.get();
      window.__handedness.set(cur === 'left' ? 'right' : 'left');
    },
  };

  // Start Over — restart the run from mile 0 with the same vehicle,
  // fresh HP / drugs / party clock.  Phaser scene.restart() re-runs
  // init+create with no carry-over data; the vehicleId lives on the
  // registry so it survives the restart.  Scene is then re-paused so
  // the car waits at mile 0 until the player rotates to landscape.
  window.__startOver = () => {
    try {
      game?.scene?.getScene?.('Game')?.scene?.restart?.();
      reapplyAfterRestart();
    } catch (_) {}
  };

  // Main Menu — exit the active run and return to the title screen.
  // Mirrors GameOverScene._returnToTitle: starting Game with no resume
  // data presents the normal title overlay (difficulty picker etc.).
  // Persistent saves / unlocks stay intact.
  window.__mainMenu = () => {
    try {
      game?.scene?.start?.('Game', {});
      reapplyAfterRestart();
    } catch (_) {}
  };

  window.__checkpoint = {
    warpToLast: () => {
      const scene = game.scene.getScene('Game');
      const lc    = scene?._lastCheckpoint;
      if (lc?.position != null) {
        scene.scene.restart({
          resumeFromPosition: lc.position,
          resumeScore: lc.scoreAtCP ?? 0,
        });
        reapplyAfterRestart();
        return true;
      }
      const save = game.registry.get('save');
      const snap = save?.get?.('lastRestStop');
      if (snap?.id) {
        game.scene.start('Game', {
          resumeFromStop: snap.id,
          resumeScore:    snap.score ?? 0,
          resumeStars:    0,
        });
        reapplyAfterRestart();
        return true;
      }
      return false;
    },
  };

  // Career stats snapshot for the phone-menu Leaderboard + Stats apps.
  // Returns a plain-object copy so the menu can't mutate live state.
  window.__stats = {
    // Lifetime/persisted career stats (records, earned/spent, drugs, etc.).
    get: () => {
      const stats = game.registry.get('stats');
      if (!stats?.stats) return null;
      try { return JSON.parse(JSON.stringify(stats.stats)); }
      catch (_) { return stats.stats; }
    },
    // Current-trip (session) counters — for the Stats app's "This Trip" tab.
    session: () => {
      const stats = game.registry.get('stats');
      if (!stats?.session) return null;
      try { return JSON.parse(JSON.stringify(stats.session)); }
      catch (_) { return stats.session; }
    },
    // Local run history (this device), already sorted best-score first — for
    // the Leaderboard app's "Your Runs" ranking.
    runs: () => {
      const save = game.registry.get('save');
      const lb = save?.get?.('leaderboard', { runs: [] }) || { runs: [] };
      return (lb.runs || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    },
    // Cross-player HOUSE leaderboard — one row per player profile slot on this
    // device.  Reads every slot's records/leaderboard directly (does NOT switch
    // the active slot).  Includes only created players (a non-empty plate) plus
    // the active slot.  The UI re-sorts by score / time / miles.  records is the
    // primary source (StatsTracker keeps it current); runs is a defensive
    // fallback so a slot with history but no records still ranks.
    house: () => {
      const save = game.registry.get('save');
      const slots = save?.data?.slots;
      if (!Array.isArray(slots)) return [];
      const active = save.activeSlot | 0;
      const out = [];
      slots.forEach((slot, i) => {
        const plate = (slot?.plate ?? '').toString().trim();
        const isActive = i === active;
        if (!plate && !isActive) return;          // skip empty, non-active slots
        const rec  = slot?.global?.stats?.records ?? {};
        const runs = (slot?.global?.leaderboard?.runs) ?? [];
        const bestScore = rec.bestScore   || runs.reduce((m, r) => Math.max(m, r.score || 0), 0);
        const mostMiles = rec.mostMilesRun || runs.reduce((m, r) => Math.max(m, r.miles || 0), 0);
        let fastest = rec.fastestCompletionSec || 0;
        if (!fastest) {
          const done = runs.filter(r => r.completed && r.timeSec > 0).map(r => r.timeSec);
          if (done.length) fastest = Math.min(...done);
        }
        out.push({
          index:                i,
          plate:                plate || (isActive ? '' : '—'),
          active:               isActive,
          bestScore,
          mostMilesRun:         mostMiles,
          fastestCompletionSec: fastest || 0,
          hasRuns:              runs.length > 0,
        });
      });
      return out;
    },
  };

  // Settings app — volume / mute / haptics.  Sound routes through the
  // AudioSystem (so it works from the portrait start menu, no pause
  // needed); haptics persists to the save and is pushed to the live
  // scene (GameScene also reads it on create).
  window.__settings = {
    get: () => {
      const audio = game.registry.get('audio');
      const save  = game.registry.get('save');
      return {
        muted:   !!audio?.muted,
        volume:  audio?.volume ?? 0.32,
        haptics: save?.get?.('settings.haptics', true) !== false,
      };
    },
    setMuted: (v) => {
      const audio = game.registry.get('audio');
      if (audio && !!audio.muted !== !!v) audio.toggleMute?.();
    },
    setVolume: (v) => {
      const audio = game.registry.get('audio');
      if (!audio) return;
      audio.volume = Math.max(0, Math.min(1, Number(v) || 0));
      audio._applyMasterGain?.();
    },
    setHaptics: (v) => {
      game.registry.get('save')?.set?.('settings.haptics', !!v);
      game.scene.getScene('Game')?.haptics?.setEnabled?.(!!v);
    },
    // Speedometer / distance units: 'mph' | 'kmh'.
    getUnits: () => game.registry.get('save')?.get?.('settings.units', 'mph'),
    setUnits: (u) => {
      const uu = (u === 'kmh') ? 'kmh' : 'mph';
      game.registry.get('save')?.set?.('settings.units', uu);
      const s = game.scene.getScene('Game'); if (s) s._unitsKmh = (uu === 'kmh');
    },
    // Screen-shake intensity 0..1 (1 = full).
    getShake: () => game.registry.get('save')?.get?.('settings.shake', 1),
    setShake: (v) => {
      const t = Math.max(0, Math.min(1, Number(v) || 0));
      game.registry.get('save')?.set?.('settings.shake', t);
      const s = game.scene.getScene('Game'); if (s) s._shakeMult = t;
    },
    // Colorblind-safe mode (remaps red/green UI to blue/orange).
    getColorblind: () => game.registry.get('save')?.get?.('settings.colorblind', false) === true,
    setColorblind: (on) => {
      game.registry.get('save')?.set?.('settings.colorblind', !!on);
      const s = game.scene.getScene('Game'); if (s) s._colorblind = !!on;
    },
    // HUD visible (true) / hidden (false).
    getHud: () => game.registry.get('save')?.get?.('settings.hud', true) !== false,
    setHud: (vis) => {
      game.registry.get('save')?.set?.('settings.hud', !!vis);
      const s = game.scene.getScene('Game');
      if (s) { s._hudHidden = !vis; s._setHudVisible?.(!s._awaitingStart); }
    },
    // Reset PROGRESS — fully blanks the ACTIVE player slot (plate, lifetime
    // stats, leaderboard, achievements, money, cars, every mode's progress),
    // leaving the other players untouched.  Frees the plate so it can be
    // renamed.
    //
    // This used to end with a hard `location.reload()` for a guaranteed-clean
    // reboot, but a page reload tears down the AudioContext and the browser
    // then blocks autoplay until the next user tap — so the radio went silent
    // on reset.  Instead we soft-restart into the title (same path as
    // __mainMenu): the AudioSystem lives on the registry and survives a scene
    // restart, so the music keeps playing.  SaveSystem resolves the slot via
    // getters, so Wallet / plate / leaderboard re-read the wiped slot for
    // free; the only stale state is StatsTracker's live `stats` reference
    // (reload re-points it) and the registry vehicleId (may point at a
    // now-unowned car — drop it back to the starter).
    resetProgress: () => {
      game.registry.get('save')?.resetProgress?.();
      game.registry.get('stats')?.reload?.();
      game.registry.set('vehicleId', 'beater');
      try {
        game?.scene?.start?.('Game', {});
        reapplyAfterRestart();
      } catch (_) {}
    },
  };

  // Location widget — current town + live weather + a simulated temperature
  // for the phone-menu top bar (name by the GPS arrow, temp + symbol upper
  // right).  Temp is faked from a lowland→Cascade-pass gradient, capped by
  // the active weather so snow reads cold and rain reads cool.
  window.__location = {
    get: () => {
      const scene = game.scene.getScene('Game');
      const mile  = Math.max(0, scene?._odometer ?? 0);
      const name  = getLocationName(mile / TOTAL_ROUTE_MILES);
      let weather = 'clear';
      try { weather = Weather.state(mile); } catch (_) {}
      // Coldest at the Snoqualmie Pass summit (~mile 50), warm in the lowlands.
      const passCold = Math.max(0, 1 - Math.abs(mile - 50) / 45);
      let tempF = 70 - passCold * 33;
      if (weather === 'snow')      tempF = Math.min(tempF, 31);
      else if (weather === 'rain') tempF = Math.min(tempF, 52);
      return { name, weather, tempF: Math.round(tempF) };
    },
  };

  // The Lawyer (phone → Messages).  One-time $15k retainer, paid from the
  // run's current cash (score), halves all future "busted" fines for good.
  // Flavor contacts (The Ex / Mom / The Boss / The Unknown) — pure-tone texters.
  // GameScene logs their messages per run; the Messages app reads the threads.
  window.__buddytexts = {
    threads: () => game.scene.getScene('Game')?._buddyThreads ?? { ex: [], mom: [], boss: [], unknown: [] },
  };

  window.__lawyer = {
    status: () => {
      const save  = game.registry.get('save');
      const scene = game.scene.getScene('Game');
      return {
        retained: save?.get?.('lawyerRetained', false) === true,
        cash:     Math.max(0, Math.round(scene?.score ?? 0)),
        cost:     15000,
      };
    },
    retain: () => {
      const save  = game.registry.get('save');
      const scene = game.scene.getScene('Game');
      if (save?.get?.('lawyerRetained', false) === true) return { ok: false, reason: 'already' };
      const cash = Math.round(scene?.score ?? 0);
      if (cash < 15000) return { ok: false, reason: 'funds', need: 15000 - cash };
      if (scene) scene.score -= 15000;
      save?.set?.('lawyerRetained', true);
      return { ok: true };
    },
  };

  // The Dealer (phone → Messages).  Order a drug, pay now from the run's
  // cash (score); it's waiting FREE at the next rest stop's drug menu.
  const _dealerLabel = (id) => (DRUG_CONFIG[id]?.label ?? id).replace(/^[^A-Za-z]+/, '').trim();
  window.__dealer = {
    status: () => {
      const save    = game.registry.get('save');
      const scene   = game.scene.getScene('Game');
      const unlocks = game.registry.get('drugUnlocks');
      const isUnlocked = (id) => (unlocks && typeof unlocks === 'object')
        ? !!unlocks[id] : !!DRUG_CONFIG[id]?.unlocked;
      return {
        cash:   Math.max(0, Math.round(scene?.score ?? 0)),
        orders: (save?.get?.('dealerOrders', []) || []).slice(),
        drugs:  Object.values(DRUGS).filter(isUnlocked).map(id => ({
          id, label: _dealerLabel(id), price: DRUG_PRICE[id] ?? 200,
        })),
      };
    },
    label: (id) => _dealerLabel(id),
    order: (id) => {
      const save  = game.registry.get('save');
      const scene = game.scene.getScene('Game');
      const price = DRUG_PRICE[id];
      if (price == null) return { ok: false, reason: 'badid' };
      const cash = Math.round(scene?.score ?? 0);
      if (cash < price) return { ok: false, reason: 'funds', need: price - cash };
      if (scene) scene.score -= price;
      const orders = (save?.get?.('dealerOrders', []) || []).slice();
      orders.push(id);
      save?.set?.('dealerOrders', orders);
      return { ok: true };
    },
  };

  // The Crush (phone → Contacts).  Gender-neutral (they/them) — they invited
  // you to the party in Pullman.  Texting is FREE and once per town — keep them
  // warm each town or they cool off ("…", with annoyed/angry texts) and
  // eventually find someone else.  Reward is a party payoff at the finish, NOT
  // per-text cash.  All logic lives on GameScene (it owns the per-town /
  // checkpoint loop); this is a thin pass-through for the UI.
  window.__girl = {
    status: () => game.scene.getScene('Game')?._girlStatus?.()
      ?? { gone: false, responded: false, sent: 0, everTexted: false, canText: false, skips: 0, skipsLeft: 4, thread: [] },
    text:   () => game.scene.getScene('Game')?._girlText?.() ?? { ok: false },
  };

  // Music app — list stations and play specific tracks.
  window.__music = {
    list: () => {
      const audio = game.registry.get('audio');
      return audio?.getStations?.() ?? [];
    },
    current: () => {
      const audio = game.registry.get('audio');
      return audio ? { name: audio.currentName, index: audio.currentStation } : null;
    },
    playStation: (idx) => {
      const audio = game.registry.get('audio');
      audio?.setStation?.(idx);
    },
    playTrack: (url) => {
      const audio = game.registry.get('audio');
      audio?.playSpecificTrack?.(url);
    },
    playPlaylist: (urls) => {
      const audio = game.registry.get('audio');
      audio?.playPlaylist?.(urls);
    },
    shuffleAll: () => {
      const audio = game.registry.get('audio');
      audio?.shuffleAllTracks?.();
    },
    nextTrack: () => {
      const audio = game.registry.get('audio');
      audio?.skipTrack?.();
    },
    // Scrubber: { time, duration, name } or null when nothing's playing.
    progress: () => game.registry.get('audio')?.trackProgress?.() ?? null,
    seek: (frac) => game.registry.get('audio')?.seekTrackFrac?.(frac) ?? false,
    isMuted: () => {
      const audio = game.registry.get('audio');
      return !!audio?.muted;
    },
    // Default station (genre) that auto-plays on boot — persisted in the
    // save's settings.radio.  Setting it also switches to it now as feedback.
    getDefaultStation: () => game.registry.get('save')?.get?.('settings.radio', 0),
    setDefaultStation: (idx) => {
      const i = parseInt(idx, 10) || 0;
      game.registry.get('save')?.set?.('settings.radio', i);
      game.registry.get('audio')?.setStation?.(i);
    },
    toggleMute: () => {
      const audio = game.registry.get('audio');
      audio?.toggleMute?.();
    },
    getVolume: () => {
      const audio = game.registry.get('audio');
      return audio?.volume ?? 0.32;
    },
    setVolume: (v) => {
      const audio = game.registry.get('audio');
      if (!audio) return;
      const t = Math.max(0, Math.min(1, Number(v) || 0));
      audio.volume = t;
      // While paused, mark this as a user-initiated change so the
      // resume path doesn't snap back to the pre-pause level — the
      // player explicitly set this volume.
      if (audio.paused) audio._userTouchedVolumeWhilePaused = true;
      // All gain writes go through the perceptual-curve helper so
      // the slider feels linear to the ear.
      audio._applyMasterGain?.();
    },
    isPaused: () => {
      const audio = game.registry.get('audio');
      return !!audio?.paused;
    },
    // Pre-warm — called when the music modal opens so the
    // AudioContext + reverb/buffer/compressor graph is built BEFORE
    // the user taps a song.  Saves ~50–200 ms off the first-song
    // startup latency.  Safe to call any number of times; init()
    // bails after the first run.
    warmup: () => {
      const audio = game.registry.get('audio');
      if (!audio) return;
      if (!audio.ready) audio.init?.();
      try { if (audio._ctx?.state === 'suspended') audio._ctx.resume(); } catch (_) {}
    },
    togglePaused: () => {
      const audio = game.registry.get('audio');
      if (!audio) return;
      audio.setPaused?.(!audio.paused);
    },
    // Music app's ⏸/▶ button — truly HOLDS the music (stops the procedural
    // scheduler AND any real track) until un-paused, unlike togglePaused()
    // which is the game-pause volume duck.
    isMusicPaused: () => !!game.registry.get('audio')?.musicPaused,
    toggleMusicPaused: () => {
      const a = game.registry.get('audio');
      a?.setMusicPaused?.(!a.musicPaused);
    },
    nowPlayingUrl: () => {
      const audio = game.registry.get('audio');
      // _trackEl is the live HTMLAudioElement; its src is the current track url
      return audio?._trackEl?.src ?? null;
    },
  };

  const applyOrientation = () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    // Locked = the phone-menu CSS override keeps the menu open even in
    // landscape, so the game must also stay paused regardless of
    // rotation.
    const shouldPause = isPortrait || lockedByPhone;
    for (const key of SCENES_TO_PAUSE) {
      const scene = game.scene.getScene(key);
      if (!scene || !scene.scene) continue;
      // Skip scenes that haven't actually been started yet — calling
      // pause() on them logs "Cannot pause non-running Scene" noise.
      if (!game.scene.isActive(key) && !game.scene.isPaused(key)) continue;
      const paused  = game.scene.isPaused(key);
      const visible = game.scene.isVisible(key);
      if (shouldPause && visible && !paused) {
        game.scene.pause(key);
        pendingTapResume = false;     // entering portrait/locked clears any pending resume
      } else if (!shouldPause && paused) {
        // Don't resume immediately — arm a "first tap unpauses" hold.
        pendingTapResume = true;
      }
    }
  };

  // First pointerdown after rotation-to-landscape resumes the run.
  // Ignored while locked or while in portrait.
  const tapResumeHandler = () => {
    if (!pendingTapResume) return;
    if (window.innerHeight > window.innerWidth) return;   // still portrait
    if (lockedByPhone) return;
    for (const key of SCENES_TO_PAUSE) {
      if (game.scene.isPaused(key)) game.scene.resume(key);
    }
    pendingTapResume = false;
  };
  window.addEventListener('pointerdown', tapResumeHandler, { capture: true });
  window.addEventListener('touchstart',  tapResumeHandler, { capture: true });

  const onOrientationChange = () => requestAnimationFrame(applyOrientation);
  window.addEventListener('resize',            onOrientationChange);
  window.addEventListener('orientationchange', onOrientationChange);
  requestAnimationFrame(applyOrientation);
};

// If DOM is already parsed (modules execute after DOMContentLoaded
// fires by default), boot immediately.  Otherwise wait for the event.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _boot, { once: true });
} else {
  _boot();
}
