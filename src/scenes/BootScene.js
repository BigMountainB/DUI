import Phaser from 'phaser';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { flattenManifest } from '../systems/AssetManifest.js';
import { Wallet } from '../economy/Wallet.js';
import { StatsTracker } from '../systems/StatsTracker.js';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }

  preload() {
    const manifest = flattenManifest();
    // _failedKeys tracks ONLY keys that genuinely errored (404, decode
    // failure).  Previously we used _missingKeys = everything-not-yet-
    // -completed, which the safety timer could trip on while real loads
    // were still in flight — triggering placeholder generation that
    // then collided with the late-arriving real texture ("Texture key
    // already in use" spam in console).  loaderror is the authoritative
    // signal; only those keys deserve placeholders.
    this._failedKeys = new Set();

    this._buildProgressBar();

    this.load.on('progress', v => this._setProgress(v));
    this.load.on('filecomplete', key => {
      if (key === 'ui_loading_screen') this._mountLoadingBackdrop();
    });
    this.load.on('loaderror', (file) => {
      if (file?.key) this._failedKeys.add(file.key);
    });

    // Queue the splash first so it appears while heavier gameplay art
    // continues loading behind the progress bar.
    const loadingSplash = manifest.find(asset => asset.key === 'ui_loading_screen');
    if (loadingSplash) this.load.image(loadingSplash.key, loadingSplash.path);
    for (const { key, path } of manifest) {
      if (key === loadingSplash?.key) continue;
      this.load.image(key, path);
    }

    // Safety net: if the loader stalls (browser quirks with all-404 batches),
    // force the boot to complete after 20s so the user never sees a permanent
    // loading screen.  Bumped from 5s to 20s because a normal cold load over
    // the dev-server LAN can take 10+ s with 200+ assets — at 5s the timer
    // tripped during normal flow and created placeholders for keys whose
    // real load was still in flight.
    this._safetyTimer = setTimeout(() => {
      if (!this._createDone) {
        this._setProgress(1);
        try { this.create(); } catch (e) { console.error('[Boot safety]', e); }
      }
    }, 20000);
  }

  create() {
    if (this._createDone) return;
    this._createDone = true;
    if (this._safetyTimer) clearTimeout(this._safetyTimer);

    try {
      this._doCreate();
    } catch (e) {
      console.error('[BootScene.create] FAILED:', e);
      // Show error on screen so the player isn't stuck guessing.
      this.add.text(SCREEN_W / 2, SCREEN_H / 2 + 60, 'BOOT ERROR — check console', {
        fontSize: '14px', color: '#FF4444', backgroundColor: '#000',
      }).setOrigin(0.5);
    }
  }

  _doCreate() {
    // Legacy procedural textures still used by current GameScene code paths.
    this._makeCarTexture('player_car',  0xFF4400, 0xCC3300);
    this._makeCarTexture('traffic_car', 0x4488FF, 0x3366CC);
    this._makeCarTexture('cop_car',     0x2244BB, 0x1133AA);
    // White-bodied car so NPC tint comes through clean (tint multiplies the
    // texture; tinting an orange body just gives muddy orange).
    this._makeCarTexture('npc_car_white', 0xFFFFFF, 0xDDDDDD);

    // For any manifest key whose PNG is missing, synthesize a placeholder
    // so downstream code can reference manifest keys safely.
    this._fillMissingPlaceholders();

    // (Removed: drug_cocaine procedural override.  The user is shipping a
    // real cocaine sprite under public/assets/drugs/cocaine.webp now and
    // the override was clobbering it on every boot.)

    // Shared singletons live on the registry.  (Garage / UpgradeShop /
    // BodyShop / TimeOfDay / MissionManager were here previously but
    // never read by any scene — vestigial from the abandoned hub-mode
    // design.  Removed in cleanup pass.)
    const save = new SaveSystem();
    // Align save profile with the user's current steering-mode pick BEFORE
    // Wallet reads `save.profile.money` — otherwise Wallet binds to the
    // default 'tap' profile, then any mode change leaves Wallet pointing
    // at the wrong slot.
    const mode = this.registry?.get?.('steeringMode')
              ?? (this.registry?.get?.('tiltSteerEnabled') ? 'tilt' : 'tap');
    save.setMode(mode);
    const wallet = new Wallet(save);
    // Career stats — lifetime counters that feed the stats menu + leaderboards.
    // Reads/writes the GLOBAL save bucket, so it's mode-agnostic.
    const stats = new StatsTracker(save);

    // AudioSystem is registered in main.js before the game even
    // boots so the iPhone-menu music app sees stations instantly.
    // Only create one here as a fallback if main.js didn't.
    if (!this.registry.get('audio')) {
      this.registry.set('audio', new AudioSystem());
    }
    this.registry.set('save',         save);
    this.registry.set('wallet',       wallet);
    this.registry.set('stats',        stats);

    // Boot straight into GameScene — its own title overlay handles the
    // pre-start intro, so the road style is identical to gameplay (same
    // Road class, same painted asphalt) with no jarring scene transition.
    this.scene.start('Game');
  }

  _buildProgressBar() {
    this.cameras.main.setBackgroundColor('#03050D');
    this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x03050D)
      .setDepth(-2);

    const w = 390, h = 10;
    const x = (SCREEN_W - w) / 2;
    const y = SCREEN_H - 32;

    this._loadingText = this.add.text(SCREEN_W / 2, y - 29, 'LOADING', {
      fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      fontSize: '22px',
      letterSpacing: 5,
      color: '#F4F7FF',
      stroke: '#FF39AF',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3)
      .setShadow(0, 0, '#FF39AF', 10, true, true);

    this._barBg = this.add.graphics();
    this._barBg.setDepth(3);
    this._barBg.fillStyle(0x040916, 0.90);
    this._barBg.fillRoundedRect(x - 7, y - 7, w + 14, h + 14, 10);
    this._barBg.lineStyle(4, 0x152E51, 0.55);
    this._barBg.strokeRoundedRect(x - 6, y - 6, w + 12, h + 12, 9);
    this._barBg.lineStyle(2, 0x39A8FF, 1);
    this._barBg.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 7);

    this._barGlow = this.add.graphics().setDepth(3);
    this._barFill = this.add.graphics().setDepth(4);
    this._barX = x;
    this._barY = y;
    this._barW = w;
    this._barH = h;
  }

  _setProgress(v) {
    if (!this._barFill) return;
    const fillW = this._barW * Math.max(0, Math.min(1, v));
    this._barGlow.clear();
    this._barFill.clear();
    if (fillW <= 0) return;
    this._barGlow.fillStyle(0x39A8FF, 0.14);
    this._barGlow.fillRoundedRect(this._barX - 3, this._barY - 3, fillW + 6, this._barH + 6, 6);
    this._barFill.fillGradientStyle(0x39D9FF, 0xFF39AF, 0x39D9FF, 0xFF39AF, 1);
    this._barFill.fillRoundedRect(this._barX, this._barY, fillW, this._barH, 4);
    this._barFill.fillStyle(0xFFFFFF, 0.45);
    this._barFill.fillRoundedRect(this._barX + 2, this._barY + 1, Math.max(0, fillW - 4), 2, 1);
  }

  _mountLoadingBackdrop() {
    if (this._loadingBackdrop || !this.textures.exists('ui_loading_screen')) return;
    this._loadingBackdrop = this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'ui_loading_screen')
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setDepth(-1)
      .setAlpha(0);
    this.tweens.add({ targets: this._loadingBackdrop, alpha: 1, duration: 180 });
  }

  _fillMissingPlaceholders() {
    // Only generate placeholders for keys that explicitly errored
    // (loaderror).  Falling back on "anything not-yet-loaded" would
    // race the in-flight network/decode work and clobber real
    // textures with a placeholder, then Phaser warns about the
    // duplicate when the real image arrives.
    const failed = this._failedKeys ?? new Set();
    for (const key of failed) {
      if (this.textures.exists(key)) continue;
      this._makePlaceholder(key);
    }
  }

  _makePlaceholder(key) {
    if (key.startsWith('car_'))    return this._makeCarPlaceholder(key);
    if (key.startsWith('hooker_')) return this._makeHookerPlaceholder(key);
    if (key.startsWith('drug_'))   return this._makeDrugPlaceholder(key);
    if (key.startsWith('cop_'))    return this._makeCopPlaceholder(key);
    if (key.startsWith('ui_'))     return this._makeUIPlaceholder(key);
    this._makeBlank(key, 32, 32, 0xFF00FF);
  }

  _makeCarPlaceholder(key) {
    const palette = {
      car_beater:      [0x886655, 0x554433],
      car_muscle:      [0xCC2222, 0x881111],
      car_sports:      [0xFFCC00, 0xCC9900],
      car_lowrider:    [0x9944CC, 0x661199],
      car_interceptor: [0x111133, 0x000022],
      car_van:         [0xFFFFFF, 0xCCCCCC],
    };
    const [body, roof] = palette[key] ?? [0x888888, 0x555555];
    this._makeCarTexture(key, body, roof);
  }

  _makeHookerPlaceholder(key) {
    const palette = {
      hooker_kimono:     [0xFF66AA, 0xFFCCDD],
      hooker_schoolgirl: [0x4488FF, 0xFFFFFF],
      hooker_club:       [0xFF2244, 0x222222],
      hooker_street:     [0xCC44FF, 0x441166],
    };
    const [primary, secondary] = palette[key] ?? [0xFF66AA, 0xFFCCDD];
    const w = 28, h = 64;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xFFCC99); g.fillCircle(w / 2, 8, 6);
    g.fillStyle(primary);  g.fillRect(8, 14, w - 16, 28);
    g.fillStyle(secondary); g.fillRect(10, 38, w - 20, 18);
    g.fillStyle(0x111111); g.fillRect(11, 56, 4, 8); g.fillRect(w - 15, 56, 4, 8);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  _makeDrugPlaceholder(key) {
    // Cocaine gets a custom baggie sprite — readable from a distance and
    // immediately recognisable as a drug pickup, not a generic white pill.
    if (key === 'drug_cocaine') return this._makeCocaineSprite(key);

    const palette = {
      drug_beer:     0xF5A623,
      drug_weed:     0x4CAF50,
      drug_shrooms:  0xBB44FF,
      drug_lsd:      0xFF44AA,
      drug_heroin:   0x8B4513,
      drug_rx:       0x00BCD4,
      drug_fentanyl: 0xFF2222,
      drug_ketamine: 0x44EEFF,
      drug_meth:     0xCCFFCC,
    };
    const color = palette[key] ?? 0xFFFFFF;
    const size = 48;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.4); g.fillCircle(size / 2 + 2, size / 2 + 2, size / 2 - 2);
    g.fillStyle(color, 1);       g.fillCircle(size / 2,     size / 2,     size / 2 - 4);
    g.fillStyle(0xFFFFFF, 0.5);  g.fillCircle(size / 2 - 6, size / 2 - 6, 4);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /** Custom cocaine sprite — clear plastic baggie of white powder with a
   *  pinched red zip-tie at the top. Far more "drug pickup" than the plain
   *  white circle the procedural fallback was producing. */
  _makeCocaineSprite(key) {
    const w = 64, h = 64;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Drop shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(w / 2, h - 6, w * 0.7, 6);

    // Baggie body — slightly translucent grey-blue to read as plastic.
    // Trapezoid shape (narrower at the top where the zip is pinched).
    g.fillStyle(0xC8DCEA, 0.35);
    g.fillPoints([
      { x: w * 0.18, y: h * 0.32 },
      { x: w * 0.82, y: h * 0.32 },
      { x: w * 0.92, y: h * 0.92 },
      { x: w * 0.08, y: h * 0.92 },
    ], true);

    // White powder filling the bottom 65% of the baggie (settled at base)
    g.fillStyle(0xFFFFFF, 1);
    g.fillPoints([
      { x: w * 0.22, y: h * 0.42 },
      { x: w * 0.78, y: h * 0.42 },
      { x: w * 0.88, y: h * 0.88 },
      { x: w * 0.12, y: h * 0.88 },
    ], true);

    // Powder texture — soft highlight + lump
    g.fillStyle(0xF4F4F4, 1);
    g.fillEllipse(w * 0.36, h * 0.62, w * 0.30, h * 0.16);
    g.fillStyle(0xE6E6E6, 1);
    g.fillEllipse(w * 0.62, h * 0.74, w * 0.22, h * 0.10);

    // Top edge of the powder line (slightly curved, gives volume)
    g.lineStyle(2, 0xCCCCCC, 0.7);
    g.strokeRect(w * 0.22, h * 0.42, w * 0.56, 1);

    // Plastic highlight running down the right side of the bag
    g.fillStyle(0xFFFFFF, 0.45);
    g.fillRect(w * 0.74, h * 0.36, 3, h * 0.50);

    // Pinched neck at the top
    g.fillStyle(0xC8DCEA, 0.6);
    g.fillRect(w * 0.34, h * 0.18, w * 0.32, h * 0.16);

    // Red zip-tie / twist closure
    g.fillStyle(0xC8141C, 1);
    g.fillRect(w * 0.30, h * 0.18, w * 0.40, h * 0.06);
    g.fillStyle(0xFF3344, 1);
    g.fillRect(w * 0.30, h * 0.18, w * 0.40, 2);

    // Tiny shine on the zip
    g.fillStyle(0xFFFFFF, 0.6);
    g.fillRect(w * 0.34, h * 0.20, w * 0.06, 1);

    // Outline so it pops against any background
    g.lineStyle(1, 0x111111, 0.85);
    g.strokePoints([
      { x: w * 0.18, y: h * 0.32 },
      { x: w * 0.82, y: h * 0.32 },
      { x: w * 0.92, y: h * 0.92 },
      { x: w * 0.08, y: h * 0.92 },
    ], true, true);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  _makeCopPlaceholder(key) {
    // Only cop_police is shipped as a real PNG now; everything else
    // falls back to the generic black blank.
    this._makeBlank(key, 64, 40, 0x000000);
  }

  _makeUIPlaceholder(key) {
    this._makeBlank(key, 32, 32, 0xFFFFFF);
  }

  _makeBlank(key, w, h, color) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  _makeCarTexture(key, bodyColor, roofColor) {
    const w = 64, h = 40;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(bodyColor);
    g.fillRect(4, 12, w - 8, 20);

    g.fillStyle(roofColor);
    g.fillRect(14, 4, w - 28, 14);

    g.fillStyle(0x88BBFF, 0.7);
    g.fillRect(16, 5, w - 32, 12);

    g.fillStyle(0x111111);
    g.fillEllipse(14, 32, 16, 12);
    g.fillEllipse(w - 14, 32, 16, 12);

    g.fillStyle(key === 'player_car' ? 0xFFFF88 : 0xFF4444);
    g.fillRect(4,  14, 6, 8);
    g.fillRect(w - 10, 14, 6, 8);

    g.generateTexture(key, w, h);
    g.destroy();
  }
}
