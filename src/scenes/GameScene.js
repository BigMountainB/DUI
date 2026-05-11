import Phaser from 'phaser';
import {
  SCREEN_W, SCREEN_H, SEG_LENGTH, ROUTE_SEGS, ROAD_WIDTH,
  MAX_SPEED, ACCEL, BRAKE, DECEL, TURN_SPEED, OFFROAD_SLOW, CENTRIFUGAL,
  PTS_DIST, PTS_CRASH, PTS_HITCH, DRUG_MULT, DRUG_PTS,
  DRUGS, DRUG_CONFIG, DRUG_COMBOS, CHECKPOINTS, TOTAL_ROUTE_MILES, REST_STOPS,
  getLocationName,
  CAR_LEN_Z, CAR_WIDTH_LANES, PLAYER_VIRTUAL_Z,
  VEHICLES, GAS_LIGHT_AT_MI,
} from '../constants.js';
import { clamp, lerp } from '../utils/Helpers.js';
import { Road }          from '../road/Road.js';
import geoData           from '../road/routeGeo.json';
import { DrugSystem }    from '../systems/DrugSystem.js';
import { EffectsSystem } from '../systems/EffectsSystem.js';
import { CopSystem }     from '../systems/CopSystem.js';
import { HapticSystem }  from '../systems/HapticSystem.js';
import { Difficulty }    from '../systems/Difficulty.js';
import { TimeOfDay }     from '../world/TimeOfDay.js';
import { Weather }       from '../world/Weather.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { DamageModel }   from '../car/DamageModel.js';
import { getPaletteAtProgress, REGION_ORDER, REGION_PALETTES, lerpColor } from '../utils/Colors.js';

const CAM_DEPTH = 0.84;
const IMPACT    = 'Impact, "Arial Black", Arial, sans-serif';

function makePlayer() {
  return {
    position:      0,
    speed:         MAX_SPEED * 0.4,
    // Start in lane 2 (rightmost lane immediately right of the yellow center
    // line). x = 0 is the centre line — sitting there means your right half
    // is in same-direction lane 2 traffic.
    x:             0.25,
    screenX:       SCREEN_W / 2,
    xImpulse:      0,
    steerVelocity: 0,
  };
}

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'Game' }); }

  init(data) {
    this._missionConfig = data?.mission ?? null;
    this._hubReturn     = data?.hubReturn ?? null;
    // Resume-from-rest-stop: scene.start('Game', { resumeFromStop: 'C', score, ... })
    // tells us to skip the title overlay and place the player at the saved
    // mileage with the saved score. Set in RestStopScene "CONTINUE" or in
    // MenuScene/title "ENTER CODE".
    this._resumeFromStop = data?.resumeFromStop ?? null;
    this._resumeScore    = data?.resumeScore    ?? 0;
    this._resumeStars    = data?.resumeStars    ?? 0;
    this._resumePurchases = data?.purchases    ?? null;
    // Restart-from-checkpoint after death: position only, NO score/stars.
    // GameOverScene's "RESTART FROM CHECKPOINT" button passes this.
    this._resumeFromPosition = data?.resumeFromPosition ?? null;
    // Slider-restart drug levels (technical-loss / custom-mode flow) —
    // applied once after the scene reaches gameplay.
    this._customStartLevels  = data?.startDrugLevels ?? null;

    // CRITICAL: clear lazily-built per-scene-run caches.  Phaser reuses the
    // same scene instance across `scene.start('Game')` calls, but it also
    // destroys the previous run's display objects.  If we don't drop the
    // stale references here, the next _renderHUD pass calls setText() on a
    // destroyed Text, which crashes with "Cannot read properties of null
    // (reading 'drawImage')" inside Phaser's canvas pipeline.
    this._f12Texts     = null;
    this._drugLabels   = null;
    this._signTextPool  = null;      // sign-label overlay pool (same scene-restart issue)
    this._signDecalPool = null;      // hwy-shield + sign-face image pool
    // Also reset stateful flags that survive across `scene.start('Game')`.
    // _takingExit was the culprit behind the Issaquah pull-over not firing
    // — it stayed `true` from the prior Bellevue exit, blocking subsequent
    // _takeRestStopExit calls until the page was reloaded.
    this._takingExit          = false;
    this._touchExitArmed      = false;
    // Reset rest-stop / checkpoint history so a "Start Over" from the
    // pause menu actually re-prompts every stop.  Previously these sets
    // accumulated across runs — once you'd taken the Seattle exit on one
    // playthrough, the next playthrough's Seattle window was disabled
    // because the id was still in this._passedRestStops from before.
    this._passedRestStops    = new Set();
    this._passedCheckpoints  = new Set();
    this._npcCrashesPostDrink = 0;
    this._drugBumpCount       = 0;
    this._drugBumpFired       = false;
    this._playerCopCrashes    = 0;
    this._copCrashCount       = 0;
    this._lastMixedLineMile   = 0;
    this._beerLineTimer       = 90;
    this._bonusWeaponTimer    = 0;
    this._flatTireTimer       = 0;
    this._steerHistory        = null;     // drunk-delay input ring
    // Restart-from-pause / GameOver re-attach: the title-screen "any key
    // dismisses the title" listener is `once`-style.  After it fires the
    // first time, _anyKeyAttached stays true on the reused scene instance,
    // so the listener never re-attaches on the next run and the player is
    // stuck on the title screen.  Reset here every init.
    this._anyKeyAttached = false;
    // Touch-input latches — same Phaser-reuse issue.  If the player was
    // mid-tap (or held a touch button) when scene.start fired, the latch
    // stayed true into the next run and triggered phantom input.
    this._touchLeft  = false;
    this._touchRight = false;
    this._touchF12   = false;
    this._touchBrake = false;
    this._touchBoost = false;
    // HUD drug-bar drag handler — same reuse issue.  The Phaser input
    // system tears down its listeners on scene shutdown, but our
    // `_drugBarDragWired` flag persisted into the next run so the
    // re-attach was skipped and the bars stopped responding.  Clearing
    // the flag here lets _ensureDrugBarDragHandler re-register cleanly.
    this._drugBarDragWired = false;
    this._draggingDrugId   = null;
    this._drugBarHits      = null;
    // Maxed-out + full-tank per-run gates — clear so each new run can
    // award them fresh.
    this._maxedFired       = null;
    this._fullTankFired    = null;
    // Gas-stranded popup gate — fires once per empty event.
    this._strandedShown    = false;
    // Tilt-steer state — listener was attached to `window`, not the
    // scene, so a scene-restart leaves it dangling.  Detach + reset
    // so the next create() can re-attach cleanly.
    if (this._tiltAttached && this._tiltOnOrient) {
      window.removeEventListener('deviceorientation', this._tiltOnOrient, true);
    }
    this._tiltAttached    = false;
    this._tiltLeftActive  = false;
    this._tiltRightActive = false;
    this._tiltGamma       = 0;
  }

  create() {
    console.log('[GameScene] create start');
    try {
      this._doCreate();
      console.log('[GameScene] create complete');
    } catch (e) {
      console.error('[GameScene.create] FAILED:', e);
      this.add.text(SCREEN_W / 2, SCREEN_H / 2, 'GAME ERROR\n' + (e?.message ?? e), {
        fontSize: '14px', color: '#FF4444', backgroundColor: '#000', align: 'center',
      }).setOrigin(0.5);
    }
  }

  _doCreate() {
    this.cameras.main.setBackgroundColor(0x000000);

    // Track which objects belong to the world (shake/sway with the main camera)
    // vs the HUD (must remain perfectly static on a separate UI camera).
    this._worldObjects = [];
    this._hudObjects   = [];

    // ── Core systems ──────────────────────────────────────────────────
    // Difficulty needs to be hydrated FIRST — its flags gate weather,
    // day/night, damage scaling, and cop escalation for the rest of the
    // scene.  Stored on the registry so child scenes (Rest stop, Game over)
    // see the same value.
    Difficulty.hydrate(this.registry);
    // Achievement toast wiring — AchievementSystem fires this callback
    // whenever a badge is earned (or upgraded to a higher tier).  The
    // toast renders bottom-of-screen in HUD camera so it survives camera
    // tilt and shake.
    AchievementSystem.setAwardCallback((evt) => this._showAchievementToast(evt));
    // Achievement run-state trackers.
    this._noDamageTimer    = 0;          // seconds since last damage (Untouchable)
    this._noDamageFlags    = { '1m': false, '2m': false, '3m': false, '5m': false };
    this._peakStars        = 0;          // for 5★ Survivor
    this._fiveStarSurvived = false;
    this._everHitStars     = false;      // for Crystal Clean (Pullman-end)
    this._everUsedRestStop = false;      // for Iron Bladder (Pullman-end)
    // Custom-mode opt-in flags from the start-screen checkboxes.  Default
    // false; survives across scene-restart via the field but the user
    // resets them by re-launching from the title.
    this._customFlags = this._customFlags ?? { noNpcDamage: false, noPolice: false };

    this.road    = new Road();
    this.drugs   = new DrugSystem();
    // Hydrate persistent drug unlocks from the Phaser registry — survives
    // arrest/death/respawn within the same play session.  See "drugUnlocks"
    // writes after _drugUpdate (below).
    this.drugs.hydrateUnlocks?.(this.registry.get('drugUnlocks'));
    // Also restore partial-unlock progress (e.g. meth Phase 1) so a rest
    // stop or arrest doesn't wipe the cocaine-peak flag the gate depends on.
    this.drugs.hydrateProgress?.(this.registry.get('drugProgress'));
    this.effects = new EffectsSystem(this);
    this.cops    = new CopSystem();
    this.haptics = new HapticSystem();
    this.audio   = this.registry.get('audio'); // shared from BootScene — already playing
    // Always unpause on scene-create.  _endGame() and _onArrested() pause
    // the audio when a run ends, but the audio object is a registry
    // singleton so the paused flag survives into the next scene.start.
    // Without this, restarting from GameOver / FROM CHECKPOINT / START
    // OVER / rest-stop continue all left the music silent.
    this.audio?.setPaused?.(false);
    this.player  = makePlayer();

    // ── Vehicle + gas state ───────────────────────────────────────────
    // Player owns one vehicle from VEHICLES catalog; the dealership
    // (Phase 3) lets them swap.  vehicleId persists across runs via the
    // registry; defaults to the Beater on first boot.
    const _savedVehId = this.registry.get('vehicleId');
    this.player.vehicleId = (_savedVehId && VEHICLES[_savedVehId]) ? _savedVehId : 'beater';
    const _veh = VEHICLES[this.player.vehicleId];
    // Gas tank: full on each new run.  Decrements per mile in update().
    this.player.gasMi    = _veh.rangeMi;
    this.player.gasMaxMi = _veh.rangeMi;

    // ── New overhaul systems ──────────────────────────────────────────
    // HP cap pulls from the chosen vehicle's spec so a Truck can soak
    // more damage than a Beater out of the box.
    this.damage  = new DamageModel({ max: _veh.hp, durability: _veh.hp });
    this.wallet  = this.registry.get('wallet');

    // Zero-HP wreck → game-over screen.  Now that the HP bar is on the
    // HUD the player can see this coming, so auto-ending the run is fair.
    this.damage.on('wreck', () => this._endGame('crash'));

    // ── Graphics layers ───────────────────────────────────────────────
    this.roadGfx      = this.add.graphics();
    this.ghostGfx     = this.add.graphics();
    // Procedural-sprite layer (houses, buildings, etc.) — sits in the
    // tree/car depth band so they don't always render *behind* image-
    // based trees on roadGfx (depth 0).  9.45 lands above most trees
    // (which use 9.5 - relZ/76000 × 2.5, so depth ≤ 9.45 once relZ ≥
    // ~1500), so far trees paint behind houses while very close trees
    // and the player's car still paint in front.
    this.propsGfx     = this.add.graphics().setDepth(9.45);
    this.tunnelGfx    = this.add.graphics().setDepth(9.82);
    this.signGfx      = this.add.graphics().setDepth(9.86);
    this.overlayGfx   = this.add.graphics().setDepth(10);
    this.vignetteGfx  = this.add.graphics().setDepth(11);
    this.hudFlashGfx  = this.add.graphics().setDepth(12);
    this.effects.setGraphics(this.overlayGfx, this.vignetteGfx, this.hudFlashGfx);

    // Weed cushion: dampen all crash-shake intensity by phys.collisionShakeDamp.
    // Wrapping the existing triggerShake means every call site (vehicle/cop/
    // roadblock/etc.) gets the cushion without touching ~16 spots.
    {
      const _origTriggerShake = this.effects.triggerShake.bind(this.effects);
      this.effects.triggerShake = (durationMs, intensity) => {
        const _phys = this.effects.getPhysics?.(this.drugs);
        const damp  = _phys?.collisionShakeDamp ?? 0;
        _origTriggerShake(durationMs, intensity * (1 - damp));
      };
    }

    this.hudGfx = this.add.graphics().setDepth(20);
    this._hudObjects.push(this.hudGfx);

    // ── Player sprite ─────────────────────────────────────────────────
    // Sprite sits ~120 px above the bottom of the screen so there is visible
    // road *below* the car — the apparent "behind the car" view the player
    // asked for.
    // Use the player's provided car image if loaded; otherwise the procedural texture.
    const playerTex = this.textures.exists('car_player') ? 'car_player' : 'player_car';
    // Player car sits above all world sprites (which now share the 7.0–9.5
    // depth band based on z-distance) but below HUD/overlay layers (≥10).
    this.playerSprite = this.add.image(SCREEN_W / 2, SCREEN_H - 130, playerTex)
      // Bottom-anchored like NPC cars — getVehicleProjection().sy is the
      // road-contact point, so origin (0.5, 1) puts the sprite's tires
      // on that point cleanly without an arbitrary half-height fudge.
      .setOrigin(0.5, 1)
      .setDepth(9.95);
    if (playerTex === 'car_player') {
      // 25% smaller than before per request (was 120×75 → now 90×56).
      this.playerSprite.setDisplaySize(90, 56);
    } else {
      this.playerSprite.setScale(1.7 * 0.75);
    }
    // Vehicle tint — placeholder colour-coding until per-vehicle sprite
    // art lands.  Beater is left untinted (its tan is already set in
    // the catalog but we skip multiply-tint so the original art shows).
    {
      const _vehTint = VEHICLES[this.player.vehicleId]?.tint;
      if (_vehTint && this.player.vehicleId !== 'beater') {
        this.playerSprite.setTint(_vehTint);
      }
    }

    // ── Vehicle sprite pool — same SHAPE as player car, white-bodied
    // texture so each car's tint comes through cleanly. Uses Phaser Images
    // so they match the player visually.
    this._carSpritePool = [];
    for (let i = 0; i < 36; i++) {
      // setOrigin(0.5, 1) → sprite is anchored at its bottom-centre, so when
      // we place it at the road-surface y the car SITS on the road instead
      // of being half-sunken at sprite centre.
      const s = this.add.image(0, 0, 'npc_car_white')
        .setOrigin(0.5, 1)
        .setDepth(8)
        .setVisible(false);
      this._carSpritePool.push(s);
    }
    // Dedicated overlay for cop light bars at higher depth than car sprites
    // (was drawing on roadGfx at depth 0, which was hidden behind the cars).
    this._copLightGfx = this.add.graphics().setDepth(9.75);

    // Tire-shadow overlay — small dark ellipses glued to the road-contact
    // point of every car (player + NPC + cop).  Sampled from the road
    // surface, NOT from sprite Y, so a 1-3 px sprite mismatch reads as
    // grounded instead of floating.  Depth 7.4 sits below sprites (8) but
    // above the road fill (0).
    this._tireShadowGfx = this.add.graphics().setDepth(7.4);

    // Drug sprite pool — Phaser Images for the road-side drug pickups.
    this._drugSpritePool = [];
    for (let i = 0; i < 24; i++) {
      const s = this.add.image(0, 0, 'drug_beer')
        .setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
      this._drugSpritePool.push(s);
    }
    // Drug halo overlay — sits one depth-tier below the drug sprite pool
    // so the halo paints UNDER each pickup.  Used for ketamine (dark
    // outer ring + bright inner glow) and fentanyl (uniform red glow)
    // since their PNGs are too dark to spot on dark asphalt.
    this._drugHaloGfx = this.add.graphics().setDepth(8.4);

    // Double-vision ghost pools — mirror the car + drug pools at reduced
    // alpha and a lateral pixel offset.  Sized at 24 each (drug pool size)
    // since traffic count and visible pickups stay in that range.
    this._carGhostPool = [];
    for (let i = 0; i < 24; i++) {
      this._carGhostPool.push(this.add.image(0, 0, 'npc_car_white')
        .setOrigin(0.5, 1).setDepth(8).setVisible(false));
    }
    this._drugGhostPool = [];
    for (let i = 0; i < 24; i++) {
      this._drugGhostPool.push(this.add.image(0, 0, 'drug_beer')
        .setOrigin(0.5, 1).setDepth(8.5).setVisible(false));
    }

    // Building / tree sprite pool — bumped to 600 so dense urban regions can
    // populate BOTH the close foreground and the far horizon.  At the prior
    // size of 200 the pool filled with the closest ~120 buildings before the
    // iterator reached anything past mid-range, so distant blocks never got
    // sprites and buildings appeared to "pop in" only when the player was
    // ~100 feet away.
    this._sceneSpritePool = [];
    for (let i = 0; i < 600; i++) {
      const s = this.add.image(0, 0, 'building_1')
        .setOrigin(0.5, 1).setDepth(7.5).setVisible(false);
      this._sceneSpritePool.push(s);
    }

    // ── Input ─────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd    = this.input.keyboard?.addKeys({ up:'W', down:'S', left:'A', right:'D' });
    this.keyF     = this.input.keyboard?.addKey('F');
    this.keyM     = this.input.keyboard?.addKey('M');
    this.keyR     = this.input.keyboard?.addKey('R');
    // Q cycles the selected weapon (forward/backward rocket variants count
    // as separate slots so the player can pick direction).
    this.keyQ     = this.input.keyboard?.addKey('Q');
    this.keySpace = this.input.keyboard?.addKey('SPACE');
    this.keyEnter = this.input.keyboard?.addKey('ENTER');

    // ── DEV WARP — REMOVE BEFORE RELEASE ──────────────────────────────
    // Digit 1-9 jumps the player to a predefined mile marker so verification
    // of bridge / pass / palouse rendering doesn't require driving the whole
    // route.  Search "DEV WARP" before shipping and delete this block.
    const _DEV_WARP_MILES = {
      1:   3,   // West Seattle Bridge descent
      2:   7,   // Lacey V Murrow Bridge
      3:   9,   // Mercer Island climb
      4:  11,   // East Channel Bridge
      5:  45,   // Snoqualmie Pass climb
      6:  52,   // Snoqualmie Pass summit
      7: 132,   // Vantage descent
      8: 220,   // Palouse hills
      9: 285,   // Pullman approach
    };
    this._devWarpHandler = (ev) => {
      const n = Number(ev.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const mile = _DEV_WARP_MILES[n];
      if (mile == null || !this.player) return;
      this.player.position = (mile / TOTAL_ROUTE_MILES) * ROUTE_SEGS * SEG_LENGTH;
      // Clear traffic + cops + wanted state so the warp doesn't immediately
      // crash or trigger BUSTED at the finish line (warp 9 = mile 285,
      // very close to the Pullman finish — a leftover 5★ from earlier
      // gameplay was tripping the late-with-stars BUSTED branch).
      if (this.npcs) this.npcs.length = 0;
      if (this.cops?.cops) this.cops.cops.length = 0;
      if (this.cops) {
        this.cops.stars = 0;
        this.cops.headOnHits = 0;
        this.cops.rearBumps  = 0;
        this.cops.pitsLanded = 0;
      }
      // Refresh the party clock so a near-finish warp registers as
      // ON-TIME (otherwise warp 9 finishes the run immediately with
      // clock=0 → TOO LATE).
      this._partyClockSec = Difficulty.partyClockSec();
      this._showPopup?.(`WARP → mile ${mile}`, '#FFCC00');
    };
    this.input.keyboard?.on('keydown', this._devWarpHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._devWarpHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._devWarpHandler));
    // ── /DEV WARP ─────────────────────────────────────────────────────

    this._setupTouch();
    this._setupTilt();
    // Detach the window-level deviceorientation listener if the scene
    // shuts down (e.g. transition to RestStopScene) — otherwise we keep
    // burning battery and may double-attach on the next create().
    this.events.once('shutdown', () => this._disableTiltSteer());
    this.events.once('destroy',  () => this._disableTiltSteer());

    // ── State ─────────────────────────────────────────────────────────
    this.score           = 0;
    this.gameTime        = 0;
    // Party clock — counts down from Difficulty.partyClockSec() until
    // hitting 0.  Pullman finish before 0 → ON TIME (cash bonus).
    this._partyClockSec  = Difficulty.partyClockSec();
    this.lastSegIdx      = 0;
    this.popupTimer      = 0;
    this.explosions      = [];
    // ms-timestamp until which the player is invulnerable after a
    // scenery crash (tree / building / barrier).  During this window the
    // sprite blinks and _applyDamage is no-op.
    this._invincibleUntil = 0;
    this.traffic         = [];
    this._trafficTimer   = 0;
    this._prevRegion     = 0;
    this._announcedUnlocks = {};
    this._touchLeft      = false;
    this._touchRight     = false;
    this._touchF12       = false;
    this._f12KeyPressed  = false;

    // ── Odometer — advances at speed × 4× time compression ───────────
    // At 120 mph display: 120 × 4 / 3600 = 0.1333 mi/s → 120 mi in 15 min ✓
    this._odometer = 0;

    // ── Checkpoint system ─────────────────────────────────────────────
    // Start at Seattle with no score yet
    this._lastCheckpoint = { name: 'Seattle, WA', position: 0, scoreAtCP: 0 };
    this._passedCheckpoints = new Set(['Seattle, WA']);
    this._probationTimer = 0;  // seconds remaining where drug use = +2 stars
    this._gameFinished   = false;

    // ── Pause state ───────────────────────────────────────────────────
    this._paused = false;
    this._pauseGfx = this.add.graphics().setDepth(60);
    // PAUSED moved down (was 0.22) so the music-volume slider + tilt
    // toggle can sit at the top under the HUD radio/mute/genre row.
    this._pauseText = this.add.text(SCREEN_W / 2, SCREEN_H * 0.32, 'PAUSED', {
      fontSize: '42px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 8, align: 'center',
    }).setOrigin(0.5).setDepth(61).setVisible(false);
    // (Removed: SPACE to resume hint — clutter, the START OVER /
    // FROM CHECKPOINT buttons + tilt + slider make the action obvious.)
    this._pauseHint = this.add.text(SCREEN_W / 2, SCREEN_H * 0.42, '', {
      fontSize: '13px', fontFamily: 'Arial', color: '#CCCCCC',
    }).setOrigin(0.5).setDepth(61).setVisible(false);
    this._pauseObjects = [this._pauseText, this._pauseHint];

    // ── Route map modal ─────────────────────────────────────────────────
    // Built on demand by _buildMapModal() — opened from a 🗺 button on the
    // title screen and a MAP button in the pause menu.  Modal lives at a
    // higher depth than the garage modal so it can stack on top.  All
    // map graphics + labels are owned by the modal lifecycle so they're
    // destroyed when the modal closes (preventing the "labels remain up
    // after pause restart" leak the previous auto-map version had).
    this._mapModalOpen = false;
    this._mapModalObjs = null;

    // ── Pause menu: two restart buttons + music volume slider ─────────
    // Built once, hidden until the player pauses.  Each control is
    // listed in _pauseObjects so _togglePause can flip them all together.
    // Two buttons stacked horizontally:
    //   • START OVER    — fresh game from West Seattle (drops checkpoint)
    //   • FROM CHECKPOINT — replays from the last passed checkpoint
    //                       (rest stop / town).  Disabled when none exists.
    // Buttons sit BELOW the player car (~y=348) — y=388 keeps them just
    // above the BRAKE/ACCEL pedals (top edge at y=392) so the whole
    // pause column is bottom-half of the screen.
    const buttonY = SCREEN_H - 62;
    const startOverBtn = this._buildPauseButton(
      SCREEN_W / 2 - 110, buttonY, 200, 38, 'START OVER',
      0x993322, 0xFFFFFF,
      () => {
        // In-game confirm — window.confirm freezes iOS WKWebView, so use a
        // Phaser-rendered modal that's reliable on every platform.
        this._buildConfirmPopup(
          'CONFIRM START OVER?',
          'This wipes your drug unlocks and sends you back to West Seattle.',
          () => {
            this._paused = false;
            this.audio?.setPaused?.(false);
            this.registry?.remove?.('drugUnlocks');
            this.registry?.remove?.('drugProgress');
            if (this.player) this.player.position = 0;
            this._lastCheckpoint = null;
            this._odometer       = 0;
            this.scene.start('Game', {});
          },
        );
      },
    );
    this._pauseObjects.push(startOverBtn.bg, startOverBtn.txt);

    // ── Pause menu: 🗺 MAP and 🚗 GARAGE icon buttons ───────────────────
    // Sit centered just above the START OVER / FROM CHECKPOINT row so the
    // player can pop the route map or swap vehicles mid-run without
    // having to leave to the title screen.
    const iconRowY = buttonY - 56;
    const iconSize = 40;
    const iconGap  = 16;
    const mapX     = SCREEN_W / 2 - iconSize - iconGap / 2;
    const garX     = SCREEN_W / 2 + iconGap / 2;
    const makeIconBtn = (px, glyph, onClick) => {
      const bg = this.add.graphics().setDepth(62).setVisible(false);
      const draw = (alpha = 1) => {
        bg.clear();
        bg.fillStyle(0x222222, alpha);
        bg.fillRoundedRect(px, iconRowY, iconSize, iconSize, 8);
        bg.lineStyle(2, 0x66CCFF, 1);
        bg.strokeRoundedRect(px + 0.5, iconRowY + 0.5, iconSize - 1, iconSize - 1, 8);
      };
      draw(0.85);
      bg.setInteractive(new Phaser.Geom.Rectangle(px, iconRowY, iconSize, iconSize), Phaser.Geom.Rectangle.Contains);
      bg.input.cursor = 'pointer';
      const lbl = this.add.text(px + iconSize / 2, iconRowY + iconSize / 2, glyph, {
        fontSize: '22px',
      }).setOrigin(0.5).setDepth(63).setVisible(false);
      bg.on('pointerover', () => draw(1));
      bg.on('pointerout',  () => draw(0.85));
      bg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        onClick();
      });
      return [bg, lbl];
    };
    const [mapBg, mapLbl] = makeIconBtn(mapX, '🗺', () => this._buildMapModal());
    const [garBg, garLbl] = makeIconBtn(garX, '🚗', () => this._buildGarageModal());
    this._pauseObjects.push(mapBg, mapLbl, garBg, garLbl);

    const checkpointBtn = this._buildPauseButton(
      SCREEN_W / 2 + 110, buttonY, 200, 38, 'FROM CHECKPOINT',
      0x44AA66, 0x000000,
      () => {
        // Prompt for the save code instead of auto-loading the last
        // checkpoint.  Default the entry to the most recent saved code
        // so the common case is one click + Enter; the prompt's
        // built-in Cancel returns the player to the paused screen.
        const save = this.registry?.get?.('save');
        const last = save?.get?.('lastRestStop');
        const defaultCode = last?.code ?? '';
        this._promptForCode(defaultCode);
        // Note: _promptForCode handles unpause / scene.start internally
        // when the player acce$ a valid code.  If they cancel, we
        // stay paused and the menu remains visible.
      },
    );
    this._pauseObjects.push(checkpointBtn.bg, checkpointBtn.txt);

    // Pause-only secondary controls — anchored to the score-multiplier
    // slot (hudMult lives at x=120, y=14) so they reuse that real estate
    // while the run is paused.  hudMult is hidden in _togglePause so
    // there's no overlap.
    const PAUSE_COL_X    = 120;
    const PAUSE_STEER_Y  = 14;
    const PAUSE_VOL_Y    = 50;
    const PAUSE_SLIDER_Y = 70;
    const sliderY = PAUSE_SLIDER_Y;
    this._pauseVolLabel = this.add.text(PAUSE_COL_X, PAUSE_VOL_Y,
      `MUSIC VOLUME  ${Math.round((this.audio?.volume ?? 0.32) * 100)}%`, {
      fontSize: '12px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(62).setVisible(false);
    this._pauseObjects.push(this._pauseVolLabel);

    const sliderW = 220, sliderH = 14;
    const sliderL = PAUSE_COL_X;
    const sliderTrack = this.add.rectangle(sliderL, sliderY, sliderW, sliderH, 0x222222, 1)
      .setOrigin(0, 0.5).setStrokeStyle(2, 0xFFFFFF).setDepth(62).setVisible(false)
      .setInteractive({ useHandCursor: true });
    const sliderFill = this.add.rectangle(sliderL, sliderY, sliderW * (this.audio?.volume ?? 0.32), sliderH, 0x44CC88, 1)
      .setOrigin(0, 0.5).setDepth(63).setVisible(false);
    const setVolFromX = (px) => {
      const t = Math.max(0, Math.min(1, (px - sliderL) / sliderW));
      if (this.audio) {
        this.audio.volume = t;
        if (this.audio._master) this.audio._master.gain.value = (this.audio.muted || this.audio.paused) ? 0 : t;
      }
      sliderFill.setSize(sliderW * t, sliderH);
      this._pauseVolLabel.setText(`MUSIC VOLUME  ${Math.round(t * 100)}%`);
    };
    sliderTrack.on('pointerdown', (ptr) => setVolFromX(ptr.x));
    sliderTrack.on('pointermove', (ptr) => { if (ptr.isDown) setVolFromX(ptr.x); });
    this._pauseObjects.push(sliderTrack, sliderFill);

    // ── Steering mode picker — sits in the slot vacated by hudMult ─────
    const steerY      = PAUSE_STEER_Y;
    const steerSwW    = 120;
    const steerSwH    = 28;
    const steerLbl = this.add.text(PAUSE_COL_X + steerSwW + 8, steerY, 'STEERING', {
      fontSize: '15px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setDepth(62).setVisible(false);
    // 'flappy' shows as "TAP" in the picker — same internal key for save
    // compatibility, but more descriptive in the UI.
    const MODE_ORDER = ['flappy', 'classic', 'tilt'];
    const MODE_LABELS = { classic: 'CLASSIC', tilt: 'TILT', flappy: 'TAP' };
    const MODE_COLORS = { classic: 0x6688CC, tilt: 0x44CC88, flappy: 0xCC8844 };
    const initMode = this._steeringMode();
    const steerSwBg = this.add.rectangle(PAUSE_COL_X, steerY, steerSwW, steerSwH,
      MODE_COLORS[initMode], 1)
      .setOrigin(0, 0.5).setStrokeStyle(2, 0xFFFFFF).setDepth(62).setVisible(false)
      .setInteractive({ useHandCursor: true });
    const steerSwTxt = this.add.text(PAUSE_COL_X + steerSwW / 2, steerY,
      MODE_LABELS[initMode], {
        fontSize: '16px', fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#000000',
      }).setOrigin(0.5).setDepth(63).setVisible(false);
    this._refreshSteeringBtn = () => {
      const m = this._steeringMode();
      steerSwBg.setFillStyle(MODE_COLORS[m] ?? 0x444444, 1);
      steerSwTxt.setText(MODE_LABELS[m] ?? m.toUpperCase());
    };
    steerSwBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      const cur = this._steeringMode();
      const next = MODE_ORDER[(MODE_ORDER.indexOf(cur) + 1) % MODE_ORDER.length];
      this._setSteeringMode(next);
      // For tilt the registry write happens inside the async permission
      // callback; for classic/flappy it's already set, so refresh now.
      if (next !== 'tilt') this._refreshSteeringBtn();
    });
    this._pauseObjects.push(steerLbl, steerSwBg, steerSwTxt);

    this._hudObjects.push(this._pauseGfx, ...this._pauseObjects);

    // ── Resume from rest stop ─────────────────────────────────────────
    // If we were started with `resumeFromStop`, jump the player to that
    // stop's road position and restore the saved score / stars.  Skip the
    // title overlay so the player drops right back into action.
    if (this._resumeFromPosition != null) {
      // Death-respawn at last checkpoint — score/stars/drugs all zeroed.
      this.player.position = this._resumeFromPosition;
      this.score           = 0;
      this.cops.stars         = 0;
      this.cops.cops          = [];
      this.cops.bumpCount     = 0;
      this.cops.rearBumpCount = 0;
      this.cops.headOnCount   = 0;
      this.cops.pitCount      = 0;
      if (this.drugs?.levels) {
        for (const id of Object.keys(this.drugs.levels)) this.drugs.levels[id] = 0;
      }
      // Apply slider-chosen drug levels after the zero-out so the
      // technical-loss restart actually reflects the player's choices.
      if (this._customStartLevels) {
        for (const [id, lvl] of Object.entries(this._customStartLevels)) {
          this.drugs.levels[id] = lvl;
          if (lvl > 0 && this.drugs.unlocked) this.drugs.unlocked[id] = true;
        }
        this._customStartLevels = null;
      }
      this.damage?.reset?.();
      // Skip the title overlay so the player drops straight back in.
      this._awaitingStart = false;
      this._introDone     = true;
    } else if (this._resumeFromStop) {
      const rs = REST_STOPS.find(r => r.id === this._resumeFromStop);
      if (rs) {
        this.player.position = rs.t * (ROUTE_SEGS * SEG_LENGTH);
        this.score           = this._resumeScore || 0;
        // Seed the "last checkpoint" so a crash before reaching the next
        // CHECKPOINT still offers "Start at Bellevue" (or whichever stop
        // they just left), instead of falling all the way back to Seattle.
        this._lastCheckpoint = {
          name:      rs.name,
          position:  rs.t * (ROUTE_SEGS * SEG_LENGTH),
          scoreAtCP: this.score,
        };
        // Any reset of the game (new game, game-over restart, rest-stop
        // resume, save-code resume) clears the wanted level — the player
        // shouldn't carry stars from one run into the next.  resumeStars is
        // intentionally ignored here for the same reason.
        this.cops.stars         = 0;
        this.cops.starTimer     = 0;
        this.cops.bumpCount     = 0;
        this.cops.rearBumpCount = 0;
        this.cops.headOnCount   = 0;
        this.cops.pitCount      = 0;
        this.cops.cops          = [];
        // Mark this stop and all earlier stops as "passed" so we don't
        // re-prompt the player as they continue.
        if (!this._passedRestStops) this._passedRestStops = new Set();
        for (const r of REST_STOPS) {
          if (r.t <= rs.t) this._passedRestStops.add(r.id);
        }
        if (!this._passedCheckpoints) this._passedCheckpoints = new Set();
        for (const cp of CHECKPOINTS) {
          if (cp.t <= rs.t) this._passedCheckpoints.add(cp.name);
        }

        // Apply purchases bought at the rest-stop menu.
        const buys = this._resumePurchases;
        if (buys) {
          // Car durability preservation — DamageModel was just constructed
          // at 100, so we restore the value the player walked in with
          // (or 100 if REPAIR CAR was purchased — durabilityOnResume is
          // overridden to 100 by RestStopScene._applyPurchase in that case).
          if (typeof buys.durabilityOnResume === 'number' && this.damage?.setDurability) {
            this.damage.setDurability(buys.durabilityOnResume);
          }
          // Restore drug levels from the rest-stop snapshot FIRST — drug
          // status is paused during the menu, so the player resumes at the
          // bar levels they walked in with.  The new DrugSystem otherwise
          // starts every bar at zero, silently wiping the player's high.
          if (buys.drugLevelsOnResume && this.drugs?.levels) {
            for (const [id, lvl] of Object.entries(buys.drugLevelsOnResume)) {
              this.drugs.levels[id] = Math.max(0, Math.min(1, lvl));
            }
          }
          if (buys.restock && this.drugs?.refillAll) this.drugs.refillAll();
          // Coffee / Snooze — multiplier applied to ALL drug bars FIRST so
          // any subsequent top-ups (beers, weed, etc.) win on top of the
          // sobered baseline.  Coffee = ×0.5, Snooze = ×0, stackable.
          if (typeof buys.reduceDrugs === 'number' && this.drugs?.levels) {
            for (const id of Object.keys(this.drugs.levels)) {
              this.drugs.levels[id] = (this.drugs.levels[id] ?? 0) * buys.reduceDrugs;
            }
          }
          // Per-drug top-ups — set each named drug's bar to >= the stored
          // amount.  Lets players buy weed alone without restocking everything.
          if (buys.drugTopUps && this.drugs?.levels) {
            for (const [drugId, amount] of Object.entries(buys.drugTopUps)) {
              const cur = this.drugs.levels[drugId] ?? 0;
              this.drugs.levels[drugId] = Math.max(cur, Math.min(1, amount));
            }
          }
          // "Top all to N" — every UNLOCKED bar lifts to >= N.  Use
          // this.drugs.unlocked (already hydrated from registry above)
          // as the authoritative source — the previous version read the
          // registry directly and checked `instanceof Set`, but the
          // registry stores unlocks as a plain object, so the check
          // always fell through to DRUG_CONFIG which only marks
          // alcohol/weed as default-unlocked.  Result: nothing topped up.
          if (buys.topAllTo && this.drugs?.levels) {
            for (const id of Object.keys(this.drugs.levels)) {
              if (!this.drugs.unlocked?.[id]) continue;
              this.drugs.levels[id] = Math.max(this.drugs.levels[id] ?? 0, buys.topAllTo);
            }
          }
          // Sex-worker dirt-on-a-politician buff — caps cops at 2★ for
          // the next N miles after resume.  Tracked on this.cops so
          // CopSystem can clamp star-add operations against the cap.
          if (buys.starCapMiles && buys.starCapMax != null && this.cops) {
            this.cops.starCapMax    = buys.starCapMax;
            this.cops.starCapEndPos = this.player.position +
              (buys.starCapMiles * (ROUTE_SEGS * SEG_LENGTH) / TOTAL_ROUTE_MILES);
          }
          if (buys.clearStars) {
            this.cops.stars = 0;
            if ('bumpCount'     in this.cops) this.cops.bumpCount     = 0;
            if ('rearBumpCount' in this.cops) this.cops.rearBumpCount = 0;
            if ('headOnCount'   in this.cops) this.cops.headOnCount   = 0;
            if ('pitCount'      in this.cops) this.cops.pitCount      = 0;
            this.cops.cops = [];
          }
          if (Array.isArray(buys.f12)) {
            for (const t of buys.f12) {
              const raw = t === 'gun' ? 'f12_gun'
                       : t === 'spike_strip' ? 'f12_spike'
                       : t === 'paint_bomb'  ? 'f12_paint'
                       : t === 'rocket'      ? 'f12_rocket'
                       : t === 'grenade'     ? 'grenade'
                       : t === 'disguise'    ? 'disguise' : null;
              if (raw) {
                // grenade/disguise don't have an f12_* sprite key; pass the
                // normalised name straight to addF12Token (it acce$ both).
                this.cops.addF12Token?.(raw);
              }
            }
          }
          // Persistent garage upgrades — tracked so future repairs / damage
          // calls can read them from this._upgrades.
          if (Array.isArray(buys.upgrade) && buys.upgrade.length) {
            this._upgrades = new Set([...(this._upgrades ?? []), ...buys.upgrade]);
          }
          // ── Phase 2-4 effects on resume ─────────────────────────
          // Refuel / charge — fill the tank.  Both purchases set the
          // same flag.  Charge additionally sets `chargeAdMs` (handled
          // below as a black-screen ad).
          if (buys.refuelToFull) {
            this.player.gasMi = this.player.gasMaxMi;
            this._strandedShown = false;
          }
          if (buys.tractionTires) {
            this._tractionTires = true;
            this.registry.set('tractionTires', true);
          }
          if (typeof buys.starsToDrop === 'number' && buys.starsToDrop > 0 && this.cops) {
            this.cops.stars = Math.max(0, (this.cops.stars ?? 0) - buys.starsToDrop);
          }
          if (typeof buys.bumpStarsOnResume === 'number' && buys.bumpStarsOnResume > 0 && this.cops) {
            this.cops.addStar?.(buys.bumpStarsOnResume);
          }
          if (typeof buys.partyClockPenalty === 'number' && buys.partyClockPenalty > 0) {
            this._partyClockSec = Math.max(0, (this._partyClockSec ?? 0) - buys.partyClockPenalty);
          }
          if (Array.isArray(buys.boughtVehicles) && buys.boughtVehicles.length) {
            const owned = new Set(this.registry.get('ownedVehicles') ?? ['beater']);
            for (const v of buys.boughtVehicles) owned.add(v);
            this.registry.set('ownedVehicles', [...owned]);
            // Auto-swap into the most-recently-purchased car: full HP,
            // HALF tank.  Half-gas is the "drive-it-off-the-lot" feel
            // — full would make the purchase feel free of consequence,
            // empty would feel punishing.  The HP cap and tint match
            // the new vehicle's spec.
            const newId  = buys.boughtVehicles[buys.boughtVehicles.length - 1];
            const newVeh = VEHICLES[newId];
            if (newVeh) {
              this.player.vehicleId = newId;
              this.registry.set('vehicleId', newId);
              this.player.gasMaxMi = newVeh.rangeMi;
              this.player.gasMi    = Math.round(newVeh.rangeMi * 0.5);   // half tank
              if (this.damage?.setMax)        this.damage.setMax(newVeh.hp);
              if (this.damage?.setDurability) this.damage.setDurability(newVeh.hp);
              // Apply the new tint to the player sprite immediately so
              // the player visibly sees the swap on resume.
              if (this.playerSprite) {
                if (newId === 'beater') this.playerSprite.clearTint();
                else if (newVeh.tint)   this.playerSprite.setTint(newVeh.tint);
              }
              this._strandedShown = false;
            }
          }
          // Sleep / charge ad — show a black-screen ad for buys.sleepAdMs
          // or buys.chargeAdMs ms, then resume gameplay.  Pause input
          // during the ad.  Ad time is in REAL ms but is gated by the
          // game pause flag so it doesn't progress the world either.
          const adMs = (buys.sleepAdMs ?? 0) + (buys.chargeAdMs ?? 0);
          if (adMs > 0) {
            this._showAdScreen?.(adMs);
          }
          // Score bonus from hitchhiker / hooker — already merged into
          // resumeScore by RestStopScene._continue, but re-add here just in
          // case a tip path missed it.
          if (buys.scoreBonus && (this.score ?? 0) < this._resumeScore + buys.scoreBonus) {
            this.score = this._resumeScore;        // already includes bonus
          }
        }
      }
    }

    // ── Title-screen overlay (drawn over the actual gameplay road) ────
    // Until first tap, gameplay is "paused at idle" — the road is rendered
    // every frame, the player car sits at idle speed, but score/distance/
    // collisions are off, and a title + tap-to-start overlay is shown.
    // Resume-from-stop bypasses the title.
    this._awaitingStart = !this._missionConfig
                       && !this._resumeFromStop
                       && this._resumeFromPosition == null;
    this._introDone     = !this._awaitingStart;
    this._introGfx      = null;
    this.player.speed   = this._awaitingStart ? MAX_SPEED * 0.18 : MAX_SPEED * 0.4;

    // ── HUD ───────────────────────────────────────────────────────────
    // _buildHUD also creates the title overlay objects (used pre-tap).
    this._buildHUD();
    this._setHudVisible(!this._awaitingStart);

    // ── UI camera so shake/sway only affects the world, never the HUD ──
    // Phaser draws every object on every camera by default. We split:
    // main cam → world only; uiCam → HUD only.
    this._worldObjects.push(
      ...[
        this.roadGfx, this.ghostGfx, this.propsGfx, this.tunnelGfx, this.signGfx, this.overlayGfx, this.vignetteGfx,
        this.hudFlashGfx, this.playerSprite,
        this._copLightGfx,
        ...this._carSpritePool,
        ...this._drugSpritePool,
        this._drugHaloGfx,
        ...this._sceneSpritePool,
        ...(this._carGhostPool ?? []),
        ...(this._drugGhostPool ?? []),
      ].filter(Boolean),
    );
    // Default cameras.add() is transparent — do NOT setBackgroundColor here or
    // it will paint over the main camera's world.
    this._uiCam = this.cameras.add(0, 0, SCREEN_W, SCREEN_H);
    this.cameras.main.ignore(this._hudObjects);
    this._uiCam.ignore(this._worldObjects);
  }

  // ─── Input ───────────────────────────────────────────────────────────
  _setupTouch() {
    // Pedal buttons (BRAKE / ACCEL) live in the bottom-left and
    // bottom-right corners — same x-zones as the steering bands.
    // Skip steering for any tap within the pedal y-band so the
    // gas/brake taps don't also veer the car.  Pedals are PEDAL_H=50
    // tall with origin at PEDAL_Y=SCREEN_H-8, so they cover roughly
    // y ∈ [SCREEN_H-58, SCREEN_H-8].  Use a 70-px guard for safety.
    const PEDAL_BAND_TOP = SCREEN_H - 70;
    // Helper — true if the pointer is currently over a draggable HUD
    // drug bar.  Used to suppress the touch-steer latch so adjusting
    // bars in custom mode doesn't also steer the car.
    const overDrugBar = (p) => {
      const hits = this._drugBarHits;
      if (!hits || !hits.length) return false;
      for (const h of hits) {
        if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return true;
      }
      return false;
    };

    this.input.on('pointerdown', (p) => {
      if (this._modalOpen) return;
      // While the title is up, taps must hit one of the explicit
      // difficulty buttons — don't latch any steer/F12 flags from
      // anywhere else on screen, so the player isn't accidentally
      // starting the run by tapping near a difficulty button.
      if (this._awaitingStart) return;
      if (p.y > PEDAL_BAND_TOP) return;        // pedal area — pedals handle it
      // HUD drug bars (custom mode) — let the bar drag handler own
      // this pointer without also veering the car.
      if (overDrugBar(p)) return;
      // Top-right UI cluster (note/mute/pause/speed) + right-edge
      // weapon stack — never steer when tapping those zones.
      const overTopButtons = p.y < 60 && p.x > SCREEN_W - 230;
      const overWeaponCol  = p.x > SCREEN_W - 70 && p.y > 50;
      if (overTopButtons || overWeaponCol) return;
      // Tap mode: one direction of action.  ANY tap that wasn't on a
      // UI element counts as "go right" — no need to aim for the right
      // half on a phone screen.
      if (this._steeringMode() === 'flappy') {
        this._touchRight = true;
        return;
      }
      // Classic mode keeps the explicit left/right halves + center-tap
      // weapon shortcut.
      if (p.x < SCREEN_W * 0.30)      { this._touchLeft  = true; }
      else if (p.x > SCREEN_W * 0.70) { this._touchRight = true; }
      else if (p.y < SCREEN_H * 0.35) { this._touchF12   = true; }
    });
    this.input.on('pointerup', () => {
      this._touchLeft  = false;
      this._touchRight = false;
      this._touchF12   = false;
    });
    this.input.on('pointermove', (p) => {
      if (this._modalOpen) return;
      if (!p.isDown) return;
      // While dragging a drug bar, never steer.
      if (this._draggingDrugId) {
        this._touchLeft = this._touchRight = false;
        return;
      }
      if (p.y > PEDAL_BAND_TOP) {
        // Drag entered pedal area — release any active steer latch so
        // the car doesn't keep turning when the finger crosses down.
        this._touchLeft = this._touchRight = false;
        return;
      }
      const overTopButtons = p.y < 60 && p.x > SCREEN_W - 230;
      const overWeaponCol  = p.x > SCREEN_W - 70 && p.y > 50;
      if (overTopButtons || overWeaponCol) {
        this._touchLeft = this._touchRight = false;
        return;
      }
      // Tap mode: hold = action; move within the play area stays held.
      if (this._steeringMode() === 'flappy') {
        this._touchRight = true;
        this._touchLeft  = false;
        return;
      }
      this._touchLeft  = p.x < SCREEN_W * 0.30;
      this._touchRight = p.x > SCREEN_W * 0.70;
    });
  }

  /** Phone tilt steering — opt-in.  Toggle from the title screen sets
   *  registry key `tiltSteerEnabled`; that drives whether we attach
   *  `deviceorientation` and feed tilt into the raw-steering path.
   *  iOS 13+ requires explicit permission, requested from a user gesture
   *  (the toggle button itself).  Mapping accounts for landscape vs
   *  portrait via `screen.orientation.angle`. */
  _setupTilt() {
    this._tiltGamma = 0;
    this._tiltLeftActive  = false;
    this._tiltRightActive = false;
    this._tiltAttached = false;
    this._tiltOnOrient = (e) => {
      const angle = (screen.orientation?.angle ?? window.orientation ?? 0);
      let tilt;
      if (angle === 90 || angle === -90 || angle === 270) {
        const sign = (angle === 90 || angle === -270) ? 1 : -1;
        tilt = (e.beta ?? 0) * sign;
      } else {
        tilt = (e.gamma ?? 0);
      }
      this._tiltGamma = tilt;
      const DEAD = 5, THRESH = 10;
      this._tiltLeftActive  = tilt < -THRESH;
      this._tiltRightActive = tilt >  THRESH;
      if (Math.abs(tilt) < DEAD) {
        this._tiltLeftActive = this._tiltRightActive = false;
      }
    };
    // If user previously enabled tilt, attach automatically (after the
    // first tap to satisfy iOS gesture rule on cold load).
    if (this.registry?.get?.('tiltSteerEnabled')) {
      this.input.once('pointerdown', () => this._enableTiltSteer());
    }
  }

  /** Request OS permission (iOS) and attach the orientation listener.
   *  Calls back with 'granted' | 'denied' | 'unsupported'.  MUST be
   *  called synchronously from a user-gesture handler (no `await`
   *  before this) — iOS rejects requestPermission outside one. */
  _enableTiltSteer(onResult) {
    if (this._tiltAttached) { onResult?.('granted'); return; }
    const W = window.DeviceOrientationEvent;
    if (!W) { onResult?.('unsupported'); return; }
    const attach = () => {
      if (!this._tiltAttached) {
        this._tiltAttached = true;
        window.addEventListener('deviceorientation', this._tiltOnOrient, true);
      }
      onResult?.('granted');
    };
    const needsPerm = typeof W.requestPermission === 'function';
    if (needsPerm) {
      // Called synchronously here — gesture context is preserved.
      W.requestPermission()
        .then((res) => { if (res === 'granted') attach(); else onResult?.('denied'); })
        .catch(() => onResult?.('denied'));
    } else {
      attach();
    }
  }

  _disableTiltSteer() {
    if (!this._tiltAttached) return;
    window.removeEventListener('deviceorientation', this._tiltOnOrient, true);
    this._tiltAttached = false;
    this._tiltLeftActive = this._tiltRightActive = false;
    this._tiltGamma = 0;
  }

  _isLeftRaw()  { return this._touchLeft  || this._tiltLeftActive  || !!this.cursors?.left.isDown  || !!this.wasd?.left.isDown; }
  _isRightRaw() { return this._touchRight || this._tiltRightActive || !!this.cursors?.right.isDown || !!this.wasd?.right.isDown; }

  /** Steering mode — 'classic' (default), 'tilt', or 'flappy'.
   *  Persists in the registry.  Migrates the legacy `tiltSteerEnabled`
   *  boolean so existing saves still have tilt steering if they had it. */
  _steeringMode() {
    let m = this.registry?.get?.('steeringMode');
    if (!m) {
      // Default: 'flappy' (tap-to-steer) — the headline control scheme.
      // Existing players with legacy `tiltSteerEnabled` keep tilt.
      m = this.registry?.get?.('tiltSteerEnabled') ? 'tilt' : 'flappy';
      this.registry?.set?.('steeringMode', m);
    }
    return m;
  }
  _setSteeringMode(mode) {
    const prev = this._steeringMode();
    if (prev === mode) return;
    // Push the new mode into SaveSystem so subsequent get/set hit the
    // right per-mode profile (wallet, restStopSaves, etc).  Achievements
    // stay cross-mode since SaveSystem flags them as global.
    const save = this.registry?.get?.('save');
    if (mode === 'tilt') {
      // Synchronous — preserves iOS user-gesture context.  Falls back to
      // classic if permission is denied / unsupported.
      this._enableTiltSteer?.((res) => {
        if (res === 'granted') {
          this.registry?.set?.('steeringMode', 'tilt');
          this.registry?.set?.('tiltSteerEnabled', true);
          save?.setMode?.('tilt');
        } else {
          this.registry?.set?.('steeringMode', 'classic');
          this.registry?.set?.('tiltSteerEnabled', false);
          save?.setMode?.('classic');
          this._showPopup?.(res === 'denied'
            ? 'TILT PERMISSION DENIED'
            : 'TILT NOT SUPPORTED', '#FF4444');
        }
        this._refreshSteeringBtn?.();
      });
      return;
    }
    if (prev === 'tilt') {
      this._disableTiltSteer?.();
      this.registry?.set?.('tiltSteerEnabled', false);
    }
    this.registry?.set?.('steeringMode', mode);
    save?.setMode?.(mode);
  }

  /** Steering input with optional drunk-delay buffer.  When alcohol is
   *  above 75 %, the player gets occasional "lurches" — random windows
   *  (every 5-10 s) lasting 0.6-1.2 s during which their steering input
   *  is read from a stale frame (350-600 ms ago).  Outside a lurch the
   *  input passes through unchanged.  Below 75 % alcohol there's no
   *  effect at all.
   *
   */
  _isLeft()  { return this._delayedSteer().left; }
  _isRight() { return this._delayedSteer().right; }

  _delayedSteer() {
    const alc = this.drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
    const raw = { left: this._isLeftRaw(), right: this._isRightRaw() };
    if (alc <= 0.75) {
      // Below threshold — reset scheduling so a brief sober dip doesn't
      // carry over a queued lurch.
      this._drunkLurchUntil = 0;
      this._drunkLurchNext  = 0;
      return raw;
    }

    const now = this.gameTime ?? 0;

    // First frame above threshold — arm the next lurch 5-10 s out.
    if (!this._drunkLurchNext) {
      this._drunkLurchNext = now + 5 + Math.random() * 5;
    }

    // Always feed the history ring while drunk so a lurch can sample
    // from past input the moment it kicks in.
    if (!this._steerHistory) this._steerHistory = [];
    this._steerHistory.push({ t: now, ...raw });
    while (this._steerHistory.length > 0 && now - this._steerHistory[0].t > 1.0) {
      this._steerHistory.shift();
    }

    const inLurch = now < (this._drunkLurchUntil ?? 0);

    // No active lurch but cooldown elapsed → start a new one.
    if (!inLurch && now >= this._drunkLurchNext) {
      const lurchDur = 0.6 + Math.random() * 0.6;            // 0.6-1.2 s
      this._drunkLurchUntil = now + lurchDur;
      this._drunkLurchNext  = this._drunkLurchUntil + 5 + Math.random() * 5; // 5-10 s gap
    }

    // Outside the lurch window → input passes through cleanly.
    if (now >= (this._drunkLurchUntil ?? 0)) return raw;

    // Inside a lurch — pull from a stale frame.  Stronger than before:
    // 350 ms at exactly 75 %, scaling to 600 ms at a full bar.
    const delaySec = 0.35 + Math.min(1, (alc - 0.75) / 0.25) * 0.25;
    const target   = now - delaySec;
    let chosen = this._steerHistory[0];
    for (const e of this._steerHistory) {
      if (e.t <= target) chosen = e; else break;
    }
    return { left: !!chosen?.left, right: !!chosen?.right };
  }
  _isBrake() { return this._touchBrake || !!this.cursors?.down.isDown || !!this.wasd?.down.isDown; }
  _isBoost() { return this._touchBoost || !!this.cursors?.up.isDown   || !!this.wasd?.up.isDown; }

  // ─── Intro cinematic ─────────────────────────────────────────────────
  // Camera starts looking straight up (full sky) and tilts down to road.
  // Duration: ~3.2 seconds total.
  _updateIntro(dt) {
    const CX  = SCREEN_W / 2;
    const DUR = 3.2;
    this._introT       += dt / DUR;
    this._introCloudT  += dt;

    if (this._introT >= 1.0) {
      this._introT = 1.0;
      // Pre-render the first game frame onto roadGfx BEFORE removing the intro overlay.
      // This ensures the road is already drawn the instant the overlay disappears.
      this._renderFrame();
      // Now remove the intro overlay — road is underneath, already painted.
      if (this._introGfx) { this._introGfx.destroy(); this._introGfx = null; }
      this.playerSprite.setVisible(true);
      this.hudGfx.setVisible(true);
      this._setHudVisible(true);
      this._introDone = true;
      return;
    }

    const g  = this._introGfx;
    const t  = this._introT;
    g.clear();

    // Ease: sky fills full screen at t=0, shrinks to HORIZON_Y by t=1
    // easeOutCubic so the pan slows as it reaches driving position
    const ease = 1 - Math.pow(1 - Math.min(1, t * 1.1), 3);

    // horizon starts at SCREEN_H (off bottom = all sky) → HORIZON_Y
    const HORIZON_Y = 210;
    const hz = SCREEN_H - (SCREEN_H - HORIZON_Y) * ease;

    // ── Sky gradient ───────────────────────────────────────────────
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const bt   = i / bands;
      const y    = Math.round(bt * hz);
      const bh   = Math.ceil(hz / bands) + 1;
      const r    = Math.round(18  + bt * (95  - 18));
      const gv   = Math.round(58  + bt * (175 - 58));
      const b    = Math.round(115 + bt * (228 - 115));
      g.fillStyle((r << 16) | (gv << 8) | b, 1);
      g.fillRect(0, y, SCREEN_W, bh);
    }

    // ── Clouds (only visible in sky area) ─────────────────────────
    this._introDrawClouds(g, hz);

    // ── Sun ────────────────────────────────────────────────────────
    const sunY = hz * 0.55;
    g.fillStyle(0xFFEE88, 0.15); g.fillCircle(CX + 200, sunY, 55);
    g.fillStyle(0xFFEE99, 0.30); g.fillCircle(CX + 200, sunY, 30);
    g.fillStyle(0xFFFFCC, 0.85); g.fillCircle(CX + 200, sunY, 13);

    // ── Ground / road (only appears once horizon has moved partway) ─
    if (hz < SCREEN_H - 10) {
      this._introDrawGround(g, hz);
    }

    // ── Fade-in from black at the very start ───────────────────────
    if (t < 0.12) {
      g.fillStyle(0x000000, 1 - t / 0.12);
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  _introDrawClouds(g, skyH) {
    const ct = this._introCloudT;
    const clouds = [
      { x: ((ct * 14      ) % 900) - 60, y: 0.18, s: 1.00 },
      { x: ((ct *  9 + 350) % 900) - 60, y: 0.42, s: 0.72 },
      { x: ((ct * 17 + 180) % 900) - 60, y: 0.10, s: 0.55 },
      { x: ((ct * 11 + 620) % 900) - 60, y: 0.60, s: 0.80 },
    ];
    for (const c of clouds) {
      const cy = c.y * skyH;
      if (cy > skyH - 20) continue; // clip to sky
      this._introPuffCloud(g, c.x, cy, c.s);
    }
  }

  _introPuffCloud(g, x, y, s) {
    g.fillStyle(0xFFFFFF, 0.80);
    g.fillEllipse(x,           y,       100 * s, 36 * s);
    g.fillEllipse(x + 38 * s,  y - 14 * s, 72 * s, 30 * s);
    g.fillEllipse(x - 28 * s,  y - 8  * s, 58 * s, 24 * s);
    g.fillEllipse(x + 70 * s,  y + 4  * s, 48 * s, 26 * s);
    g.fillStyle(0xCCDDEE, 0.30);
    g.fillEllipse(x + 10 * s,  y + 12 * s, 88 * s, 20 * s);
  }

  _introDrawGround(g, hz) {
    const CX = SCREEN_W / 2;
    // Hills
    g.fillStyle(0x2A5E22, 1);
    g.fillEllipse(80,  hz + 10, 240, 60);
    g.fillEllipse(310, hz + 6,  200, 44);
    g.fillEllipse(530, hz + 12, 280, 58);
    g.fillEllipse(730, hz + 8,  180, 42);
    g.fillStyle(0x3A7030, 1);
    g.fillRect(0, hz + 14, SCREEN_W, SCREEN_H - hz);

    // Grass shoulders
    g.fillStyle(0x4A8A38, 1);
    g.fillPoints([{ x:0, y:hz+2 }, { x:CX-24, y:hz+2 }, { x:CX-195, y:SCREEN_H }, { x:0, y:SCREEN_H }], true);
    g.fillPoints([{ x:SCREEN_W, y:hz+2 }, { x:CX+24, y:hz+2 }, { x:CX+195, y:SCREEN_H }, { x:SCREEN_W, y:SCREEN_H }], true);

    // Rumble strips
    g.fillStyle(0xFFCC00, 1);
    g.fillPoints([{ x:CX-24, y:hz+2 }, { x:CX-18, y:hz+2 }, { x:CX-178, y:SCREEN_H }, { x:CX-210, y:SCREEN_H }], true);
    g.fillPoints([{ x:CX+18, y:hz+2 }, { x:CX+24, y:hz+2 }, { x:CX+210, y:SCREEN_H }, { x:CX+178, y:SCREEN_H }], true);

    // Road surface
    g.fillStyle(0x555548, 1);
    g.fillPoints([{ x:CX-18, y:hz+2 }, { x:CX+18, y:hz+2 }, { x:CX+178, y:SCREEN_H }, { x:CX-178, y:SCREEN_H }], true);

    // Lane dashes
    const dashes = 7;
    for (let i = 0; i < dashes; i++) {
      const t1 = (i + 0.05) / dashes;
      const t2 = (i + 0.48) / dashes;
      const y1 = hz + 2 + t1 * (SCREEN_H - hz - 2);
      const y2 = hz + 2 + t2 * (SCREEN_H - hz - 2);
      const hw1 = Math.max(0.5, t1 * 5.5), hw2 = Math.max(0.5, t2 * 5.5);
      g.fillStyle(0xEEEECC, 0.88);
      g.fillPoints([{ x:CX-hw1, y:y1 }, { x:CX+hw1, y:y1 }, { x:CX+hw2, y:y2 }, { x:CX-hw2, y:y2 }], true);
    }

    // Roadside trees
    const treeScale = (SCREEN_H - hz) / (SCREEN_H - 210);
    this._introTree(g, CX + 155, hz + 8,  0.22 * treeScale);
    this._introTree(g, CX + 240, hz + 16, 0.34 * treeScale);
    this._introTree(g, CX - 148, hz + 8,  0.22 * treeScale);
    this._introTree(g, CX - 235, hz + 16, 0.34 * treeScale);
  }

  _introTree(g, x, y, s) {
    const h = 90 * s, tw = 50 * s;
    g.fillStyle(0x3A5E28, 1);
    g.fillTriangle(x, y - h, x - tw, y, x + tw, y);
    g.fillStyle(0x2E4E20, 1);
    g.fillTriangle(x, y - h * 0.55, x - tw * 0.85, y + 2, x + tw * 0.85, y + 2);
    g.fillStyle(0x5A3A1A, 1);
    g.fillRect(x - 4 * s, y, 8 * s, h * 0.35);
  }

  _setHudVisible(v) {
    this.hudScore?.setVisible(v);
    this.hudMult?.setVisible(v);
    this.hudDist?.setVisible(v);
    this.hudSpeed?.setVisible(v);
    this.hudRegion?.setVisible(v);
    this.hudStars?.setVisible(v);
    this.hudRadio?.setVisible(v);
    this.hudF12hint?.setVisible(v);
    // Touch pedals — hidden on the title screen so they don't compete with
    // the "TAP TO START" prompt; shown only once gameplay actually begins.
    this._gasBtn?.setVisible(v);
    this._gasLbl?.setVisible(v);
    this._brakeBtn?.setVisible(v);
    this._brakeLbl?.setVisible(v);
  }

  // ─── Update loop ──────────────────────────────────────────────────────
  update(time, delta) {
    const rawDt = delta / 1000;

    // Title-screen state: render the gameplay road and the player car at
    // idle, but freeze score/odometer/spawning. Tap or Enter/Space starts
    // the actual game.
    if (this._awaitingStart) {
      // Slow drift so the road isn't completely static.
      this.player.position += this.player.speed * rawDt;
      this._renderFrame();
      this._renderHUD();
      // Title now requires an explicit difficulty-button tap to start —
      // no more "any-key / any-tap" auto-start.  Keyboard players can
      // still hit Enter to confirm whatever difficulty is currently
      // active (defaulting to Normal on first run).
      if (!this._anyKeyAttached) {
        this._anyKeyAttached = true;
        this.input.keyboard?.once('keydown-ENTER', () => {
          if (this._awaitingStart) this._startGameplay();
        });
        this.input.keyboard?.once('keydown-SPACE', () => {
          if (this._awaitingStart) this._startGameplay();
        });
      }
      return;
    }

    if (!this._introDone) {
      this._updateIntro(rawDt);
      return;
    }

    // ── Pause toggle ──────────────────────────────────────────────────
    if (this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this._togglePause();
    }
    if (this._paused) return;

    const phys  = this.effects.getPhysics(this.drugs);
    const dt    = rawDt * phys.dtMultiplier;
    // Cocaine accelerates wanted-level gain — stamp the multiplier on
    // CopSystem so addStar(amount) reads it without touching call sites.
    if (this.cops) this.cops._starGainMul = phys.cocaineStarMul ?? 1;
    // Cocaine high-freq tremor: fire a micro-shake every ~3 frames while
    // coke is active.  cameraTremor maxes at 1.5 (full bar) → 0.0012 amp.
    this._tremorTick = (this._tremorTick ?? 0) + 1;
    if ((phys.cameraTremor ?? 0) > 0.05 && this._tremorTick % 3 === 0) {
      this.effects.triggerShake(60, phys.cameraTremor * 0.0008);
    }

    this.gameTime += rawDt;
    // Party clock — counts down until 0 regardless of pause-elsewhere.
    if (this._partyClockSec > 0) this._partyClockSec = Math.max(0, this._partyClockSec - rawDt);

    // ── One-shot key actions ──────────────────────────────────────────
    if ((this.keyF?.isDown && !this._f12KeyPressed) || this._touchF12) {
      this._useTopF12();
      this._f12KeyPressed = true;
      this._touchF12 = false;
    }
    if (!this.keyF?.isDown) this._f12KeyPressed = false;

    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) this.audio.nextStation();
    if (this.keyM && Phaser.Input.Keyboard.JustDown(this.keyM)) this.audio.toggleMute();
    if (this.keyQ && Phaser.Input.Keyboard.JustDown(this.keyQ)) this._cycleWeapon();
    if (this._touchCycleArmed) {
      this._touchCycleArmed = false;
      this._cycleWeapon();
    }

    // ── Physics ───────────────────────────────────────────────────────
    this._updatePlayer(dt, phys);
    this._updateTraffic(dt);

    // ── Systems ───────────────────────────────────────────────────────
    this.drugs.update(rawDt);
    this.drugs.routeProgress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    // Weed Permastoned tracker — bar at 100% for 10 in-game miles fires
    // the Permastoned achievement, force-resets the weed bar to 0, and
    // suppresses any future weed pickups for the rest of the run.
    {
      const posPerMile = (ROUTE_SEGS * SEG_LENGTH) / TOTAL_ROUTE_MILES;
      const r = this.drugs.notePermastonedTick?.(this.player.position, posPerMile);
      if (r?.permastoned) {
        this._showPopup('🌿 PERMASTONED!\nWeed bar locked.', '#88FF88');
        AchievementSystem.award('permastoned', this.registry);
      }
    }

    // ── Achievement run-state trackers ────────────────────────────────
    // Untouchable timer — counts seconds since the last damage event.
    // Fires 1m / 2m / 3m / 5m milestones once each per run.
    this._noDamageTimer += rawDt;
    const milestones = [
      ['1m',  60,  'untouchable_1m'],
      ['2m', 120,  'untouchable_2m'],
      ['3m', 180,  'untouchable_3m'],
      ['5m', 300,  'untouchable_5m'],
    ];
    for (const [key, sec, id] of milestones) {
      if (!this._noDamageFlags[key] && this._noDamageTimer >= sec) {
        this._noDamageFlags[key] = true;
        AchievementSystem.award(id, this.registry);
      }
    }

    // Wanted-level tracking — peak stars + the "5★ Survivor" reset trick.
    const stars = this.cops.starDisplay ?? this.cops.stars ?? 0;
    if (stars > 0) this._everHitStars = true;
    this._peakStars = Math.max(this._peakStars, stars);
    if (this._peakStars >= 5 && stars <= 0 && !this._fiveStarSurvived) {
      this._fiveStarSurvived = true;
      AchievementSystem.award('five_star_survivor', this.registry);
    }

    // Snowblind tracking — entered the snow zone (mile 40+) with full
    // HP, took zero damage all the way through (~mile 88).  Strict per
    // user request: any HP loss disqualifies the run for this badge.
    {
      const _mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const inSnow = Weather.isSnow(_mile);
      const hp = this.damage?.getDurability?.() ?? 100;
      if (inSnow && this._snowblindHpEntry == null) {
        // First frame entering the snow zone — capture HP and a flag.
        this._snowblindHpEntry = hp;
        this._snowblindOk      = true;
      }
      if (this._snowblindOk && hp < (this._snowblindHpEntry ?? 100)) {
        this._snowblindOk = false;     // any HP loss disqualifies
      }
      if (this._snowblindOk && this._snowblindHpEntry != null && !inSnow && _mile > 88) {
        // Cleared the entire snow window without HP loss.
        this._snowblindOk = false;     // suppress double-fire
        AchievementSystem.award('snowblind', this.registry);
      }
    }
    {
      const mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const wiperActive = (this.gameTime ?? 0) < (this._wiperUntil ?? 0);
      this.effects.update(rawDt, this.drugs, this.cameras.main, { mile, wiperActive });
      // Show the wiper HUD button only while it's actually raining.
      const showWiper = Weather.isRain(mile);
      if (this.hudWiperBtn) this.hudWiperBtn.setVisible(showWiper);
      if (this.hudWiperLbl) this.hudWiperLbl.setVisible(showWiper);
    }
    // Custom-mode "No police" — keep stars + cops fully suppressed.
    // `starDisplay` is a getter on CopSystem (= Math.floor(stars)), so
    // setting `stars = 0` is enough; we never write to starDisplay.
    if (this._customFlags?.noPolice) {
      this.cops.stars         = 0;
      this.cops.cops          = [];
      this.cops.bumpCount     = 0;
      this.cops.rearBumpCount = 0;
      this.cops.headOnCount   = 0;
      this.cops.pitCount      = 0;
      this.cops.arrestPending = false;
    } else {
      this.cops.update(rawDt, this.player.position, this.player.speed, this.player.x);
    }
    // Sex-worker dirt buff: enforce the star cap and expire it once
    // the player passes the buff's end position.
    this.cops.tickStarCap?.(this.player.position);
    if (this.cops.starCapMax != null && this.cops.stars > this.cops.starCapMax) {
      this.cops.stars = this.cops.starCapMax;
    }
    // Real-time drug → music coupling.  Cheap call (just sets filter
    // targets), runs every frame so the mix continuously breathes with
    // bar levels.  See AudioSystem.setDrugInfluence for the mapping.
    this.audio?.setDrugInfluence?.(this.drugs.levels);

    // ── Collisions ────────────────────────────────────────────────────
    this._assignPendingDrugTypes();
    this._checkCollisions();

    // ── OD / Arrested ─────────────────────────────────────────────────
    // Custom mode never ODs, so skip the frame-level safety check too.
    if (Difficulty.mode?.() !== 'custom') {
      const odDrug = this.drugs.checkOD();
      if (odDrug) { this._onOverdose(odDrug); return; }
    }
    if (this.cops.arrestPending) { this._onArrested(); return; }

    // ── Probation timer ───────────────────────────────────────────────
    if (this._probationTimer > 0) this._probationTimer -= rawDt;

    // ── Wanted-level activation ──────────────────────────────────────
    //
    // FIRST STAR is gated.  Two separate paths can trigger it; whichever
    // fires first awards the star.  Both paths reach exactly 1.0 stars.
    //
    //   Path A:  (alcohol ≥ ⅓  OR  weed ≥ ½)
    //            AND   3 NPC crashes since first drink
    //
    //   Path B:  20 NPC-car bumps while at least one drug bar ≥ 30%
    //            (one-shot gate — `_drugBumpFired` flag prevents re-trigger)
    //
    // ── Random cop encounter trigger ─────────────────────────────────
    // Once the player has at least 1 star, every random roadside cop
    // they pass spawns a rear-pursuit cop closing in from behind.  The
    // sprite's `triggered` flag flips so each encounter only fires once.
    if (this.cops.stars >= 1) {
      const segs = this.road?.segments;
      if (segs?.length) {
        const startSeg = Math.floor(this.player.position / SEG_LENGTH);
        for (let n = 1; n <= 60; n++) {
          const seg = segs[(startSeg - n + segs.length) % segs.length];
          if (!seg?.sprites) continue;
          for (const sp of seg.sprites) {
            if (!sp.copEncounter || sp.triggered) continue;
            sp.triggered = true;
            this.cops._spawnRearFromEncounter?.(this.player.position);
            this._showPopup('🚨 COP ON YOUR TAIL!', '#FF4444');
          }
        }
      }
    }

    // After the first star, all further star changes are STATIC additions
    // from collision events (see _onCopCollision and friends).  No heat trickle.
    if (this.cops.stars < 1) {
      const drunk    = (this.drugs.get?.(DRUGS.ALCOHOL) ?? 0) >= (1 / 3);
      const stoned   = (this.drugs.get?.(DRUGS.WEED)    ?? 0) >= 0.5;
      const everDrunk = (this.drugs.maxReached?.[DRUGS.ALCOHOL] ?? 0) > 0.05;
      this._npcCrashesPostDrink ??= 0;
      this._drugBumpCount       ??= 0;

      const pathA = everDrunk && (drunk || stoned) && this._npcCrashesPostDrink >= 3;
      const pathB = !this._drugBumpFired && this._drugBumpCount >= 20;
      if (pathA || pathB) {
        this.cops.addStar(1);
        this._showPopup('★ WANTED LEVEL ACTIVATED!\nCops dispatched.', '#FF4444');
        this._npcCrashesPostDrink = 0;
        this._drugBumpFired        = true;     // path B is one-shot
      }
    }

    // ── Drug-line drops ───────────────────────────────────────────────
    // Every ~90 sec a 4-pickup line appears.  Drug type is picked from the
    // player's unlocked pool so they get variety as more drugs come online
    // (Beer Run, Chain Smoking, Rail Run, Mushroom Hunting, Tab Run, …).
    this._beerLineTimer = (this._beerLineTimer ?? 90) - rawDt;
    if (this._beerLineTimer <= 0) {
      this._beerLineTimer = 80 + Math.random() * 20;       // 80–100 sec
      const pool = ['beer', 'weed'];
      if (this.drugs.isUnlocked(DRUGS.COCAINE))  pool.push('cocaine');
      if (this.drugs.isUnlocked(DRUGS.SHROOMS))  pool.push('shrooms');
      if (this.drugs.isUnlocked(DRUGS.LSD))      pool.push('lsd');
      if (this.drugs.isUnlocked(DRUGS.HEROIN))   pool.push('heroin');
      if (this.drugs.isUnlocked(DRUGS.RX))       pool.push('rx');
      if (this.drugs.isUnlocked(DRUGS.FENTANYL)) pool.push('fentanyl');
      if (this.drugs.isUnlocked(DRUGS.KETAMINE)) pool.push('ketamine');
      if (this.drugs.isUnlocked(DRUGS.METH))     pool.push('meth');
      // Bias toward beer so it stays the dominant line type.
      pool.push('beer', 'beer');
      const drugType = pool[(Math.random() * pool.length) | 0];
      this._injectDrugLine({
        types:  [drugType, drugType, drugType, drugType],
        spread: 14,
        label:  this._drugLineLabel(drugType),
      });
    }
    // Every ~100 in-game miles a longer mixed-drug line spawns. Tracked
    // by integer odometer mile so it triggers exactly once per crossing.
    const milesNow = Math.floor(this._odometer ?? 0);
    if (milesNow > 0 && milesNow % 100 === 0
        && milesNow !== this._lastMixedLineMile) {
      this._lastMixedLineMile = milesNow;
      // Mix is biased to drugs the player has unlocked.
      const pool = ['beer', 'weed'];
      if (this.drugs.isUnlocked(DRUGS.COCAINE)) pool.push('cocaine');
      if (this.drugs.isUnlocked(DRUGS.SHROOMS)) pool.push('shrooms');
      if (this.drugs.isUnlocked(DRUGS.LSD))     pool.push('lsd');
      if (this.drugs.isUnlocked(DRUGS.RX))      pool.push('rx');
      const mixed = [];
      for (let i = 0; i < 7; i++) mixed.push(pool[(Math.random() * pool.length) | 0]);
      this._injectDrugLine({
        types:  mixed,
        spread: 16,
        label:  `🎉 MIXED DRUG LINE — MILE ${milesNow}!`,
      });
    }

    // ── 4★+ extra weapon drops ───────────────────────────────────────
    // Pre-baked F12 spawns are 1 every 1200 segments (~7s @ 120 mph).  At
    // 4★+ inject a bonus weapon onto a near-future segment every ~3.5s so
    // the player has tools to fight back against the heavier heat.
    if (this.cops.starDisplay >= 4) {
      this._bonusWeaponTimer = (this._bonusWeaponTimer ?? 0) - rawDt;
      if (this._bonusWeaponTimer <= 0) {
        this._bonusWeaponTimer = 3.0 + Math.random() * 1.5;
        this._injectBonusWeapon();
      }
    }

    // ── Odometer (4× time-compression: 120 mph → 120 mi per 15 min) ──
    // Odometer is derived from route progress × real-world Seattle→Miami
    // mileage (4,390 mi) so checkpoints land at their actual driving
    // distances (Portland at 630 mi, Boise at 1,115 mi, …, Miami at 4,390).
    const _odoPrev = this._odometer ?? 0;
    this._odometer = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;

    // ── Gas decrement (in odometer miles per frame) ──────────────────
    const _odoDelta = Math.max(0, this._odometer - _odoPrev);
    if (_odoDelta > 0 && this.player.gasMi > 0) {
      this.player.gasMi = Math.max(0, this.player.gasMi - _odoDelta);
      if (this.player.gasMi <= 0 && !this._strandedShown) {
        this._strandedShown = true;
        this._showPopup?.('⛽ OUT OF GAS — calling tow…', '#FF4444');
        // After a brief beat, run the tow logic.
        this.time.delayedCall(2200, () => this._runTow());
      }
    }

    // ── Score ─────────────────────────────────────────────────────────
    const currentSeg = Math.floor(this.player.position / SEG_LENGTH);
    const passed     = currentSeg - this.lastSegIdx;
    if (passed > 0) {
      this.score    += passed * PTS_DIST * this._scoreMult();
      this.lastSegIdx = currentSeg;
    }
    // Penalties: slowing below 120 mph and driving off-road both bleed score.
    // Scale with drug multiplier so highs don't trivially cancel them.
    {
      const dispMph = this._displayMPH();
      const mult    = this._scoreMult();
      // Fentanyl: while in your system the car is hard-capped at 30%
      // speed.  Penalising the player for that drop is double-jeopardy,
      // so suppress the slowness penalty entirely until it clears.
      const fentActive = (this.drugs?.get?.(DRUGS.FENTANYL) ?? 0) > 0.05;
      // Weed ≥ 60% — "hot-boxed" mode: no slow-driving penalty at all,
      // and off-road penalty cut in half (per user spec).
      const weedHigh  = (this.drugs?.get?.(DRUGS.WEED) ?? 0) >= 0.60;
      // Any drug dragging max speed below baseline (heroin, fent, weed-
      // alone, ketamine, rx) suppresses the slowness penalty — getting
      // docked $ for a slowdown the drug is forcing on you is double-
      // jeopardy.  speedMult < 1 means SOMETHING is slowing the car;
      // the player can't help it, so don't drain their wallet for it.
      const drugSlowing = (phys?.speedMult ?? 1) < 0.99;
      let penalty   = 0;

      if (dispMph < 120 && !fentActive && !weedHigh && !drugSlowing) {
        // -25 pt/sec floor at 60 mph, linear up to 0 at 120 mph.
        const slowness = Math.min(1, (120 - dispMph) / 60);
        penalty += 25 * slowness * mult;
      }
      if (Math.abs(this.player.x) > 1) {
        // -20 pt/sec when off the road; scales by how deep into the dirt.
        const depth = Math.min(1, (Math.abs(this.player.x) - 1) / 1.0);
        let offroad = 20 * (0.5 + 0.5 * depth) * mult;
        if (weedHigh) offroad *= 0.5;
        penalty += offroad;
      }
      // Haptic feedback — light buzz on the rumble strip, heavy buzz off-road.
      // The painted asphalt half-width is ±1.0; the rumble band sits in
      // (1.0, ~1.06]; everything past that is dirt/grass.
      const ax = Math.abs(this.player.x);
      let hapticTier = 0;
      if (ax > 1.06)      hapticTier = 2;          // off-road
      else if (ax > 1.00) hapticTier = 1;          // rumble strip
      this.haptics?.pulse?.(hapticTier);
      if (penalty > 0) {
        this.score = Math.max(0, this.score - penalty * rawDt);
      }
    }
    // ── Checkpoint detection ──────────────────────────────────────────
    const progress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    for (const cp of CHECKPOINTS) {
      if (cp.isStart || this._passedCheckpoints.has(cp.name)) continue;
      if (progress >= cp.t) {
        this._passedCheckpoints.add(cp.name);
        this._lastCheckpoint = { name: cp.name, position: this.player.position, scoreAtCP: this.score };
        if (cp.isFinish && !this._gameFinished) {
          this._gameFinished = true;
          // ── Party-clock evaluation ────────────────────────────────
          // ON TIME (clock > 0): apply Difficulty.onTimeBonusMul × cash.
          // TOO LATE (clock == 0): no bonus.  TOO LATE + 5★: technical
          // loss — game ends with cash penalty + Restart-Checkpoint UI.
          const onTime = (this._partyClockSec ?? 0) > 0;
          const stars  = this.cops.starDisplay ?? this.cops.stars ?? 0;
          if (onTime) {
            const mul   = Difficulty.onTimeBonusMul();
            const bonus = Math.round(this.score * (mul - 1));
            if (bonus > 0) this.score += bonus;
            this._showPopup(`🎉 YOU MADE IT!\n+$${bonus.toLocaleString()} bonus`, '#FFEE00');
            AchievementSystem.award('on_time', this.registry);
          } else if (stars >= 5) {
            // Technical loss path — _endGame branches on cause==='busted_late'.
            this._showPopup('🚓 TOO LATE — BUSTED!\nTechnical loss.', '#FF3344');
            this._endGame('busted_late');
            return;
          } else {
            this._showPopup('😞 TOO LATE\nNo bonus.', '#FF6622');
          }
          // ── Pullman-finish achievements ───────────────────────────
          const sober      = !Object.values(this.drugs.pickupCounts ?? {}).some(c => (c ?? 0) > 0);
          const cleanRun   = !this._everHitStars;
          const noStops    = !this._everUsedRestStop;
          const noDamage   = (this.damage?.getDurability?.() ?? 0) >= 100
                             && this._noDamageTimer >= (this.gameTime ?? 0) - 0.5;
          if (sober)    AchievementSystem.award('stone_cold_sober', this.registry);
          if (cleanRun) AchievementSystem.award('crystal_clean', this.registry);
          if (noStops)  AchievementSystem.award('iron_bladder', this.registry);
          if (noDamage) AchievementSystem.award('untouchable_run', this.registry);
          if (sober && cleanRun && noStops) {
            AchievementSystem.award('trifecta', this.registry);
          }
          this._endGame(onTime ? 'finish_on_time' : 'finish_late');
          return;
        }
        this._showPopup(`CHECKPOINT!\n${cp.name}`, '#00FF88');
      }
    }

    // ── Rest stop window detection ────────────────────────────────────
    // Player is "in the rest-stop approach window" from −0.5 mi to +0.3 mi
    // around each stop — i.e. they can only take the exit once they're at
    // least HALFWAY down the 1-mile off-ramp (which tapers from −1 mi to
    // the exit point).  Earlier than that the ramp is barely a shoulder
    // and the take-exit prompt is misleading.  While in the window, we
    // show a tappable EXIT prompt; if the player swerves onto the right
    // shoulder (player.x > 1.5) OR taps the prompt, we take the exit and
    // switch to RestStopScene.
    if (!this._passedRestStops) this._passedRestStops = new Set();
    const winBefore = 0.5 / TOTAL_ROUTE_MILES;
    const winAfter  = 0.3 / TOTAL_ROUTE_MILES;
    let activeStop = null;
    for (const rs of REST_STOPS) {
      if (this._passedRestStops.has(rs.id)) continue;
      if (progress > rs.t + winAfter) {
        // Drove past without stopping — mark missed so we don't re-prompt.
        this._passedRestStops.add(rs.id);
        continue;
      }
      if (progress >= rs.t - winBefore && progress <= rs.t + winAfter) {
        activeStop = rs;
        break;
      }
    }
    this._activeRestStop = activeStop;
    if (activeStop) {
      // Pull-over fires when the player makes a clear right swerve onto
      // the off-ramp (x > 1.5) OR taps the on-screen TAKE EXIT chip.
      // Restored from the wide-open 1.0 threshold which was letting the
      // player "exit" mid-bridge into Lake Washington before Bellevue.
      // Water/bridge segments suppress the trigger entirely so guardrails
      // can do their job.
      const seg = this.road.getSegment(this.player.position);
      if (!seg?.water) {
        const wantExit = this._touchExitArmed || this.player.x > 1.5;
        if (wantExit) {
          this._touchExitArmed = false;
          this._takeRestStopExit(activeStop);
          return;
        }
      }
    }

    // ── Region crossing ───────────────────────────────────────────────
    const region = this._regionIndex(progress);
    if (region !== this._prevRegion) {
      this._prevRegion = region;
      this.cops.clearStarsAtStateLine();
      const key      = REGION_ORDER[region]?.key ?? '';
      const display  = REGION_PALETTES[key]?.name ?? key.replace(/_/g, ' ');
      this._showPopup(`NOW ENTERING\n${display.toUpperCase()}!\nStars −2`, '#44FF88');
    }

    // ── Explosions / wrecks / gunshot stars timer ─────────────────────
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const fx = this.explosions[i];
      fx.timer += rawDt;
      // Wrecks drift laterally and spin while alive.
      if (fx.kind === 'wreck') {
        fx.sx        += (fx.lateralV ?? 0) * rawDt;
        fx.rotation   = (fx.rotation ?? 0) + (fx.spinV ?? 0) * rawDt;
      }
      if (fx.timer >= fx.maxTimer) {
        // Destroy any Phaser Image attached to a wreck so it doesn't
        // leak into the scene's display list.
        if (fx.img?.destroy) fx.img.destroy();
        this.explosions.splice(i, 1);
      }
    }

    // ── Popup timer ───────────────────────────────────────────────────
    if (this.popupTimer > 0) this.popupTimer -= rawDt;

    // ── Drug unlock announcements ─────────────────────────────────────
    let newUnlock = false;
    for (const id of Object.values(DRUGS)) {
      if (this.drugs.isUnlocked(id) && !DRUG_CONFIG[id].unlocked && !this._announcedUnlocks[id]) {
        this._announcedUnlocks[id] = true;
        newUnlock = true;
        this._showPopup(`UNLOCKED:\n${DRUG_CONFIG[id].label}!`, '#FF44FF');
      }
    }
    // Persist unlock state across arrests/respawns within this play session
    // (Phaser registry survives scene restarts).  Cleared by a fresh "new
    // game" from the menu — see MenuScene.
    if (newUnlock) this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks?.());
    // Persist partial-unlock progress every frame — cheap, and ensures
    // meth Phase 1 survives a rest stop / arrest mid-gate.
    if (this.drugs.snapshotProgress) {
      this.registry.set('drugProgress', this.drugs.snapshotProgress());
    }

    // ── Render ────────────────────────────────────────────────────────
    this._renderFrame();
    this._renderHUD();
  }

  // ─── Player movement ──────────────────────────────────────────────────
  _updatePlayer(dt, phys) {
    const p = this.player;

    // Speed: cruise at 120 mph by default. Holding UP boosts toward 140; holding
    // DOWN slows toward 60. Cocaine pickups raise both top and cruise by 5 mph each.
    const cokeBonus = this.drugs.getCocaineSpeedBonusMPH?.() ?? 0;
    const cruiseMph = 120 + cokeBonus;
    const boostMph  = 140 + cokeBonus;
    const slowMph   = 60;
    const mphToUnits = (mph) => MAX_SPEED * (mph / 120);

    let targetSpeed;
    if (this._isBoost())      targetSpeed = mphToUnits(boostMph);
    else if (this._isBrake()) targetSpeed = mphToUnits(slowMph);
    else                       targetSpeed = mphToUnits(cruiseMph);

    targetSpeed *= phys.speedMult;
    // Heroin nod-cycle throttle sag — driver eases off the pedal during
    // each nod peak, then back on as they lift.  Subtle (max 25%).
    targetSpeed *= 1 - (phys.nodAmount ?? 0) * 0.25;
    // Microsleep — bigger throttle drop (foot off) at peak + high dose.
    if (phys.microsleep) targetSpeed *= 0.60;

    // Out of gas — coast to 0.  Multiplies targetSpeed by 0 so the
    // BRAKE/ACCEL ramp brings the car down at its normal deceleration.
    if (this.player.gasMi <= 0) targetSpeed = 0;

    // Grade physics — subtle climb/descent effect on top speed.  Uphill
    // shaves a few mph off the cruise; downhill adds a few.  Uses the
    // real-world gradePct (e.g., 0.06 = 6 % grade) so the I-90 climb up
    // Snoqualmie and the Ryegrass→Vantage drop both feel right.
    const curSegIdx = Math.floor(p.position / SEG_LENGTH) % this.road.segments.length;
    const curGrade  = this.road.segments[curSegIdx]?.gradePct ?? 0;
    // Gain 2.0 → 6% climb costs 12 % top speed (≈ 14 mph drop at 120
    // cruise); 5% descent gives +10 %.  Clamp so micro-noise can't
    // swing speed by more than ±15 %.
    const gradeMult = Math.max(0.85, Math.min(1.15, 1 - curGrade * 2.0));
    targetSpeed *= gradeMult;

    // Flat tire from roadblock — hard-cap top speed to 45 mph until timer ends.
    if (this._flatTireTimer > 0) {
      this._flatTireTimer = Math.max(0, this._flatTireTimer - dt);
      const flatCap = mphToUnits(45);
      if (targetSpeed > flatCap) targetSpeed = flatCap;
    }

    if (p.speed < targetSpeed) {
      // Weed (when alone) reduces ACCEL — slower throttle response.
      p.speed = Math.min(targetSpeed, p.speed + ACCEL * (phys.accelMul ?? 1) * dt * 60);
    } else if (p.speed > targetSpeed) {
      p.speed = Math.max(targetSpeed, p.speed - BRAKE * dt * 60);
    }

    // Steering with momentum — ramps to full turn speed in ~0.12s, bleeds off in ~0.45s
    // Flappy mode: car always pulls FULL LEFT unless the action input
    // (right key / tap / space) is held — in which case it swings full
    // right.  Left input is ignored.  Same magnitude both ways, same
    // activeTau ramp as classic, so the swing feels equally fast.
    //
    // During the crash i-frame window: ALL steering input is ignored AND
    // the Tap-mode left pull is suspended.  steerIn forced to 0 so the
    // car coasts at center until the player regains control.
    const _iframeActive = (this.time?.now ?? 0) < this._invincibleUntil;
    const steerIn = _iframeActive
      ? 0
      : (this._steeringMode() === 'flappy')
        ? (this._isRight() ? 1 : -1)
        : (this._isLeft() ? -1 : this._isRight() ? 1 : 0);
    const steerDir = phys.invertSteering ? -steerIn : steerIn;

    // ── Snow slip: last commitment locks for 0.05-0.35s ───────────
    // On snow the player loses traction.  Once they commit to a
    // direction by pressing it, the car STAYS in that direction for
    // 0.05-0.35s even if they release OR press the opposite direction
    // mid-slide.  Mimics not being able to counter-steer on ice.
    const _mileForSnow = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const _inSnow = Weather.isSnow(_mileForSnow);
    let effectiveSteerDir = steerDir;
    if (_inSnow) {
      const slipRunning = this._slipDir
                       && this._slipDir !== 0
                       && (this._slipTimer ?? 0) < (this._slipMax ?? 0);
      if (steerDir !== 0 && steerDir === this._slipDir) {
        // Holding the same direction — refresh commitment, no tick.
        this._slipTimer = 0;
      } else if (slipRunning && steerDir !== this._slipDir) {
        // Either released OR counter-pressed during the slip window —
        // ignore the change, keep going in the original slip direction
        // and tick the timer toward expiry.
        effectiveSteerDir = this._slipDir;
        this._slipTimer = (this._slipTimer ?? 0) + dt;
      } else if (steerDir !== 0) {
        // Fresh commitment (slip expired or no prior direction) —
        // capture this direction and roll a new slip duration.  Halved
        // from 0.05–0.35s → 0.025–0.175s so Flappy mode (which never
        // releases — always pulling one way or the other) doesn't feel
        // like driving on ice for full minute stretches.
        this._slipDir   = steerDir;
        this._slipTimer = 0;
        this._slipMax   = 0.025 + Math.random() * 0.15;
      } else {
        // Idle on snow with slip expired.
        this._slipDir   = 0;
        this._slipTimer = 0;
      }
    } else {
      // Off-snow: instantaneous control, reset any leftover slip state.
      this._slipDir   = 0;
      this._slipTimer = 0;
    }

    // ── Alcohol overcorrection holdover ──────────────────────────
    // Layered AFTER snow slip (snow takes priority — if snow already
    // overrode effectiveSteerDir we won't do it again).  When the
    // player releases input and alcoholHoldover > 0, keep steering in
    // the last committed direction for 0.3-0.5s scaled by hold level
    // before the bleed-off resumes.  Drunk drivers overshoot — this is
    // the input layer of that feel.
    const alcHold = phys.alcoholHoldover ?? 0;
    if (!_inSnow && alcHold > 0.05) {
      // Hold-direction duration in seconds.  Halved vs the original
      // (0.30 + 0.40*hold) so 4-beer drift doesn't span multiple lanes.
      const alcMaxBase = 0.12 + alcHold * 0.25;
      if (steerDir !== 0) {
        this._alcHoldDir   = steerDir;
        this._alcHoldTimer = 0;
        this._alcHoldMax   = alcMaxBase;
      } else if (this._alcHoldDir
              && (this._alcHoldTimer ?? 0) < (this._alcHoldMax ?? 0)) {
        effectiveSteerDir  = this._alcHoldDir;
        this._alcHoldTimer = (this._alcHoldTimer ?? 0) + dt;
      } else {
        this._alcHoldDir   = 0;
        this._alcHoldTimer = 0;
      }
    } else {
      this._alcHoldDir   = 0;
      this._alcHoldTimer = 0;
    }

    // Heroin "input lag" extends both ramp + bleed time constants, so
    // inputs feel late and heavy (the sedation feel).  No effect when
    // sober (inputLag=0, steerReturnSlow=0).
    const activeTau  = 0.12 + (phys.inputLag ?? 0);
    const releaseTau = 0.45 + (phys.steerReturnSlow ?? 0);
    if (effectiveSteerDir !== 0) {
      // Ramp toward target velocity (slowed by inputLag on heroin).
      p.steerVelocity = lerp(p.steerVelocity, effectiveSteerDir * TURN_SPEED * phys.steerSensitivity, 1 - Math.pow(0.01, dt / activeTau));
    } else {
      // Bleed off (slowed by steerReturnSlow on heroin).
      p.steerVelocity = lerp(p.steerVelocity, 0, 1 - Math.pow(0.01, dt / releaseTau));
    }
    // Microsleep — at hero ≥ 0.65 + nod peak, the player briefly loses
    // grip on the wheel.  Bleed steerVelocity faster to approximate
    // hands-off drift for that frame.
    if (phys.microsleep) {
      p.steerVelocity *= 0.75;
    }

    const seg        = this.road.getSegment(p.position);
    const centrifugal = seg ? seg.curve * p.speed * CENTRIFUGAL * 0.001 : 0;

    // Weather grip — wet pavement / snow reduce steering authority and
    // amplify centrifugal force, so curves push wider when traction is
    // bad.  rain × 0.9, snow × 0.75 (per user spec).  Traction tires
    // (purchasable at any dealership) negate the weather penalty —
    // requires a 4x4 vehicle to apply.
    const _mileForGrip = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    let gripMul = Weather.gripMul(_mileForGrip);
    const _tractionOk = (this._tractionTires || this.registry.get('tractionTires'))
                     && VEHICLES[this.player.vehicleId]?.drive === '4x4';
    if (_tractionOk) gripMul = 1;
    const slipMul = 1 + (1 - gripMul) * 1.5;   // 1.0 dry, ~1.15 rain, ~1.375 snow

    p.x += (
      p.steerVelocity  * dt * gripMul
      + phys.steerDrift   * dt
      + centrifugal        * dt * slipMul
      + phys.extraCurve    * p.speed * 0.001 * dt
    );

    // Lateral collision impulse (bounce from crash)
    if (p.xImpulse) {
      p.x        += p.xImpulse * dt;
      p.xImpulse *= Math.max(0, 1 - dt * 7);
      if (Math.abs(p.xImpulse) < 0.02) p.xImpulse = 0;
    }

    // ── Bridge guardrail clamp ──────────────────────────────────────
    // On water (Lake Washington floating bridge) the side of the road is
    // a Jersey barrier, not grass. Bounce the player off it instead of
    // letting them drift into the lake. Limit |x| to 1.05 (just past the
    // shoulder line) and reflect their lateral velocity / impulse.
    if (seg?.water) {
      const RAIL = 1.05;
      if (p.x > RAIL) {
        p.x        = RAIL;
        p.steerVelocity = Math.min(0, p.steerVelocity) * 0.4;
        p.xImpulse = (p.xImpulse > 0 ? -p.xImpulse * 0.5 : p.xImpulse);
        p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
      } else if (p.x < -RAIL) {
        p.x        = -RAIL;
        p.steerVelocity = Math.max(0, p.steerVelocity) * 0.4;
        p.xImpulse = (p.xImpulse < 0 ? -p.xImpulse * 0.5 : p.xImpulse);
        p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
      }
    }

    // ── Tunnel wall clamp ──────────────────────────────────────────
    // Inside the tunnel, concrete walls flank the road — the player
    // can't drive THROUGH them.  Rail set ~1' inside the wall face
    // (normalized lane-units): rumble extends to ±1.125, the wall
    // starts just past that, and 1 ft ≈ 0.033 lane-units, so clamp at
    // ±1.10 so the car can hug the rumble but not chip the concrete.
    // Bridge clamp — same hard-rail behaviour as the tunnel.  The West
    // Seattle Bridge has tall concrete railings on both sides; you
    // shouldn't be able to drive over them into the Duwamish below.
    if (seg?.bridge) {
      const BRIDGE_RAIL = 0.95;
      if (p.x > BRIDGE_RAIL) {
        p.x = BRIDGE_RAIL;
        p.steerVelocity = Math.min(0, p.steerVelocity) * 0.4;
        p.xImpulse = (p.xImpulse > 0 ? -p.xImpulse * 0.5 : p.xImpulse);
        p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
      } else if (p.x < -BRIDGE_RAIL) {
        p.x = -BRIDGE_RAIL;
        p.steerVelocity = Math.max(0, p.steerVelocity) * 0.4;
        p.xImpulse = (p.xImpulse < 0 ? -p.xImpulse * 0.5 : p.xImpulse);
        p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
      }
    }
    if (seg?.tunnel) {
      // Tunnel-wall slams now trigger the structural-crash respawn
      // (explosion + reset to center + 4-second i-frames) instead of
      // the old soft bounce — matches the tree / building / parked-car
      // behavior so the player can't grind along the concrete and
      // bleed HP indefinitely.
      const TUNNEL_RAIL = 0.95;
      const _nowTun = this.time?.now ?? 0;
      if (Math.abs(p.x) > TUNNEL_RAIL && _nowTun >= this._invincibleUntil) {
        this._triggerSceneryRespawn(null);
      } else if (p.x > TUNNEL_RAIL) {
        p.x = TUNNEL_RAIL;
        p.steerVelocity = Math.min(0, p.steerVelocity) * 0.4;
      } else if (p.x < -TUNNEL_RAIL) {
        p.x = -TUNNEL_RAIL;
        p.steerVelocity = Math.max(0, p.steerVelocity) * 0.4;
      }
    }
    // Off-road: gradually cap speed rather than multiplying each frame.
    // EXCEPT — if the player is on the painted exit ramp asphalt, it
    // counts as paved road and the slowdown is suppressed.  Range goes
    // out to x=4.0 (was 2.5) so even deep swerves into the ramp area
    // still qualify and don't grind the car to a halt.
    const onRamp = (seg?.rampStrength ?? 0) > 0 && p.x > 1 && p.x < 4.0;
    if (Math.abs(p.x) > 1 && !onRamp) {
      const depth     = clamp((Math.abs(p.x) - 1) / 1.5, 0, 1);
      const maxSpeed  = MAX_SPEED * lerp(OFFROAD_SLOW, 0.15, depth);
      if (p.speed > maxSpeed) p.speed = lerp(p.speed, maxSpeed, 0.06);
      // Off-road HP bleed — 0.5 HP per second of dirt-driving.  Ramp
      // segments are exempt (they're paved) so pulling over doesn't tax
      // the player.
      this._applyDamage(0.5 * dt, 'offroad_bleed');
    }

    // ── Beer gravity (alcohol ≥ 80%) ────────────────────────────────
    // At very drunk the car gets pulled toward the nearest beer ahead —
    // a "beer-seeking missile" effect.  Pull is strong enough to drift
    // the car a full lane width before reaching the beer, but stays
    // beatable: a player holding the opposite steer (TURN_SPEED 2.8) can
    // overpower the pull when sober-leaning hard.  Scans ~80 segments
    // forward so the pull engages early enough to feel.
    const alcLvl = this.drugs?.levels?.[DRUGS.ALCOHOL] ?? 0;
    if (alcLvl >= 0.80) {
      const segs     = this.road.segments;
      const segCount = segs.length;
      const startSeg = Math.floor(p.position / SEG_LENGTH);
      let beerOffset = null;
      for (let look = 1; look < 80 && beerOffset === null; look++) {
        const seg = segs[(startSeg + look) % segCount];
        if (!seg?.sprites) continue;
        for (const sp of seg.sprites) {
          if (sp.collected || !sp.isCollectible) continue;
          if (sp.type === 'beer') { beerOffset = sp.offset; break; }
        }
      }
      if (beerOffset !== null) {
        // 0.80 alc → 2 lane-units/sec (below TURN_SPEED 2.8 so the player
        // can fully overpower the pull when leaning hard on the wheel),
        // 1.00 alc → 6 lane-units/sec (steering resists but loses).
        const pullStr = 2 + (alcLvl - 0.80) * 20;
        p.x += clamp(beerOffset - p.x, -1, 1) * pullStr * dt;
      }
    }

    p.x = clamp(p.x, -2.8, 2.8);

    // Advance
    // World-units position: full speed so the road scrolls fast and the game
    // feels arcade-y. Mileage display below (in `_odometer`) compresses so the
    // displayed odometer reaches ~200 mi by Oregon and ~2,000 mi by Miami.
    // LSD ≥ 90% — distance multiplier ×1.25.  The world rolls past 25%
    // faster than your actual speed, on top of the LSD-60% display cap.
    // Combined effect: read 60 mph, cover ground as if at 150 mph.
    const lsdLvl = this.drugs?.get?.(DRUGS.LSD) ?? 0;
    const distMul = lsdLvl >= 0.90 ? 1.25 : 1.0;
    p.position = (p.position + p.speed * distMul * dt) % (ROUTE_SEGS * SEG_LENGTH);

    // Visual lean — follows steer velocity so it lingers after key release
    const leanDir = p.steerVelocity / (TURN_SPEED || 1);  // normalised -1..1
    const targetX = SCREEN_W / 2 - leanDir * 22;
    p.screenX     = lerp(p.screenX ?? SCREEN_W / 2, targetX, 0.12);
    if (this.playerSprite) {
      // ── Player sprite — X + angle only ────────────────────────────
      // Y assignment moved to _renderVehicles, which runs AFTER
      // road.render() in _renderFrame.  Sampling the road here would
      // read from the PREVIOUS frame's _drawn (one-frame stale), so the
      // car bounced on slopes when the road shifted between frames.
      // Keeping X here because p.screenX is input/physics-driven, not
      // road-derived.
      const DEFAULT_W = 78, DEFAULT_H = 49;
      this.playerSprite.setDisplaySize(DEFAULT_W, DEFAULT_H);
      this.playerSprite.x = p.screenX;
      this.playerSprite.angle = leanDir * 6;
      // Crash i-frame blink — 7 Hz alpha toggle so the player can see
      // they're temporarily invulnerable.  Outside the window keep the
      // sprite fully opaque (other systems don't touch alpha).
      const _now = this.time?.now ?? 0;
      if (_now < this._invincibleUntil) {
        this.playerSprite.alpha = (Math.floor(_now / 140) & 1) ? 0.25 : 1.0;
      } else if (this.playerSprite.alpha !== 1) {
        this.playerSprite.alpha = 1;
      }
    }
  }

  // ─── Traffic ─────────────────────────────────────────────────────────
  _isUrbanZone(progress) {
    // West Seattle / Downtown Seattle (start) and Spokane area (end).
    return progress < 0.043 || progress > 0.95;
  }

  _updateTraffic(dt) {
    this._trafficTimer -= dt;
    if (this._trafficTimer <= 0) {
      const p       = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
      const urban   = this._isUrbanZone(p);
      // Denser traffic across the board: cities cap at 22 cars; highway
      // spawns ~every 0.6–1.6 s (was 2.8–5.8 s) so the road feels populated.
      // Cap scales with Difficulty.trafficMul (Hard +10%) AND Weather
      // (snow zone −30%).  Both stack — Hard in snow ≈ −23% vs base.
      const _mileForSpawn = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const tMul = Difficulty.trafficMul() * Weather.trafficMul(_mileForSpawn);
      const cap  = Math.round((urban ? 22 : 18) * tMul);
      if (this.traffic.length < cap) {
        this._trafficTimer = urban ? (0.4 + Math.random() * 0.6) : (0.6 + Math.random() * 1.0);
        this._spawnTraffic();
      } else {
        this._trafficTimer = 0.4;
      }
    }
    // Same-lane follow distance: faster cars slow to match a slower car
    // ahead in the same lane, instead of driving through it.
    const FOLLOW_DIST = 1800;

    // ── Shroom synchronised pulse (≥ 45% shrooms) ────────────────────
    // ALL NPC cars slow / speed up in unison — no lateral swerve, no per-
    // car random phase.  The road "breathes" as one.  Reads as the
    // player's depth perception playing tricks rather than chaotic
    // traffic.  Period 0.75 s, ±10 mph at full ramp.
    const shroomLvl = this.drugs?.get?.(DRUGS.SHROOMS) ?? 0;
    const shroomActive = shroomLvl >= 0.45;
    this._shroomTime = (this._shroomTime ?? 0) + (shroomActive ? dt : 0);
    let shroomPulseUnits = 0;
    if (shroomActive) {
      const ramp = Math.min(1, (shroomLvl - 0.45) / 0.20);   // 0 at 45%, 1 at 65%
      const pulseAmpUnits = MAX_SPEED * 10 / 120;            // 10 mph in world units
      shroomPulseUnits = Math.sin(this._shroomTime * 2 * Math.PI / 0.75) * pulseAmpUnits * ramp;
    }
    // ── Rx NPC speed shift — cumulative per pickup ──────────────────
    // +/-7 mph per Rx pickup applied as a uniform additive shift.
    // Same-direction cars (positive speed) get faster (more positive);
    // oncoming cars (negative speed) shift toward zero (slower magnitude).
    const rxShiftUnits = MAX_SPEED * (this.drugs?.getRxNpcSpeedShiftMPH?.() ?? 0) / 120;

    const npcSpeedShift = shroomPulseUnits + rxShiftUnits;

    for (const t of this.traffic) {
      if (t.crashed) {
        // Wreck is animating: spin, drift sideways, leave smoke. Forward
        // momentum continues at the slowed `speed` set on impact.
        t.crashTimer  -= dt;
        t.crashAng    += t.crashSpin * dt;
        t.laneOffset  += t.crashVx * dt;
        t.position    += t.speed * dt;
        // Spawn smoke puffs every ~0.08s along the wreck's path
        t.crashSmokeT = (t.crashSmokeT ?? 0) + dt;
        if (t.crashSmokeT > 0.08) {
          t.crashSmokeT = 0;
          this._spawnSmokePuff(t);
        }
        continue;
      }
      let effSpeed = t.speed;
      for (const other of this.traffic) {
        if (other === t || other.crashed) continue;
        if (Math.abs(other.laneOffset - t.laneOffset) > 0.05) continue;
        const gap = other.position - t.position;
        if (gap > 0 && gap < FOLLOW_DIST && other.speed < effSpeed) {
          effSpeed = other.speed;
        }
      }
      // Apply shroom-pulse + Rx shift uniformly to every NPC.  Cars stay
      // in their lanes; only their forward speed modulates.
      effSpeed += npcSpeedShift;
      t.position += effSpeed * dt;
    }
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      const dist = t.position - this.player.position;
      const crashedDone = t.crashed && t.crashTimer <= 0;
      // Despawn far behind, OR far past the visible horizon (DRAW_DIST × SEG_LENGTH).
      if (crashedDone || dist < -2000 || dist > 80000) {
        this.traffic.splice(i, 1);
      }
    }
  }

  // Smoke puff trailing a crashed vehicle — uses the same explosion list so
  // the existing render loop draws it.
  _spawnSmokePuff(car) {
    const relZ = Math.max(50, car.position - this.player.position);
    const proj = this.road.getVehicleProjection(relZ, car.laneOffset);
    if (!proj) return;
    this.explosions.push({
      sx:       proj.sx + (Math.random() - 0.5) * proj.sw * 0.5,
      sy:       proj.sy - proj.sw * 0.3,
      sw:       proj.sw * 0.5,
      timer:    0,
      maxTimer: 0.85,
      smoke:    true,
    });
  }

  _spawnTraffic() {
    const p         = this.player;
    const isCop     = this.cops.stars >= 1 && Math.random() < this.cops.stars * 0.18;
    const colors    = [0xFF4444, 0x44AAFF, 0x44CC44, 0xFFCC44, 0xCC44CC, 0xFFFFFF, 0xFF8800];
    // Same-direction traffic only — 2 right-side lanes (player's direction).
    // Lane centers ±0.25 and ±0.75 are in painted-road normalized units, the
    // same units as `p.x` and the drawn-segment lookup, so we don't scale
    // them — getVehicleProjection() handles the world-vs-painted conversion.
    // 60% of spawns same-direction (right 2 lanes), 40% oncoming (left 2).
    const oncoming = !isCop && Math.random() < 0.4;
    const sameDirLanes = [0.25, 0.75];
    const oppDirLanes  = [-0.25, -0.75];
    const lanePool = oncoming ? oppDirLanes : sameDirLanes;
    const laneOffset = lanePool[(Math.random() * lanePool.length) | 0];

    // Same-direction: 80 ± 25 mph. Oncoming: 60 ± 15 mph (slower so the
    // closing rate isn't insurmountable). Oncoming traffic moves in the
    // OPPOSITE direction in world Z, so its speed is stored negative.
    const baseUnits = MAX_SPEED * (oncoming ? 60 : 80) / 120;
    const spread    = MAX_SPEED * (oncoming ? 15 : 25) / 120;
    let trafficSpeed = isCop
      ? 500
      : baseUnits + (Math.random() - 0.5) * 2 * spread;
    if (oncoming) trafficSpeed = -trafficSpeed;

    // Spawn at the horizon so cars appear from the distance and gradually
    // grow as they approach. DRAW_DIST × SEG_LENGTH = 76,000 units is the
    // far edge of what the road renders. We pick 50,000–72,000 so cars
    // appear small/distant on first frame and roll toward the player.
    let position = p.position + 50000 + Math.random() * 22000;
    for (let tries = 0; tries < 6; tries++) {
      const conflict = this.traffic.some(t =>
        Math.abs(t.laneOffset - laneOffset) < 0.05 &&
        Math.abs(t.position - position) < 4000);
      if (!conflict) break;
      position = p.position + 50000 + Math.random() * 22000;
    }

    // Pick a paired-direction color set.  At render time we look up
    // `car_back_<set>` for same-direction traffic (player sees the rear)
    // and `car_front_<set>` for oncoming traffic (player sees the nose).
    // colorSet === 'police' is reserved for cops.
    const COLOR_SETS = ['blue', 'blue2', 'green', 'grey', 'orange', 'red', 'red2', 'white', 'white2', 'truck_blue'];
    const colorSet = isCop
      ? 'police'
      : COLOR_SETS[(Math.random() * COLOR_SETS.length) | 0];

    this.traffic.push({
      id:         Math.random(),
      position,
      laneOffset,
      speed:      trafficSpeed,
      color:      isCop ? 0x2244BB : colors[Math.floor(Math.random() * colors.length)],
      isCop,
      colorSet,
      alive:      true,
    });
  }

  // ─── Collisions ───────────────────────────────────────────────────────
  /** Sweep upcoming visible segments and replace any 'drug-pending' sprite
   *  with an addiction-weighted real drug type so the on-screen sprite
   *  matches what you'd pick up.
   *
   *  Range covers the full draw distance (DRAW_DIST = 380 segments) so drugs
   *  appear at the horizon, not pop into existence mid-distance. */
  _assignPendingDrugTypes() {
    const segs = this.road.segments;
    if (!segs?.length) return;
    const segIdx = Math.floor(this.player.position / SEG_LENGTH) % segs.length;
    const routeT = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    for (let di = -2; di < 400; di++) {
      const seg = segs[(segIdx + di + segs.length) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.type !== 'drug-pending') continue;
        sp.type = this.drugs.chooseAddictedDrug(routeT);
      }
    }
  }

  _checkCollisions() {
    const p      = this.player;
    const segIdx = Math.floor(p.position / SEG_LENGTH) % this.road.segments.length;

    // Road sprite collectibles — collect ONLY when the pickup is visually
    // touching the player car.  The visible car sprite sits ~6–8 segments
    // ahead of player.position because of camera-projection offset, so a
    // pickup at segIdx+0 is still rendered well above the car on screen.
    // Iterate a wide segment range and gate on screen-Y overlap with the
    // live player sprite rect — that way the pickup vanishes the frame
    // its image meets the bumper, not the moment its world Z passes the
    // camera.
    const customMode = Difficulty.mode() === 'custom';
    const carY    = this.playerSprite?.y ?? (SCREEN_H - 130);
    const carH    = this.playerSprite?.displayHeight ?? 56;
    const carTop  = carY - carH * 0.55;
    const carBot  = carY + carH * 0.55;
    for (let di = 0; di <= 14; di++) {
      const idx = (segIdx + di) % this.road.segments.length;
      const seg = this.road.segments[idx];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected || !sp.isCollectible) continue;
        if (customMode && sp.collectibleType === 'drug') continue;
        // Lateral overlap (~half a lane) — required for visual touch.
        const dX = Math.abs(sp.offset * ROAD_WIDTH - p.x * ROAD_WIDTH);
        if (dX >= 700) continue;
        // Project the pickup to screen and check the vertical band against
        // the player sprite's bounding box.  Collect when the pickup's
        // base sits inside the car rect (give or take a small margin so
        // 60-fps motion doesn't skip past the overlap window).
        const relZ = di * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj) continue;
        if (proj.sy < carTop - 6) continue;   // pickup still ABOVE the car
        if (proj.sy > carBot + 24) continue;  // pickup already past below
        sp.collected = true;
        this._onCollect(sp);
      }
    }

    // ── Scenery collisions (trees, buildings, houses) ────────────────
    // When the player drifts off-road and bumps into a roadside fixture,
    // it counts as a "structural" crash: explosion, big damage, reset to
    // the road centre with 4-second i-frames so the player can recover.
    // Only fires if NOT already in the invincibility window — so each
    // crash spawns one explosion, not a chain reaction.
    const _now = this.time?.now ?? 0;
    if (_now >= this._invincibleUntil && Math.abs(p.x) > 0.95) {
      const SCENERY_TYPES = new Set([
        'tree', 'building', 'house', 'shrub', 'landmark',
        'cop_random_parked',   // parked roadside cops count as structures
      ]);
      let _scenicHit = false;
      for (let di = 0; di <= 4 && !_scenicHit; di++) {
        const idx = (segIdx + di) % this.road.segments.length;
        const seg = this.road.segments[idx];
        if (!seg?.sprites) continue;
        for (const sp of seg.sprites) {
          if (!SCENERY_TYPES.has(sp.type)) continue;
          if (sp.collected) continue;
          // Match sign: only check sprites on the side the player is on.
          if ((sp.offset > 0) !== (p.x > 0)) continue;
          const dX = Math.abs(sp.offset - p.x);
          if (dX > 0.35) continue;            // ~1/3 lane wide hitbox
          const relZ = di * SEG_LENGTH + SEG_LENGTH / 2;
          const proj = this.road.getVehicleProjection(relZ, sp.offset);
          if (!proj) continue;
          if (proj.sy < carTop - 6)  continue;
          if (proj.sy > carBot + 24) continue;
          _scenicHit = true;
          this._triggerSceneryRespawn(proj);
          break;
        }
      }
    }

    // Traffic vehicle collisions use BOTH a world-space near gate and a
    // screen-space overlap test. The near gate matters on steep downhill
    // bridge stretches: perspective can visually compress a far car near
    // the player sprite, but it is still thousands of world units ahead.
    // Strict screen-space collision + impact-type classification.
    // The NPC sprite's CENTRE must fall inside the player sprite's
    // bounding rectangle for ANY hit. From the geometry of the overlap we
    // then classify the crash so it behaves differently:
    //
    //   • REAR-END   — player slammed straight into NPC's back at speed
    //   • SIDE-SWIPE — sideways brush, NPC pushed off, player keeps going
    //   • CORNER     — corner-of-bumper clip, both nudged but no explosion
    // Player half-extents pulled from the LIVE sprite size so collision
    // tracks any visible scaling.  The 0.42 / 0.42 multipliers compensate
    // for the ~15% transparent margin in the car art so the hit rect
    // matches the visible body.
    const PLAYER_HX = (this.playerSprite.displayWidth  || 90) * 0.42;
    const PLAYER_HY = (this.playerSprite.displayHeight || 56) * 0.42;
    const playerCX  = this.playerSprite.x;
    // Decouple collision-rect Y from the sprite Y.  The sprite is parked
    // at the title-screen position (~SCREEN_H-130) per user preference,
    // but NPC cars project near the bottom of the road quad (~bottom of
    // screen).  If we used the sprite Y, the collision rect would float
    // ~120px above where NPCs actually appear and close-range hits would
    // miss (this is the same root cause as the bridge "fly through cars"
    // bug — here it's general, not bridge-specific).  Snap collisionY to
    // the far-edge Y of the closest visible road segment.
    const drawnAll = this.road?._drawn;
    let collisionY = SCREEN_H - 30;
    if (drawnAll?.length) {
      for (let k = 0; k < drawnAll.length; k++) {
        const d = drawnAll[k];
        if (d && d.screenY < SCREEN_H && d.screenY > 0) {
          collisionY = d.screenY - 8;
          break;
        }
      }
    }
    const playerCY = collisionY;

    // Returns null if no hit, else { type, dxRel, dyRel, side }.
    const classifyHit = (proj) => {
      if (!proj || proj.sw < 6) return null;
      const halfX = proj.sw * 0.42;
      const npcH  = proj.sw * (40 / 64) * 0.85;
      // Proper screen-space rect overlap.  NPC sprite has origin (0.5, 1)
      // so its bottom is proj.sy and top is proj.sy - npcH.  The previous
      // "NPC center inside player Y range" test missed every collision
      // outside a narrow ~1500-unit relZ window — at closer range npcH is
      // huge and pushes the center way out of the player rect, so the
      // player drove visually-through NPCs without registering any hit.
      const npcBot = proj.sy;
      const npcTop = proj.sy - npcH;
      const playerTop = playerCY - PLAYER_HY;
      const playerBot = playerCY + PLAYER_HY;
      if (npcBot < playerTop) return null;     // NPC entirely above player rect
      if (npcTop > playerBot) return null;     // NPC entirely below player rect
      const dx = proj.sx - playerCX;
      if (Math.abs(dx) >= halfX + PLAYER_HX) return null;

      // Lateral overlap drives the crash type.  Use actual rectangle
      // overlap ratio (how much of the smaller rect sits inside the
      // other) instead of the old center-distance / combined-width
      // ratio — that one was over-eager to call near-aligned hits
      // "side-swipe" because a slight lane mismatch with a small player
      // rect would push dxRel above the 0.7 threshold even when the
      // bumpers were mostly overlapping.  Now: high overlap ⇒ head-on
      // rear-end, low overlap ⇒ glancing side-swipe.
      const playerLeft  = playerCX - PLAYER_HX;
      const playerRight = playerCX + PLAYER_HX;
      const npcLeft     = proj.sx - halfX;
      const npcRight    = proj.sx + halfX;
      const overlapPx   = Math.max(0, Math.min(playerRight, npcRight)
                                     - Math.max(playerLeft, npcLeft));
      // Normalise overlap by the PLAYER's bumper width — answers "how
      // much of MY car got hit?" from the player's POV regardless of
      // how big the NPC projects on screen (a close-up truck shouldn't
      // need twice the overlap of a small sedan to count as a head-on).
      const overlapRatio = PLAYER_HX > 0 ? overlapPx / (2 * PLAYER_HX) : 0;
      const dxRel = Math.abs(dx) / (halfX + PLAYER_HX);
      const npcMidY = (npcTop + npcBot) * 0.5;
      const dyRel = Math.abs(npcMidY - playerCY) / PLAYER_HY;
      const side  = dx >= 0 ? 'right' : 'left';

      let type;
      // Tuned so a clearly-overlapping crash like the screenshot
      // (~40% of the player's bumper covered by the NPC) reads as a
      // head-on instead of a corner clip.  Side-swipe stays reserved
      // for true glances where most of the player's bumper is clear.
      if (overlapRatio >= 0.35)     type = 'rear-end';   // head-on / bumper-to-bumper
      else if (overlapRatio >= 0.10) type = 'corner';     // diagonal corner clip
      else                           type = 'side-swipe'; // grazing the flank
      return { type, dxRel, dyRel, side, overlapRatio };
    };

    // On bridge segments, the carriageways are physically separated by a
    // median + railing — oncoming cars in the opposite carriageway can
    // visually overlap the player's screen rect during curves, so we
    // gate oncoming-collisions by lateral world-space distance.  If the
    // player has swerved across the median INTO oncoming (gap small),
    // we still register the hit; only the "across the divider" phantom
    // overlap gets skipped.
    const playerSeg = this.road.segments[segIdx];
    const onBridge  = !!(playerSeg?.bridge || playerSeg?.water);
    // ~half a lane width — anything bigger is a different carriageway.
    const BRIDGE_OPPDIR_GAP = 0.55;
    // ── World-space AABB collision ─────────────────────────────────
    // The previous screen-space test missed real crashes whenever the
    // NPC's projection fell outside the narrow vertical window where
    // the player's screen rect lived.  Use a 3D box test on the road
    // plane instead: a hit fires when |Δposition| < CAR_LEN_Z AND
    // |Δlane| < CAR_WIDTH_LANES.  Screen-space classifyHit() is kept
    // only to LABEL the hit (rear-end / corner / side-swipe).
    const playerLane = p.x ?? 0;
    // The player's VISUAL position on screen is PLAYER_VIRTUAL_Z units
    // ahead of the camera, so collisions need to fire when an NPC is
    // near THAT z, not the camera's z.  Same offset used by the
    // forward-cull and the rear-view, keeps everything consistent.
    const playerPos  = p.position + PLAYER_VIRTUAL_Z;
    const aabbHit = (entityPos, entityLane) => {
      const dz = Math.abs(entityPos - playerPos);
      if (dz >= CAR_LEN_Z) return false;
      const dl = Math.abs(playerLane - (entityLane ?? 0));
      if (dl >= CAR_WIDTH_LANES * 2) return false;
      return true;
    };
    // Defensive label fallback — derive a hit type from the world-space
    // overlap when classifyHit() can't (NPC just behind the player /
    // off-screen so screen projection is unhelpful).
    const labelFromAABB = (entityPos, entityLane) => {
      const dl = Math.abs(playerLane - (entityLane ?? 0));
      const lateralOverlap = Math.max(0, 1 - dl / (CAR_WIDTH_LANES * 2));
      let type;
      if (lateralOverlap >= 0.65)      type = 'rear-end';
      else if (lateralOverlap >= 0.30) type = 'corner';
      else                              type = 'side-swipe';
      const side = (entityLane ?? 0) >= playerLane ? 'right' : 'left';
      return { type, dxRel: 1 - lateralOverlap, dyRel: 0, side, overlapRatio: lateralOverlap };
    };

    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const car = this.traffic[i];
      if (!car.alive) continue;
      // Bridge median guard — opposite carriageway oncoming traffic
      // doesn't physically share the deck.
      if (onBridge && (car.speed ?? 0) < 0
          && Math.abs(playerLane - (car.laneOffset ?? 0)) > BRIDGE_OPPDIR_GAP) continue;
      if (!aabbHit(car.position, car.laneOffset)) continue;
      // Try the screen-space classifier first (richer label info), but
      // fall back to the world-space label if projection is missing or
      // sub-threshold.  Note: getVehicleProjection wants relZ FROM THE
      // CAMERA (= car.position − p.position), not from the virtual
      // player z that aabbHit uses.
      const relZcam = car.position - p.position;
      const proj = relZcam > 0 ? this.road.getVehicleProjection(relZcam, car.laneOffset) : null;
      const hit  = (proj && classifyHit(proj)) || labelFromAABB(car.position, car.laneOffset);
      this._onVehicleCollision(car, i, hit);
    }

    for (let i = this.cops.cops.length - 1; i >= 0; i--) {
      const cop = this.cops.cops[i];
      if (cop.side === 'rear') continue;
      if (onBridge && (cop.speed ?? 0) < 0
          && Math.abs(playerLane - (cop.laneOffset ?? 0)) > BRIDGE_OPPDIR_GAP) continue;
      if (!aabbHit(cop.position, cop.laneOffset)) continue;
      const relZcam = cop.position - p.position;
      const proj = relZcam > 0 ? this.road.getVehicleProjection(relZcam, cop.laneOffset) : null;
      const hit  = (proj && classifyHit(proj)) || labelFromAABB(cop.position, cop.laneOffset);
      this._onCopCollision(cop, i, hit);
    }
  }

  /** Wrapper around DamageModel.takeDamage that bakes in every drug-driven
   *  damage modifier plus the difficulty multiplier:
   *    • Fentanyl ≥ 25%  → phase: collision deals zero damage.
   *    • Beer    ≥ 100% → 50% chance to no-op on glancing hits (sideswipes,
   *                        corner clips) — head-on / rear / PIT / ram still bite.
   *    • Difficulty.damageMul scales every hit (Easy 0.7, Normal 1.0, Hard 1.5).
   *    • Meth active     → +1 hp damage on every collision.
   *    • Heroin ≥ 15%    → discrete crash hits drop by 2 hp (replaces the
   *                        older 50%/85% numbness rules per user spec).
   *  Continuous offroad bleed (source 'offroad_bleed', amount < 1) skips
   *  the collision-only rules so it still trickles through normally. */
  /** Reusable drug-slider modal.  10 horizontal sliders (one per drug),
   *  click+drag to set 0..1.  Modes:
   *    'custom'  — title-screen Custom Mode start.  Includes the no-NPC-
   *                damage and no-police checkboxes.
   *    'live'    — in-game adjustment.  Pre-fills sliders with current
   *                bar levels; on confirm, writes them back without
   *                restarting the scene.
   *    'restart' — technical-loss flow.  Adds checkpoint picker row.
   *  `initialLevels` (optional) — object keyed by drug id, values 0..1.
   *  `onConfirm({ drugLevels, checkpointPos, noNpcDamage, noPolice })`
   *  fires when the player taps START. */
  _buildDrugSliderModal({ mode = 'custom', onConfirm, onClose, initialLevels = null } = {}) {
    if (this._sliderModalOpen) return;
    this._sliderModalOpen = true;
    const D = 280;
    const objs = [];

    const scrim = this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2,
      SCREEN_W, SCREEN_H, 0x000000, 0.85)
      .setDepth(D).setInteractive();
    // Eat clicks on the empty scrim — without this, clicks pass through
    // to whatever's underneath (title difficulty buttons, HUD, etc.)
    // because Phaser only stops propagation when a handler explicitly
    // calls it.
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    scrim.on('pointerup',   (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 40;
    const panelH = SCREEN_H - 30;
    const panelX = (SCREEN_W - panelW) / 2;
    const panelY = (SCREEN_H - panelH) / 2;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x0E1320, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 14);
    panel.lineStyle(3, 0x44AAFF, 1);
    panel.strokeRoundedRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 14);
    objs.push(panel);

    const titleStr = mode === 'restart' ? 'RESTART AT CHECKPOINT'
                   : mode === 'live'    ? 'ADJUST DRUG LEVELS'
                   :                       'CUSTOM MODE';
    const title = this.add.text(SCREEN_W / 2, panelY + 8, titleStr, {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#44CCFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Selected state — drug levels (pre-filled from initialLevels if
    // provided, else 0) + chosen checkpoint pos + custom-start flags.
    const drugLevels = {};
    for (const id of Object.values(DRUGS)) {
      drugLevels[id] = initialLevels?.[id] ?? 0;
    }
    let checkpointPos = this.player?.position ?? 0;
    let checkpointLabel = 'Current';
    let noNpcDamage = false;
    let noPolice    = false;

    let yCursor = panelY + 32;

    // ── Checkpoint picker (restart mode only) ────────────────────
    if (mode === 'restart') {
      const cpLabel = this.add.text(panelX + 12, yCursor,
        'Resume from:', {
          fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#AAAAAA',
        }).setOrigin(0, 0).setDepth(D + 2);
      objs.push(cpLabel);
      yCursor += 14;
      const cpStops = [
        { label: 'Seattle (start)', pos: 0 },
        ...REST_STOPS.map(rs => ({ label: rs.name, pos: rs.t * (ROUTE_SEGS * SEG_LENGTH) })),
      ];
      const cpRowW = panelW - 24;
      const cpBtnW = Math.floor((cpRowW - 4 * (cpStops.length - 1)) / cpStops.length);
      const cpBtnH = 22;
      const cpBgs = [];
      cpStops.forEach((cp, i) => {
        const bx = panelX + 12 + i * (cpBtnW + 4);
        const bg = this.add.graphics().setDepth(D + 2);
        const drawCp = (active) => {
          bg.clear();
          bg.fillStyle(active ? 0x4488FF : 0x222222, 1);
          bg.fillRoundedRect(bx, yCursor, cpBtnW, cpBtnH, 6);
          bg.lineStyle(1, 0x88AACC, 1);
          bg.strokeRoundedRect(bx + 0.5, yCursor + 0.5, cpBtnW - 1, cpBtnH - 1, 6);
        };
        drawCp(i === 0);
        bg.setInteractive(new Phaser.Geom.Rectangle(bx, yCursor, cpBtnW, cpBtnH), Phaser.Geom.Rectangle.Contains);
        bg.input.cursor = 'pointer';
        cpBgs.push({ bg, drawCp });
        const lbl = this.add.text(bx + cpBtnW / 2, yCursor + cpBtnH / 2,
          cp.label.split(',')[0], {
            fontSize: '8px', fontFamily: 'Impact, "Arial Black", sans-serif',
            color: '#FFFFFF',
          }).setOrigin(0.5).setDepth(D + 3);
        bg.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          checkpointPos   = cp.pos;
          checkpointLabel = cp.label;
          cpBgs.forEach((entry, j) => entry.drawCp(j === i));
        });
        objs.push(bg, lbl);
      });
      yCursor += cpBtnH + 12;
      // Default: first option (Seattle start)
      checkpointPos   = cpStops[0].pos;
      checkpointLabel = cpStops[0].label;
    }

    // ── Drug-level sliders ───────────────────────────────────────
    const drugList = Object.values(DRUGS);
    const drugCfgList = drugList.map(id => ({ id, cfg: DRUG_CONFIG[id] }));
    const sliderRowH  = 22;
    const trackX      = panelX + 110;
    const trackW      = panelW - 110 - 60;
    const trackH      = 12;
    const sliderRefs = [];

    for (let i = 0; i < drugCfgList.length; i++) {
      const { id, cfg } = drugCfgList[i];
      const y = yCursor + i * sliderRowH;
      const lbl = this.add.text(panelX + 12, y, cfg.label ?? id, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif',
        color: '#' + (cfg.color ?? 0xFFFFFF).toString(16).padStart(6, '0'),
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 2);
      objs.push(lbl);

      // Slider track + fill
      const track = this.add.graphics().setDepth(D + 2);
      track.fillStyle(0x222222, 1);
      track.fillRoundedRect(trackX, y + 1, trackW, trackH, 6);
      track.lineStyle(1, 0x666666, 1);
      track.strokeRoundedRect(trackX + 0.5, y + 1.5, trackW - 1, trackH - 1, 6);
      track.setInteractive(new Phaser.Geom.Rectangle(trackX, y, trackW, sliderRowH),
        Phaser.Geom.Rectangle.Contains);
      track.input.cursor = 'pointer';
      objs.push(track);

      const fill = this.add.graphics().setDepth(D + 3);
      const valTxt = this.add.text(trackX + trackW + 6, y + 1, '0%', {
        fontSize: '10px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#FFFFFF',
      }).setOrigin(0, 0).setDepth(D + 3);
      objs.push(fill, valTxt);

      const drawFill = (level) => {
        fill.clear();
        fill.fillStyle(cfg.color ?? 0x44AAFF, 0.85);
        fill.fillRoundedRect(trackX + 1, y + 2, Math.max(0, (trackW - 2) * level), trackH - 2, 5);
        valTxt.setText(`${Math.round(level * 100)}%`);
      };
      drawFill(drugLevels[id] ?? 0);   // pre-fill from initialLevels (if any)

      let dragging = false;
      const updateFromPointer = (ptr) => {
        const lx = ptr.x - trackX;
        const lvl = Math.max(0, Math.min(1, lx / trackW));
        drugLevels[id] = lvl;
        drawFill(lvl);
      };
      track.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        dragging = true;
        updateFromPointer(ptr);
      });
      track.on('pointermove', (ptr) => {
        if (!dragging) return;
        updateFromPointer(ptr);
      });
      // Bind release globally so dragging off the track still releases.
      const onUp = () => { dragging = false; };
      this.input.on('pointerup', onUp);
      sliderRefs.push({ id, drawFill, onUp });
    }

    // ── Custom-mode checkboxes (No NPC damage / No police) ───────
    if (mode === 'custom') {
      const cbY = panelY + panelH - 78;
      const cbSize = 14;
      const checkboxes = [
        { x: panelX + 22,        label: 'No NPC damage', key: 'noNpcDamage' },
        { x: panelX + 22 + 180,  label: 'No police',     key: 'noPolice' },
      ];
      const cbState = { noNpcDamage: false, noPolice: false };
      checkboxes.forEach(({ x, label, key }) => {
        const box = this.add.graphics().setDepth(D + 2);
        const drawBox = (checked) => {
          box.clear();
          box.fillStyle(checked ? 0x44CCFF : 0x222222, 1);
          box.fillRoundedRect(x, cbY, cbSize, cbSize, 3);
          box.lineStyle(1.5, 0xFFFFFF, 1);
          box.strokeRoundedRect(x + 0.5, cbY + 0.5, cbSize - 1, cbSize - 1, 3);
          if (checked) {
            box.lineStyle(2, 0xFFFFFF, 1);
            box.beginPath();
            box.moveTo(x + 3, cbY + cbSize * 0.55);
            box.lineTo(x + cbSize * 0.45, cbY + cbSize - 3);
            box.lineTo(x + cbSize - 2, cbY + 3);
            box.strokePath();
          }
        };
        drawBox(false);
        box.setInteractive(new Phaser.Geom.Rectangle(x, cbY, cbSize, cbSize), Phaser.Geom.Rectangle.Contains);
        box.input.cursor = 'pointer';
        const lbl = this.add.text(x + cbSize + 5, cbY + cbSize / 2, label, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif',
          color: '#CCCCCC',
        }).setOrigin(0, 0.5).setDepth(D + 3);
        // Tap on label OR box toggles.
        const toggle = () => {
          cbState[key] = !cbState[key];
          drawBox(cbState[key]);
          if (key === 'noNpcDamage') noNpcDamage = cbState[key];
          if (key === 'noPolice')    noPolice    = cbState[key];
        };
        box.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          toggle();
        });
        const lblHit = this.add.rectangle(x + cbSize + 5, cbY, 140, cbSize, 0x000000, 0)
          .setOrigin(0, 0).setDepth(D + 3).setInteractive({ useHandCursor: true });
        lblHit.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          toggle();
        });
        objs.push(box, lbl, lblHit);
      });
    }

    // ── Confirm / Cancel buttons ─────────────────────────────────
    const btnY = panelY + panelH - 38;
    const btnW = 140, btnH = 30, btnGap = 16;
    const startX = SCREEN_W / 2 - btnW - btnGap / 2;
    const cancelX = SCREEN_W / 2 + btnGap / 2;

    const startBg = this.add.graphics().setDepth(D + 2);
    startBg.fillStyle(0x227755, 1);
    startBg.fillRoundedRect(startX, btnY, btnW, btnH, 8);
    startBg.lineStyle(2, 0xFFFFFF, 1);
    startBg.strokeRoundedRect(startX + 0.5, btnY + 0.5, btnW - 1, btnH - 1, 8);
    startBg.setInteractive(new Phaser.Geom.Rectangle(startX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    startBg.input.cursor = 'pointer';
    const startLbl = this.add.text(startX + btnW / 2, btnY + btnH / 2, 'START', {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(startBg, startLbl);

    const cancelBg = this.add.graphics().setDepth(D + 2);
    cancelBg.fillStyle(0x442222, 1);
    cancelBg.fillRoundedRect(cancelX, btnY, btnW, btnH, 8);
    cancelBg.lineStyle(2, 0xFFFFFF, 1);
    cancelBg.strokeRoundedRect(cancelX + 0.5, btnY + 0.5, btnW - 1, btnH - 1, 8);
    cancelBg.setInteractive(new Phaser.Geom.Rectangle(cancelX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    cancelBg.input.cursor = 'pointer';
    const cancelLbl = this.add.text(cancelX + btnW / 2, btnY + btnH / 2, 'CANCEL', {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(cancelBg, cancelLbl);

    const close = () => {
      this._sliderModalOpen = false;
      sliderRefs.forEach(r => this.input.off('pointerup', r.onUp));
      objs.forEach(o => o?.destroy?.());
      onClose?.();          // always fires — restore pause state, etc.
    };
    cancelBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });
    startBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
      onConfirm?.({
        drugLevels: { ...drugLevels },
        checkpointPos, checkpointLabel,
        noNpcDamage, noPolice,
      });
    });

    this._addHudObjs?.(...objs);
  }

  /** Garage modal — pick which OWNED car the player will drive on the
   *  next run.  Title-screen only.  Active selection persists to the
   *  registry so the next scene.start picks up the new vehicleId. */
  _buildGarageModal() {
    if (this._garageModalOpen) return;
    this._garageModalOpen = true;
    const owned = this.registry.get('ownedVehicles') ?? ['beater'];
    const currentId = this.registry.get('vehicleId') ?? this.player?.vehicleId ?? 'beater';
    const D = 240;
    const objs = [];

    const scrim = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.78)
      .setOrigin(0).setDepth(D).setInteractive();
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 80;
    const panelH = SCREEN_H - 100;
    const panelX = 40;
    const panelY = 50;
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x122039, 0.96)
      .setOrigin(0).setDepth(D + 1).setStrokeStyle(3, 0x66CCFF);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 18, '🚗  GARAGE', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    const sub = this.add.text(SCREEN_W / 2, panelY + 48,
      `${owned.length} car${owned.length === 1 ? '' : 's'} owned · tap to drive`, {
      fontSize: '12px', fontFamily: 'Arial', color: '#AAD0FF',
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(sub);

    // Vehicle list — one row per owned car, current marked.
    const rowH = 56, rowGap = 8;
    const listX = panelX + 16;
    const listY = panelY + 78;
    const listW = panelW - 32;
    owned.forEach((vid, i) => {
      const v = VEHICLES[vid];
      if (!v) return;
      const ry = listY + i * (rowH + rowGap);
      const isCurrent = vid === currentId;
      const bg = this.add.rectangle(listX, ry, listW, rowH,
        isCurrent ? 0x1E5BB8 : 0x0E1A2E, 1)
        .setOrigin(0).setDepth(D + 2)
        .setStrokeStyle(2, isCurrent ? 0xFFFFFF : 0x4A6E8C)
        .setInteractive({ useHandCursor: true });
      // Color swatch — uses the vehicle's tint as a paint-chip square.
      const swatch = this.add.rectangle(listX + 28, ry + rowH / 2, 36, 36, v.tint ?? 0xCCCCCC, 1)
        .setOrigin(0.5).setDepth(D + 3).setStrokeStyle(2, 0xFFFFFF);
      const lbl = this.add.text(listX + 60, ry + 8, v.label, {
        fontSize: '16px', fontFamily: IMPACT,
        color: isCurrent ? '#FFFFFF' : '#DDEEFF',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0, 0).setDepth(D + 3);
      const stats = this.add.text(listX + 60, ry + 30,
        `${v.hp} HP · ${v.rangeMi} mi · ${v.topMph} mph · ${v.drive} · ${v.fuel}`, {
        fontSize: '11px', fontFamily: 'Arial', color: '#AAD0FF',
      }).setOrigin(0, 0).setDepth(D + 3);
      const tag = this.add.text(listX + listW - 10, ry + rowH / 2,
        isCurrent ? '✓ DRIVING' : 'TAP TO DRIVE', {
        fontSize: '11px', fontFamily: IMPACT,
        color: isCurrent ? '#88FF88' : '#FFCC44',
      }).setOrigin(1, 0.5).setDepth(D + 3);

      bg.on('pointerover', () => { if (!isCurrent) bg.setFillStyle(0x1B3050); });
      bg.on('pointerout',  () => { if (!isCurrent) bg.setFillStyle(0x0E1A2E); });
      bg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        if (isCurrent) return;
        // Persist + apply: set registry + swap player + sprite + reset
        // tank to full of the new vehicle's range.
        this.registry.set('vehicleId', vid);
        if (this.player) {
          this.player.vehicleId = vid;
          this.player.gasMaxMi  = v.rangeMi;
          this.player.gasMi     = v.rangeMi;       // full tank on title swap
          if (this.damage?.setMax)        this.damage.setMax(v.hp);
          if (this.damage?.setDurability) this.damage.setDurability(v.hp);
        }
        if (this.playerSprite) {
          if (vid === 'beater') this.playerSprite.clearTint();
          else if (v.tint)     this.playerSprite.setTint(v.tint);
        }
        // Close + re-open so the new "✓ DRIVING" mark renders.
        this._closeGarageModal(objs);
        this._buildGarageModal();
      });
      objs.push(bg, swatch, lbl, stats, tag);
    });

    // Close button.
    const closeY = panelY + panelH - 38;
    const closeBg = this.add.rectangle(SCREEN_W / 2, closeY, 160, 30, 0x66CCFF, 1)
      .setOrigin(0.5).setDepth(D + 2)
      .setStrokeStyle(2, 0xFFFFFF).setInteractive({ useHandCursor: true });
    const closeLbl = this.add.text(SCREEN_W / 2, closeY, 'CLOSE', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#000', stroke: '#FFF', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    closeBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._closeGarageModal(objs);
    });
    objs.push(closeBg, closeLbl);

    // Make UI camera ignore (so HUD camera doesn't double-render).
    this.cameras.main?.ignore?.(objs);
    this._garageModalObjs = objs;
  }

  _closeGarageModal(objs) {
    const list = objs ?? this._garageModalObjs ?? [];
    for (const o of list) o.destroy?.();
    this._garageModalObjs = null;
    this._garageModalOpen = false;
  }

  /** Build a scrollable Achievements page modal — full grid showing
   *  every drug-info + run-state achievement with the highest tier
   *  earned (or greyed-out lock).  Description text shown here only. */
  _buildAchievementsModal() {
    if (this._achievementsModalOpen) return;
    this._achievementsModalOpen = true;
    const D = 240;
    const objs = [];

    // Backdrop scrim — dismiss on click outside the panel.
    const scrim = this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2,
      SCREEN_W, SCREEN_H, 0x000000, 0.78)
      .setDepth(D).setInteractive();
    objs.push(scrim);

    const panelW = SCREEN_W - 60;
    const panelH = SCREEN_H - 50;
    const panelX = (SCREEN_W - panelW) / 2;
    const panelY = (SCREEN_H - panelH) / 2;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x0E1320, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 14);
    panel.lineStyle(3, 0xFFD700, 1);
    panel.strokeRoundedRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 14);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 12, '🏆  ACHIEVEMENTS', {
      fontSize: '18px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFD700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Close button (top-right)
    const closeBtn = this.add.text(panelX + panelW - 14, panelY + 10, '✕', {
      fontSize: '18px', fontFamily: 'Arial Black, Arial, sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(D + 3).setInteractive({ useHandCursor: true });
    objs.push(closeBtn);

    // Build the row list.  Drug achievements first (10) then run-state.
    const earned   = AchievementSystem.earned(this.registry);
    const drugDefs = AchievementSystem.drugDefs();
    const runDefs  = AchievementSystem.runDefs();
    const rows = [
      ...Object.entries(drugDefs).map(([_, def]) => def),
      ...Object.entries(runDefs).map(([id, def]) => ({ ...def, id })),
    ];

    // Strip the "X% per <unit>" prefix (plus its trailing punctuation /
    // em-dash / comma) from drug descriptions — user wants players to
    // discover pickup percentages on their own; only the in-game
    // effects belong on this page.
    const stripPickupPct = (s) => {
      if (!s) return '';
      return s.replace(/^[\d.]+%\s+per\s+[a-z]+\s*[.\-—,;:]?\s*/i, '').trim();
    };

    // ── Scrollable content area ─────────────────────────────────────
    // Phaser doesn't have a native scroll view — implement it manually
    // by tracking scrollY, applying it to each row's y, and clipping
    // overflow with a geometry mask.
    const rowH        = 30;
    const headerY     = panelY + 42;
    const contentTop  = headerY;
    const contentBot  = panelY + panelH - 26;          // leave room for indicator
    const contentH    = contentBot - contentTop;
    const colX        = panelX + 16;
    const totalH      = rows.length * rowH;
    const maxScroll   = Math.max(0, totalH - contentH);

    // Mask: a Graphics rectangle the size of the content area.  Each
    // row text/dot sets this as its mask so it visually clips when it
    // scrolls outside the content band.
    const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xFFFFFF, 1);
    maskShape.fillRect(panelX + 4, contentTop, panelW - 8, contentH);
    const mask = maskShape.createGeometryMask();
    objs.push(maskShape);    // destroy with the modal

    // Track per-row objects + their relative y offset so scrollY moves
    // every element in lock-step.
    const rowObjs = [];
    rows.forEach((def, i) => {
      const yRel = i * rowH;          // y offset within content area
      const tier = earned[def.id];
      const tierColor = tier ? AchievementSystem.tierColor(tier) : 0x555555;
      const tierLabel = tier ? tier.toUpperCase() : 'LOCKED';
      const iconCol   = tier ? '#FFFFFF' : '#666666';
      const lblCol    = tier ? '#FFFFFF' : '#777777';
      const descCol   = tier ? '#AAAAAA' : '#888888';

      // Pre-earn we surface `unlockHint` (how to find/unlock) — the
      // actual drug-effect text in `desc` is hidden so the player has
      // to discover those mechanics by playing.  Run-state achievements
      // (no drug to "find") just fall through to `desc` for both states
      // since their criteria ARE the description.
      const rawBody = tier
        ? (def.desc ?? '')
        : (def.unlockHint ?? def.desc ?? '???');
      const bodyText = tier ? stripPickupPct(rawBody) : rawBody;

      const initialY = contentTop + yRel;

      const dot = this.add.graphics().setDepth(D + 2);
      dot.fillStyle(tierColor, 1);
      dot.fillCircle(colX + 6, initialY + 8, 5);
      dot.setMask(mask);

      const icon = this.add.text(colX + 18, initialY, def.icon ?? '🏆', {
        fontSize: '13px',
      }).setOrigin(0, 0).setDepth(D + 2).setColor(iconCol).setMask(mask);
      const name = this.add.text(colX + 38, initialY, def.label, {
        fontSize: '12px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: lblCol, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);
      const tierTxt = this.add.text(colX + 178, initialY + 1, tierLabel, {
        fontSize: '9px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: tier ? '#' + tierColor.toString(16).padStart(6, '0') : '#666666',
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);
      const desc = this.add.text(colX + 230, initialY + 1, bodyText, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif',
        color: descCol, wordWrap: { width: panelW - 250 },
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);

      rowObjs.push({ dot, icon, name, tierTxt, desc, baseY: initialY });
      objs.push(dot, icon, name, tierTxt, desc);
    });

    // Scrollbar indicator (right side, semi-transparent).
    const scrollbarBg = this.add.graphics().setDepth(D + 2);
    const scrollbarFg = this.add.graphics().setDepth(D + 3);
    objs.push(scrollbarBg, scrollbarFg);
    const drawScrollbar = (scrollY) => {
      scrollbarBg.clear();
      scrollbarFg.clear();
      if (maxScroll <= 0) return;
      const barX = panelX + panelW - 10;
      const barW = 4;
      scrollbarBg.fillStyle(0x222222, 0.55);
      scrollbarBg.fillRoundedRect(barX, contentTop, barW, contentH, 2);
      const thumbH = Math.max(20, contentH * (contentH / totalH));
      const thumbY = contentTop + (scrollY / maxScroll) * (contentH - thumbH);
      scrollbarFg.fillStyle(0xFFD700, 0.85);
      scrollbarFg.fillRoundedRect(barX, thumbY, barW, thumbH, 2);
    };

    // Scroll state + input wiring.
    let scrollY = 0;
    const applyScroll = () => {
      for (const r of rowObjs) {
        const y = r.baseY - scrollY;
        r.dot.y     = y - r.baseY;        // graphics: shift via .y prop
        r.icon.y    = y;
        r.name.y    = y;
        r.tierTxt.y = y + 1;
        r.desc.y    = y + 1;
      }
      drawScrollbar(scrollY);
    };
    drawScrollbar(0);

    const onWheel = (_pointer, _gameObjects, _dx, dy) => {
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy * 0.6));
      applyScroll();
    };
    this.input.on('wheel', onWheel);

    // Touch / drag scroll (mobile).
    let dragStartY = null;
    let dragStartScroll = 0;
    const dragHit = this.add.rectangle(panelX + 4, contentTop, panelW - 8, contentH, 0x000000, 0)
      .setOrigin(0, 0).setDepth(D + 4).setInteractive();
    dragHit.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      dragStartY = ptr.y;
      dragStartScroll = scrollY;
    });
    dragHit.on('pointermove', (ptr) => {
      if (dragStartY == null) return;
      const dy = dragStartY - ptr.y;
      scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll + dy));
      applyScroll();
    });
    const endDrag = () => { dragStartY = null; };
    dragHit.on('pointerup',     endDrag);
    dragHit.on('pointerupoutside', endDrag);
    objs.push(dragHit);

    const close = () => {
      this._achievementsModalOpen = false;
      this.input.off('wheel', onWheel);
      objs.forEach(o => o?.destroy?.());
    };
    scrim.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });
    closeBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });

    // Camera registration for the new objects (UI camera only).
    this._addHudObjs?.(...objs);
  }

  /** Achievement toast — small, semi-transparent badge with tier label
   *  + achievement name only.  Full description text lives on the
   *  Achievements page on the title screen.  Sized so it never covers
   *  meaningful gameplay; alpha low so it reads as a notification, not
   *  a dialogue. */
  _showAchievementToast(evt) {
    if (!evt?.def) return;
    const { tier, def } = evt;
    const tierColor = AchievementSystem.tierColor(tier);
    const tierLabel = tier?.toUpperCase() ?? '';
    const cx = SCREEN_W / 2;
    const cy = SCREEN_H - 50;
    const w  = 240, h = 36;
    const D  = 80;
    // Top-level alpha applied to every element so animation tweens
    // lerp toward this max (instead of fully opaque).
    const TOAST_ALPHA = 0.62;

    const g = this.add.graphics().setDepth(D);
    g.fillStyle(0x0A0F18, 0.55);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(2, tierColor, 0.85);
    g.strokeRoundedRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2, 8);

    const tierTxt = this.add.text(cx - w / 2 + 9, cy - 12,
      `${tierLabel}`, {
        fontSize: '8px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#' + tierColor.toString(16).padStart(6, '0'),
        stroke: '#000', strokeThickness: 1,
      }).setOrigin(0, 0).setDepth(D + 1);

    const titleTxt = this.add.text(cx - w / 2 + 9, cy - 1,
      `${def.icon ?? '🏆'}  ${def.label}`, {
        fontSize: '12px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 1);

    const objs = [g, tierTxt, titleTxt];
    this._addHudObjs?.(...objs);

    objs.forEach(o => o.setAlpha(0));
    this.tweens.add({
      targets: objs, alpha: TOAST_ALPHA, y: '-=12', duration: 240, ease: 'Cubic.Out',
    });
    this.time.delayedCall(2200, () => {
      this.tweens.add({
        targets: objs, alpha: 0, duration: 280,
        onComplete: () => objs.forEach(o => o?.destroy?.()),
      });
    });
  }

  _applyDamage(amount, source) {
    if (!this.damage) return;
    // Crash i-frames — silently absorb any incoming damage (collision or
    // offroad bleed alike) until the invincibility window expires.
    if ((this.time?.now ?? 0) < this._invincibleUntil) return;
    const drugs = this.drugs;
    const isCollision = source && source !== 'offroad_bleed';

    // Custom-mode "No NPC damage" — skip any traffic / cop / collision
    // damage; offroad bleed still applies (otherwise it's not really
    // driving, it's flying).
    if (isCollision && this._customFlags?.noNpcDamage) return;

    if (isCollision) {
      const fent = drugs?.get?.(DRUGS.FENTANYL) ?? 0;
      if (fent >= 0.25) return;
      const alc = drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
      if (alc >= 1.0 && /sideswipe|corner/i.test(source) && Math.random() < 0.5) return;
    }

    let adj = amount * (Difficulty.damageMul() ?? 1);

    if (isCollision) {
      const meth = drugs?.get?.(DRUGS.METH) ?? 0;
      if (meth > 0.05) adj += 1;
      const hero = drugs?.get?.(DRUGS.HEROIN) ?? 0;
      if (hero >= 0.15 && adj >= 1) adj = Math.max(0, adj - 2);
    }

    if (adj > 0) {
      this.damage.takeDamage(adj, source);
      // Untouchable streak broken — reset the per-run no-damage timer.
      this._noDamageTimer = 0;
      this._noDamageFlags = { '1m': false, '2m': false, '3m': false, '5m': false };
    }
  }

  _impactModel(otherSpeed = 0, hit = {}, opts = {}) {
    const p = this.player;
    const closingMph = Math.abs((p.speed ?? 0) - (otherSpeed ?? 0)) / MAX_SPEED * 120;
    const overlap = clamp(hit?.overlapRatio ?? 0.5, 0, 1);
    const type = hit?.type ?? 'rear-end';
    const isHeadOn = opts.headOn ?? otherSpeed < 0;

    let severity;
    if (type === 'side-swipe') {
      severity = clamp((closingMph / 95) * (0.75 - overlap * 0.25), 0.12, 0.85);
    } else if (type === 'corner') {
      severity = clamp((closingMph / 85) * (0.45 + overlap * 0.65), 0.18, 1.05);
    } else {
      severity = clamp((closingMph / (isHeadOn ? 105 : 70)) * (0.55 + overlap * 0.75), 0.22, isHeadOn ? 1.55 : 1.25);
    }

    return { closingMph, overlap, severity };
  }

  _onVehicleCollision(car, _idx, hit) {
    const p    = this.player;
    const relZ = Math.max(50, car.position - p.position);
    const proj = this.road.getVehicleProjection(relZ, car.laneOffset);
    const sx   = proj?.sx ?? SCREEN_W / 2;
    const sy   = proj?.sy ?? SCREEN_H / 2;
    const sw   = proj?.sw ?? 32;

    // Count NPC-car crashes that happen after the player has had their
    // first drink — feeds the first-star activation gate in update().
    if (!car.isCop) {
      // Lifetime NPC-crash tally — gates rx unlock at 50.
      if (this.drugs) this.drugs.npcCrashesTotal = (this.drugs.npcCrashesTotal ?? 0) + 1;
      const everDrunk = (this.drugs.maxReached?.[DRUGS.ALCOHOL] ?? 0) > 0.05;
      if (everDrunk) {
        this._npcCrashesPostDrink = (this._npcCrashesPostDrink ?? 0) + 1;
      }
      // Drug-influenced bump counter — separate one-shot gate.  If any
      // drug bar is ≥ 30% at the moment of impact, the bump counts.
      // Once it hits 20, the player is awarded their first star (one
      // time only — see _drugBumpFired flag in the gate logic).
      if (!this._drugBumpFired) {
        const anyHigh = Object.values(DRUGS).some(id =>
          (this.drugs.get?.(id) ?? 0) >= 0.30);
        if (anyHigh) {
          this._drugBumpCount = (this._drugBumpCount ?? 0) + 1;
        }
      }
    }

    const type    = hit?.type ?? 'rear-end';
    // Push direction comes from where the NPC sat relative to the player.
    // hit.side is 'right' if NPC was right of player, 'left' if left of.
    const sideDir = hit?.side === 'right' ? -1 : 1;     // player gets pushed AWAY from NPC
    const npcDir  = -sideDir;                            // NPC gets pushed AWAY from player

    if (type === 'rear-end') {
      // Differentiate same-direction "rear-end" (player overtakes slow car
      // ahead) from "head-on" (oncoming car at full closing speed).
      const isHeadOn = (car.speed ?? 0) < 0;
      const impact = this._impactModel(car.speed ?? 0, hit, { headOn: isHeadOn });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse  = sideDir * (isHeadOn ? 2.8 + impact.severity * 1.5 : 1.8 + impact.severity * 1.4);
      p.speed     = Math.max(600, p.speed * (isHeadOn
        ? clamp(0.24 - impact.severity * 0.10, 0.08, 0.18)
        : clamp(0.72 - impact.severity * 0.36, 0.24, 0.62)));
      this.effects.triggerShake(
        isHeadOn ? 420 + impact.severity * 360 : 260 + impact.severity * 280,
        isHeadOn ? 0.014 + impact.severity * 0.012 : 0.010 + impact.severity * 0.010,
      );
      this.score += PTS_CRASH * this._scoreMult() * (isHeadOn ? 1.5 : 1);
      const label = car.isCop ? 'COP CAR RAMMED!\n⭐+1'
                  : isHeadOn   ? 'HEAD-ON!'
                  :              'REAR-END!';
      this._showPopup(label, isHeadOn ? '#FF2222' : '#FF8800');
      this._applyDamage(isHeadOn ? 3 + impact.severity * 3 : 1 + impact.severity * 2, isHeadOn ? 'head_on' : 'traffic');
      car.alive      = false;
      car.crashed    = true;
      car.crashTimer = 1.6;
      car.crashVx    = npcDir * (0.9 + impact.severity * 0.8) + (Math.random() - 0.5) * 0.4;
      car.crashAng   = 0;
      car.crashSpin  = (Math.random() < 0.5 ? -1 : 1) * (2.5 + impact.severity * 3.5 + Math.random() * 2);
      car.crashSmokeT = 0;
      car.speed      *= clamp(0.65 - impact.severity * 0.22, 0.28, 0.58);
      if (car.isCop) this.cops.addStar(0.25);   // rear-end NPC traffic-cop
      return;
    }

    if (type === 'side-swipe') {
      // Sideways brush — NPC pushed off the road, player keeps full speed,
      // tiny lateral nudge but no explosion, no big screen shake.
      const impact = this._impactModel(car.speed ?? 0, hit);
      p.xImpulse  = sideDir * (0.35 + impact.severity * 0.75);
      p.speed     = Math.max(1000, p.speed * clamp(0.98 - impact.severity * 0.10, 0.88, 0.97));
      this.effects.triggerShake(80 + impact.severity * 120, 0.003 + impact.severity * 0.005);
      this.score += Math.round(PTS_CRASH * 0.3 * this._scoreMult());
      this._showPopup('SIDESWIPE!', '#FFEE44');
      this._applyDamage(0.4 + impact.severity * 0.9, 'sideswipe');
      car.alive      = false;
      car.crashed    = true;
      car.crashTimer = 1.4;
      // NPC gets shoved hard sideways off the road — bigger lateral velocity
      // than rear-end since that's the whole point of a sideswipe.
      car.crashVx    = npcDir * (1.4 + impact.severity * 1.6) + (Math.random() - 0.3) * 0.3;
      car.crashAng   = 0;
      car.crashSpin  = npcDir * (1.8 + impact.severity * 3 + Math.random() * 2);
      car.crashSmokeT = 0;
      // NPC keeps most of its speed — it's still moving forward as it leaves
      // the road.
      car.speed      *= clamp(0.94 - impact.severity * 0.16, 0.78, 0.92);
      return;
    }

    // type === 'corner' — diagonal corner clip. Mid-severity.
    const impact = this._impactModel(car.speed ?? 0, hit);
    p.xImpulse  = sideDir * (0.9 + impact.severity * 1.2);
    p.speed     = Math.max(800, p.speed * clamp(0.91 - impact.severity * 0.22, 0.68, 0.87));
    this.effects.triggerShake(140 + impact.severity * 230, 0.006 + impact.severity * 0.010);
    this.score += Math.round(PTS_CRASH * 0.55 * this._scoreMult());
    this._showPopup('CORNER CLIP!', '#FFAA44');
    this._applyDamage(0.6 + impact.severity * 1.4, 'corner');
    car.alive      = false;
    car.crashed    = true;
    car.crashTimer = 1.5;
    car.crashVx    = npcDir * (1.0 + impact.severity * 1.0) + (Math.random() - 0.4) * 0.3;
    car.crashAng   = 0;
    car.crashSpin  = npcDir * (2 + impact.severity * 2.4 + Math.random() * 1.5);
    car.crashSmokeT = 0;
    car.speed      *= clamp(0.82 - impact.severity * 0.25, 0.52, 0.76);
  }

  _onCopCollision(cop, idx, hit) {
    const p    = this.player;
    const relZ = Math.max(50, cop.position - p.position);
    const proj = this.road.getVehicleProjection(relZ, cop.laneOffset);
    const sx   = proj?.sx ?? SCREEN_W / 2;
    const sy   = proj?.sy ?? SCREEN_H / 2;
    const sw   = proj?.sw ?? 32;

    const type    = hit?.type ?? 'rear-end';
    const sideDir = hit?.side === 'right' ? -1 : 1;
    const kind    = cop.kind ?? 'pursuit-front';

    // Generic bump tally (legacy, still drives `BUMPS x/8` HUD).
    if (type !== 'side-swipe') this.cops.registerBump();

    // ── Head-on with oncoming cop — counts toward 3-strikes BUSTED ────
    if (kind === 'oncoming' && type !== 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? -p.speed, hit, { headOn: true });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (2.6 + impact.severity * 1.5);
      p.speed    = Math.max(400, p.speed * clamp(0.26 - impact.severity * 0.10, 0.10, 0.20));
      this.cops.addStar(0.5);                  // head-on with oncoming cop
      this.effects.triggerShake(440 + impact.severity * 360, 0.015 + impact.severity * 0.012);
      this._applyDamage(3 + impact.severity * 3, 'cop_head_on');
      const headons = this.cops.registerHeadOn();
      const left = 3 - headons;
      this._showPopup(
        left > 0 ? `HEAD-ON COP! ${headons}/3\n${left} more = JAIL` : 'BUSTED!',
        '#FF2222',
      );
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Sideswipe of an oncoming cop — no bust counter, just chaos ────
    if (kind === 'oncoming' && type === 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? -p.speed, hit, { headOn: true });
      p.xImpulse = sideDir * (0.55 + impact.severity * 0.9);
      p.speed    = Math.max(800, p.speed * clamp(0.98 - impact.severity * 0.12, 0.86, 0.96));
      this.cops.addStar(0.2);                  // side-swipe oncoming cop
      this.effects.triggerShake(100 + impact.severity * 160, 0.004 + impact.severity * 0.006);
      this._applyDamage(0.5 + impact.severity * 1.1, 'cop_sideswipe_oncoming');
      this._showPopup('SIDESWIPED ONCOMING COP!', '#FFCC44');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Rear cop ramming player — counts toward 5-strikes BUSTED ──────
    if (kind === 'rear' && type !== 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? p.speed, hit, { headOn: false });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (1.0 + impact.severity * 1.0);
      p.speed    = Math.max(400, p.speed * clamp(0.78 - impact.severity * 0.20, 0.50, 0.70));
      this.cops.addStar(0.2);                  // player rear-ends a cop
      this.effects.triggerShake(180 + impact.severity * 220, 0.007 + impact.severity * 0.009);
      this._applyDamage(1 + impact.severity * 1.8, 'cop_ram_rear');
      const rearBumps = this.cops.registerRearBump();
      const left = 5 - rearBumps;
      this._showPopup(
        left > 0 ? `COP RAM! ${rearBumps}/5\n${left} more = JAIL` : 'BUSTED!',
        '#FF2222',
      );
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── PIT maneuver — only fires when the cop's PIT setup has been
    //    armed (sustained lateral lock at close range).  A side-swipe
    //    before that = the player smashing into the cop, which CRASHES
    //    the cop instead of busting the player. ────────────────────────
    if (type === 'side-swipe' && cop._pitArmed) {
      const impact = this._impactModel(cop.speed ?? p.speed, hit);
      p.xImpulse = sideDir * (1.0 + impact.severity * 1.1);
      p.speed    = Math.max(600, p.speed * clamp(0.86 - impact.severity * 0.18, 0.68, 0.82));
      this.effects.triggerShake(160 + impact.severity * 190, 0.007 + impact.severity * 0.008);
      this._applyDamage(1 + impact.severity * 1.5, 'cop_pit');
      this.cops.registerPit();
      this._showPopup('PIT MANEUVER!\nBUSTED!', '#FF2222');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Player smashed the cop's side — cop crashes off the road ─────
    if (type === 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? p.speed, hit);
      p.xImpulse = sideDir * (0.35 + impact.severity * 0.75);
      p.speed    = Math.max(800, p.speed * clamp(0.98 - impact.severity * 0.10, 0.88, 0.96));
      this.cops.addStar(0.1);                  // player smashes cop side
      this.effects.triggerShake(90 + impact.severity * 150, 0.004 + impact.severity * 0.006);
      this._applyDamage(0.5 + impact.severity * 1.0, 'cop_smash');
      // Mark cop visually crashed (spawns debris cloud) and remove.
      this._spawnExplosion(sx, sy, sw);
      this._showPopup('SMASHED A COP!', '#FFAA22');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Barricade cop — instant slow-to-45-mph for 5 seconds ─────────
    if (kind === 'barricade') {
      const impact = this._impactModel(cop.speed ?? 0, hit, { headOn: false });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (1.4 + impact.severity * 1.3);
      p.speed    = Math.max(400, p.speed * clamp(0.48 - impact.severity * 0.18, 0.24, 0.42));
      this.effects.triggerShake(240 + impact.severity * 260, 0.010 + impact.severity * 0.011);
      this._applyDamage(2 + impact.severity * 3, 'cop_barricade');
      this._flatTireTimer = Math.max(this._flatTireTimer ?? 0, 5);
      this._showPopup('🚧 BARRICADE!\n45 MPH × 5 sec', '#FF8800');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Default catch-all (corner clip) ──────────────────────────────
    const impact = this._impactModel(cop.speed ?? p.speed, hit);
    p.xImpulse = sideDir * (0.8 + impact.severity * 1.0);
    p.speed    = Math.max(600, p.speed * clamp(0.90 - impact.severity * 0.20, 0.66, 0.86));
    this.cops.addStar(0.1);                    // corner-clip a cop
    this.effects.triggerShake(110 + impact.severity * 180, 0.005 + impact.severity * 0.008);
    this._applyDamage(0.7 + impact.severity * 1.3, 'cop_corner');
    this._showPopup('CLIPPED A COP!', '#FF6644');
    cop.alive = false;
    this.cops.cops.splice(idx, 1);
    this._tickPlayerCopCrash();
  }

  /** Increment the player-vs-cop crash counter.  Every 3rd crash applies
   *  a 45-mph cap for 5 seconds (reuses the flat-tire timer mechanic).
   *  Resets to 0 after each penalty so the next 3rd crash triggers again. */
  _tickPlayerCopCrash() {
    this._playerCopCrashes = (this._playerCopCrashes ?? 0) + 1;
    if (this._playerCopCrashes >= 3) {
      this._playerCopCrashes = 0;
      this._flatTireTimer = Math.max(this._flatTireTimer ?? 0, 5);
      this._showPopup('🚓 3 COPS CRASHED!\n45 MPH × 5 sec', '#FF8800');
    }
  }

  _spawnExplosion(sx, sy, sw) {
    this.explosions.push({ sx, sy, sw: Math.max(sw, 18), timer: 0, maxTimer: 0.55 });
  }

  /** Scenery crash response: explosion at impact point, big HP hit,
   *  car snapped back to road centre, then 4-second i-frames so the
   *  player can recover.  During the i-frame window the playerSprite
   *  blinks (see _renderVehicles) and _applyDamage is no-op, so
   *  Tap-mode players who let the car drift into a tree can survive a
   *  few impacts before HP runs out instead of being instantly stuck
   *  in a collide-loop. */
  _triggerSceneryRespawn(proj) {
    const sx = proj?.sx ?? (this.playerSprite?.x ?? SCREEN_W / 2);
    const sy = proj?.sy ?? (this.playerSprite?.y ?? SCREEN_H - 130);
    const sw = proj?.sw ?? 80;
    this._spawnExplosion(sx, sy, sw);
    // Damage BEFORE setting the invincibility window so this hit still
    // counts (otherwise the new gate in _applyDamage would absorb it).
    this._applyDamage(20, 'scenery_crash');
    // Snap back to road centre + halve speed so the player isn't
    // immediately re-clipping the same tree at full velocity.
    this.player.x        = 0;
    this.player.speed   *= 0.5;
    this.player.steerVelocity = 0;
    this._invincibleUntil = (this.time?.now ?? 0) + 4000;
    this._showPopup?.('💥 CRASH — recover!', '#FF4444');
  }

  _onCollect(sprite) {
    const type = sprite.collectibleType;

    if (type === 'hitchhiker') {
      this._hitchhikerPickup();
      return;
    }

    if (type === 'f12') {
      const invType = { f12_gun: 'gun', f12_spike: 'spike_strip', f12_paint: 'paint_bomb', f12_rocket: 'rocket' }[sprite.type];
      if (invType && !this.cops.canCarryMore(invType)) {
        // Inventory full for this type — don't consume the pickup so it
        // remains visible (and harvestable) if user later uses one.
        sprite.collected = false;
        return;
      }
      this.cops.addF12Token(sprite.type);
      const labels = {
        f12_gun:    '🔫 GUN ACQUIRED',
        f12_spike:  '📍 SPIKE STRIP',
        f12_paint:  '🎨 PAINT BOMB',
        f12_rocket: '🚀 ROCKET LAUNCHER',
      };
      this._showPopup(labels[sprite.type] ?? 'F12 TOKEN', '#AADDFF');
      this.effects.triggerShake(60, 0.002);
      return;
    }

    if (type === 'cop_roadblock') {
      // Roadblocks only exist once you're at 3+ stars — under that threshold
      // skip the collision entirely (matches the visual gate in Road.js).
      if (this.cops.starDisplay < 3) return;
      // Treat as a vehicle collision
      const p   = this.player;
      const seg = this.road.getSegment(p.position);
      this._spawnExplosion(SCREEN_W / 2, SCREEN_H * 0.55, 40);
      p.xImpulse = (Math.random() > 0.5 ? 1 : -1) * 2.0;
      p.speed    = Math.max(1000, p.speed * 0.45);
      this.cops.addStar(0.33);                 // hit roadblock
      this.effects.triggerShake(350, 0.012);

      // Every 3rd roadblock hit blows a tire — top speed capped at 45 mph for
      // 30 seconds (drive carefully or pick up a hitchhiker for repair).
      this._roadblockHits = (this._roadblockHits ?? 0) + 1;
      if (this._roadblockHits % 3 === 0) {
        this._flatTireTimer = 30;
        this._showPopup('💥 HIT ROADBLOCK!\n🔧 FLAT TIRE — top 45 mph', '#FF2222');
      } else {
        this._showPopup('HIT ROADBLOCK!\n⭐+1', '#FF4444');
      }
      return;
    }

    if (type === 'drug') {
      // 4★+ drug pickup suppression — match the renderer; the sprite is
      // visually invisible and shouldn't grant pickup either.
      if (this.cops.starDisplay >= 4 && (sprite.lootSeed ?? 1) < 0.40) {
        sprite.collected = true;       // mark as gone but don't grant
        return;
      }
      // Probation: first 60s after arrest = any drug use adds 2 stars
      if (this._probationTimer > 0) {
        this.cops.addStar(1.0);                // drug pickup during probation
        this._showPopup('PROBATION!\n+1 STAR!', '#FF4444');
      }
      const result = this.drugs.pickup(sprite.type);
      if (!result) return;
      // First-pickup achievement — fire on the very first hit of each
      // drug, with the toast text describing the mechanic.
      if (this.drugs.pickupCounts?.[result.drug] === 1) {
        AchievementSystem.firstPickup(result.drug, this.registry);
      }
      // Full Tank: bar this drug to 99% (without OD'ing — OD is checked
      // below).  Fires once per run on first crossing.
      if (this.drugs.get(result.drug) >= 0.99 && !this._fullTankFired?.[result.drug]) {
        this._fullTankFired = this._fullTankFired ?? {};
        this._fullTankFired[result.drug] = true;
        AchievementSystem.award('full_tank', this.registry);
      }
      // Maxed-out: per-drug achievement for canOD drugs reaching 100%
      // without triggering an overdose.  OD now fires on overflow past
      // 100% (not on reaching it), so this is achievable.
      const _drugCfg = DRUG_CONFIG[result.drug];
      if (_drugCfg?.canOD
          && this.drugs.get(result.drug) >= 1.0
          && !this._maxedFired?.[result.drug]) {
        this._maxedFired = this._maxedFired ?? {};
        this._maxedFired[result.drug] = true;
        AchievementSystem.award(`maxed_${result.drug}`, this.registry);
      }
      // Custom mode: never OD — the slider-driven HUD already lets the
      // player set bars wherever they want, and OD'ing yourself there
      // is just a frustrating restart.  Treat it as a no-op.
      const _customMode = Difficulty.mode?.() === 'custom';
      if (result.overdose && !_customMode) { this._onOverdose(result.drug); return; }
      const basePts  = DRUG_PTS[result.drug] ?? 10;
      const isFull   = this.drugs.get(result.drug) >= 0.95;
      const mult     = (isFull ? 2 : 1) * this._scoreMult();
      const earned   = Math.round(basePts * mult);
      this.score    += earned;
      const label    = DRUG_CONFIG[result.drug]?.label ?? sprite.type;
      const suffix   = isFull ? '\n★ FULL BAR ×2!' : `  +$${earned}`;
      this._showPopup(`${label}${suffix}`, isFull ? '#FF8800' : '#FFFF44');
      this.effects.triggerShake(55, 0.002);
    }
  }

  /** On-road hitchhiker pickup — risk/reward.  ~60% positive (drugs
   *  recovery / score bonus / free weapon), ~40% negative (robbed of
   *  score, drugs, or a weapon).  Be careful who you pick up. */
  _hitchhikerPickup() {
    this.effects.triggerShake(80, 0.002);
    const r = Math.random();

    // ── 18% — friendly biker, free rocket ─────────────────────────────
    if (r < 0.18) {
      this.cops.addF12Token('rocket');
      this._showPopup('🤝 BIKER GAVE\nYOU A 🚀 ROCKET!', '#88FFCC');
      return;
    }
    // ── 18% — old hippie, free grenade ────────────────────────────────
    if (r < 0.36) {
      this.cops.addF12Token('grenade');
      this._showPopup('🤝 OLD HIPPIE\n💣 GRENADE!', '#88FFCC');
      return;
    }
    // ── 12% — disguise (skip a star or two) ───────────────────────────
    if (r < 0.48) {
      this.cops.addF12Token('disguise');
      this._showPopup('🤝 GAVE YOU A\n🎭 DISGUISE!', '#88FFCC');
      return;
    }
    // ── 12% — sober up + bonus $ ────────────────────────────────────
    if (r < 0.60) {
      this.drugs.applyRecovery(0.20);
      const bonus = Math.round(PTS_HITCH * this._scoreMult());
      this.score += bonus;
      this._showPopup(`🤝 NICE FOLKS!\n+$${bonus}, sobered up`, '#88FFCC');
      return;
    }
    // ── 22% — sketchy stranger robs score ─────────────────────────────
    if (r < 0.82) {
      const loss = Math.min(this.score, 600);
      this.score -= loss;
      this._showPopup(`💀 ROBBED!\n−$${loss}`, '#FF4444');
      return;
    }
    // ── 13% — armed robbery, takes a random F12 token ─────────────────
    if (r < 0.95) {
      const tokens = this.cops.f12Tokens;
      let stolen = null;
      if (tokens.length) {
        const idx = (Math.random() * tokens.length) | 0;
        stolen = tokens[idx];
        tokens.splice(idx, 1);
      }
      const loss = Math.min(this.score, 400);
      this.score -= loss;
      this._showPopup(
        stolen
          ? `💀 ARMED ROBBERY!\n−$${loss} + lost ${stolen}!`
          : `💀 ARMED ROBBERY!\n−$${loss}`,
        '#FF4444',
      );
      return;
    }
    // ── 5% — wipe a random drug bar (junkie nicked your stash) ────────
    const bars = Object.values(DRUGS).filter(id =>
      this.drugs.isUnlocked(id) && this.drugs.get(id) > 0.05,
    );
    if (bars.length) {
      const target = bars[(Math.random() * bars.length) | 0];
      this.drugs.levels[target] = 0;
      this._showPopup(`💀 JUNKIE STOLE\nYOUR ${target.toUpperCase()}!`, '#FF4444');
    } else {
      this._showPopup('💀 SKETCHY HITCH\n— close call', '#FFCC44');
    }
  }

  /** Order in which the weapon-cycle button steps through types. Rockets
   *  appear twice (forward + backward) so the player can pick a direction. */
  static get WEAPON_CYCLE() {
    // Every weapon (except spike strips, which are rear-only by design)
    // has fwd/bwd variants so the player can fire in either direction.
    return [
      'gun-fwd',     'gun-bwd',
      'rocket-fwd',  'rocket-bwd',
      'spike_strip',
      'paint-fwd',   'paint-bwd',
      'grenade-fwd', 'grenade-bwd',
      'disguise',
    ];
  }

  /** Resolve a cycle slot ('rocket-fwd' / 'paint-bwd' / etc.) back to the
   *  underlying inventory token type stored in CopSystem.f12Tokens. */
  _baseWeaponType(slot) {
    if (slot === 'rocket-fwd'  || slot === 'rocket-bwd')  return 'rocket';
    if (slot === 'gun-fwd'     || slot === 'gun-bwd')     return 'gun';
    if (slot === 'paint-fwd'   || slot === 'paint-bwd')   return 'paint_bomb';
    if (slot === 'grenade-fwd' || slot === 'grenade-bwd') return 'grenade';
    return slot;
  }

  _selectedFireDirection() {
    const slot = this._selectedWeapon;
    if (typeof slot === 'string' && slot.endsWith('-bwd')) return 'backward';
    return 'forward';
  }

  /** Default cycle-slot for a freshly-picked-up base weapon — points at the
   *  forward variant so legacy tap-to-fire keeps firing forward. */
  _defaultSlotFor(baseType) {
    const map = {
      rocket:     'rocket-fwd',
      gun:        'gun-fwd',
      paint_bomb: 'paint-fwd',
      grenade:    'grenade-fwd',
    };
    return map[baseType] ?? baseType;
  }

  /** Currently selected weapon slot, falling back to the last token in
   *  inventory if the player hasn't cycled yet (preserves legacy behavior). */
  _currentWeaponSlot() {
    if (this._selectedWeapon) {
      // Verify the player still has at least one of this base type.
      const base = this._baseWeaponType(this._selectedWeapon);
      if (this.cops.f12Tokens.includes(base)) return this._selectedWeapon;
      this._selectedWeapon = null;
    }
    const tokens = this.cops.f12Tokens;
    if (!tokens.length) return null;
    const last = tokens[tokens.length - 1];
    return this._defaultSlotFor(last);
  }

  /** Cycle to the next available weapon (only stops on types the player
   *  actually owns; rocket-fwd / rocket-bwd both require a 'rocket' token). */
  _cycleWeapon() {
    const tokens = this.cops.f12Tokens;
    if (!tokens.length) return;
    const ORDER = GameScene.WEAPON_CYCLE;
    const has = (slot) => tokens.includes(this._baseWeaponType(slot));
    const cur = this._currentWeaponSlot();
    const startIdx = cur ? ORDER.indexOf(cur) : -1;
    for (let i = 1; i <= ORDER.length; i++) {
      const next = ORDER[(startIdx + i + ORDER.length) % ORDER.length];
      if (has(next)) {
        this._selectedWeapon = next;
        const labels = this._weaponLabels();
        this._showPopup(`SELECTED:\n${labels[next] ?? next}`, '#88FFCC');
        return;
      }
    }
  }

  _weaponLabels() {
    return {
      'gun-fwd':     '🔫 GUN ▲ FWD',
      'gun-bwd':     '🔫 GUN ▼ REAR',
      'rocket-fwd':  '🚀 ROCKET ▲ FWD',
      'rocket-bwd':  '🚀 ROCKET ▼ REAR',
      'paint-fwd':   '🎨 PAINT ▲ FWD',
      'paint-bwd':   '🎨 PAINT ▼ REAR',
      'grenade-fwd': '💣 GRENADE ▲ FWD',
      'grenade-bwd': '💣 GRENADE ▼ REAR',
      spike_strip:   '📍 SPIKE STRIP',
      disguise:      '🎭 DISGUISE',
    };
  }

  /** Toggle paused state.  Used by both the SPACE key and the on-screen
   *  ⏸ button in the upper-right corner. */
  _togglePause() {
    this._paused = !this._paused;
    this._pauseGfx?.clear();
    if (this._paused) {
      this._pauseGfx?.fillStyle?.(0x000000, 0.6);
      this._pauseGfx?.fillRect?.(0, 0, SCREEN_W, SCREEN_H);
    }
    if (this._pauseObjects) {
      for (const o of this._pauseObjects) o.setVisible?.(this._paused);
    } else {
      this._pauseText?.setVisible?.(this._paused);
    }
    // Score-multiplier ("combination") is hidden while paused so the
    // pause controls sitting in its slot aren't crowded.
    this.hudMult?.setVisible?.(!this._paused);
    // When un-pausing, also tear down any open map modal so its rest-stop
    // text labels (which sit at depth 63 above the HUD) don't linger over
    // gameplay.
    if (!this._paused && this._mapModalOpen) this._closeMapModal();
    this.audio?.setPaused?.(this._paused);
  }

  /** Open the route-map modal — a centered panel showing the real WA
   *  geography (lat/lon waypoints for every checkpoint along
   *  I-90 → WA-26 → US-195 → WA-270) with rest-stop ticks + town labels
   *  and a player dot at the current mileage.  Mirrors the garage modal's
   *  lifecycle so its objects are owned by the modal and destroyed
   *  cleanly on close. */
  _buildMapModal() {
    if (this._mapModalOpen) return;
    this._mapModalOpen = true;
    const D = 260;                 // higher than the garage modal (240)
    const objs = [];

    const scrim = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.75)
      .setOrigin(0).setDepth(D).setInteractive();
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 40;
    const panelH = SCREEN_H - 60;
    const panelX = 20;
    const panelY = 30;
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x07111F, 0.96)
      .setOrigin(0).setDepth(D + 1).setStrokeStyle(3, 0x66CCFF);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 14, '🗺  ROUTE MAP', {
      fontSize: '20px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Plot area inside the panel.
    const plotX = panelX + 16;
    const plotY = panelY + 50;
    const plotW = panelW - 32;
    const plotH = panelH - 100;        // leave room for title + close button

    const g = this.add.graphics().setDepth(D + 2);
    objs.push(g);

    // ── Build the road polyline from real-world lat/lon waypoints ──────
    // Hand-keyed (lat, lon) for every named checkpoint along the actual
    // I-90 → WA-26 → US-195 → WA-270 corridor.  Plotting these as
    // (lon, -lat) gives a top-down map matching what you'd see on Google
    // Maps — straight east shot to Vantage, east-southeast across the
    // Columbia Basin, then the south jog at Colfax → Pullman.
    const GEO_WAYPOINTS = [
      [   0, 47.580, -122.390],   // West Seattle
      [   5, 47.598, -122.330],   // Seattle
      [ 9.5, 47.570, -122.222],   // Mercer Island
      [12.5, 47.611, -122.180],   // Bellevue
      [  18, 47.530, -122.033],   // Issaquah
      [  25, 47.528, -121.825],   // Snoqualmie
      [  32, 47.493, -121.789],   // North Bend
      [  53, 47.424, -121.413],   // Snoqualmie Pass
      [  70, 47.243, -121.187],   // Easton
      [  84, 47.196, -120.937],   // Cle Elum
      [ 101, 47.071, -120.661],   // Thorp
      [ 109, 46.995, -120.547],   // Ellensburg
      [ 137, 46.948, -119.978],   // Vantage
      [ 158, 46.904, -119.629],   // Royal City
      [ 184, 46.826, -119.176],   // Othello
      [ 228, 46.755, -118.310],   // Washtucna
      [ 253, 46.810, -117.873],   // La Crosse
      [ 274, 46.877, -117.364],   // Colfax
      [ 289, 46.731, -117.180],   // Pullman
    ];
    // Densify the polyline by linearly interpolating between waypoints
    // every ~0.5 mi so the line draws smoothly.
    const pathPts = [];
    const PATH_MILE_STEP = 0.5;
    for (let i = 0; i < GEO_WAYPOINTS.length - 1; i++) {
      const [m0, lat0, lon0] = GEO_WAYPOINTS[i];
      const [m1, lat1, lon1] = GEO_WAYPOINTS[i + 1];
      const span = m1 - m0;
      const steps = Math.max(1, Math.ceil(span / PATH_MILE_STEP));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const lat = lat0 + (lat1 - lat0) * t;
        const lon = lon0 + (lon1 - lon0) * t;
        pathPts.push([lon, -lat]);   // x = east, y = up (-lat → north on top)
      }
    }
    {
      const [, lat, lon] = GEO_WAYPOINTS[GEO_WAYPOINTS.length - 1];
      pathPts.push([lon, -lat]);
    }

    // Fit the path into the plot box.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pathPts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const PADDING = 24;                      // px inset around the route
    const fitW = plotW - PADDING * 2;
    const fitH = plotH - PADDING * 2;
    const s = Math.min(fitW / dx, fitH / dy);
    const cxData = (minX + maxX) / 2;
    const cyData = (minY + maxY) / 2;
    const ox = plotX + plotW / 2;
    const oy = plotY + plotH / 2;
    const project = (px, py) => [ox + (px - cxData) * s, oy + (py - cyData) * s];

    // Draw the road as a thick blue polyline with a yellow dashed centerline.
    g.lineStyle(7, 0x1E5BB8, 1);
    g.beginPath();
    {
      const [sx, sy] = project(pathPts[0][0], pathPts[0][1]);
      g.moveTo(sx, sy);
      for (let i = 1; i < pathPts.length; i++) {
        const [nx, ny] = project(pathPts[i][0], pathPts[i][1]);
        g.lineTo(nx, ny);
      }
    }
    g.strokePath();
    // Yellow centerline — every 3rd sample so it dashes naturally.
    g.lineStyle(1.5, 0xFFEE00, 0.7);
    for (let i = 1; i < pathPts.length; i += 3) {
      const [ax, ay] = project(pathPts[i - 1][0], pathPts[i - 1][1]);
      const [bx, by] = project(pathPts[i    ][0], pathPts[i    ][1]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();
    }

    // Helper: project a mile onto an (x,y) point along the polyline.
    const ptAtMile = (mile) => {
      const f = Math.max(0, Math.min(1, mile / TOTAL_ROUTE_MILES));
      const idx = Math.min(pathPts.length - 1, Math.round(f * (pathPts.length - 1)));
      return project(pathPts[idx][0], pathPts[idx][1]);
    };

    // Rest-stop ticks + town labels.  4-tier vertical stagger
    // (above-far / above-near / below-near / below-far) keeps the dense
    // Seattle cluster (Mercer Island / Bellevue / Issaquah / Snoqualmie)
    // from overlapping.  Each label gets a thin leader line from the dot.
    const LANE_OFFSETS = [-26, -12, 12, 26];   // px, +y is downward
    REST_STOPS.forEach((rs, i) => {
      const [px, py] = ptAtMile(rs.mileage);
      g.fillStyle(0xFFFFFF, 1);
      g.fillCircle(px, py, 3);
      g.lineStyle(1, 0x000000, 1);
      g.strokeCircle(px, py, 3);
      const dy = LANE_OFFSETS[i % LANE_OFFSETS.length];
      const ly = py + dy;
      // Leader line from dot to label.
      g.lineStyle(1, 0x88AACC, 0.7);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px, ly);
      g.strokePath();
      const lbl = this.add.text(px, ly,
        rs.name.split(',')[0], {
        fontSize: '10px', fontFamily: IMPACT,
        color: '#DDEEFF', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, dy < 0 ? 1 : 0).setDepth(D + 3);
      this.cameras.main?.ignore?.(lbl);
      objs.push(lbl);
    });

    // Player dot — pulsing red at current mile.
    const pMile = (this.player?.position ?? 0) / (ROUTE_SEGS * SEG_LENGTH) * TOTAL_ROUTE_MILES;
    const [pX, pY] = ptAtMile(pMile);
    g.fillStyle(0xFF2244, 1);
    g.fillCircle(pX, pY, 6);
    g.lineStyle(2, 0xFFFFFF, 1);
    g.strokeCircle(pX, pY, 6);
    const youLbl = this.add.text(pX, pY - 12, `YOU · MILE ${Math.round(pMile)}`, {
      fontSize: '11px', fontFamily: IMPACT,
      color: '#FF4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(D + 4);
    this.cameras.main?.ignore?.(youLbl);
    objs.push(youLbl);

    // Close button.
    const closeY = panelY + panelH - 28;
    const closeBg = this.add.rectangle(SCREEN_W / 2, closeY, 160, 30, 0x66CCFF, 1)
      .setOrigin(0.5).setDepth(D + 2)
      .setStrokeStyle(2, 0xFFFFFF).setInteractive({ useHandCursor: true });
    const closeLbl = this.add.text(SCREEN_W / 2, closeY, 'CLOSE', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#000', stroke: '#FFF', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    closeBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._closeMapModal();
    });
    objs.push(closeBg, closeLbl);

    this.cameras.main?.ignore?.(objs);
    this._mapModalObjs = objs;
  }

  _closeMapModal() {
    const list = this._mapModalObjs ?? [];
    for (const o of list) o?.destroy?.();
    this._mapModalObjs = null;
    this._mapModalOpen = false;
  }

  /** Pause-menu button factory mirroring GameOverScene._makeButton. */
  _buildPauseButton(cx, cy, w, h, label, fillColor, textColor, onClick) {
    const bg = this.add.rectangle(cx, cy, w, h, fillColor, 1)
      .setOrigin(0.5).setStrokeStyle(2, 0x000000).setDepth(62).setVisible(false)
      .setInteractive({ useHandCursor: true });
    const css = `#${textColor.toString(16).padStart(6, '0')}`;
    const txt = this.add.text(cx, cy, label, {
      fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: css, align: 'center',
    }).setOrigin(0.5).setDepth(63).setVisible(false);
    bg.on('pointerover', () => bg.setFillStyle(fillColor, 0.85));
    bg.on('pointerout',  () => bg.setFillStyle(fillColor, 1));
    let armed = false;
    bg.on('pointerdown', () => { armed = true; });
    bg.on('pointerup',   () => { if (armed) { armed = false; onClick?.(); } });
    bg.on('pointerout',  () => { armed = false; });
    return { bg, txt };
  }

  /** Fire a specific weapon type directly (used by tap-on-icon).  If the
   *  player owns at least one of `baseType`, sets the selected slot to it
   *  and fires.  Rocket defaults to forward (use Q / weapon-cycle for
   *  rear-fire). */
  _fireWeaponByType(baseType) {
    if (!this.cops.f12Tokens.includes(baseType)) return;
    this._selectedWeapon = this._defaultSlotFor(baseType);
    this._useTopF12();
  }

  _useTopF12() {
    const slot = this._currentWeaponSlot();
    if (!slot) return;
    const base = this._baseWeaponType(slot);
    const dir  = this._selectedFireDirection();
    const result = this.cops.useF12Token(base, this.player.position, dir, this.traffic);
    if (result?.ok) {
      // Weapons are infinite-use, but each fire has a 25% chance of
      // attracting a wanted star (witnesses, gunshot acoustic flags,
      // etc).  Custom mode bypasses since cops are typically off there.
      if (Math.random() < 0.25 && Difficulty.mode?.() !== 'custom') {
        this.cops.addStar?.(1);
        this._showPopup?.('🚓 +1 STAR — heard the shot', '#FF6644');
      }
      const arrow = dir === 'backward' ? '▼ REAR' : '▲ FWD';
      const labels = {
        gun:          `🔫 SHOT FIRED ${arrow}!`,
        spike_strip:  '📍 SPIKES DEPLOYED!',
        paint_bomb:   `🎨 PAINT LAUNCHED ${arrow}!`,
        rocket:       `🚀 ROCKET ${arrow}!`,
        grenade:      `💣 GRENADE ${arrow}!`,
        disguise:     '🎭 GOING DARK!',
      };
      this._showPopup(labels[base] ?? 'F12 USED!', '#AADDFF');
      this.effects.triggerShake(180, 0.007);

      // Per-victim FX: project each car's last-known position to screen,
      // then drop the appropriate effect on top of it.
      const isBomb = (base === 'rocket' || base === 'grenade' || base === 'paint_bomb');
      for (const v of (result.victims ?? [])) {
        const relZ = v.position - this.player.position;
        if (Math.abs(relZ) > 80000) continue;
        const proj = this.road.getVehicleProjection(relZ, v.laneOffset);
        if (!proj || proj.sw < 4) continue;
        const sx = proj.sx;
        const sy = proj.sy - proj.sw * 0.25;   // mid-body height of the car
        const sw = proj.sw;
        // Wreck — drifts laterally, spins, fades out over 1.5s.  Pass
        // colorSet so the wreck renders the actual car sprite (not a
        // grey rectangle).  Cops fall back to a police car texture.
        const wreckTex = v.isCop
          ? (this.textures.exists('car_back_police') ? 'car_back_police' : 'cop_police')
          : this._carTexKey(v.colorSet, 'back');
        this._spawnWreck(sx, sy, sw, v.laneOffset, wreckTex);
        if (base === 'gun') {
          // Tiny star on the windshield (front half of the car).
          this._spawnGunStar(sx, sy - sw * 0.12, sw);
        } else if (isBomb) {
          // Full explosion at the car's centre.
          this._spawnExplosion(sx, sy, sw * 1.2);
        }
      }

      this._currentWeaponSlot();
    }
  }

  /** Tiny white star at gun-impact point — short-lived flash on the
   *  victim's windshield. */
  _spawnGunStar(sx, sy, sw) {
    if (!this.explosions) this.explosions = [];
    this.explosions.push({
      sx, sy, sw: Math.max(8, sw * 0.5),
      timer: 0, maxTimer: 0.18, kind: 'star',
    });
  }

  /** Wreck animation — the actual car sprite spinning and drifting
   *  laterally with a smoke trail.  texKey is the Phaser texture for
   *  the victim car (drawn as a real Image, not a grey rectangle). */
  _spawnWreck(sx, sy, sw, laneOffset, texKey) {
    if (!this.explosions) this.explosions = [];
    // Faster, more violent spin — like the car was just smashed.
    const lateralV = (laneOffset >= 0 ? 1 : -1) * (140 + Math.random() * 80);
    const spinV    = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
    // Spawn a Phaser Image of the actual car sprite — it's rotated /
    // moved / faded by _renderExplosions each frame and destroyed when
    // the wreck timer expires.
    let img = null;
    if (texKey && this.textures.exists(texKey)) {
      const targetW = Math.max(20, sw * 1.6);
      const tex     = this.textures.get(texKey).source[0];
      const baseW   = tex?.width  || 64;
      const baseH   = tex?.height || 64;
      const targetH = targetW * (baseH / baseW);
      img = this.add.image(sx, sy, texKey)
        .setOrigin(0.5)
        .setDisplaySize(targetW, targetH)
        .setDepth(9.6);   // below player (9.95), above scenery (≤9.5)
      // Mirror the camera-ignore pattern: world objects on main cam only.
      this._uiCam?.ignore?.(img);
    }
    this.explosions.push({
      sx, sy, sw: Math.max(14, sw),
      timer: 0, maxTimer: 1.5, kind: 'wreck',
      lateralV, spinV, rotation: 0,
      img,
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────
  _renderFrame() {
    const progress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    const palette  = getPaletteAtProgress(Math.min(progress, 0.999));

    this.road.render(
      this.roadGfx, this.ghostGfx,
      this.player.position, this.player.x,
      palette, {
        doubleVision: this.effects.doubleVision,
        currentStars: this.cops.starDisplay,
        shroomsBar:   this.drugs?.get?.(DRUGS.SHROOMS) ?? 0,
      },
      this.propsGfx,
    );

    this._renderSceneSprites();   // buildings + trees from images
    this._renderVehicles();
    this._renderDrugSprites();
    this.road.renderTunnelOverlay(this.tunnelGfx);
    this.road.renderSignOverlay(this.signGfx);
    this._renderSignText();       // text labels on top of green/brown signs
    this._renderSignDecals();     // hwy-shield + brand-logo images on signs
    this._renderExplosions();

  }

  /** Resolve the right texture key for a car based on its colorSet and
   *  its direction relative to the player.  Same-direction → BACK image
   *  (player sees the rear); oncoming → FRONT image (car driving toward
   *  the player).  Falls back to legacy keys if a paired asset is absent. */
  _carTexKey(colorSet, facing /* 'back' | 'front' */) {
    if (!colorSet) return 'npc_car_white';
    const candidate = `car_${facing}_${colorSet}`;
    if (this.textures.exists(candidate)) return candidate;
    // Legacy fallbacks while the asset set isn't fully paired yet.
    if (colorSet === 'police') {
      if (this.textures.exists('cop_police')) return 'cop_police';
    }
    if (this.textures.exists(`car_${colorSet}`)) return `car_${colorSet}`;
    return 'npc_car_white';
  }

  _renderVehicles() {
    const p = this.player;
    const pool = this._carSpritePool;
    const ghostPool = this._carGhostPool;
    const dv = this.effects?.doubleVision ?? 0;
    const ghostOffset = dv > 0.01 ? Math.round(dv * 38) : 0;
    const ghostAlpha  = dv > 0.01 ? dv * 0.62 : 0;
    let used = 0;
    let ghostUsed = 0;

    // Reset the shared tire-shadow canvas — we redraw all car shadows
    // fresh each frame, anchored to sampleSurface() (NOT sprite Y), so
    // any 1-3 px sprite mismatch still reads as a grounded car.
    const shadowG = this._tireShadowGfx;
    if (shadowG) shadowG.clear();

    // ── Position the player car on the CURRENT-FRAME road surface ───
    // road.render() ran moments ago and built this frame's _drawn array.
    // _updatePlayer (way earlier in update()) only set X + angle; Y is
    // set here so we never read from a stale projection.  No lerp —
    // current-frame data doesn't need smoothing.
    if (this.playerSprite?.visible !== false) {
      const surf = this.road?.sampleSurface?.(PLAYER_VIRTUAL_Z, 0, { allowClipped: true });
      if (surf && Number.isFinite(surf.sy)) {
        this.playerSprite.y = surf.sy;
      }
    }

    const place = (relZ, laneOffset, color, scaleHint, rotation, texKey) => {
      // Cull NPCs that have passed the player's VISUAL position — they
      // should appear in the rear-view mirror instead, not stick around
      // floating below the sprite at the bottom of the screen.
      if (relZ < PLAYER_VIRTUAL_Z * 0.65 || relZ > 76000) return;
      const segIdx = Math.floor((p.position + relZ) / SEG_LENGTH) % this.road.segments.length;
      const inTunnel = !!this.road.segments[segIdx]?.tunnel;
      const tunnelLaneOffset = inTunnel ? clamp(laneOffset, -0.48, 0.48) : laneOffset;
      const proj = this.road.getVehicleProjection(relZ, tunnelLaneOffset);
      if (!proj || proj.sw < 2) return;
      // Tire shadow — the surface contact point sampled from the road,
      // not from where the sprite ended up.  An 8-bit darkening ellipse
      // hides any minor sprite/road mismatch.
      if (shadowG) {
        const shW = proj.sw * 0.78;
        const shH = Math.max(1.2, proj.sw * 0.10);
        shadowG.fillStyle(0x000000, 0.32);
        shadowG.fillEllipse(proj.sx, proj.sy - shH * 0.05, shW, shH);
      }
      if (used >= pool.length) return;
      const s = pool[used++];
      const useTex = texKey || 'npc_car_white';
      if (s.texture.key !== useTex) s.setTexture(useTex);
      // Display size targeting proj.sw px wide (so width matches projection
      // regardless of source-image dimensions).
      const tex = this.textures.get(useTex)?.source?.[0];
      const baseW = tex?.width  || 64;
      const baseH = tex?.height || 40;
      const targetW = proj.sw * (scaleHint ?? 1) * (inTunnel ? 0.88 : 1);
      const targetH = targetW * (baseH / baseW);
      // Unified world-space depth — all roadside sprites (buildings, trees,
      // cars, drugs) share the 7.0–9.5 band, mapped from z-distance so that
      // a *closer* sprite always paints over a *farther* one regardless of
      // type. Without this, cars (formerly depth 9) painted through any
      // building (depth 7.5) sitting between them and the camera.
      // In-tunnel cars need to clear the tunnelGfx overlay (depth 9.82) so
      // the wall structure doesn't paint over them — bump above 9.82 but
      // below signGfx (9.86) so signs still draw on top.
      const baseDepth = 9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5;
      const depth = inTunnel ? Math.max(baseDepth, 9.84) : baseDepth;
      s.setPosition(proj.sx, proj.sy)
        .setDisplaySize(targetW, targetH)
        .setTint(color)
        .setRotation(rotation ?? 0)
        .setDepth(depth)
        .setAlpha(1)
        .setVisible(true);

      // Double-vision ghost copy — shifted laterally and alpha'd.
      if (ghostOffset > 0 && ghostPool && ghostUsed < ghostPool.length) {
        const gs = ghostPool[ghostUsed++];
        if (gs.texture.key !== useTex) gs.setTexture(useTex);
        gs.setPosition(proj.sx + ghostOffset, proj.sy)
          .setDisplaySize(targetW, targetH)
          .setTint(color)
          .setRotation(rotation ?? 0)
          .setDepth(depth - 0.01)
          .setAlpha(ghostAlpha)
          .setVisible(true);
      }
    };

    // Traffic — alive cars and crashed wrecks (with spin). Each car looks
    // up its texture per-frame so direction changes (e.g. someone crashes
    // and the wreck spins to face the camera) update the image correctly.
    // Same-direction (positive speed) → BACK; oncoming (negative speed) →
    // FRONT (the player is staring down their grille as they close).
    //
    // For CRASHED wrecks the texture also flips between the back and
    // front images each half-rotation so the spin reads as the car
    // rotating yaw-wise (you see the rear, then the front, then the
    // rear again as it spins out) instead of just one image rolling.
    const TWO_PI = Math.PI * 2;
    for (const t of this.traffic) {
      const relZ = t.position - p.position;
      const baseFacing = (t.speed ?? 0) < 0 ? 'front' : 'back';
      let facing = baseFacing;
      if (t.crashed) {
        const ang = t.crashAng ?? 0;
        const mod = ((ang % TWO_PI) + TWO_PI) % TWO_PI;
        // Flip half: 90°..270° we're looking at the OPPOSITE end of the
        // car (its nose if it was driving away, its tail if oncoming).
        const flipHalf = mod >= Math.PI * 0.5 && mod < Math.PI * 1.5;
        if (flipHalf) facing = baseFacing === 'back' ? 'front' : 'back';
      }
      const texKey = this._carTexKey(t.colorSet, facing);
      const isImg  = texKey && texKey !== 'npc_car_white';
      const tint   = isImg ? 0xFFFFFF : t.color;
      if (t.crashed) {
        place(relZ, t.laneOffset, isImg ? 0xAA8866 : 0x664422, 1, t.crashAng ?? 0, texKey);
      } else if (t.alive) {
        place(relZ, t.laneOffset, tint, 1, 0, texKey);
      }
    }

    // Cache the cop list once per frame — getCopsForRender allocates a
    // filtered array, so reusing it across the two loops below saves
    // one allocation + one O(n) traversal per frame.
    const copsForRender = this.cops.getCopsForRender(p.position);

    // Cops — pursuit-front cops drive same direction (player sees the
    // back), oncoming cops barrel head-on (front), barricade cops parked
    // facing oncoming traffic = front.
    for (const cop of copsForRender) {
      const facing =
        cop.kind === 'oncoming'  ? 'front' :
        cop.kind === 'barricade' ? 'front' :
        (cop.speed ?? 0) < 0     ? 'front' :
                                   'back';
      const texKey = this._carTexKey(cop.colorSet ?? 'police', facing);
      place(cop.relativePos, cop.laneOffset, 0xFFFFFF, 1.0, 0, texKey);
    }

    // Player tire shadow — anchored to sprite.y (the actual on-screen
    // bottom of the car, since the sprite is origin (0.5, 1)) instead of
    // the live road sample.  During gameplay sprite.y already tracks the
    // road, so visually identical; on title / pause / death where the
    // sprite sits at its own Y, the shadow follows the car instead of
    // floating to wherever the road would be.
    // Ketamine retinal drift — shadow drifts laterally from the car body,
    // selling the "shadow detached from car" dissociation cue.  Up to
    // 4 px at peak ket bar.
    if (shadowG && this.playerSprite?.visible !== false) {
      const PW = 78, PH = 49;
      const shW = PW * 0.82;
      const shH = Math.max(2, PH * 0.18);
      const phys2 = this.effects?.getPhysics?.(this.drugs);
      const drift = phys2?.kRetinalDrift ?? 0;
      // Shadow tilts subtly OPPOSITE the car's lean — "body leans into
      // the turn, wheels stay planted" cue.  Applies in all steering
      // modes (classic / tilt / flappy).
      const leanDir = (this.player?.steerVelocity ?? 0) / (TURN_SPEED || 1);
      const shadowAngle = -leanDir * Phaser.Math.DegToRad(4);
      shadowG.save();
      shadowG.translateCanvas(this.playerSprite.x + drift, this.playerSprite.y);
      shadowG.rotateCanvas(shadowAngle);
      shadowG.fillStyle(0x000000, 0.40);
      shadowG.fillEllipse(0, 0, shW, shH);
      shadowG.restore();
    }

    // Hide any sprites in the pool we didn't use this frame.
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
    if (ghostPool) {
      for (let i = ghostUsed; i < ghostPool.length; i++) ghostPool[i].setVisible(false);
    }

    // Cop light bars + night headlights / tail-lights (depth 9.75).
    const g = this._copLightGfx;
    g.clear();

    // ── Night headlights / tail-lights for ALL traffic ───────────────
    // Only visible from late dusk on (nightAmt > 0).  Oncoming cars get
    // bright yellow headlights at the front (= bottom edge from the
    // player's view); same-direction cars show red tail-lights at the
    // bottom edge (= back of the car visible to player).
    const _mileForLights = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const _nightAmt      = TimeOfDay.nightAmount(_mileForLights);
    if (_nightAmt > 0.05) {
      const drawHeadlights = (proj, oncoming) => {
        if (!proj || proj.sw < 6) return;
        const w = proj.sw;
        const x = proj.sx;
        const y = proj.sy;            // bottom edge of NPC sprite
        const lx1 = x - w * 0.28;
        const lx2 = x + w * 0.28;
        const ly  = y - w * 0.10;
        const r1  = Math.max(2, w * 0.07);
        if (oncoming) {
          // Bright yellow headlight glow
          g.fillStyle(0xFFEEAA, 0.55 * _nightAmt);
          g.fillCircle(lx1, ly, r1 * 1.6);
          g.fillCircle(lx2, ly, r1 * 1.6);
          g.fillStyle(0xFFFFFF, 0.85 * _nightAmt);
          g.fillCircle(lx1, ly, r1);
          g.fillCircle(lx2, ly, r1);
        } else {
          // Dim red tail-light pair
          g.fillStyle(0x661111, 0.7 * _nightAmt);
          g.fillCircle(lx1, ly, r1 * 0.85);
          g.fillCircle(lx2, ly, r1 * 0.85);
          g.fillStyle(0xFF3333, 0.9 * _nightAmt);
          g.fillCircle(lx1, ly, r1 * 0.55);
          g.fillCircle(lx2, ly, r1 * 0.55);
        }
      };
      for (const t of this.traffic) {
        if (t.crashed || !t.alive) continue;
        const relZ = t.position - p.position;
        // Cull at the visual-player-z plane so headlights don't keep
        // shining from under the player sprite after a car has passed.
        if (relZ < PLAYER_VIRTUAL_Z * 0.65 || relZ > 76000) continue;
        const proj = this.road.getVehicleProjection(relZ, t.laneOffset);
        const oncoming = (t.speed ?? 0) < 0;
        drawHeadlights(proj, oncoming);
      }
      for (const cop of copsForRender) {
        const proj = this.road.getVehicleProjection(cop.relativePos, cop.laneOffset);
        const oncoming = cop.kind === 'oncoming' || cop.kind === 'barricade' || (cop.speed ?? 0) < 0;
        drawHeadlights(proj, oncoming);
      }
    }

    // Cop flashing light bars stay on top of everything else.
    for (const cop of copsForRender) {
      const proj = this.road.getVehicleProjection(cop.relativePos, cop.laneOffset);
      if (!proj || proj.sw < 6) continue;
      const w = proj.sw, x = proj.sx, y = proj.sy - w * 0.55;
      g.fillStyle(0x111111, 1); g.fillRect(x - w * 0.32, y, w * 0.64, w * 0.10);
      g.fillStyle(cop.flash ? 0xFF3333 : 0x440000, 1);
      g.fillRect(x - w * 0.30, y + 1, w * 0.28, w * 0.07);
      g.fillStyle(cop.flash ? 0x2255FF : 0x000044, 1);
      g.fillRect(x + w * 0.02, y + 1, w * 0.28, w * 0.07);
    }
  }

  _renderSceneSprites() {
    const pool = this._sceneSpritePool;
    if (!pool?.length) return;
    const segs = this.road.segments;
    if (!segs?.length) return;
    const playerPos = this.player.position;
    const startSeg  = Math.floor(playerPos / SEG_LENGTH);
    let used = 0;

    // Iterate NEAR → FAR so close scenery gets pool slots first. Depth is
    // set per-sprite (closer = higher depth) so paint order still works.
    // The pool is now 600 wide which gives enough headroom for a far-horizon
    // pass to also land — distant buildings shrink correctly as the player
    // approaches instead of popping into existence at close range.
    for (let n = 0; n <= 380 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        // Random roadside cop encounters — pick the appropriate police
        // texture (left/right side for parked, back for driving) and let
        // the rest of the pool placement logic handle scaling.
        let copTexKey = null;
        if (sp.copEncounter && !sp.triggered) {
          if (sp.type === 'cop_random_parked') {
            copTexKey = sp.side === 'left'
              ? (this.textures.exists('car_left_police')  ? 'car_left_police'  : 'car_back_police')
              : (this.textures.exists('car_right_police') ? 'car_right_police' : 'car_back_police');
          } else {
            copTexKey = this.textures.exists('car_back_police') ? 'car_back_police' : 'cop_police';
          }
        }
        if (!copTexKey && !sp.texKey) continue;
        if (sp.collected) continue;
        // Pickups (drugs, F12, etc.) are rendered by _renderDrugSprites at a
        // smaller pickup size — skip them here so they don't double-render
        // at building/tree size.
        if (sp.isCollectible) continue;
        const useTexKey = copTexKey ?? sp.texKey;
        if (!this.textures.exists(useTexKey)) continue;
        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        let visualOffset = sp.offset;
        if (sp.type === 'building' || sp.type === 'house') {
          const sign = visualOffset >= 0 ? 1 : -1;
          visualOffset = sign * Math.max(Math.abs(visualOffset), 2.15);
        }
        const proj = this.road.getVehicleProjection(relZ, visualOffset);
        if (!proj || proj.sw < 0.6) continue;
        if (used >= pool.length) break;
        const s = pool[used++];
        if (s.texture.key !== useTexKey) s.setTexture(useTexKey);
        const tex = this.textures.get(useTexKey).source[0];
        const baseW = tex?.width  || 64;
        const baseH = tex?.height || 64;
        // Per-type scale.  Random cops (parked or driving) get 1.4× car
        // width — life-sized vehicle, slightly bigger than NPC traffic so
        // they're more noticeable on the shoulder.
        const isTree     = sp.type === 'tree' || sp.type === 'cactus' || sp.type === 'palm' || sp.type === 'shrub';
        const isLandmark = sp.type === 'landmark';
        const isCopRand  = sp.copEncounter === true;
        const sizeMult   = isCopRand ? 1.4
                         : isLandmark ? 5.5
                         : isTree ? 2.0
                         : 2.6;
        const targetW    = proj.sw * sizeMult;
        const targetH    = targetW * (baseH / baseW);
        // Unified depth scheme — see _renderVehicles. Buildings/trees and
        // cars now share one band so a car between camera and a near
        // building correctly paints in front of the further building.
        // (Reuses relZ from above — was computed twice unnecessarily.)
        const depth = 9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5;
        s.setPosition(proj.sx, proj.sy)
          .setDisplaySize(targetW, targetH)
          .setDepth(depth)
          .setVisible(true);
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
  }

  /** Paint actual letters on the green / brown highway signs.  The Road
   *  Graphics layer draws the sign shapes (green face, white plates,
   *  yellow flags) but can't render text — this overlay places Phaser
   *  Text objects on each plate, sized + positioned to match the sign
   *  geometry as it scales with perspective. */
  _renderSignText() {
    const segs = this.road.segments;
    if (!segs?.length) return;

    if (!this._signTextPool) {
      this._signTextPool = [];
      for (let i = 0; i < 120; i++) {
        const t = this.add.text(0, 0, '', {
          fontSize: '12px', fontFamily: '"Helvetica Neue", Arial, sans-serif',
          fontStyle: 'bold',
          color: '#000000', align: 'center', resolution: 2,
        }).setOrigin(0.5).setVisible(false);
        this._signTextPool.push(t);
        this._worldObjects?.push(t);
        // CRITICAL: this pool is lazy-initialized AFTER create() finished
        // setting up cameras.  Phaser's _uiCam.ignore(this._worldObjects)
        // was called once with the (then-empty) array — pushing new
        // objects to that array now does NOT update the camera's ignore
        // set.  Without an explicit ignore call here, every text label
        // is rendered by BOTH the main camera AND the UI camera, which
        // is exactly what produces the "doubled sign text" the user has
        // been seeing.
        this._uiCam?.ignore?.(t);
      }
    }
    const pool = this._signTextPool;
    let used   = 0;

    // Drunk-only sign-text drift: at full alcohol bar (1.0), text starts
    // wandering off the sign as a "you can't read it anymore" gag.  Below
    // 100 % the text is rock-solid anchored.
    const alc = this.drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
    const drunkDrift = alc >= 1.0 ? 1.0 : 0;
    const tNow       = (this.gameTime ?? 0);

    /** Place a text label, shrinking the font if it would overflow `maxW`.
     *  This keeps long town names like "MERCER ISLAND" inside the sign
     *  without manually tuning per-string.  Defensive against destroyed
     *  pool entries (scene restart) and NaN font sizes. */
    const place = (text, color, cx, cy, baseFontSize, maxW, depth) => {
      if (used >= pool.length) return;
      const t = pool[used++];
      // Skip if Phaser has destroyed this Text behind our back — its
      // internal canvas goes null and setText would crash with
      // "Cannot read properties of null (reading 'drawImage')".
      if (!t || !t.scene || t.canvas == null) return;
      const safeText = String(text ?? '');
      if (!safeText.length) { t.setVisible(false); return; }
      // Helvetica Neue Bold avg char width ~0.62 × font size.
      const estCharW = 0.62;
      const MIN_FS   = 2;
      const estW     = safeText.length * baseFontSize * estCharW;
      const shrunk   = estW > maxW ? maxW / (safeText.length * estCharW) : baseFontSize;
      const fs       = Math.max(MIN_FS, Math.round(shrunk || baseFontSize));
      // At far distances, allow very small text to remain visible as
      // sign markings instead of making the sign look blank. If it still
      // cannot fit, clip conceptually by shrinking harder rather than
      // hiding the label.
      const widthAtFs = safeText.length * fs * estCharW;
      const finalFs = widthAtFs > maxW
        ? Math.max(1, Math.floor(maxW / Math.max(1, safeText.length * estCharW)))
        : fs;
      // Drift offset — 0 unless 100 % drunk.  Small per-text seed makes
      // each label wander independently so the sign looks chaotic.
      let dx = 0, dy = 0;
      if (drunkDrift > 0) {
        const seed = (used * 1.7 + safeText.length * 0.3);
        dx = Math.sin(tNow * 1.4 + seed) * baseFontSize * 0.9;
        dy = Math.cos(tNow * 1.1 + seed * 1.3) * baseFontSize * 0.7;
      }
      try {
        t.setText(safeText)
         .setStyle({ fontSize: `${finalFs}px`, color, fontFamily: '"Helvetica Neue", Arial, sans-serif', fontStyle: 'bold' })
         .setPosition(cx + dx, cy + dy)
         .setDepth(depth)
         .setVisible(true);
      } catch (_) {
        // Text in a bad internal state — hide and move on rather than
        // taking down the frame.
        t.setVisible?.(false);
      }
    };

    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    for (let n = 0; n <= 380 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected) continue;
        const t = sp.type;
        if (t !== 'rest_sign' && t !== 'exit_sign_green' && t !== 'amenities_sign'
         && t !== 'next_stops_sign' && t !== 'mileage_sign' && t !== 'grade_sign') continue;

        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj || proj.sw < 4) continue;

        // Convert vehicle-projection (sized for an 825-unit car body) to
        // sign size:  signW = baseW * proj.sw * 0.5 / 825.
        const signW = proj.sw * (sp.baseW / 825) * 0.5;
        const signH = proj.sw * (sp.baseH / 825) * 0.5;
        // Lowered from 36 → 16 so labels fade in much earlier on the
        // horizon (player can read the sign while it's still small).
        // Lower threshold so far-away signs still get text (they were
        // blank from a distance — sign frame drew but text was skipped).
        if (signW < 3) continue;

        const cx   = proj.sx;
        const topY = proj.sy - signH;
        // Same depth ramp as scenery sprites so signs sort correctly
        // against trees / buildings / cars at the same relZ.
        const depth = 9.9;

        if (t === 'rest_sign') {
          // White text directly on the green face — header + distance row.
          // Yellow flag (when present) gets black text since it sits on yellow.
          place('REST STOP', '#FFFFFF', cx, topY + signH * 0.18,
                signW * 0.20, signW * 1.06, depth);
          if (sp.sub === '5mi') {
            place('5 MI', '#FFFFFF', cx, topY + signH * 0.38,
                  signW * 0.24, signW * 0.90, depth);
          } else if (sp.sub === '1mi') {
            place('1 MI',     '#FFFFFF', cx, topY + signH * 0.38,
                  signW * 0.24, signW * 0.90, depth);
            place('NEXT EXIT','#000000', cx, topY - signH * 0.05,
                  signW * 0.18, signW * 0.58, depth);
          } else {
            place('EXIT', '#000000', cx, topY - signH * 0.05,
                  signW * 0.20, signW * 0.58, depth);
          }
        } else if (t === 'exit_sign_green') {
          const town  = String(sp.townName ?? '').toUpperCase();
          // exitLabel is the WSDOT-style sign label ("Exit 7B", "WA-262",
          // "US-195 S", "Airport Rd") — falls back to legacy exitNum/mileage.
          const exitLbl = String(sp.exitLabel ?? sp.exitNum ?? `EXIT ${sp.mileage ?? ''}`).toUpperCase();
          // Real-highway sign format: yellow REST STOP plaque on top, the
          // exit label + town below.  Highway-shield badge in the top-left
          // of the green face is overlaid as an Image by _renderSignDecals.
          place('REST STOP', '#000000', cx, topY - signH * 0.09,
                signW * 0.20, signW * 0.78, depth);
          // EXIT label is on the same row as the shield, so it stays
          // shifted right to clear the badge.
          place(exitLbl, '#FFFFFF', cx + signW * 0.12, topY + signH * 0.20,
                signW * 0.28, signW * 0.62, depth);
          // Town text — multi-word names get split into TWO LINES so
          // each line renders at full font size instead of being
          // auto-shrunk to fit one row (which made "MERCER ISLAND" /
          // "SNOQUALMIE PASS" / etc. unreadable).  Town text is
          // centered on the green face since the shield is in the
          // upper half — the bottom half is clear so we can use the
          // full sign width.
          const townWords = town.split(/\s+/).filter(Boolean);
          if (townWords.length >= 2) {
            const mid = Math.ceil(townWords.length / 2);
            const line1 = townWords.slice(0, mid).join(' ');
            const line2 = townWords.slice(mid).join(' ');
            // Multi-line town font dropped to ~22.4% (was 28%) per user
            // feedback — MERCER / ISLAND was just slightly too big at 28%.
            place(line1, '#FFFFFF', cx, topY + signH * 0.46,
                  signW * 0.224, signW * 1.16, depth);
            place(line2, '#FFFFFF', cx, topY + signH * 0.62,
                  signW * 0.224, signW * 1.16, depth);
          } else {
            place(town, '#FFFFFF', cx, topY + signH * 0.50,
                  signW * 0.30, signW * 1.16, depth);
          }
        } else if (t === 'amenities_sign') {
          // Sign face is a pre-baked PNG with the header text + brand
          // logos already burned in — _renderSignDecals draws the texture.
        } else if (t === 'next_stops_sign') {
          // Header + 3 rows of "<town>   <mi> MI" painted directly on the green face.
          place('NEXT EXITS', '#FFFFFF', cx, topY - signH * 0.06,
                signW * 0.16, signW * 0.78, depth);
          const rows = sp.rows ?? [];
          for (let r = 0; r < Math.min(3, rows.length); r++) {
            const row = rows[r];
            const town = String(row.name ?? '').toUpperCase();
            const mi   = String(row.mi ?? '');
            const yRow = topY + signH * (0.12 + r * 0.18);
            place(town, '#FFFFFF', cx - signW * 0.18, yRow,
                  signW * 0.16, signW * 0.62, depth);
            place(`${mi} MI`, '#FFFFFF', cx + signW * 0.32, yRow,
                  signW * 0.16, signW * 0.34, depth);
          }
        } else if (t === 'mileage_sign') {
          const town  = String(sp.townName ?? '').toUpperCase();
          const mileN = String(sp.mileage  ?? '');
          // Two rows kept INSIDE the green face.
          if (mileN) place(`MILE ${mileN}`, '#FFFFFF', cx, topY + signH * 0.16,
                signW * 0.18, signW * 0.78, depth);
          place(town, '#FFFFFF', cx, topY + signH * 0.38,
                signW * 0.20, signW * 0.82, depth);
        } else if (t === 'grade_sign') {
          // Two-line yellow warning — black text on the yellow face.
          const line1 = String(sp.line1 ?? '').toUpperCase();
          const line2 = String(sp.line2 ?? '').toUpperCase();
          if (line1) place(line1, '#000000', cx, topY + signH * 0.18,
                signW * 0.20, signW * 0.85, depth);
          if (line2) place(line2, '#000000', cx, topY + signH * 0.40,
                signW * 0.18, signW * 0.85, depth);
        }
      }
    }

    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
  }

  /** Overlay textured decals on top of the Graphics-drawn signs:
   *    • exit_sign_green → highway shield (top-left of green face)
   *    • amenities_sign  → up to 4 brand-logo placards on the blue face
   *  Lazy pool of Phaser Images, recycled per frame like _signTextPool. */
  _renderSignDecals() {
    const segs = this.road.segments;
    if (!segs?.length) return;

    if (!this._signDecalPool) {
      this._signDecalPool = [];
      for (let i = 0; i < 80; i++) {
        const img = this.add.image(0, 0, 'hwy_i90')
          .setOrigin(0.5)
          .setVisible(false);
        this._signDecalPool.push(img);
        this._worldObjects?.push(img);
        this._uiCam?.ignore?.(img);
      }
    }
    const pool = this._signDecalPool;
    let used = 0;

    const place = (texKey, cx, cy, w, h, depth) => {
      if (used >= pool.length) return;
      if (!texKey || !this.textures.exists(texKey)) return;
      const img = pool[used++];
      if (!img || !img.scene) return;
      if (img.texture.key !== texKey) img.setTexture(texKey);
      img.setPosition(cx, cy)
         .setDisplaySize(w, h)
         .setDepth(depth)
         .setVisible(true);
    };

    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    for (let n = 0; n <= 380 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected) continue;
        if (sp.type !== 'exit_sign_green' && sp.type !== 'amenities_sign') continue;

        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj || proj.sw < 4) continue;

        const signW = proj.sw * (sp.baseW / 825) * 0.5;
        const signH = proj.sw * (sp.baseH / 825) * 0.5;
        if (signW < 6) continue;       // skip when too small to read the badges

        const cx   = proj.sx;
        const topY = proj.sy - signH;
        const depth = 9.92;            // just above sign text (9.9)

        if (sp.type === 'exit_sign_green' && sp.hwyKey) {
          // Highway shield sits on the left edge of the green face,
          // vertically centered through the EXIT label row.  Sized
          // to ~24% of sign height (was 32%) so the I-90 / WA-26 / etc.
          // shields fit fully inside the green face instead of clipping
          // off the left edge.
          const badgeSize = signH * 0.24;
          const badgeX    = cx - signW * 0.50;
          const badgeY    = topY + signH * 0.28;
          place(sp.hwyKey, badgeX, badgeY, badgeSize, badgeSize, depth);
        } else if (sp.type === 'amenities_sign' && sp.signKey) {
          // Pre-baked "SHOPPING - NEXT RIGHT" PNG — preserve the source
          // 1277:840 ≈ 1.52:1 aspect ratio so the artwork isn't stretched.
          // Centered inside the white frame painted by Road.js's case
          // 'amenities_sign' (frame top = topY - signW*0.04, height
          // signW*0.87 → frame center is topY + signW*0.395).
          const pngW   = signW * 1.20;
          const pngH   = pngW / 1.52;          // preserve source aspect
          const pngCy  = topY + signW * 0.395; // center of white frame
          place(sp.signKey, cx, pngCy, pngW, pngH, depth);
        }
      }
    }

    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
  }

  _renderDrugSprites() {
    const pool = this._drugSpritePool;
    if (!pool?.length) return;
    const segs = this.road.segments;
    if (!segs?.length) return;
    const playerPos = this.player.position;
    const startSeg  = Math.floor(playerPos / SEG_LENGTH);
    const ghostPool = this._drugGhostPool;
    const dv = this.effects?.doubleVision ?? 0;
    const ghostOffset = dv > 0.01 ? Math.round(dv * 38) : 0;
    const ghostAlpha  = dv > 0.01 ? dv * 0.62 : 0;
    let used = 0;
    let ghostUsed = 0;
    // Reset halo gfx — repainted per-frame for ketamine + fentanyl pickups.
    this._drugHaloGfx?.clear();

    // Walk visible segments far→near. Render BOTH drug pickups and F12
    // weapon tokens through this pool — same depth, same sizing rules.
    const customMode = Difficulty.mode() === 'custom';
    for (let n = 380; n >= 0 && used < pool.length; n--) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (!sp.isCollectible || sp.collected) continue;
        if (sp.type === 'drug-pending') continue;
        // Custom mode — no drug pickups on the road (player chose
        // starting bar levels via slider, can adjust mid-run).  Weapons
        // still render so the player has tools.
        if (customMode && sp.collectibleType === 'drug') continue;
        // 4★+ drug pickup suppression — ~40% of drugs simply don't render
        // (they're "gone" — narcs swept the area).  Stable per-sprite roll.
        if (sp.collectibleType === 'drug'
            && this.cops.starDisplay >= 4
            && (sp.lootSeed ?? 1) < 0.40) continue;
        // Pick texture: drugs use drug_<type>, F12 tokens have texKey already.
        let texKey;
        if (sp.collectibleType === 'drug') {
          texKey = `drug_${sp.type}`;
        } else if (sp.collectibleType === 'f12') {
          // Hide weapon pickups when player is maxed (3-per-type cap).
          // Maps the route's 'f12_*' to the inventory's normalised name.
          const invType = { f12_gun: 'gun', f12_spike: 'spike_strip', f12_paint: 'paint_bomb', f12_rocket: 'rocket' }[sp.type];
          if (invType && !this.cops.canCarryMore(invType)) continue;
          texKey = sp.texKey;
        } else {
          continue;
        }
        if (!texKey || !this.textures.exists(texKey)) continue;
        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj || proj.sw < 4) continue;
        if (used >= pool.length) break;
        const s = pool[used++];
        if (s.texture.key !== texKey) s.setTexture(texKey);
        // Preserve each image's original aspect ratio. We size each so
        // the LARGEST dimension equals targetMax — so all pickups appear
        // at "roughly the same size" without distorting any of them.
        const tex = this.textures.get(texKey).source[0];
        const baseW = tex?.width  || 64;
        const baseH = tex?.height || 64;
        const targetMax = proj.sw * 0.6;
        let dispW, dispH;
        if (baseW >= baseH) { dispW = targetMax; dispH = targetMax * (baseH / baseW); }
        else                { dispH = targetMax; dispW = targetMax * (baseW / baseH); }
        // Unified depth scheme — pickups share the same z-banded depth as
        // buildings/cars, so a car between you and a drug pickup occludes it.
        // (Reuses relZ from above — was computed twice unnecessarily.)
        const depth = 9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5;
        s.setPosition(proj.sx, proj.sy - dispH * 0.4)
          .setDisplaySize(dispW, dispH)
          .setDepth(depth)
          .setAlpha(1)
          .setVisible(true);

        // Double-vision ghost copy.
        if (ghostOffset > 0 && ghostPool && ghostUsed < ghostPool.length) {
          const gs = ghostPool[ghostUsed++];
          if (gs.texture.key !== texKey) gs.setTexture(texKey);
          gs.setPosition(proj.sx + ghostOffset, proj.sy - dispH * 0.4)
            .setDisplaySize(dispW, dispH)
            .setDepth(depth - 0.01)
            .setAlpha(ghostAlpha)
            .setVisible(true);
        }
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
    if (ghostPool) {
      for (let i = ghostUsed; i < ghostPool.length; i++) ghostPool[i].setVisible(false);
    }
  }

  _renderExplosions() {
    const g = this.roadGfx;
    for (const exp of this.explosions) {
      const prog  = exp.timer / exp.maxTimer;  // 0→1
      const alpha = 1 - prog;
      // ── Gunshot star — small white burst with 4 short spokes. ─────
      if (exp.kind === 'star') {
        const s = exp.sw * (0.5 + prog * 0.4);
        g.fillStyle(0xFFFFFF, alpha * 0.95);
        // Cross
        g.fillTriangle(exp.sx - s * 0.6, exp.sy,         exp.sx, exp.sy - s * 0.25, exp.sx, exp.sy + s * 0.25);
        g.fillTriangle(exp.sx + s * 0.6, exp.sy,         exp.sx, exp.sy - s * 0.25, exp.sx, exp.sy + s * 0.25);
        g.fillTriangle(exp.sx, exp.sy - s * 0.6,         exp.sx - s * 0.25, exp.sy, exp.sx + s * 0.25, exp.sy);
        g.fillTriangle(exp.sx, exp.sy + s * 0.6,         exp.sx - s * 0.25, exp.sy, exp.sx + s * 0.25, exp.sy);
        // Centre highlight
        g.fillStyle(0xFFFFAA, alpha * 0.95);
        g.fillCircle(exp.sx, exp.sy, s * 0.18);
        continue;
      }
      // ── Wreck — actual car sprite spinning + smoke trail. ─────────
      if (exp.kind === 'wreck') {
        const w = exp.sw * 0.9;
        const h = w * 0.55;
        // Update the Phaser Image: position, rotation, fade.
        if (exp.img && exp.img.scene) {
          exp.img.setPosition(exp.sx, exp.sy);
          exp.img.setRotation(exp.rotation ?? 0);
          exp.img.setAlpha(alpha);
        }
        // Smoke trail — multiple puffs drifting up + back, growing
        // with progress.  Drawn into roadGfx so it sits BEHIND the
        // car image on screen (roadGfx depth 0 < image depth 9.6).
        const r = w * (0.30 + prog * 0.7);
        g.fillStyle(0x666666, alpha * 0.55);
        g.fillCircle(exp.sx,             exp.sy - h * 0.5 - prog * w * 0.3, r);
        g.fillStyle(0x888888, alpha * 0.45);
        g.fillCircle(exp.sx + r * 0.35,  exp.sy - h * 0.6 - prog * w * 0.5, r * 0.75);
        g.fillStyle(0xAAAAAA, alpha * 0.30);
        g.fillCircle(exp.sx - r * 0.30,  exp.sy - h * 0.7 - prog * w * 0.7, r * 0.55);
        continue;
      }
      // Smoke puffs: grey fluffy circle that drifts up and grows
      if (exp.smoke) {
        const r  = exp.sw * (0.4 + prog * 0.9);
        const yOff = -prog * exp.sw * 0.6;
        g.fillStyle(0x666666, alpha * 0.55);
        g.fillCircle(exp.sx, exp.sy + yOff, r * 1.05);
        g.fillStyle(0x888888, alpha * 0.4);
        g.fillCircle(exp.sx + r * 0.25, exp.sy + yOff - r * 0.2, r * 0.7);
        g.fillStyle(0xAAAAAA, alpha * 0.3);
        g.fillCircle(exp.sx - r * 0.2, exp.sy + yOff + r * 0.15, r * 0.55);
        continue;
      }
      const radius = prog * exp.sw * 2.2;
      g.fillStyle(0xFF8800, alpha * 0.85);
      g.fillCircle(exp.sx, exp.sy, radius * 1.5);
      g.fillStyle(0xFFFF44, alpha * 0.9);
      g.fillCircle(exp.sx, exp.sy, radius * 0.85);
      g.fillStyle(0xFFFFFF, alpha * 0.6);
      g.fillCircle(exp.sx, exp.sy, radius * 0.35);
      // Smoke ring
      g.fillStyle(0x444444, alpha * 0.3);
      g.fillCircle(exp.sx, exp.sy - radius * 0.4, radius * 0.9);
    }
  }

  _projectVehicle(relativeZ, laneOffset, playerX) {
    const scale = CAM_DEPTH / relativeZ;
    const worldX = laneOffset * ROAD_WIDTH - playerX * ROAD_WIDTH;
    const sx = Math.round(SCREEN_W / 2 + scale * worldX * SCREEN_W / 2);
    const sy = Math.round(SCREEN_H / 2 - scale * (-1000) * SCREEN_H / 2);
    // Vehicle width tied to a fixed car width (~1100 world units), NOT to the
    // road width — so widening the road for 4 lanes doesn't bloat the cars.
    const sw = Math.round(scale * 1100 * 0.42 * SCREEN_W / 2);
    return { sx, sy, sw };
  }

  // ─── HUD ──────────────────────────────────────────────────────────────
  _buildHUD() {
    const d = 20;

    // ── TOP-LEFT: Time → Cash → Distance (top-down stack) ──────────────
    // Whole left column shifted down a few pixels so it doesn't crowd
    // the screen edge.  Time sits above the dollar amount per user spec.
    this.hudPartyClock = this.add.text(10, 14, '⏱  --:--', {
      fontSize: '13px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(d);
    this.hudScore = this.add.text(10, 32, '$0', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#FFEE00', stroke: '#000000', strokeThickness: 5,
    }).setDepth(d);
    this.hudDist = this.add.text(10, 62, '0 MI', {
      fontSize: '13px', fontFamily: IMPACT,
      color: '#88DDFF', stroke: '#000000', strokeThickness: 3,
    }).setDepth(d);
    // Multiplier + active drug-combo badge — single inline line that
    // reads "SNOW-CONE  ×3.5" or just "×3.5" if no combos are firing.
    // Sits to the right of the time, same row.
    this.hudMult = this.add.text(120, 14, '', {
      fontSize: '18px', fontFamily: IMPACT,
      color: '#44FF88', stroke: '#000000', strokeThickness: 4,
    }).setDepth(d);

    // ── TOP-CENTER: Region + stars ─────────────────────────────────────
    // Region/location label — bottom-center, just above the bottom edge.
    this.hudRegion = this.add.text(SCREEN_W / 2, SCREEN_H - 8, 'WASHINGTON', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(d);
    // Wanted stars sit JUST ABOVE the location label so they share the
    // bottom-center status row.  Smaller font keeps both readable.
    this.hudStars = this.add.text(SCREEN_W / 2, SCREEN_H - 26, '', {
      fontSize: '13px', color: '#FFDD00', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(d);

    // Car HP readout — sits LEFT of the gun weapon icon (top-right
    // weapon column).  Starts green at 100, fades to red as it drops.
    this.hudHP = this.add.text(SCREEN_W - 78, 76, '100 HP', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#44FF44', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(d);

    // ── Gas gauge (below HP, right edge) ─────────────────────────────
    // Shows remaining range in miles + the ⛽ icon.  Green > 30 mi,
    // amber 30→10, red ≤ 10 with a slow blink.  Updated each frame in
    // _renderHUD via this.hudGas.setText / setColor.
    this.hudGas = this.add.text(SCREEN_W - 78, 96, '⛽ --- mi', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#44FF44', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(d);

    // ── TOP-RIGHT: Speed (big) + radio ─────────────────────────────────
    // Speed colour matches the run's difficulty so the readout itself
    // signals which mode you're in:
    //   Easy   → green (Daisy Dukes drive)
    //   Normal → amber (default)
    //   Hard   → red (heavier heat)
    //   Custom → cyan (no-score sandbox)
    const speedTones = {
      easy:   { main: '#44FF88', sub: '#88FFAA' },
      normal: { main: '#FF6600', sub: '#FF9944' },
      hard:   { main: '#FF2244', sub: '#FF6688' },
      custom: { main: '#44CCFF', sub: '#88DDFF' },
    };
    const tones = speedTones[Difficulty.mode()] ?? speedTones.normal;
    this.hudSpeed = this.add.text(SCREEN_W - 10, 4, '0', {
      fontSize: '34px', fontFamily: IMPACT,
      color: tones.main, stroke: '#000000', strokeThickness: 6,
    }).setOrigin(1, 0).setDepth(d);
    const _mphSub = this.add.text(SCREEN_W - 10, 42, 'MPH', {
      fontSize: '11px', fontFamily: IMPACT,
      color: tones.sub, stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(d);
    this._hudObjects?.push(_mphSub);

    // ── Party clock (top-center, below the radio name) ──────────────
    // Counts down from Difficulty.partyClockSec().  Color shifts:
    //   > 10 min remaining → white
    //   5–10 min           → yellow
    //   < 5 min            → red + pulse
    // (hudPartyClock moved earlier in the build, above hudScore — see
    // the TOP-LEFT block.)
    this._hudObjects?.push(this.hudPartyClock);

    // Mute button — same size as pause (32 px), immediately LEFT of it.
    // Music HUD cluster pushed RIGHT toward the speedometer (which sits at
    // SCREEN_W-10, ~50 px wide).  Pause/mute/note all 4 px apart in a tight
    // group so they read as one control bar adjacent to the speed cluster.
    const muteSize  = 44;
    const muteRight = SCREEN_W - 123;
    const muteTop   = 8;
    this.hudMuteBtn = this.add.rectangle(muteRight, muteTop, muteSize, muteSize, 0x000000, 0.55)
      .setOrigin(1, 0).setDepth(d + 3).setStrokeStyle(2, 0xFFFFFF)
      .setInteractive({ useHandCursor: true });
    this.hudMuteLbl = this.add.text(muteRight - muteSize / 2, muteTop + muteSize / 2, '🔊', {
      fontSize: '28px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 4);
    this.hudMuteBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.toggleMute?.();
      this.hudMuteLbl.setText(this.audio?.muted ? '🔇' : '🔊');
    });
    this._hudObjects?.push(this.hudMuteBtn, this.hudMuteLbl);

    // Music-note button (cycle station) — same size as mute, immediately
    // LEFT of mute.  Tapping cycles to the next station.
    const noteRight = muteRight - muteSize - 4;
    this.hudNoteBtn = this.add.rectangle(noteRight, muteTop, muteSize, muteSize, 0x000000, 0.55)
      .setOrigin(1, 0).setDepth(d + 3).setStrokeStyle(2, 0xFFFFFF)
      .setInteractive({ useHandCursor: true });
    this.hudNoteLbl = this.add.text(noteRight - muteSize / 2, muteTop + muteSize / 2, '🎵', {
      fontSize: '28px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 4);
    this.hudNoteBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.nextStation?.();
    });
    this._hudObjects?.push(this.hudNoteBtn, this.hudNoteLbl);

    // Skip-track button — same size, immediately LEFT of the note button.
    // Tapping skips to the next song on real-track stations (Country,
    // EDM, Hip-Hop, Heavy Metal, Polka, Reggae, Mariachi, Pop, MK64).
    // No-op on procedural-only stations.
    const skipRight = noteRight - muteSize - 4;
    this.hudSkipBtn = this.add.rectangle(skipRight, muteTop, muteSize, muteSize, 0x000000, 0.55)
      .setOrigin(1, 0).setDepth(d + 3).setStrokeStyle(2, 0xFFFFFF)
      .setInteractive({ useHandCursor: true });
    this.hudSkipLbl = this.add.text(skipRight - muteSize / 2, muteTop + muteSize / 2, '⏭', {
      fontSize: '28px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 4);
    this.hudSkipBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.skipTrack?.();
    });
    this._hudObjects?.push(this.hudSkipBtn, this.hudSkipLbl);

    // Wiper button — same size as the cluster, immediately LEFT of skip.
    // Hidden by default; only visible while it's raining.  Tapping it
    // sets `_wiperUntil = gameTime + 4`, suppressing windshield droplets
    // for 4 seconds (the wiper-sweep window).
    const wiperRight = skipRight - muteSize - 4;
    this.hudWiperBtn = this.add.rectangle(wiperRight, muteTop, muteSize, muteSize, 0x000000, 0.55)
      .setOrigin(1, 0).setDepth(d + 3).setStrokeStyle(2, 0xFFFFFF)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.hudWiperLbl = this.add.text(wiperRight - muteSize / 2, muteTop + muteSize / 2, '🌧', {
      fontSize: '24px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 4).setVisible(false);
    this.hudWiperBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._wiperUntil = (this.gameTime ?? 0) + 4;
    });
    this._hudObjects?.push(this.hudWiperBtn, this.hudWiperLbl);

    // Custom-mode drug-slider button removed — drug levels are now set
    // by clicking/dragging the actual HUD drug bars directly when in
    // custom mode (see drag handler registered in create()).

    // ── Rear-view mirror ───────────────────────────────────────────
    // Sits where the top-center HUD text is.  hudMirrorBg paints just
    // the frame border (static).  hudMirrorGlass paints the SCENE
    // INTERIOR (sky / ground / horizon / perspective lines) every frame
    // using the live world palette + TimeOfDay tint, so the mirror's
    // colours match what the player is driving through (instead of a
    // hardcoded dark-blue + dark-grey backdrop).
    {
      const mw = 260, mh = 56;
      const mx = SCREEN_W / 2 - mw / 2;
      const my = 2;
      const f = this.add.graphics().setDepth(d - 5);
      // Frame body — outer black housing + light grey trim only.
      f.fillStyle(0x1A1A1A, 0.95);
      f.fillRoundedRect(mx, my, mw, mh, 9);
      f.lineStyle(2, 0x666666, 1);
      f.strokeRoundedRect(mx + 0.5, my + 0.5, mw - 1, mh - 1, 9);
      const glassX = mx + 4, glassY = my + 4;
      const glassW = mw - 8, glassH = mh - 8;
      const horizonY = glassY + glassH * 0.42;
      const roadCx     = glassX + glassW / 2;
      const roadBotY   = glassY + glassH - 2;
      const roadHalfW  = glassW * 0.40;
      this.hudMirrorBg    = f;
      this.hudMirrorGlass = this.add.graphics().setDepth(d - 4);
      this._mirrorBounds  = {
        x: mx, y: my, w: mw, h: mh,
        glassX, glassY, glassW, glassH, horizonY,
        roadCx, roadBotY, roadHalfW,
      };
      this._hudObjects?.push(this.hudMirrorBg, this.hudMirrorGlass);

      // Geometry mask — clips both the sprite pool AND the painted
      // road / sky / ground so nothing escapes the mirror frame even
      // when parallax pushes the road sideways or the player is at the
      // edge of a lane.
      const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
      maskShape.fillStyle(0xFFFFFF, 1);
      maskShape.fillRect(glassX, glassY, glassW, glassH);
      this._mirrorMask = maskShape.createGeometryMask();
      this._mirrorMaskShape = maskShape;
      this.hudMirrorGlass.setMask(this._mirrorMask);
      this._hudObjects?.push(maskShape);

      // Pool of mirror car sprites — same textures as the world's cars,
      // using the FRONT-view variant since looking back you see the
      // grille of the car you've passed (or the cop chasing you).
      this._mirrorCarPool = [];
      for (let i = 0; i < 14; i++) {
        const s = this.add.image(0, 0, 'car_front_white')
          .setOrigin(0.5, 1)
          .setDepth(d - 3.5)
          .setVisible(false)
          .setMask(this._mirrorMask);
        this._mirrorCarPool.push(s);
        this._hudObjects?.push(s);
      }
      // Pool of mirror building sprites — buildings the player has
      // already driven past, painted as small images to either side of
      // the mirror road.
      this._mirrorBuildingPool = [];
      for (let i = 0; i < 8; i++) {
        const s = this.add.image(0, 0, 'building_1')
          .setOrigin(0.5, 1)
          .setDepth(d - 3.6)        // beneath cars in z-order
          .setVisible(false)
          .setMask(this._mirrorMask);
        this._mirrorBuildingPool.push(s);
        this._hudObjects?.push(s);
      }
    }

    // Radio station name — sits just below the next-track + music-genre
    // (note) buttons.  Centred under that pair so the label visually
    // belongs to the controls that change it.  noteRight = SCREEN_W-171,
    // skipRight = SCREEN_W-219; midpoint of the two button columns is
    // ≈ SCREEN_W-217.  Tapping still cycles stations.
    this.hudRadio = this.add.text(SCREEN_W - 217, 56, 'CLASSIC ROCK', {
      fontSize: '13px', fontFamily: IMPACT,
      color: '#5DD4FF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(d).setInteractive({ useHandCursor: true });
    this.hudRadio.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.nextStation?.();
    });

    // ── (FIRE-banner + F12-hint removed per player request — they were
    //    blocking the bottom-right corner so the GAS pedal couldn't sit
    //    symmetric with BRAKE.  Weapon icons themselves are still
    //    individually tap-to-fire; weapon-cycle still works via Q on
    //    keyboard.)  Stub hudWeaponSel so existing render code is a no-op.
    this.hudF12hint   = null;
    this.hudWeaponSel = null;

    // ── CENTER: Popup ───────────────────────────────────────────────────
    // Sits just below the rear-view mirror (mirror frame covers y=2..58)
    // so achievement / combo toasts don't compete with the rear-view
    // sprites for visual space.
    this.hudPopup = this.add.text(SCREEN_W / 2, 62, '', {
      fontSize: '18px', fontFamily: IMPACT,
      color: '#FFFF00', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5, 0).setDepth(d + 5);

    // ── Phone-only GAS + BRAKE pedals — TOGGLE buttons (tap once to turn
    //    on, tap again to turn off).  Mutually exclusive.  Spread close
    //    to the corners but kept inboard of the right-side weapons stack
    //    + FIRE banner so they don't cover anything.
    const PEDAL_W = 70, PEDAL_H = 50, PEDAL_Y = SCREEN_H - 8;
    const BRAKE_X = 70;                       // close to left corner
    // FIRE banner gone, so GAS can sit at the mirrored x position.
    const GAS_X   = SCREEN_W - 70;

    const refreshGas   = () => this._gasBtn?.setFillStyle?.(this._touchBoost ? 0x55DD55 : 0x22AA22, this._touchBoost ? 0.95 : 0.55);
    const refreshBrake = () => this._brakeBtn?.setFillStyle?.(this._touchBrake ? 0xEE3333 : 0xCC2222, this._touchBrake ? 0.95 : 0.55);
    this._refreshPedals = () => { refreshGas(); refreshBrake(); };

    const gasBtn = this.add.rectangle(
      GAS_X, PEDAL_Y, PEDAL_W, PEDAL_H, 0x22AA22, 0.55,
    ).setOrigin(0.5, 1).setDepth(d + 1).setStrokeStyle(2, 0xAAFFAA);
    this._gasBtn = gasBtn;
    const gasLbl = this.add.text(GAS_X, PEDAL_Y - PEDAL_H / 2,
      'ACCEL\n▲', {
        fontSize: '12px', fontFamily: IMPACT,
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5).setDepth(d + 2);
    this._gasLbl = gasLbl;
    gasBtn.setInteractive({ useHandCursor: true });
    gasBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._touchBoost = !this._touchBoost;
      if (this._touchBoost) this._touchBrake = false;
      this._refreshPedals();
    });

    const brakeBtn = this.add.rectangle(
      BRAKE_X, PEDAL_Y, PEDAL_W, PEDAL_H, 0xCC2222, 0.55,
    ).setOrigin(0.5, 1).setDepth(d + 1).setStrokeStyle(2, 0xFFAAAA);
    this._brakeBtn = brakeBtn;
    const brakeLbl = this.add.text(BRAKE_X, PEDAL_Y - PEDAL_H / 2,
      'BRAKE\n▼', {
        fontSize: '13px', fontFamily: IMPACT,
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5).setDepth(d + 2);
    this._brakeLbl = brakeLbl;
    brakeBtn.setInteractive({ useHandCursor: true });
    brakeBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._touchBrake = !this._touchBrake;
      if (this._touchBrake) this._touchBoost = false;
      this._refreshPedals();
    });

    this._hudObjects?.push(gasBtn, gasLbl, brakeBtn, brakeLbl);

    // ── Pause button — upper-right area, but moved LEFT of the speed
    //    cluster so it never overlaps the MPH readout.  Tappable on
    //    phones, also still triggered by SPACE.
    // Pause sits 4 px to the right of mute → tight cluster: Note 🎵 | Mute 🔊 | Pause ⏸
    // Right edge at SCREEN_W-75 leaves ~65 px to the speedometer.
    const pauseSize = 44;
    const pauseRight = SCREEN_W - 75;
    const pauseTop   = 8;
    const pauseBtn  = this.add.rectangle(pauseRight, pauseTop, pauseSize, pauseSize, 0x000000, 0.55)
      .setOrigin(1, 0).setDepth(d + 3).setStrokeStyle(2, 0xFFFFFF)
      .setInteractive({ useHandCursor: true });
    const pauseLbl  = this.add.text(pauseRight - pauseSize / 2, pauseTop + pauseSize / 2, '⏸', {
      fontSize: '28px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 4);
    pauseBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._togglePause();
    });
    this._hudObjects?.push(pauseBtn, pauseLbl);

    // ── REAR-COP indicator (cop behind the player; visible only when active)
    this.hudRearCop = this.add.text(SCREEN_W / 2, SCREEN_H - 32, '', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#FF3333', stroke: '#000000', strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(d).setVisible(false);

    // ── 5★ helicopter overlay — ASCII chopper that hovers high above the
    // road centre and pulses red+blue rotor flash.  Decorative only —
    // signals "you're at maximum heat" without adding extra collision logic.
    this.hudHelicopter = this.add.text(SCREEN_W / 2, 96, '', {
      fontSize: '34px', fontFamily: 'Courier New, monospace',
      color: '#222222', stroke: '#FF3333', strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(d - 2).setVisible(false);

    // (Yellow "TAKE EXIT → REST STOP" prompt removed — too many rest
    //  stops on the route for that visual to be useful, and the in-world
    //  exit signage already tells the player when one's coming up.
    //  Swerve right to take any exit.)

// Title overlay (created here so HUD-camera tracking grabs it). Shown
    // before the first tap; hidden once gameplay begins.
    // (Grey title scrim removed per player request — letters/text now
    // sit directly on the road background.)
    this._titleScrim = this.add.graphics().setDepth(d + 8);    // empty, kept for legacy refs

    // ── Title letters as PNG images (D / U / I) ───────────────────────
    // Each letter is its own image so we can sway / fade / wobble them
    // independently for a drunk-vision intro effect.  Falls back to a
    // single text node if any of the textures is missing.
    const haveLetters =
      this.textures.exists('ui_title_d') &&
      this.textures.exists('ui_title_u') &&
      this.textures.exists('ui_title_i');

    if (haveLetters) {
      const titleY     = SCREEN_H * 0.32;
      const letterH    = 110;                          // tall — dominates the title
      const spacing    = 4;                            // letters tight together

      // Pre-compute each letter's display width keeping aspect ratio.
      const letters    = [];
      const sources    = ['ui_title_d', 'ui_title_u', 'ui_title_i'];
      let totalW = 0;
      for (const key of sources) {
        const tex   = this.textures.get(key)?.source?.[0];
        const baseW = tex?.width  || 100;
        const baseH = tex?.height || 100;
        const fit   = letterH / baseH;
        const dw    = baseW * fit;
        letters.push({ key, dw, dh: letterH });
        totalW += dw;
      }
      totalW += spacing * (letters.length - 1);
      let xCursor = SCREEN_W / 2 - totalW / 2;

      this._titleLetters = letters.map((L, i) => {
        const cx = xCursor + L.dw / 2;
        xCursor += L.dw + spacing;
        const img = this.add.image(cx, titleY, L.key)
          .setOrigin(0.5)
          .setDepth(d + 10)
          .setDisplaySize(L.dw, L.dh);
        // Drunk sway — each letter rocks at a slightly different
        // frequency so they don't look like a rigid sign.  Y-bob too.
        const swayDur = 1700 + i * 230;
        this.tweens.add({
          targets: img,
          angle:   { from: -7 - i * 1.5, to: 7 + i * 1.5 },
          duration: swayDur,
          yoyo:    true,
          repeat:  -1,
          ease:    'Sine.InOut',
        });
        this.tweens.add({
          targets: img,
          y:       { from: titleY - 6, to: titleY + 6 },
          duration: 1300 + i * 320,
          yoyo:    true,
          repeat:  -1,
          ease:    'Sine.InOut',
        });
        // Fade in/out — slightly out of sync per letter for the woozy
        // "is this real?" intoxicated effect.
        this.tweens.add({
          targets: img,
          alpha:   { from: 0.55, to: 1.0 },
          duration: 1100 + i * 410,
          yoyo:    true,
          repeat:  -1,
          ease:    'Sine.InOut',
        });
        return img;
      });
      // Stub text node so legacy code that toggles _titleMain.setVisible()
      // still has something to call on (no-op).
      this._titleMain = this.add.text(SCREEN_W / 2, titleY, '', { fontSize: '1px' })
        .setOrigin(0.5).setDepth(d + 10).setVisible(false);
    } else {
      this._titleMain = this.add.text(SCREEN_W / 2, SCREEN_H * 0.32, 'D U I', {
        fontSize: '78px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
        color: '#FF4400', stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(d + 10);
    }

    // (Plot blurb intentionally absent — the previous "Hottie" version is
    //  retired, replaced by a court-date angle to be authored separately.)
    this._titleSub = null;

    this._titleRoute = this.add.text(SCREEN_W / 2, SCREEN_H * 0.55, 'Seattle  →  Pullman', {
      fontSize: '17px', fontFamily: 'Arial, sans-serif', align: 'center',
      color: '#88CCFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 10);

    // Bottom-row buttons: [RESUME] [EASY] [NORMAL] [HARD] all sharing the
    // same chip styling.  Tapping a difficulty selects + starts the run
    // in one motion; Resume opens the code-entry prompt.  Currently-active
    // difficulty is highlighted.
    const save = this.registry.get('save');
    const last = save?.get?.('lastRestStop');
    const modes = Difficulty.allModes();
    const current = Difficulty.mode();

    // Five chips in a row: [RESUME] [EASY] [NORMAL] [HARD] [CUSTOM].
    // Narrower than before so the chips don't span ~95% of the screen
    // width — leaves visible road on either side of the row, and the
    // blurb text wraps inside each chip via its existing wordWrap.
    const btnW   = 118;
    const btnH   = 72;     // taller to give a 2-3-line blurb room
    const gap    = 6;
    const cols   = 2 + modes.length;          // Resume + Easy + Normal + Hard + Custom
    const totalW = cols * btnW + (cols - 1) * gap;
    const startX = (SCREEN_W - totalW) / 2;
    // Lifted slightly so the taller (72-px) chips keep an 18-px bottom
    // margin instead of crowding the screen edge.
    const btnY   = SCREEN_H - 90;
    this._titleDifficultyBtns = [];

    // Helper: rounded-rect button with hover + tap.  Returns the graphics
    // object so the caller can register it with the title-fade list.
    // Corner radius defaults to ~10% of button height (subtle rounding).
    const makeRoundedBtn = (cx, cy, w, h, fill, strokeColor, strokeW, baseAlpha, hoverFill, onTap, isActive) => {
      const r = Math.round(h * 0.20);     // ~20% rounding — clearly soft corners without looking pillish
      const g = this.add.graphics().setDepth(d + 10);
      const draw = (alpha = baseAlpha, fc = fill) => {
        g.clear();
        g.fillStyle(fc, alpha);
        g.fillRoundedRect(cx, cy, w, h, r);
        g.lineStyle(strokeW, strokeColor, 1);
        g.strokeRoundedRect(cx + 0.5, cy + 0.5, w - 1, h - 1, r);
      };
      draw();
      g.setInteractive(new Phaser.Geom.Rectangle(cx, cy, w, h), Phaser.Geom.Rectangle.Contains);
      g.input.cursor = 'pointer';
      g.on('pointerover', () => draw(1.0, hoverFill ?? fill));
      g.on('pointerout',  () => draw(baseAlpha, fill));
      g.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        onTap?.();
      });
      g._roundedBtnDraw = draw;            // expose for caller-driven repaints
      return g;
    };

    // Resume button — leftmost, grey/black so it doesn't read as a
    // difficulty.  Always shown; on first run with no saves, the prompt
    // opens blank for entering a code.
    {
      const cx = startX;
      const bg = makeRoundedBtn(
        cx, btnY, btnW, btnH,
        0x222222, 0xAAAAAA, 2, 1.0, 0x333333,
        () => this._promptForCode(last?.code ?? ''),
      );
      const lbl = this.add.text(cx + btnW / 2, btnY + 14, 'RESUME', {
        fontSize: '18px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(d + 11);
      const sub = this.add.text(cx + btnW / 2, btnY + 36, 'Enter save code', {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#CCCCCC',
        wordWrap: { width: btnW - 8 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(d + 11);
      this._titleResume    = bg;
      this._titleResumeTxt = lbl;
      this._titleDifficultyBtns.push(bg, lbl, sub);
    }

    // Difficulty buttons — Easy / Normal / Hard.
    modes.forEach((m, i) => {
      const cx = startX + (i + 1) * (btnW + gap);
      const isActive = m.id === current;
      const fill   = m.id === 'easy'   ? 0x227755
                   : m.id === 'normal' ? 0x886622
                   :                     0x882222;
      const baseAlpha = isActive ? 1.0 : 0.65;
      const strokeW   = isActive ? 4 : 2;
      const bg = makeRoundedBtn(
        cx, btnY, btnW, btnH,
        fill, 0xFFFFFF, strokeW, baseAlpha, fill,
        () => {
          Difficulty.set(m.id, this.registry);
          this._startGameplay();
        },
        isActive,
      );
      // Re-bind hover so the active highlight returns to baseAlpha (1.0)
      // for the active mode and 0.65 for the inactive ones.
      bg.removeAllListeners('pointerout');
      bg.on('pointerout', () => {
        const live = m.id === Difficulty.mode();
        bg._roundedBtnDraw?.(live ? 1.0 : 0.65, fill);
      });
      const lbl = this.add.text(cx + btnW / 2, btnY + 14, m.label, {
        fontSize: '18px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(d + 11);
      const sub = this.add.text(cx + btnW / 2, btnY + 36, m.blurb, {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#FFEEAA',
        wordWrap: { width: btnW - 8 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(d + 11);
      this._titleDifficultyBtns.push(bg, lbl, sub);
    });

    // CUSTOM button — peer of the difficulty buttons, on the far end of
    // the row from RESUME.  Cyan fill so it visually distinguishes from
    // the green/amber/red difficulty chips.
    {
      const isActiveC = current === 'custom';
      const cx = startX + (1 + modes.length) * (btnW + gap);
      const fillC = 0x227699;
      const baseAlphaC = isActiveC ? 1.0 : 0.65;
      const strokeWC   = isActiveC ? 4 : 2;
      const cBg = makeRoundedBtn(
        cx, btnY, btnW, btnH,
        fillC, 0xFFFFFF, strokeWC, baseAlphaC, fillC,
        () => {
          this._buildDrugSliderModal({
            mode: 'custom',
            onConfirm: ({ drugLevels, noNpcDamage, noPolice }) => {
              Difficulty.set('custom', this.registry);
              this._customStartLevels = drugLevels;
              this._customFlags = { noNpcDamage: !!noNpcDamage, noPolice: !!noPolice };
              this._startGameplay();
            },
          });
        },
        isActiveC,
      );
      cBg.removeAllListeners('pointerout');
      cBg.on('pointerout', () => {
        const live = Difficulty.mode() === 'custom';
        cBg._roundedBtnDraw?.(live ? 1.0 : 0.65, fillC);
      });
      const cLbl = this.add.text(cx + btnW / 2, btnY + 14, 'CUSTOM', {
        fontSize: '18px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(d + 11);
      const cSub = this.add.text(cx + btnW / 2, btnY + 36,
        'Drag bars; no points awarded', {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#FFEEAA',
        wordWrap: { width: btnW - 8 }, align: 'center',
      }).setOrigin(0.5, 0).setDepth(d + 11);
      this._titleDifficultyBtns.push(cBg, cLbl, cSub);
    }

    // Stub _titleTap so the existing fade-out / hud-list code that
    // references it doesn't choke on undefined.
    this._titleTap = this.add.text(SCREEN_W / 2, btnY, '', {
      fontSize: '1px',
    }).setOrigin(0.5).setDepth(d + 10).setVisible(false);

    // 🏆 Achievements button — top-right corner, opens the page modal.
    {
      const aSize = 40;
      const aX = SCREEN_W - 12 - aSize;
      const aY = 12;
      const aBg = this.add.graphics().setDepth(d + 10);
      const drawA = (alpha = 1) => {
        aBg.clear();
        aBg.fillStyle(0x222222, alpha);
        aBg.fillRoundedRect(aX, aY, aSize, aSize, 8);
        aBg.lineStyle(2, 0xFFD700, 1);
        aBg.strokeRoundedRect(aX + 0.5, aY + 0.5, aSize - 1, aSize - 1, 8);
      };
      drawA();
      aBg.setInteractive(new Phaser.Geom.Rectangle(aX, aY, aSize, aSize), Phaser.Geom.Rectangle.Contains);
      aBg.input.cursor = 'pointer';
      const aLbl = this.add.text(aX + aSize / 2, aY + aSize / 2, '🏆', {
        fontSize: '22px',
      }).setOrigin(0.5).setDepth(d + 11);
      aBg.on('pointerover', () => drawA(1));
      aBg.on('pointerout',  () => drawA(0.85));
      drawA(0.85);
      aBg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        this._buildAchievementsModal();
      });
      this._titleDifficultyBtns.push(aBg, aLbl);
    }

    // 🚗 Garage button — sits LEFT of the trophy.  Opens the vehicle
    // picker so the player can swap between owned cars before starting
    // a new run.  Only meaningful when more than one car is owned.
    {
      const gSize = 40;
      const gX = SCREEN_W - 12 - 40 - 8 - gSize;
      const gY = 12;
      const gBg = this.add.graphics().setDepth(d + 10);
      const drawG = (alpha = 1) => {
        gBg.clear();
        gBg.fillStyle(0x222222, alpha);
        gBg.fillRoundedRect(gX, gY, gSize, gSize, 8);
        gBg.lineStyle(2, 0x66CCFF, 1);
        gBg.strokeRoundedRect(gX + 0.5, gY + 0.5, gSize - 1, gSize - 1, 8);
      };
      drawG();
      gBg.setInteractive(new Phaser.Geom.Rectangle(gX, gY, gSize, gSize), Phaser.Geom.Rectangle.Contains);
      gBg.input.cursor = 'pointer';
      const gLbl = this.add.text(gX + gSize / 2, gY + gSize / 2, '🚗', {
        fontSize: '22px',
      }).setOrigin(0.5).setDepth(d + 11);
      gBg.on('pointerover', () => drawG(1));
      gBg.on('pointerout',  () => drawG(0.85));
      drawG(0.85);
      gBg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        this._buildGarageModal();
      });
      this._titleDifficultyBtns.push(gBg, gLbl);
    }

    // 🗺 Map button — sits LEFT of the garage button.  Pops the route map
    // modal centered on screen (rest-stop ticks + your current mile +
    // the actual road shape integrated from routeGeo curves).
    {
      const mSize = 40;
      const mX = SCREEN_W - 12 - 40 - 8 - 40 - 8 - mSize;
      const mY = 12;
      const mBg = this.add.graphics().setDepth(d + 10);
      const drawM = (alpha = 1) => {
        mBg.clear();
        mBg.fillStyle(0x222222, alpha);
        mBg.fillRoundedRect(mX, mY, mSize, mSize, 8);
        mBg.lineStyle(2, 0x66CCFF, 1);
        mBg.strokeRoundedRect(mX + 0.5, mY + 0.5, mSize - 1, mSize - 1, 8);
      };
      drawM();
      mBg.setInteractive(new Phaser.Geom.Rectangle(mX, mY, mSize, mSize), Phaser.Geom.Rectangle.Contains);
      mBg.input.cursor = 'pointer';
      const mLbl = this.add.text(mX + mSize / 2, mY + mSize / 2, '🗺', {
        fontSize: '22px',
      }).setOrigin(0.5).setDepth(d + 11);
      mBg.on('pointerover', () => drawM(1));
      mBg.on('pointerout',  () => drawM(0.85));
      drawM(0.85);
      mBg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        this._buildMapModal();
      });
      this._titleDifficultyBtns.push(mBg, mLbl);
    }

    // Legacy enter-code button removed.
    this._titleEnterCode    = null;
    this._titleEnterCodeTxt = null;

    if (!this._awaitingStart) {
      // Mission entry — hide title immediately.
      this._setTitleVisible(false);
    }

    // Track every text-rich HUD element so the UI camera can render only these,
    // and the main camera can ignore them (so shake/sway never moves the HUD).
    if (this._hudObjects) {
      // Filter undefineds — `_titleResume` only exists if a save snapshot
      // was found, so pushing it raw would leave a hole that Phaser's
      // camera.ignore() chokes on with "Cannot read properties of undefined
      // (reading 'isParent')".
      this._hudObjects.push(
        ...[
          this.hudScore, this.hudMult, this.hudDist, this.hudRegion, this.hudStars, this.hudHP, this.hudGas,
          this.hudSpeed, this.hudRadio, this.hudPopup,
          this.hudRearCop, this.hudRestStop, this.hudHelicopter,
          this._titleScrim, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
          this._titleResume,    this._titleResumeTxt,
          this._titleEnterCode, this._titleEnterCodeTxt,
          ...(this._titleDifficultyBtns ?? []),
          ...(this._titleLetters ?? []),
        ].filter(Boolean),
      );
      // The unnamed "MPH" + "R=next M=mute" sublabels are the only un-tracked
      // children. Walk the display list and grab them by detecting siblings
      // at the right edge that aren't already tracked. Cheaper: capture
      // them via setName at creation time below.
    }
  }

  /** Out-of-gas → AAA tow.  Charges 50% of player's cash + delivers
   *  to the PREVIOUS rest stop (so they don't accidentally finish the
   *  game on a freebie).  If player has $0, falls back to repo logic
   *  (loses non-Beater vehicle, free tow back in the Beater). */
  _runTow() {
    const cash    = this.score ?? 0;
    const aaaCost = Math.floor(cash * 0.50);
    const curMile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    // Previous rest stop = the last one whose mileage <= curMile.
    let prevStop = null;
    for (const rs of REST_STOPS) {
      if (rs.mileage <= curMile) prevStop = rs;
      else break;
    }
    if (cash > 0) {
      this.score -= aaaCost;
      this._showPopup?.(`🚚 AAA — $${aaaCost.toLocaleString()}`, '#FFCC44');
    } else if (this.player.vehicleId !== 'beater') {
      // No cash AND non-Beater → repo.
      this._showPopup?.(`💀 REPO'D — back to the Beater`, '#FF4444');
      const owned = (this.registry.get('ownedVehicles') ?? ['beater'])
        .filter(v => v !== this.player.vehicleId);
      if (!owned.includes('beater')) owned.unshift('beater');
      this.registry.set('ownedVehicles', owned);
      this.registry.set('vehicleId',     'beater');
      this.player.vehicleId = 'beater';
    } else {
      this._showPopup?.(`🚚 FREE TOW (broke + Beater)`, '#FFCC44');
    }
    const _veh = VEHICLES[this.player.vehicleId];
    this.player.gasMaxMi = _veh.rangeMi;
    this.player.gasMi    = _veh.rangeMi;
    if (prevStop) {
      this.player.position = prevStop.t * (ROUTE_SEGS * SEG_LENGTH);
    }
    this._strandedShown = false;
  }

  /** Black-screen ad placeholder for sleep / charging.  Pauses the game
   *  and overlays a full-screen black rect with white "AD" text for ms
   *  milliseconds, then resumes.  Real ad SDK wiring is a future job;
   *  for now this is a 5-second blocked input. */
  _showAdScreen(ms) {
    if (this._adActive) return;
    this._adActive = true;
    const wasPaused = this._paused;
    this._paused = true;
    this.audio?.setPaused?.(true);
    const overlay = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 1)
      .setOrigin(0).setDepth(1000);
    const text = this.add.text(SCREEN_W / 2, SCREEN_H / 2, 'AD', {
      fontSize: '64px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#222', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1001);
    if (this._hudObjects) {
      this._hudObjects.push(overlay, text);
      this.cameras.main?.ignore?.([overlay, text]);
    }
    this.time.delayedCall(ms, () => {
      overlay.destroy();
      text.destroy();
      this._paused = wasPaused;
      if (!wasPaused) this.audio?.setPaused?.(false);
      this._adActive = false;
    });
  }

  _renderHUD() {
    const p        = this.player;
    const progress = p.position / (ROUTE_SEGS * SEG_LENGTH);

    // ── HUD alpha modulation ─────────────────────────────────────
    // Fentanyl fades the readouts down ("screen shutting down"); meth +
    // LSD jitter the alpha each frame for the wired/glitchy feel.
    {
      const _phys  = this.effects?.getPhysics?.(this.drugs);
      const _fade  = _phys?.hudAlphaMul ?? 1;
      const _flick = _phys?.hudFlicker  ?? 0;
      const _alpha = Math.max(0, _fade * (_flick > 0 ? 1 - _flick * Math.random() : 1));
      if (this._hudObjects) {
        for (const obj of this._hudObjects) {
          if (obj && 'alpha' in obj) obj.alpha = _alpha;
        }
      }
    }

    // Top speed: 120 MPH base + 5 MPH per cocaine pickup (capped at OD)
    const mph      = Math.round(this._displayMPH());
    // Odometer: speed-derived at 4× time compression (120 mph → 120 mi/15 min)
    const miles    = Math.round(this._odometer);
    const palette  = getPaletteAtProgress(Math.min(progress, 0.999));

    this.hudScore.setText(`$${Math.round(this.score).toLocaleString()}`);

    // Car HP — green > 50, orange > 20, red ≤ 20.  Reads from the existing
    // DamageModel (max 100) so all takeDamage calls feed the same number.
    if (this.hudHP && this.damage) {
      const hp = Math.max(0, Math.round(this.damage.getDurability?.() ?? 100));
      const color = hp > 50 ? '#44FF44' : hp > 20 ? '#FFAA22' : '#FF2244';
      this.hudHP.setText(`${hp} HP`).setColor(color);
    }
    // Gas gauge — miles remaining.  Green > 30, amber 30→10, red ≤ 10
    // with a slow blink (sin gate) so the low-fuel state is unmistakable.
    // Also forces the warning state when an upcoming rest-stop exit is
    // ≤1 mi ahead (so the player notices their tank as a refuel option
    // approaches), per spec.
    if (this.hudGas) {
      const gas = Math.max(0, Math.round(this.player.gasMi ?? 0));
      const _curMi = this._odometer ?? 0;
      // Find next forward rest stop; warn when within 1 mi of its mileage.
      let nearExitWarn = false;
      for (const rs of REST_STOPS) {
        const dToExit = rs.mileage - _curMi;
        if (dToExit > 0 && dToExit <= 1) { nearExitWarn = true; break; }
      }
      let gColor;
      if (gas <= 0)                       gColor = '#888888';
      else if (gas <= 10)                 gColor = (Math.sin(this.gameTime * 6) > 0 ? '#FF2244' : '#660000');
      else if (gas <= GAS_LIGHT_AT_MI)    gColor = '#FFAA22';
      else if (nearExitWarn)              gColor = '#FFAA22';
      else                                gColor = '#44FF44';
      this.hudGas.setText(gas <= 0 ? '⛽ EMPTY' : `⛽ ${gas} mi`).setColor(gColor);
    }
    // Combo name (most recently activated only) + multiplier inline.
    // Format: "SNOW-CONE  ×3.5" or just "×3.5" when nothing's active.
    // Stacked combos like "CROSS-FADED + CALIFORNIA SOBER" get
    // collapsed to whichever one tripped most recently.
    const mult   = this._scoreMult();
    const combos = this.drugs.getActiveCombos?.() ?? [];
    // Connoisseur achievement — track every named combo that fires
    // during the run.  When the set covers DRUG_COMBOS in full, award.
    if (combos.length) {
      this._combosFiredThisRun = this._combosFiredThisRun ?? new Set();
      for (const c of combos) this._combosFiredThisRun.add(c.key);
      const total = Object.keys(DRUG_COMBOS).length;
      if (this._combosFiredThisRun.size >= total && !this._connoisseurFired) {
        this._connoisseurFired = true;
        AchievementSystem.award('connoisseur', this.registry);
      }
    }
    if (mult > 1 || combos.length) {
      const top      = combos[0];   // most recent (DrugSystem already sorts)
      const comboTxt = top ? `${top.label}  ` : '';
      const tierColor = mult >= 8 ? '#FF2244' : mult >= 5 ? '#FFAA22' : '#44FF88';
      this.hudMult
        .setText(`${comboTxt}×${mult.toFixed(1)}`)
        .setColor(top ? (top.color ?? '#FFCC44') : tierColor)
        .setVisible(true);
    } else {
      this.hudMult.setVisible(false);
    }
    this.hudDist.setText(`${miles.toLocaleString()} MI`);
    this.hudSpeed.setText(`${mph}`);
    // Re-apply the difficulty-tinted MPH color each frame.  _buildHUD's
    // initial color was being locked at scene-init time (before the
    // player tapped a difficulty button), so it stuck on the previous
    // mode's tone.  Resolved here against the current Difficulty.
    {
      const tones = {
        easy:   '#44FF88',
        normal: '#FF6600',
        hard:   '#FF2244',
        custom: '#44CCFF',
      };
      const c = tones[Difficulty.mode()] ?? tones.normal;
      if (this.hudSpeed && this.hudSpeed.style.color !== c) this.hudSpeed.setColor(c);
    }
    // Party clock readout — MM:SS, with color thresholds.  At 0 it shows
    // a ring-of-fire "TOO LATE" tag so the player knows the bonus is gone.
    if (this.hudPartyClock) {
      const sec   = Math.max(0, Math.floor(this._partyClockSec ?? 0));
      const mm    = Math.floor(sec / 60).toString().padStart(2, '0');
      const ss    = (sec % 60).toString().padStart(2, '0');
      const color = sec <= 0     ? '#FF2244'
                  : sec < 300    ? '#FF6644'      // < 5 min
                  : sec < 600    ? '#FFCC44'      // < 10 min
                  :                '#FFFFFF';
      this.hudPartyClock
        .setText(sec <= 0 ? '⏱  TOO LATE' : `⏱  ${mm}:${ss}`)
        .setColor(color);
    }
    // Bottom-center label uses the player's specific town/landmark from
    // the CHECKPOINTS table, falling back to the broad region palette
    // name only if no location range matches.
    this.hudRegion.setText(getLocationName(progress) || palette.name || '');

    const stars = this.cops.starDisplay;
    let starsText = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
    // Surface whichever per-type counter is closest to busting the player
    // — the user's about-to-die meter, not a generic total.
    const cs = this.cops;
    const tallies = [];
    if (cs.rearBumpCount > 0) tallies.push(`RAM ${cs.rearBumpCount}/5`);
    if (cs.headOnCount   > 0) tallies.push(`HEAD-ON ${cs.headOnCount}/3`);
    if (cs.pitCount      > 0) tallies.push(`PIT ${cs.pitCount}/1`);
    if (tallies.length) starsText += `  •  ${tallies.join('  ')}`;
    this.hudStars.setText(starsText);

    this.hudRadio.setText(`${this.audio.currentName}`);
    if (this.hudMuteLbl) {
      this.hudMuteLbl.setText(this.audio?.muted ? '🔇' : '🔊');
    }

    // ── Rear-view mirror — populate sprite pools with rear scene ──
    if (this.hudMirrorGlass && this._mirrorBounds && this._mirrorCarPool) {
      const mb = this._mirrorBounds;
      const carPool      = this._mirrorCarPool;
      const buildingPool = this._mirrorBuildingPool;
      // Reset all pool slots to invisible — anything we don't reuse
      // this frame stays hidden.
      for (const s of carPool)      s.setVisible(false);
      for (const s of buildingPool) s.setVisible(false);

      // ── Repaint mirror interior with live world colours ─────────
      const mg = this.hudMirrorGlass;
      mg.clear();
      // Detect what's BEHIND the player so the mirror can paint the
      // correct backdrop — open road shows sky + grass, tunnel shows
      // concrete, water bridge shows water tile.
      const segsForState = this.road?.segments;
      const playerSegIdx = segsForState?.length
        ? (Math.floor(p.position / SEG_LENGTH) % segsForState.length + segsForState.length) % segsForState.length
        : 0;
      const playerSeg = segsForState?.[playerSegIdx];
      const inTunnel  = !!playerSeg?.tunnel;
      const onWater   = !!playerSeg?.water || !!playerSeg?.bridge;

      const _mileMirror = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const duskT  = TimeOfDay.duskAmount(_mileMirror);
      const nightT = TimeOfDay.nightAmount(_mileMirror);
      const DUSK_TOP  = 0xC56B3D, DUSK_FOG = 0xE8A06E;
      const NIGHT_TOP = 0x06080F, NIGHT_FOG = 0x0E1424;
      const skyTop = lerpColor(lerpColor(palette.sky, DUSK_TOP, duskT), NIGHT_TOP, nightT);
      const skyFog = lerpColor(lerpColor(palette.fog, DUSK_FOG, duskT), NIGHT_FOG, nightT);

      if (inTunnel) {
        // TUNNEL — solid concrete ceiling + walls.  The mirror reflects
        // the tunnel interior the player just drove through, NOT open
        // sky as it was doing before.
        mg.fillStyle(0x4E4A40, 1);
        mg.fillRect(mb.glassX, mb.glassY, mb.glassW, mb.glassH * 0.55);
        mg.fillStyle(0x6E6A60, 1);
        mg.fillRect(mb.glassX, mb.glassY + mb.glassH * 0.55, mb.glassW, mb.glassH * 0.07);
      } else {
        // Sky: gradient top→horizon (4 thin slices reads smooth at this size).
        const skySliceH = (mb.horizonY - mb.glassY) / 4;
        for (let i = 0; i < 4; i++) {
          const tt = i / 4;
          mg.fillStyle(lerpColor(skyTop, skyFog, tt), 1);
          mg.fillRect(mb.glassX, mb.glassY + i * skySliceH,
                      mb.glassW, skySliceH + 1);
        }
      }
      // ── Lateral parallax — road shifts opposite the player's drift ──
      const playerLane   = p.x ?? 0;
      const lateralShift = -playerLane * (mb.glassW * 0.55);
      const drawnRoadCx  = mb.roadCx + lateralShift;

      // ── Curvature — sample segments BEHIND the player and accumulate
      // their curve to bend the rear-view's vanishing point.  Mirror
      // image: a left turn forward shows as the road bending to the
      // RIGHT in the rear-view, so we negate the sum.
      const segsForCurve = this.road?.segments;
      let curveShift   = 0;
      if (segsForCurve?.length) {
        const startBack = Math.floor(p.position / SEG_LENGTH);
        let acc = 0;
        for (let n = 1; n <= 80; n++) {
          const idx = (startBack - n + segsForCurve.length) % segsForCurve.length;
          const c = segsForCurve[idx]?.curve ?? 0;
          // Earlier (closer-to-camera) segments contribute more.
          acc += c * (1 - n / 80);
        }
        // Scale so a full curve impulse (~0.012 sustained) shifts the
        // horizon point ~glassW * 0.30.
        curveShift = -acc * (mb.glassW * 1.4);
        // Clamp so the bend stays inside the glass even on hairpins.
        curveShift = Math.max(-mb.glassW * 0.30,
                     Math.min( mb.glassW * 0.30, curveShift));
      }
      // Vanishing point — combines lateral parallax with the curve bend.
      const horizonCx = mb.roadCx + lateralShift + curveShift;

      // Ground beneath the horizon — context-aware: grass on open road,
      // concrete walls in a tunnel, deep-blue water on a bridge.
      const groundCol = inTunnel ? 0x55524A
                      : onWater  ? 0x1E3850
                      :            (palette.grass1 ?? 0x3F6E40);
      mg.fillStyle(groundCol, 1);
      mg.fillRect(mb.glassX, mb.horizonY,
                  mb.glassW, mb.glassY + mb.glassH - mb.horizonY);
      // Road trapezoid — converges to horizon vanishing point (curved!)
      // from the bottom edges (parallax-shifted only).  Mask clips any
      // overspill to the glass area.
      mg.fillStyle(palette.road2 ?? palette.road1 ?? 0x2A2A2A, 1);
      mg.fillPoints([
        { x: horizonCx - 1,               y: mb.horizonY },
        { x: horizonCx + 1,               y: mb.horizonY },
        { x: drawnRoadCx + mb.roadHalfW,  y: mb.roadBotY },
        { x: drawnRoadCx - mb.roadHalfW,  y: mb.roadBotY },
      ], true);
      // Horizon line.
      mg.lineStyle(1, lerpColor(skyFog, 0x000000, 0.3), 0.6);
      mg.beginPath();
      mg.moveTo(mb.glassX + 2, mb.horizonY);
      mg.lineTo(mb.glassX + mb.glassW - 2, mb.horizonY);
      mg.strokePath();
      // ── Road markings — match the forward view (yellow double in
      // the centre, white dashed lane lines + solid white edge lines).
      // Lines converge from the road's bottom edges to the (curved!)
      // vanishing point at horizonCx so they bend with the road.
      const yellowCol = 0xFFEE44;
      const whiteCol  = 0xF6F2DC;
      const horizonX  = horizonCx;            // curved vanishing point
      const stripeAt  = (xRatio, color, alpha) => {
        // xRatio in [-1..+1]: -1 = far-left edge of mirror road, +1 = far-right.
        const xBot = drawnRoadCx + xRatio * mb.roadHalfW;
        mg.lineStyle(1, color, alpha);
        mg.beginPath();
        mg.moveTo(xBot, mb.roadBotY);
        mg.lineTo(horizonX, mb.horizonY);
        mg.strokePath();
      };
      // White edge lines — left & right outer stripes.
      stripeAt(-1.00, whiteCol, 0.65);
      stripeAt( 1.00, whiteCol, 0.65);
      // White dashed lane dividers — interior of each carriageway.
      // Render as 4 dashes per side so they read as broken lines.
      const dashedStripeAt = (xRatio, color, alpha) => {
        const xBot = drawnRoadCx + xRatio * mb.roadHalfW;
        mg.lineStyle(1, color, alpha);
        const dashes = 4;
        for (let i = 0; i < dashes; i++) {
          const t1 = (i + 0.10) / dashes;
          const t2 = (i + 0.60) / dashes;
          // Each dash also tapers in x toward the horizon (perspective).
          const x1 = xBot + (horizonX - xBot) * t1;
          const x2 = xBot + (horizonX - xBot) * t2;
          const y1 = mb.roadBotY + (mb.horizonY - mb.roadBotY) * t1;
          const y2 = mb.roadBotY + (mb.horizonY - mb.roadBotY) * t2;
          mg.beginPath();
          mg.moveTo(x1, y1);
          mg.lineTo(x2, y2);
          mg.strokePath();
        }
      };
      dashedStripeAt(-0.50, whiteCol, 0.60);
      dashedStripeAt( 0.50, whiteCol, 0.60);
      // Yellow double centre line — two parallel solid lines, slightly
      // offset on either side of the median.
      stripeAt(-0.05, yellowCol, 0.85);
      stripeAt( 0.05, yellowCol, 0.85);
      // Stash both centres so projectRear() can interpolate between
      // them — cars at the bottom of the mirror anchor on drawnRoadCx,
      // cars near the horizon converge to horizonCx (curved).
      mb._dynamicRoadCx = drawnRoadCx;
      mb._horizonCx     = horizonCx;
      mb._playerLane    = playerLane;

      // Project (relZ, laneOffset) onto the mirror's rear-perspective
      // road.  Linear depth — simpler than full pseudo-3D, reads fine
      // inside a 50-px panel.  Lateral position factors in the player's
      // own lane so cars stay attached to the parallax-shifted road
      // (i.e. an NPC in your lane stays directly behind your sprite).
      const dynRoadCx = mb._dynamicRoadCx ?? mb.roadCx;
      const horizonCx2 = mb._horizonCx     ?? mb.roadCx;
      const playerLn  = mb._playerLane ?? 0;
      const projectRear = (relZ, laneOffset, maxZ) => {
        const t      = Math.max(0, Math.min(1, relZ / maxZ));
        const depthT = 1 - t;     // 0 = at horizon, 1 = right behind you
        const yMin   = mb.horizonY + 1;
        const yMax   = mb.roadBotY - 1;
        const y      = yMin + depthT * (yMax - yMin);
        const halfW  = mb.roadHalfW * depthT;
        // Centerline interpolates from horizon (curved) at depthT=0 to
        // the bottom-edge (parallax-shifted only) at depthT=1, so a car
        // far back follows the curve and a car right behind you doesn't.
        const centerX = dynRoadCx + (horizonCx2 - dynRoadCx) * (1 - depthT);
        const x      = centerX + ((laneOffset ?? 0) - playerLn) * (halfW + 4);
        return { x, y, depthT };
      };

      // Helper — set a pool sprite to a texture and place it.  Caps
      // height by depth so a close-by car stays inside the glass.
      const placeSprite = (s, tex, x, y, depthT, maxH = 26) => {
        if (s.texture.key !== tex && this.textures.exists(tex)) s.setTexture(tex);
        const t  = this.textures.get(s.texture.key).source[0];
        const tw = t?.width  || 64;
        const th = t?.height || 32;
        const targetH = Math.max(2.5, 2 + depthT * (maxH - 2));
        const targetW = targetH * (tw / th);
        s.setDisplaySize(targetW, targetH);
        s.setPosition(x, y);
        s.setVisible(true);
      };

      // Buildings the player has driven past — scenery flanking the
      // mirror road.  Anchor the iteration on the player's VISUAL z
      // (camera + virtual_Z) so buildings that have just slipped past
      // the visible player car are picked up immediately.
      const segs = this.road?.segments;
      let usedBuildings = 0;
      if (segs?.length) {
        const visualSegIdx = Math.floor((p.position + PLAYER_VIRTUAL_Z) / SEG_LENGTH);
        for (let n = 1; n <= 40 && usedBuildings < buildingPool.length; n++) {
          const segIdx = (visualSegIdx - n + segs.length) % segs.length;
          const seg = segs[segIdx];
          if (!seg?.sprites) continue;
          for (const sp of seg.sprites) {
            if (sp.collected || !sp.texKey) continue;
            if (sp.isCollectible || sp.copEncounter) continue;
            if (sp.type !== 'building' && sp.type !== 'house'
                && sp.type !== 'tree')  continue;
            const vz = n * SEG_LENGTH + SEG_LENGTH / 2;
            const proj = projectRear(vz, sp.offset, 9000);
            const s = buildingPool[usedBuildings++];
            placeSprite(s, sp.texKey, proj.x, proj.y, proj.depthT, 22);
            if (usedBuildings >= buildingPool.length) break;
          }
        }
      }

      // NPC cars — use car_front_<colorSet> so we see grilles + headlights,
      // matching what you'd see looking backward.  "Behind player" =
      // car is at a smaller z than the player's VISUAL position
      // (player.position + PLAYER_VIRTUAL_Z), even if it hasn't yet
      // passed the camera plane.  vz is the world-space distance
      // BEHIND the player car: 0 = right at the player's visual z,
      // bigger = further back.
      let usedCars = 0;
      const visualPlayerZ = p.position + PLAYER_VIRTUAL_Z;
      const carsBehind = (this.traffic ?? [])
        .map(c => ({ c, vz: visualPlayerZ - c.position }))
        .filter(o => o.c.alive && o.vz > 0 && o.vz <= 9000)
        .sort((a, b) => b.vz - a.vz);   // far first → near paints over far
      for (const { c: car, vz } of carsBehind) {
        if (usedCars >= carPool.length) break;
        const proj = projectRear(vz, car.laneOffset, 9000);
        const tex  = `car_front_${car.colorSet ?? 'white'}`;
        const fallback = this.textures.exists(tex) ? tex : 'car_front_white';
        placeSprite(carPool[usedCars++], fallback, proj.x, proj.y, proj.depthT, 18);
      }

      // Rear cops — front-view police art.  Strobe lights on the roof
      // are baked into the texture, so no per-frame flashing needed.
      const copsBehind = (this.cops?.cops ?? [])
        .map(c => ({ c, vz: visualPlayerZ - c.position }))
        .filter(o => o.vz > 0 && o.vz <= 12000)
        .sort((a, b) => b.vz - a.vz);
      for (const { c: cop, vz } of copsBehind) {
        if (usedCars >= carPool.length) break;
        const proj = projectRear(vz, cop.laneOffset, 12000);
        const tex = this.textures.exists('car_front_police') ? 'car_front_police' : 'car_front_white';
        placeSprite(carPool[usedCars++], tex, proj.x, proj.y, proj.depthT, 20);
      }

      // (Previously this trailing .clear() erased the dot-drawing pass;
      // the dots are gone now and the live-palette backdrop above
      // already starts with mg.clear(), so nothing left to do here.)
    }

    // Rear cop pursuit indicator — pseudo-3D can't render behind the player,
    // so we show a HUD chevron when a cop is closing from the rear.
    const rear = this.cops.getRearCopInfo?.(p.position);
    if (rear?.count) {
      const distFt = Math.max(1, Math.round(-rear.nearestRelZ / 10));
      this.hudRearCop
        .setText(`◀ PURSUIT ${rear.count > 1 ? '×' + rear.count + ' ' : ''}— ${distFt} ft behind`)
        .setVisible(true);
    } else {
      this.hudRearCop.setVisible(false);
    }

    this._drawDrugBars();
    this._drawF12Inventory();

    this.hudPopup
      .setVisible(this.popupTimer > 0)
      .setAlpha(Math.min(1, this.popupTimer * 2));

// 5★ helicopter overlay — hovers above the road, flashing red/blue.
    if (this.cops.helicopterActive) {
      const phase = (this.cops.helicopterPhase ?? 0);
      const sway  = Math.sin(phase * 2.4) * 60;
      const rotor = (Math.sin(phase * 28) > 0) ? '— —' : ' = ';
      const tint  = ((phase * 5) | 0) % 2 === 0 ? '#FF3333' : '#3366FF';
      this.hudHelicopter
        .setPosition(SCREEN_W / 2 + sway, 96 + Math.sin(phase * 1.6) * 6)
        .setText(`${rotor}\n  🚁`)
        .setStroke(tint, 3)
        .setVisible(true);
    } else {
      this.hudHelicopter.setVisible(false);
    }

    // (Selected-weapon banner removed — weapons are tap-to-fire on their
    // individual icons, and the cycled-selection visual lives on the
    // icon's own glow ring.)
  }

  _drawDrugBars() {
    const g = this.hudGfx;
    g.clear();

    // Left-side stack: each row is "[NAME] [BAR]" reading downward.
    const barW   = 110, barH = 15, rowH = 22;
    const labelW = 64;
    const x      = 10;
    const yTop   = 85;

    if (!this._drugLabels) this._drugLabels = {};
    const labelsUsed = new Set();
    // Hit-rect array consumed by the pointer drag handler.  Rebuilt
    // every frame so it tracks the live unlocked-drug list and any
    // future re-layout.  In custom mode, dragging on these rects sets
    // the corresponding drug level directly (replaces the old slider
    // modal that the 🎚 button used to open).
    if (!this._drugBarHits) this._drugBarHits = [];
    this._drugBarHits.length = 0;
    // Lazy register the global pointer drag handler once.
    this._ensureDrugBarDragHandler();

    // Custom mode shows ALL drugs (locked included) so the player can
    // drag any bar to set its level — the full menu is the slider UI.
    const showAllDrugs = Difficulty.mode?.() === 'custom';
    let row = 0;
    for (const id of Object.values(DRUGS)) {
      if (!showAllDrugs && !this.drugs.isUnlocked(id)) continue;
      const level = this.drugs.get(id);
      const cfg   = DRUG_CONFIG[id];
      const y     = yTop + row * rowH;

      // Stripped label (drop emoji prefix; pull the word).
      const cleanName = (cfg.label || id).replace(/^[^A-Za-z]+/, '').trim().toUpperCase();

      if (!this._drugLabels[id]) {
        this._drugLabels[id] = this.add.text(x, y, cleanName, {
          fontSize: '11px',
          fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
          color: cfg.hexCss,
          stroke: '#000000', strokeThickness: 3,
        }).setDepth(20);
        if (this._hudObjects) {
          this._hudObjects.push(this._drugLabels[id]);
          this.cameras.main.ignore(this._drugLabels[id]);
        }
      }
      const txt = this._drugLabels[id];
      txt.setPosition(x, y + 1).setVisible(true);   // +1 vertical-align with taller bar
      labelsUsed.add(id);

      const bx = x + labelW;
      // Backdrop — was 0.72 alpha; lowered to 0.40 so it reads as a
      // translucent track instead of a solid box.
      g.fillStyle(0x000000, 0.40);
      g.fillRect(bx - 2, y - 2, barW + 4, barH + 4);
      g.lineStyle(1, 0x444444, 0.55);
      g.strokeRect(bx - 2, y - 2, barW + 4, barH + 4);

      // Fill — drug colour at 0.78 alpha (was fully opaque) so the road
      // showing through the HUD reads softer.
      g.fillStyle(cfg.color, 0.78);
      g.fillRect(bx, y, Math.round(barW * level), barH);

      if (level > 0.02) {
        g.fillStyle(0xFFFFFF, 0.16);
        g.fillRect(bx, y, Math.round(barW * level), Math.ceil(barH * 0.30));
      }

      if (cfg.canOD && level > cfg.odThreshold * 0.80) {
        if (Math.abs(Math.sin(this.gameTime * 7)) > 0.5) {
          g.lineStyle(2, 0xFF2222, 1);
          g.strokeRect(bx - 2, y - 2, barW + 4, barH + 4);
        }
      }

      // Register hit-rect for drag-to-set.  Slightly enlarged top/bottom
      // so it's comfortable to grab on touch.
      this._drugBarHits.push({
        id, x: bx, y: y - 3, w: barW, h: barH + 6,
      });
      row++;
    }

    for (const id of Object.keys(this._drugLabels)) {
      if (!labelsUsed.has(id)) this._drugLabels[id].setVisible(false);
    }
  }

  /** Wire up the click/drag handler for the HUD drug bars.  Idempotent
   *  — only attaches once.  Active only in custom mode.  Sets the bar's
   *  drug level to the horizontal fraction the player dragged to. */
  _ensureDrugBarDragHandler() {
    if (this._drugBarDragWired) return;
    this._drugBarDragWired = true;
    this._draggingDrugId = null;

    const setLevelFromPointer = (px) => {
      const id = this._draggingDrugId;
      if (!id) return;
      const hits = this._drugBarHits;
      const hit  = hits && hits.find(h => h.id === id);
      if (!hit) return;
      const frac = Math.max(0, Math.min(1, (px - hit.x) / hit.w));
      if (this.drugs?.levels) this.drugs.levels[id] = frac;
      // Mark unlocked so the bar keeps rendering even if the player
      // pulled it from 0 (otherwise unlocked-only filter hides it next
      // frame and the drag breaks).
      if (this.drugs?.unlocked && frac > 0) this.drugs.unlocked[id] = true;
      if (this.drugs?.snapshotUnlocks) {
        this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks());
      }
    };

    const isCustom = () => Difficulty.mode?.() === 'custom';

    this.input.on('pointerdown', (ptr) => {
      if (!isCustom()) return;
      const hits = this._drugBarHits;
      if (!hits) return;
      const px = ptr.x, py = ptr.y;
      for (const h of hits) {
        if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
          this._draggingDrugId = h.id;
          setLevelFromPointer(px);
          break;
        }
      }
    });
    this.input.on('pointermove', (ptr) => {
      if (!this._draggingDrugId) return;
      if (!isCustom()) { this._draggingDrugId = null; return; }
      setLevelFromPointer(ptr.x);
    });
    const endDrag = () => { this._draggingDrugId = null; };
    this.input.on('pointerup',     endDrag);
    this.input.on('pointerupoutside', endDrag);
  }

  _drawF12Inventory() {
    const g      = this.hudGfx;
    const tokens = this.cops.f12Tokens;

    const TYPES = [
      { id: 'gun',         color: 0x888888, label: '🔫', tex: 'weapon_gun'         },
      { id: 'spike_strip', color: 0xFF7700, label: '📍', tex: 'weapon_spike_strip' },
      { id: 'paint_bomb',  color: 0xFFEE00, label: '🎨', tex: 'weapon_paint_bomb' },
      { id: 'rocket',      color: 0xFF3300, label: '🚀', tex: 'weapon_rocket'     },
      { id: 'grenade',     color: 0x44AA22, label: '💣', tex: 'weapon_grenade'    },
      { id: 'disguise',    color: 0xFFCC00, label: '🎭', tex: 'weapon_disguise'   },
    ];

    if (!this._f12Texts) this._f12Texts = {};

    const counts = {};
    for (const t of tokens) counts[t] = (counts[t] ?? 0) + 1;
    // Gun is ammo-counted (6 bullets per pickup) so its count is the raw
    // bullet total, not the number of stacked tokens.
    counts.gun = this.cops.gunAmmo ?? 0;

    // Touch-target sized icons — shrunk 5% from 60×52 → 57×49 to clear
    // overlap with the speed display + Accel pedal.  yTop bumped 50 → 55
    // so the top of the weapon stack doesn't crowd the MPH readout.
    const iconW = 57, iconH = 49, rowGap = 6;
    const xRight = SCREEN_W - 10;
    const yTop   = 55;
    const top    = tokens.length ? tokens[tokens.length - 1] : null;

    let row = 0;
    for (const tType of TYPES) {
      const count = counts[tType.id] ?? 0;
      const y     = yTop + row * (iconH + rowGap);
      const x     = xRight - iconW;

      // Pre-create the icon (real image if available, fallback to emoji) +
      // count text once per type.
      if (!this._f12Texts[tType.id]) {
        const hasImg = tType.tex && this.textures.exists(tType.tex);
        if (tType.tex) {
          console.log(`[F12] ${tType.id}: tex=${tType.tex} exists=${hasImg}`);
        }
        let icon;
        if (hasImg) {
          // Preserve the source image aspect ratio — only shrink to fit
          // inside (iconW-6) × (iconH-6).  Wider sources get full width
          // and proportional height; taller sources get full height and
          // proportional width.  No stretching.
          const tex   = this.textures.get(tType.tex)?.source?.[0];
          const baseW = tex?.width  || iconW;
          const baseH = tex?.height || iconH;
          const fit   = Math.min((iconW - 6) / baseW, (iconH - 6) / baseH);
          icon = this.add.image(x + iconW / 2, y + iconH / 2, tType.tex)
            .setOrigin(0.5).setDepth(25)
            .setDisplaySize(baseW * fit, baseH * fit);
        } else {
          icon = this.add.text(x + iconW / 2, y + iconH / 2, tType.label, {
            fontSize: '32px',
          }).setOrigin(0.5).setDepth(25);
        }
        // Invisible interactive hit-zone covering the cell — taps select
        // and fire that weapon (mobile-friendly direct fire).
        const hit = this.add.rectangle(
          x + iconW / 2, y + iconH / 2, iconW, iconH, 0x000000, 0,
        ).setDepth(24).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          this._fireWeaponByType(tType.id);
        });
        this._f12Texts[tType.id] = {
          icon,
          hit,
          // Count badge — bottom-right corner INSIDE the icon box, with
          // a heavier black stroke so it stays readable on top of the
          // weapon image.  Smaller font (13 → fits the 57×49 cell).
          count: this.add.text(x + iconW - 3, y + iconH - 2, '', {
            fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
            color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
          }).setOrigin(1, 1).setDepth(26),
        };
        this._hudObjects?.push(icon, hit, this._f12Texts[tType.id].count);
        this.cameras.main.ignore?.([icon, hit, this._f12Texts[tType.id].count]);
      }

      const txt = this._f12Texts[tType.id];
      // Owned types are bright + show count; un-owned show ghosted icon.
      txt.icon.setPosition(x + iconW / 2, y + iconH / 2);
      txt.hit?.setPosition(x + iconW / 2, y + iconH / 2);
      txt.hit?.setSize?.(iconW, iconH);
      // Count badge anchored to bottom-right INSIDE the cell.
      txt.count.setPosition(x + iconW - 3, y + iconH - 2);
      txt.icon.setAlpha(count > 0 ? 1 : 0.18);
      txt.count.setText(count > 0 ? `×${count}` : '');

      // Card background
      g.fillStyle(tType.color, count > 0 ? 0.55 : 0.12);
      g.fillRoundedRect(x, y, iconW, iconH, 4);
      g.lineStyle(1, 0x000000, 0.6);
      g.strokeRoundedRect(x, y, iconW, iconH, 4);

      // Glow on the next-to-be-used token
      if (count > 0 && tType.id === top) {
        g.lineStyle(2, tType.color, 1);
        g.strokeRoundedRect(x - 1, y - 1, iconW + 2, iconH + 2, 5);
      }

      row++;
    }
  }

  _showPopup(text, color = '#FFFFFF') {
    this.hudPopup.setText(text).setColor(color);
    this.popupTimer = 2.2;
  }

  /** Combined multiplier — strictly ADDITIVE, lands on a clean 0.5
   *  increment.  Combos are cosmetic labels only; no score bonus comes
   *  from them.  Components:
   *    • base                                  → 1.0
   *    • each drug ≥ 5%   ≤ 50%                → +0.5
   *    • each drug > 50%                        → +0.5 more (i.e. +1.0 total)
   *    • each cop star                          → +1.0
   *  Example (beer 50% + weed 25% + Cross-Faded label active):
   *    1 + 0.5 (beer) + 0.5 (weed) = 2.0×  ✓
   */
  _scoreMult() {
    // Custom mode awards zero score — multiplier collapses to 0 so every
    // additive `this.score += pts * _scoreMult()` callsite no-ops.
    if (Difficulty.noScore?.()) return 0;
    const mult = this.drugs.scoreMultiplier + (this.cops.starDisplay ?? 0);
    return Math.round(mult * 2) / 2;
  }

  /** Punchy display labels for each drug-line type — used by the spawner
   *  to flash a themed banner ("🍻 BEER RUN!", "🧙 MUSHROOM HUNTING!", …)
   *  when a line drops on the road.  Mixed-drug lines fall back to the
   *  generic mixed banner below. */
  _drugLineLabel(drugType) {
    const labels = {
      beer:     '🍻 BEER RUN!',
      weed:     '🌿 CHAIN SMOKING!',
      cocaine:  '❄️ RAIL RUN!',
      shrooms:  '🍄 MUSHROOM HUNTING!',
      lsd:      '💊 TAB RUN!',
      heroin:   '💉 TRACK MARKS!',
      rx:       '📜 SCRIPT ROLL!',
      fentanyl: '☠️ RUSSIAN ROULETTE!',
      ketamine: '🐴 K-HOLE!',
      meth:     '⚡ TWEAKER TRAIL!',
    };
    return labels[drugType] ?? '💊 STREET STASH!';
  }

  /** Inject a long line of drug pickups onto consecutive segments ahead.
   *  Each pickup adds the standard 0.17 to the alcohol bar, so 3 cans nets
   *  roughly +50% — i.e. a 3-can line is enough to half-fill the player's
   *  beer status.  Lines spawn periodically (every ~1.5 min) and a longer
   *  mixed line spawns every ~100 in-game miles. */
  _injectDrugLine(o$ = {}) {
    const segs = this.road?.segments;
    if (!segs?.length) return;
    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    const ahead    = 250 + ((Math.random() * 200) | 0);
    // Centre the line in a SAME-direction lane (offset 0.0 to +0.45) so the
    // player doesn't have to swerve hard across traffic to grab it.
    const offset = 0.05 + Math.random() * 0.40;
    const types  = o$.types  ?? ['beer', 'beer', 'beer'];
    const spread = o$.spread ?? 14;        // segments between cans
    let placed = 0;
    for (let i = 0; i < types.length; i++) {
      const segIdx = (startSeg + ahead + i * spread) % segs.length;
      const seg    = segs[segIdx];
      if (!seg) continue;
      seg.sprites.push({
        type:            types[i],            // resolved drug type, NOT 'drug-pending'
        offset,
        baseW: 720, baseH: 880,
        collected:       false,
        isCollectible:   true,
        collectibleType: 'drug',
        lootSeed:        Math.random(),
        _bonusLine:      true,
      });
      placed++;
    }
    if (placed > 0) {
      this._showPopup(o$.label ?? '🍻 BEER RUN!', '#FFCC44');
    }
  }

  /** Inject a synthesized F12 weapon sprite onto a segment ~30-80 segments
   *  ahead so the player picks it up shortly.  Used at 4★+ to keep the
   *  player armed under heavy heat.  Picks balanced forward / rear types. */
  _injectBonusWeapon() {
    const segs = this.road?.segments;
    if (!segs?.length) return;
    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    const ahead    = 30 + ((Math.random() * 50) | 0);
    const seg      = segs[(startSeg + ahead) % segs.length];
    if (!seg) return;
    // 50/50 forward / rear so F12 drops at high stars stay balanced.
    const r = Math.random();
    let f12Type, texKey;
    if (r < 0.30)      { f12Type = 'f12_gun';    texKey = 'weapon_gun'; }
    else if (r < 0.55) { f12Type = 'f12_rocket'; texKey = 'weapon_rocket'; }
    else if (r < 0.80) { f12Type = 'f12_spike';  texKey = 'weapon_spike_strip'; }
    else               { f12Type = 'f12_paint';  texKey = 'weapon_paint_bomb'; }
    seg.sprites.push({
      type:            f12Type,
      texKey,
      offset:          (Math.random() * 0.9) - 0.45,
      baseW: 720, baseH: 880,
      collected:       false,
      isCollectible:   true,
      collectibleType: 'f12',
      _bonus:          true,
    });
  }

  /** Generate a stable 5-char save code: <stopId><diffChar><3-hash>.
   *  Difficulty is encoded as E / N / H so the player can tell at a glance
   *  which mode the code resumes (and the resume path can restore the
   *  matching difficulty before launching the run). */
  _makeSaveCode(stopId, score) {
    const diffChar = (Difficulty.mode() ?? 'normal').charAt(0).toUpperCase(); // 'E' | 'N' | 'H'
    const hash3 = (Math.abs(score * 2654435761) % (36 * 36 * 36))
      .toString(36).toUpperCase().padStart(3, '0');
    return `${stopId}${diffChar}${hash3}`;
  }

  /** Parse a save code back into { stopId, difficulty }.  Accepts both
   *  the legacy 4-char format (no difficulty letter) and the new 5-char
   *  format.  Returns null if the code is too short or unrecognised. */
  _parseSaveCode(code) {
    if (typeof code !== 'string') return null;
    const c = code.trim().toUpperCase();
    if (c.length < 4) return null;
    const stopId = c.charAt(0);
    // 5-char form: stopId + (E|N|H) + 3-hash
    if (c.length >= 5 && /^[ENH]$/.test(c.charAt(1))) {
      const map = { E: 'easy', N: 'normal', H: 'hard' };
      return { stopId, difficulty: map[c.charAt(1)] ?? 'normal' };
    }
    // Legacy 4-char form: assume normal difficulty.
    return { stopId, difficulty: 'normal' };
  }

  /** Take the exit ramp into a rest stop. Records the stop as visited,
   *  generates a 4-digit save code, persists state, and fades into the
   *  RestStopScene with the player's current snapshot. */
  _takeRestStopExit(rs) {
    if (this._takingExit) return;        // guard against double-fire
    this._takingExit = true;
    this._passedRestStops.add(rs.id);
    this._everUsedRestStop = true;
    const code = this._makeSaveCode(rs.id, Math.round(this.score));
    this._saveRestStop(rs.id, code);
    this._lastCheckpoint = { name: rs.name, position: this.player.position, scoreAtCP: this.score };

    // Quiet music while the menu is up so the user can read.
    this.audio?.setPaused?.(true);

    // Fade-to-white-then-launch effect — short cinematic so the transition
    // feels like an actual off-ramp pull-over, not an instant scene swap.
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RestStop', {
        stop:     rs,
        code,
        score:    Math.round(this.score),
        stars:    this.cops.starDisplay ?? 0,
        position: this.player.position,
        odometer: this._odometer,
        // Full drug-bar snapshot — drug status pauses at the rest stop and
        // resumes from these levels (no decay during the menu, no silent
        // wipe of unlocked bars).  COFFEE / SNOOZE buys mutate this on
        // resume via the reduceDrugs multiplier.
        drugLevelsAtEntry: { ...(this.drugs?.levels ?? {}) },
        // Car durability also carries through — without this, the new
        // DamageModel built in the next GameScene starts at 100%, silently
        // healing the car for free.  REPAIR CAR explicitly resets to 100.
        durabilityAtEntry: this.damage?.getDurability?.() ?? 100,
        // Vehicle + tank state — pricing of refuel/charge depends on this.
        vehicleId:      this.player.vehicleId,
        gasMi:          this.player.gasMi,
        gasMaxMi:       this.player.gasMaxMi,
        ownedVehicles:  this.registry.get('ownedVehicles') ?? ['beater'],
        // Per-drug exposure history — gates per-shop drug menus.  Camp
        // sells fent/ket/meth ONLY if the player has sampled them on
        // the road first.
        drugPickupCounts: { ...(this.drugs?.pickupCounts ?? {}) },
      });
    });
  }

  /** Persist rest-stop checkpoint to localStorage so the game can resume
   *  from that position next session via the save code. We keep two records:
   *  `lastRestStop` (most recent, for quick "Resume" UI) and a code-keyed
   *  `restStopSaves[code]` map so the player can enter any code they wrote
   *  down from this device and pick up there. */
  _saveRestStop(stopId, code) {
    try {
      const save = this.registry.get('save');
      if (!save) return;
      const snapshot = {
        id:        stopId,
        code,
        difficulty: Difficulty.mode(),    // restore on resume
        score:     Math.round(this.score),
        stars:     Math.round(this.cops.starDisplay ?? 0),
        position:  this.player.position,
        odometer:  this._odometer,
        ts:        Date.now(),
      };
      save.set('lastRestStop', snapshot);
      const all = save.get('restStopSaves') ?? {};
      all[code] = snapshot;
      save.set('restStopSaves', all);
    } catch (e) { console.warn('[saveRestStop]', e); }
  }

  _setTitleVisible(v) {
    [
      this._titleScrim, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
      this._titleResume,    this._titleResumeTxt,
      this._titleEnterCode, this._titleEnterCodeTxt,
      ...(this._titleDifficultyBtns ?? []),
    ].forEach(o => o?.setVisible(v));
    if (Array.isArray(this._titleLetters)) {
      this._titleLetters.forEach(img => img?.setVisible(v));
    }
  }

  /** Restart the Game scene at a given saved-snapshot. Snapshot is the
   *  shape persisted by `_saveRestStop`.  Difficulty is restored from the
   *  snapshot first so the next scene boots in the matching mode. */
  _resumeFromSavedSnapshot(snap) {
    if (snap?.difficulty) Difficulty.set(snap.difficulty, this.registry);
    this.scene.start('Game', {
      resumeFromStop: snap.id,
      resumeScore:    snap.score ?? 0,
      resumeStars:    snap.stars ?? 0,
    });
  }

  /** Pop a browser prompt asking for the 4-digit code, look it up against
   *  the per-device code map, and resume from the matching snapshot.
   *  `defaultCode` pre-fills the prompt — pass the most recent save code
   *  so the player can either accept it (Enter) or erase + type another. */
  _promptForCode(defaultCode = '') {
    this._buildCodeEntryPopup(defaultCode, (raw) => {
      const code = (raw || '').trim().toUpperCase();
      if (!code) return;
      const save = this.registry.get('save');
      const all  = save?.get?.('restStopSaves') ?? {};
      const snap = all[code];
      // Decode the code structure (stop letter + difficulty letter) so
      // even codes we've never saved locally still resume into the right
      // mode at the right rest stop.  Fresh codes seed a $0 / 0★ run.
      const parsed = this._parseSaveCode(code);
      if (snap) {
        if (snap.difficulty) Difficulty.set(snap.difficulty, this.registry);
        else if (parsed?.difficulty) Difficulty.set(parsed.difficulty, this.registry);
        this._resumeFromSavedSnapshot(snap);
        return;
      }
      if (parsed && REST_STOPS.find(r => r.id === parsed.stopId)) {
        Difficulty.set(parsed.difficulty, this.registry);
        this.scene.start('Game', { resumeFromStop: parsed.stopId, resumeScore: 0, resumeStars: 0 });
      } else {
        this._showPopup('CODE NOT FOUND', '#FF4444');
      }
    });
  }

  _addHudObjs(...objs) {
    for (const o of objs) {
      if (!o) continue;
      this._hudObjects?.push(o);
      this.cameras.main?.ignore(o);
    }
  }

  _buildConfirmPopup(title, message, onYes, onNo) {
    this._modalOpen = true;
    const objs = [];
    const D = 230;
    const cx = SCREEN_W / 2, cy = SCREEN_H / 2;

    const scrim = this.add.rectangle(cx, cy, SCREEN_W, SCREEN_H, 0x000000, 0.65)
      .setDepth(D).setInteractive();
    scrim.on('pointerdown', (p) => { p.event?.stopPropagation?.(); });
    objs.push(scrim);

    const cardW = 380, cardH = 180;
    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x1A1A1A, 1)
      .setStrokeStyle(2, 0xFFFFFF).setDepth(D + 1);
    objs.push(card);

    const ttl = this.add.text(cx, cy - 56, title, {
      fontSize: '20px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
      align: 'center',
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(ttl);

    const msg = this.add.text(cx, cy - 16, message, {
      fontSize: '13px', fontFamily: '"Helvetica Neue", Arial, sans-serif',
      color: '#CCCCCC', align: 'center', wordWrap: { width: cardW - 30 },
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(msg);

    const close = () => {
      this._modalOpen = false;
      objs.forEach(o => o?.destroy?.());
    };

    const yesBg = this.add.rectangle(cx + 80, cy + 50, 120, 36, 0xAA3322, 1)
      .setStrokeStyle(1, 0xFFFFFF).setDepth(D + 2)
      .setInteractive({ useHandCursor: true });
    const yesTxt = this.add.text(cx + 80, cy + 50, 'YES', {
      fontSize: '16px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 3);
    yesBg.on('pointerdown', (p) => { p.event?.stopPropagation?.(); close(); onYes?.(); });
    objs.push(yesBg, yesTxt);

    const noBg = this.add.rectangle(cx - 80, cy + 50, 120, 36, 0x444444, 1)
      .setStrokeStyle(1, 0xFFFFFF).setDepth(D + 2)
      .setInteractive({ useHandCursor: true });
    const noTxt = this.add.text(cx - 80, cy + 50, 'CANCEL', {
      fontSize: '16px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 3);
    noBg.on('pointerdown', (p) => { p.event?.stopPropagation?.(); close(); onNo?.(); });
    objs.push(noBg, noTxt);

    this._addHudObjs(...objs);
  }

  _buildCodeEntryPopup(defaultCode, onAccept, onCancel) {
    this._modalOpen = true;
    let code = String(defaultCode || '').toUpperCase().slice(0, 4);
    const objs = [];
    const D = 230;
    const cx = SCREEN_W / 2, cy = SCREEN_H / 2;

    const scrim = this.add.rectangle(cx, cy, SCREEN_W, SCREEN_H, 0x000000, 0.65)
      .setDepth(D).setInteractive();
    scrim.on('pointerdown', (p) => { p.event?.stopPropagation?.(); });
    objs.push(scrim);

    const cardW = 500, cardH = 300;
    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x1A1A1A, 1)
      .setStrokeStyle(2, 0xFFFFFF).setDepth(D + 1);
    objs.push(card);

    const title = this.add.text(cx, cy - cardH/2 + 20, 'ENTER 4-CHAR SAVE CODE', {
      fontSize: '15px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(title);

    const slotsY = cy - cardH/2 + 56;
    const slotW = 36, slotGap = 8;
    const slotsTotalW = 4 * slotW + 3 * slotGap;
    const slotsX = cx - slotsTotalW / 2 + slotW / 2;
    const slotTexts = [];
    for (let i = 0; i < 4; i++) {
      const x = slotsX + i * (slotW + slotGap);
      const sBg = this.add.rectangle(x, slotsY, slotW, 42, 0x000000, 1)
        .setStrokeStyle(1, 0x888888).setDepth(D + 2);
      const sTx = this.add.text(x, slotsY, '', {
        fontSize: '22px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
      }).setOrigin(0.5).setDepth(D + 3);
      objs.push(sBg, sTx);
      slotTexts.push(sTx);
    }
    const refresh = () => {
      for (let i = 0; i < 4; i++) slotTexts[i].setText(code[i] ?? '');
    };
    refresh();

    const KEYS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const cols = 9;
    const keyW = 38, keyH = 24;
    const padTotalW = cols * keyW + (cols - 1) * 4;
    const padX = cx - padTotalW / 2 + keyW / 2;
    const padY = cy - 6;
    for (let i = 0; i < KEYS.length; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = padX + c * (keyW + 4);
      const y = padY + r * (keyH + 4);
      const ch = KEYS[i];
      const kBg = this.add.rectangle(x, y, keyW, keyH, 0x333333, 1)
        .setStrokeStyle(1, 0x555555).setDepth(D + 2)
        .setInteractive({ useHandCursor: true });
      const kTx = this.add.text(x, y, ch, {
        fontSize: '13px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
      }).setOrigin(0.5).setDepth(D + 3);
      kBg.on('pointerdown', (p) => {
        p.event?.stopPropagation?.();
        if (code.length < 4) { code += ch; refresh(); }
      });
      objs.push(kBg, kTx);
    }

    const btnY = cy + cardH/2 - 24;
    const close = () => {
      this._modalOpen = false;
      objs.forEach(o => o?.destroy?.());
    };

    const cancelBg = this.add.rectangle(cx - 140, btnY, 110, 32, 0x444444, 1)
      .setStrokeStyle(1, 0xFFFFFF).setDepth(D + 2)
      .setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(cx - 140, btnY, 'CANCEL', {
      fontSize: '14px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 3);
    cancelBg.on('pointerdown', (p) => { p.event?.stopPropagation?.(); close(); onCancel?.(); });
    objs.push(cancelBg, cancelTxt);

    const delBg = this.add.rectangle(cx, btnY, 90, 32, 0x553322, 1)
      .setStrokeStyle(1, 0xFFFFFF).setDepth(D + 2)
      .setInteractive({ useHandCursor: true });
    const delTxt = this.add.text(cx, btnY, 'DEL', {
      fontSize: '14px', fontFamily: '"Arial Black", sans-serif', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 3);
    delBg.on('pointerdown', (p) => { p.event?.stopPropagation?.(); code = code.slice(0, -1); refresh(); });
    objs.push(delBg, delTxt);

    const okBg = this.add.rectangle(cx + 140, btnY, 110, 32, 0x44AA66, 1)
      .setStrokeStyle(1, 0xFFFFFF).setDepth(D + 2)
      .setInteractive({ useHandCursor: true });
    const okTxt = this.add.text(cx + 140, btnY, 'OK', {
      fontSize: '15px', fontFamily: '"Arial Black", sans-serif', color: '#000000',
    }).setOrigin(0.5).setDepth(D + 3);
    okBg.on('pointerdown', (p) => { p.event?.stopPropagation?.(); close(); onAccept?.(code); });
    objs.push(okBg, okTxt);

    this._addHudObjs(...objs);
  }

  _startGameplay() {
    this._awaitingStart = false;
    // Custom mode — apply the slider levels chosen on the title screen.
    // Also unlock every drug at level > 0 so the bar renders properly.
    if (this._customStartLevels && this.drugs?.levels) {
      for (const [id, lvl] of Object.entries(this._customStartLevels)) {
        this.drugs.levels[id] = lvl;
        if (lvl > 0 && this.drugs.unlocked) this.drugs.unlocked[id] = true;
      }
      // Refresh the registry-stored unlock map so the HUD redraws bars.
      if (this.drugs.snapshotUnlocks) {
        this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks());
      }
      this._customStartLevels = null;
    }
    // Initialize/play radio on first user interaction (browser audio gate).
    if (this.audio && !this.audio._inited) {
      this.audio.currentStation = 4; // Country (default station per user request)
      this.audio.init?.();
      this.audio._inited = true;
    }
    // Fade out the title overlay.  Includes the animated D-U-I letter
    // images so they don't linger after gameplay starts.
    const titleObjs = [
      this._titleScrim, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
      this._titleResume,    this._titleResumeTxt,
      this._titleEnterCode, this._titleEnterCodeTxt,
      ...(this._titleDifficultyBtns ?? []),
      ...(this._titleLetters ?? []),
    ];
    const targets = titleObjs.filter(Boolean);
    this.tweens.add({
      targets, alpha: 0, duration: 300, ease: 'Cubic.Out',
      onComplete: () => this._setTitleVisible(false),
    });
    // Reveal HUD.
    this._setHudVisible(true);
    this._introDone = true;
    // Erase any "drift" the title screen accumulated — during _awaitingStart
    // we let player.position advance so the road wasn't a static
    // freeze-frame, but that mileage shouldn't bank into the actual run.
    // Resume paths set _resumeFromPosition / _resumeFromStop and have
    // already pinned position; only reset when starting fresh.
    if (this._resumeFromPosition == null && !this._resumeFromStop) {
      this.player.position = 0;
      this._odometer       = 0;
    }
    this.lastSegIdx = Math.floor(this.player.position / SEG_LENGTH);
    this.gameTime   = 0;
    // Clear any tap latch so it doesn't immediately fire steering.
    this._touchLeft = this._touchRight = this._touchF12 = false;
  }

  // Top speed in internal units, accounting for cocaine pickup boost.
  _maxSpeedWithBoost() {
    const bonusMph = this.drugs.getCocaineSpeedBonusMPH?.() ?? 0;
    const topMph   = 120 + bonusMph;
    return MAX_SPEED * (topMph / 120);
  }

  // Displayed MPH = (current speed / current top-speed) × top-MPH.
  _displayMPH() {
    // +4 mph per coke bag, +4 mph per meth pickup (per user spec).
    const cokeBonus = this.drugs?.getCocaineSpeedBonusMPH?.() ?? 0;
    const methBonus = this.drugs?.getMethSpeedBonusMPH?.()    ?? 0;
    const topMph   = 120 + cokeBonus + methBonus;
    const topUnits = MAX_SPEED * (topMph / 120);
    const trueMph  = (this.player.speed / topUnits) * topMph;
    // LSD ≥ 60% — time distortion: world keeps scrolling at the player's
    // real speed, but the speedometer pegs at 60 mph for the trippy
    // "I'm crawling but everything's flying past" feel.
    const lsd = this.drugs?.get?.(DRUGS.LSD) ?? 0;
    if (lsd >= 0.60) return Math.min(60, trueMph);
    return trueMph;
  }

  _regionIndex(progress) {
    for (let i = 0; i < REGION_ORDER.length; i++) {
      if (progress < REGION_ORDER[i].end) return i;
    }
    return REGION_ORDER.length - 1;
  }

  _onArrested() {
    const cp         = this._lastCheckpoint;
    const earnedSince = Math.max(0, this.score - cp.scoreAtCP);
    const lost        = Math.floor(earnedSince / 2);
    this.score       -= lost;

    // Warp back to last checkpoint
    this.player.position = cp.position;
    this.player.speed    = MAX_SPEED * 0.25;
    this.player.x        = 0;
    this.player.xImpulse = 0;

    // Clear cops, reset stars
    this.cops.clearArrest();

    // Remove traffic near warp point to prevent instant re-collision
    this.traffic = this.traffic.filter(t => Math.abs(t.position - cp.position) > 15000);

    // Probation: any drug use within 60s = +2 stars
    this._probationTimer = 60;

    this.effects.triggerShake(700, 0.02);
    this._showPopup(
      `ARRESTED!\nBack to ${cp.name}\n−$${lost}`,
      '#FF2222'
    );

    // Follow-up popup once the arrest message clears — warns the player
    // they're on probation and any drug pickup will spike heat back up.
    this.time.delayedCall(2300, () => {
      this._showPopup(
        '⚖️  ON PROBATION\nStay CLEAN for 60 seconds!\nAny drug pickup = +1 star',
        '#FFCC44',
      );
    });
  }

  /** Overdose handler — same shape as _onArrested but caused by drugs.
   *  Warps to the last checkpoint, zeroes ALL drug bars (player is
   *  pumped clean by the EMTs), and clears the wanted level.  Costs the
   *  same 50% of points-since-last-checkpoint penalty as arrest. */
  _onOverdose(drugId) {
    // OD now ends the run — GameOverScene shows the overdose art and
    // offers RESTART FROM CHECKPOINT / START OVER.  Both restart paths
    // wipe score / stars / drugs to zero (see GameOverScene).
    this._endGame('overdose', { drug: drugId });
  }

  _endGame(cause, extra = {}) {
    // (Mission/Hub branch removed — MissionManager and HubScene were
    // vestigial from the abandoned hub-mode design.  Game runs straight
    // through GameScene → GameOverScene now.)

    // Pause the music so the OD/crash dirge isn't the kart-radio loop.
    this.audio?.setPaused?.(true);

    // ── Technical-loss path (TOO LATE + 5★) ─────────────────────────
    // Open the slider modal: pick a checkpoint + drug levels, restart
    // the run from there.  No GameOverScene transition.  Cash penalty
    // is applied (50% of post-checkpoint score) before the restart.
    if (cause === 'busted_late' && !this._restartModalOpen) {
      this._restartModalOpen = true;
      const cp = this._lastCheckpoint ?? { position: 0, scoreAtCP: 0 };
      const earnedSince = Math.max(0, this.score - (cp.scoreAtCP ?? 0));
      const lost        = Math.floor(earnedSince / 2);
      this.score        = Math.max(0, this.score - lost);
      this._showPopup(`💀 Cash penalty: −$${lost.toLocaleString()}`, '#FF4444');
      // Open slider modal in restart mode after a brief beat.
      this.time.delayedCall(900, () => {
        this._buildDrugSliderModal({
          mode: 'restart',
          onConfirm: ({ drugLevels, checkpointPos, checkpointLabel }) => {
            // Re-launch GameScene with the chosen checkpoint + drug levels.
            this.audio?.setPaused?.(false);
            this._customStartLevels = drugLevels;
            this.scene.restart({
              resumeFromPosition: checkpointPos,
              resumeFromLabel:    checkpointLabel,
              startDrugLevels:    drugLevels,
            });
          },
        });
      });
      return;
    }

    // Run-summary snapshot for the GameOver "Drug Log" panel — what they
    // unlocked, what they picked up, and what they never saw.
    const drugSummary = {};
    for (const id of Object.values(DRUGS)) {
      drugSummary[id] = {
        unlocked:    !!this.drugs.unlocked?.[id],
        maxReached:  this.drugs.maxReached?.[id] ?? 0,
        pickupCount: this.drugs.pickupCounts?.[id] ?? 0,
      };
    }

    this.scene.start('GameOver', {
      score:           Math.round(this.score),
      // Pass distance in MILES directly — player.position is in
      // segment-world-units, not feet, so the previous /5280 conversion
      // was wildly wrong (read 640 mi after a 6 mi drive).
      distanceMi:      Math.round(this._odometer ?? 0),
      cause,
      drug:            extra.drug ?? null,
      drugSummary,
      lastCheckpoint:  this._lastCheckpoint
        ? {
            name:     this._lastCheckpoint.name,
            position: this._lastCheckpoint.position,
          }
        : null,
    });
  }
}
