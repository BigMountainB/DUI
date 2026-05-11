import Phaser from 'phaser';
import { SCREEN_W, SCREEN_H, DRUG_CONFIG, DRUGS } from '../constants.js';

// Per-drug unlock hints shown for any drug the player hasn't unlocked yet.
// Order here drives the row order on the run-summary panel.
const DRUG_ORDER = [
  DRUGS.ALCOHOL, DRUGS.WEED, DRUGS.COCAINE, DRUGS.SHROOMS, DRUGS.LSD,
  DRUGS.HEROIN,  DRUGS.RX,   DRUGS.FENTANYL, DRUGS.KETAMINE, DRUGS.METH,
];

const UNLOCK_HINTS = {
  [DRUGS.COCAINE]:  'Stay drunk for 30 seconds.',
  [DRUGS.SHROOMS]:  'Be drunk and stoned at the same time (both bars ≥ 30%).',
  [DRUGS.LSD]:      'Get the shrooms bar to 50%.',
  [DRUGS.HEROIN]:   'Drive past 20% of the route.',
  [DRUGS.RX]:       'Crash into 50 NPC cars across your runs.',
  [DRUGS.FENTANYL]: 'Get the heroin bar to 50%.',
  [DRUGS.KETAMINE]: 'Get the LSD bar to 40%.',
  [DRUGS.METH]:     'Hit 40% cocaine, then stay clean from coke for 30 sec.',
};

const IMPACT = 'Impact, "Arial Black", Arial, sans-serif';
const CX = SCREEN_W / 2;
const CY = SCREEN_H / 2;

