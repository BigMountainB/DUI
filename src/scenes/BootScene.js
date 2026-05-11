import Phaser from 'phaser';
import { SCREEN_W, SCREEN_H } from '../constants.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { flattenManifest } from '../systems/AssetManifest.js';
import { Wallet } from '../economy/Wallet.js';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }

  preload() {
    console.log('[BootScene] preload start');
    const manifest = flattenManifest();
    this._missingKeys = new Set(manifest.map(m => m.key));

    this._buildProgressBar();

    this.load.on('progress', v => this._setProgress(v));
    this.load.on('filecomplete', key => this._missingKeys.delete(key));
    this.load.on('loaderror', () => {});

    for (const { key, path } of manifest) {
      this.load.image(key, path);
    }

    // Safety net: if the loader stalls (browser quirks with all-404 batches),
    // force the boot to complete after 5s so the user never sees a permanent
    // loading screen.
    this._safetyTimer = setTimeout(() => {
      if (!this._createDone) {
        this._setProgress(1);
        try { this.create(); } catch (e) { console.error('[Boot safety]', e); }
      }
    }, 5000);
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
    console.log('[BootScene] create — building textures');
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

    this.registry.set('audio',        new AudioSystem());
    this.registry.set('save',         save);
    this.registry.set('wallet',       wallet);

    console.log('[BootScene] starting Game scene');
    // Boot straight into GameScene — its own title overlay handles the
    // pre-start intro, so the road style is identical to gameplay (same
    // Road class, same painted asphalt) with no jarring scene transition.
    this.scene.start('Game');
  }

  _buildProgressBar() {
    const w = 360, h = 14;
    const x = (SCREEN_W - w) / 2;
    const y = SCREEN_H / 2 + 40;

    this.add.text(SCREEN_W / 2, y - 30, 'LOADING', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '20px',
      color: '#FF4400',
    }).setOrigin(0.5);

    this._barBg = this.add.graphics();
    this._barBg.lineStyle(2, 0xFF4400, 1);
    this._barBg.strokeRect(x - 1, y - 1, w + 2, h + 2);

    this._barFill = this.add.graphics();
    this._barX = x;
    this._barY = y;
    this._barW = w;
    this._barH = h;
  }

  _setProgress(v) {
    if (!this._barFill) return;
    this._barFill.clear();
    this._barFill.fillStyle(0xFF4400, 1);
    this._barFill.fillRect(this._barX, this._barY, this._barW * v, this._barH);
  }

  _fillMissingPlaceholders() {
    for (const key of this._missingKeys) {
      if (this.textures.exists(key)) continue;
      this._makePlaceholder(key);
    }
  }

  _makePlaceholder(key) {
    if (key.startsWith('car_'))    return this._makeCarPlaceholder(key);
    if (key.startsWith('hooker_')) return this._makeHookerPlaceholder(key);
    if (key.startsWith('drug_'))   return this._makeDrugPlaceholder(key);
    if (key.startsWith('cop_'))    return this._makeCopPlaceholder(key);
    if (key.startsWith('prop_'))   return this._makePropPlaceholder(key);
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
    if (key === 'cop_cruiser') return this._makeCarTexture(key, 0x000000, 0xFFFFFF);
    if (key === 'cop_swat')    return this._makeCarTexture(key, 0x222222, 0x111111);
    if (key === 'cop_heli') {
      const w = 80, h = 56;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x222222); g.fillRect(20, 18, 40, 22);
      g.fillStyle(0x88BBFF); g.fillRect(24, 22, 12, 14);
      g.fillStyle(0x111111); g.fillRect(0, 27, w, 4);
      g.generateTexture(key, w, h);
      g.destroy();
      return;
    }
    this._makeBlank(key, 64, 40, 0x000000);
  }

  _makePropPlaceholder(key) {
    if (key === 'prop_marker') {
      const w = 64, h = 96;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xFFCC00, 0.3); g.fillRect(8, 0, w - 16, h);
      g.fillStyle(0xFFCC00, 1);   g.fillRect(20, 0, w - 40, h);
      g.generateTexture(key, w, h);
      g.destroy();
      return;
    }
    if (key === 'prop_blood') {
      const size = 96;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x880000, 0.7); g.fillEllipse(size / 2, size / 2, size, size * 0.5);
      g.fillStyle(0x440000, 0.5); g.fillEllipse(size / 2, size / 2, size * 0.6, size * 0.3);
      g.generateTexture(key, size, size);
      g.destroy();
      return;
    }
    this._makeBlank(key, 32, 32, 0xFFCC00);
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
