import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { GameScene }    from './scenes/GameScene.js';
import { RestStopScene } from './scenes/RestStopScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { SCREEN_W, SCREEN_H, VEHICLES } from './constants.js';
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
    if (e.target?.closest?.('#phone-menu')) return;
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
    isMuted: () => {
      const audio = game.registry.get('audio');
      return !!audio?.muted;
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