const CAUSE = {
  busted: {
    headline: 'BUSTED',
    color:    '#2244FF',
    subtitle: 'The long arm of the law caught up with you.',
    image:    'ui_crash_collision',
  },
  overdose: {
    headline: 'OVERDOSED',
    color:    '#FF4422',
    subtitle: "Your body couldn't take any more.",
    image:    'ui_crash_overdose',
  },
  crash: {
    headline: 'WRECKED',
    color:    '#FF8800',
    subtitle: 'The car is totaled. The road won.',
    image:    'ui_crash_collision',
  },
  finish: {
    headline: 'YOU MADE IT',
    color:    '#44FF88',
    subtitle: 'Pullman, WA — what a road.',
    image:    null,
  },
};

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOver' }); }

  init(data) {
    this.finalScore     = data?.score      ?? 0;
    // GameScene now passes mileage already converted to miles.
    this.finalMiles     = data?.distanceMi ?? 0;
    this.cause          = data?.cause      ?? 'busted';
    this.deathDrug      = data?.drug       ?? null;
    this.lastCheckpoint = data?.lastCheckpoint ?? null;
    this.drugSummary    = data?.drugSummary ?? null;
  }

  create() {
    const meta = CAUSE[this.cause] ?? CAUSE.busted;

    // ── Background ─────────────────────────────────────────────────────
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000).setOrigin(0);

    // Crash artwork (collision OR overdose) covering the upper half so
    // the player has visual context for the cause.
    if (meta.image && this.textures.exists(meta.image)) {
      const img = this.add.image(CX, CY - 40, meta.image).setOrigin(0.5);
      // Fit image to ~70% of screen height while preserving aspect ratio.
      const tex = this.textures.get(meta.image)?.source?.[0];
      const baseW = tex?.width  || SCREEN_W;
      const baseH = tex?.height || SCREEN_H;
      const fit = Math.min((SCREEN_W * 0.95) / baseW, (SCREEN_H * 0.55) / baseH);
      img.setDisplaySize(baseW * fit, baseH * fit).setAlpha(0.85);
    }

    // Dark scrim over the lower portion so text reads cleanly.
    this.add.rectangle(0, SCREEN_H * 0.52, SCREEN_W, SCREEN_H * 0.48, 0x000000, 0.78).setOrigin(0);

    // ── Headline ───────────────────────────────────────────────────────
    this.add.text(CX, 28, meta.headline, {
      fontSize: '48px', fontFamily: IMPACT,
      color: meta.color, stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5, 0);

    // ── Subtitle / "why they died" ─────────────────────────────────────
    let subtitle = meta.subtitle;
    if (this.cause === 'overdose' && this.deathDrug) {
      const label = DRUG_CONFIG[this.deathDrug]?.label ?? this.deathDrug;
      subtitle = `${label} got you. ${meta.subtitle}`;
    }
    this.add.text(CX, 86, subtitle, {
      fontSize: '13px', fontFamily: 'Arial', color: '#DDDDDD',
      stroke: '#000', strokeThickness: 2, align: 'center',
      wordWrap: { width: SCREEN_W * 0.86 },
    }).setOrigin(0.5, 0);

    // ── Cash + distance summary (bottom half, on the dark scrim) ───────
    this.add.text(CX, SCREEN_H * 0.58, `CASH  $${this.finalScore.toLocaleString()}`, {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#FFCC44', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.add.text(CX, SCREEN_H * 0.58 + 30, `DISTANCE  ${this.finalMiles.toLocaleString()} mi`, {
      fontSize: '14px', fontFamily: 'Arial',
      color: '#AACCFF',
    }).setOrigin(0.5, 0);

    // ── Restart buttons ───────────────────────────────────────────────
    // Built from a clean Rectangle-with-Text combo (instead of a Text
    // with backgroundColor + heavy stroke) so the labels render crisp
    // — the previous strokeThickness on small text was producing the
    // "blurry" look the player flagged.
    const cp   = this.lastCheckpoint;
    const btnY = SCREEN_H - 76;

    if (cp?.position != null) {
      this._makeButton(
        CX - 110, btnY, 200, 50,
        `Start at\n${cp.name}`,
        0x88FFCC, 0x000000,
        () => this._restartAtCheckpoint(cp.position),
      );
    }
    this._makeButton(
      CX + 110, btnY, 200, 50,
      'Start Over',
      0x993322, 0xFFFFFF,
      () => this._startOver(),
    );

    // (Main Menu link removed — MenuScene was vestigial and never reached
    // at runtime, so the link target no longer exists.)

    // Drug-log toggle in the top-right.  Pops a full-screen panel listing
    // every drug — what you peaked, what you ignored, and hints for the
    // ones still locked.
    if (this.drugSummary) {
      this._makeButton(
        SCREEN_W - 70, 24, 120, 28,
        '📋 DRUG LOG',
        0x222244, 0xFFFFFF,
        () => this._openDrugLog(),
      );
    }

    // Keyboard shortcuts.
    this.input.keyboard?.once('keydown-SPACE', () => {
      cp?.position != null ? this._restartAtCheckpoint(cp.position) : this._startOver();
    });
    this.input.keyboard?.once('keydown-ENTER', () => this._startOver());
    this.input.keyboard?.on('keydown-L', () => this._openDrugLog());
  }

  /** Pop a modal overlay listing every drug's run status + unlock hints. */
  _openDrugLog() {
    if (this._drugLogOpen) return;
    this._drugLogOpen = true;

    const layer = this.add.container(0, 0).setDepth(100);

    // Dim scrim — full-screen, click anywhere outside the panel to close.
    const scrim = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.85)
      .setOrigin(0).setInteractive();
    layer.add(scrim);

    // Title
    const title = this.add.text(CX, 22, 'DRUG LOG — THIS RUN', {
      fontSize: '20px', fontFamily: IMPACT,
      color: '#FFCC44', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    layer.add(title);

    // Two-column rows so all 10 drugs fit comfortably.
    const COL_X    = [SCREEN_W * 0.04, SCREEN_W * 0.52];
    const COL_W    = SCREEN_W * 0.44;
    const ROW_H    = 60;
    const TOP_Y    = 60;

    DRUG_ORDER.forEach((id, idx) => {
      const col = idx % 2;
      const row = (idx / 2) | 0;
      const x   = COL_X[col];
      const y   = TOP_Y + row * ROW_H;

      const cfg     = DRUG_CONFIG[id] ?? {};
      const summary = this.drugSummary[id] ?? {};
      const peakPct = Math.round((summary.maxReached ?? 0) * 100);
      const picks   = summary.pickupCount ?? 0;
      const unlocked = !!summary.unlocked;

      // Status string + colour.  "Used" includes any path that left a
      // detectable footprint on the bar — pickups, rest-stop restocks,
      // and dealer buys all push maxReached above 0.  Counting just
      // pickupCount missed restock-bought drugs (rest-stop RESTOCK refills
      // every unlocked bar to 60% without incrementing pickupCount).
      const usedAny = picks > 0 || peakPct > 0;
      let status, statusColor;
      if (!unlocked) {
        status      = '🔒 LOCKED';
        statusColor = '#888888';
      } else if (!usedAny) {
        status      = '⊕ UNLOCKED — never used';
        statusColor = '#88CCFF';
      } else {
        const pickupLabel = picks > 0 ? `   ${picks}× pickup` : '';
        status      = `✓ PEAK ${peakPct}%${pickupLabel}`;
        statusColor = '#88FF88';
      }

      const label = this.add.text(x, y, cfg.label ?? id, {
        fontSize: '15px', fontFamily: IMPACT,
        color: cfg.hexCss ?? '#FFFFFF', stroke: '#000', strokeThickness: 2,
      });
      const stat = this.add.text(x, y + 18, status, {
        fontSize: '11px', fontFamily: 'Arial',
        color: statusColor, wordWrap: { width: COL_W },
      });
      layer.add([label, stat]);

      // Hint for locked drugs (replaces the empty space below status).
      if (!unlocked && UNLOCK_HINTS[id]) {
        const hint = this.add.text(x, y + 34, `→ ${UNLOCK_HINTS[id]}`, {
          fontSize: '10px', fontFamily: 'Arial',
          color: '#CCCCCC', fontStyle: 'italic',
          wordWrap: { width: COL_W },
        });
        layer.add(hint);
      }
    });

    // Close button — bottom centre + scrim click + Esc key.
    const closeBtn = this._makeButton(
      CX, SCREEN_H - 30, 160, 36,
      'CLOSE  (Esc)',
      0x884444, 0xFFFFFF,
      () => this._closeDrugLog(layer),
    );
    layer.add([closeBtn.bg, closeBtn.txt]);
    scrim.on('pointerdown', () => this._closeDrugLog(layer));
    this.input.keyboard?.once('keydown-ESC', () => this._closeDrugLog(layer));

    this._drugLogLayer = layer;
  }

  _closeDrugLog(layer) {
    if (!this._drugLogOpen) return;
    this._drugLogOpen = false;
    layer?.destroy();
    this._drugLogLayer = null;
  }

  /** Build a clean rectangle button with crisply-rendered text on top.
   *  Bumped depth to 50 so it sits above any later-added overlays (e.g.
   *  the drug-log scrim) and listens to BOTH pointerdown and pointerup
   *  so a touch that lifts on the button still counts as a click. */
  _makeButton(cx, cy, w, h, label, fillColor, textColor, onClick) {
    const bg = this.add.rectangle(cx, cy, w, h, fillColor, 1)
      .setOrigin(0.5).setStrokeStyle(2, 0x000000).setDepth(50)
      .setInteractive({ useHandCursor: true });
    const css = `#${textColor.toString(16).padStart(6, '0')}`;
    const txt = this.add.text(cx, cy, label, {
      fontSize: '16px',
      fontFamily: 'Arial Black, Arial, sans-serif',
      color: css,
      align: 'center',
      resolution: 2,
    }).setOrigin(0.5).setDepth(51);
    bg.on('pointerover', () => bg.setFillStyle(fillColor, 0.85));
    bg.on('pointerout',  () => bg.setFillStyle(fillColor, 1));
    let armed = false;
    bg.on('pointerdown', () => { armed = true; });
    bg.on('pointerup',   () => { if (armed) { armed = false; onClick?.(); } });
    bg.on('pointerout',  () => { armed = false; });
    return { bg, txt };
  }

  _restartAtCheckpoint(position) {
    this.scene.start('Game', { resumeFromPosition: position });
  }

  _startOver() {
    this.scene.start('Game');
  }
}
