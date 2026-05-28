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
    color:    '#35A7FF',
    subtitle: 'NOT WORTH THE RISK.',
    image:    'ui_end_busted_screen',
  },
  overdose: {
    headline: 'OVERDOSED',
    color:    '#FF3BAF',
    subtitle: 'ONE DECISION. A LIFETIME OF CONSEQUENCES.',
    image:    'ui_end_overdose_neon',
  },
  crash: {
    headline: 'CRASHED',
    color:    '#FF3BAF',
    subtitle: 'ONE BAD DECISION. ONE LAST RIDE.',
    image:    'ui_end_crashed_neon',
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
    this.charge         = data?.charge     ?? 'DUI';
    this.losses         = data?.losses     ?? 0;
    this.runTimeSec     = data?.runTimeSec ?? 0;
    this.checkpointCode = data?.checkpointCode ?? null;
    this.lastCheckpoint = data?.lastCheckpoint ?? null;
    this.drugSummary    = data?.drugSummary ?? null;
  }

  create() {
    const meta = CAUSE[this.cause] ?? CAUSE.busted;
    if (this.cause === 'overdose') {
      this._createNeonEnding(meta);
      return;
    }
    if (this.cause === 'busted' || this.cause === 'crash') {
      this._createBakedButtonEnding(meta);
      return;
    }

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
    if (this.cause === 'crash') this._drawWreckedGlass();

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
    this.add.text(CX, SCREEN_H * 0.58 + 30, `DISTANCE  ${this.finalMiles.toFixed(2)} mi`, {
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
    this.input.keyboard?.once('keydown-SPACE', () => this._retrySameSettings());
    this.input.keyboard?.once('keydown-ENTER', () => this._startOver());
    this.input.keyboard?.on('keydown-L', () => this._openDrugLog());
  }

  _createBakedButtonEnding(meta) {
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x03050F).setOrigin(0);
    if (this.textures.exists(meta.image)) {
      this.add.image(CX, CY, meta.image)
        .setOrigin(0.5)
        .setDisplaySize(SCREEN_W, SCREEN_H);
    }

    // Keep the authored plate intact, but surface the useful resume code
    // in the open strip above its baked-in action buttons.
    const code = this.checkpointCode ?? this.lastCheckpoint?.code ?? 'NONE PASSED';
    const codePanel = this.add.graphics().setDepth(40);
    codePanel.fillStyle(0x040711, 0.84);
    codePanel.fillRoundedRect(CX - 106, 329, 212, 23, 4);
    codePanel.lineStyle(1, 0x39A8FF, 0.92);
    codePanel.strokeRoundedRect(CX - 106, 329, 212, 23, 4);
    this.add.text(CX, 340, `CHECKPOINT CODE: ${code}`, {
      fontSize: '11px',
      fontFamily: IMPACT,
      color: '#EEF5FF',
      stroke: '#071224',
      strokeThickness: 2,
      letterSpacing: 1,
    }).setOrigin(0.5).setDepth(41);

    // The authored Crashed and Busted plates already contain their full
    // typography and button faces.
    // These hit zones trace those angled buttons and paint only an extra
    // hover/press glow so the art is never obscured by duplicate UI.
    const cp = this.lastCheckpoint;
    this._makeImageButtonZone([
      { x: 139, y: 400 }, { x: 150, y: 361 },
      { x: 296, y: 361 }, { x: 285, y: 400 },
    ], 0xFF39AF, () => this._startOver());
    this._makeImageButtonZone([
      { x: 306, y: 400 }, { x: 317, y: 361 },
      { x: 467, y: 361 }, { x: 456, y: 400 },
    ], 0x39A8FF, () => this._retrySameSettings());
    this._makeImageButtonZone([
      { x: 474, y: 400 }, { x: 485, y: 361 },
      { x: 647, y: 361 }, { x: 636, y: 400 },
    ], 0xF4F7FF, () => this._returnToTitle());

    this.input.keyboard?.once('keydown-SPACE', () => this._startOver());
    this.input.keyboard?.once('keydown-ENTER', () => this._returnToTitle());
  }

  _createNeonEnding(meta) {
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x03050F).setOrigin(0);
    if (this.textures.exists(meta.image)) {
      this.add.image(CX, CY, meta.image)
        .setOrigin(0.5)
        .setDisplaySize(SCREEN_W, SCREEN_H);
    }

    const isBust = this.cause === 'busted';
    const accent = isBust ? 0x2D9BFF : 0xFF2AAB;
    const accentCss = isBust ? '#39A8FF' : '#FF39AF';
    const secondCss = isBust ? '#FF39AF' : '#39A8FF';
    const g = this.add.graphics();
    g.fillStyle(0x02040D, 0.60);
    g.fillRect(0, 0, SCREEN_W, 125);
    g.fillStyle(0x02040D, 0.78);
    g.fillRect(0, 232, SCREEN_W, SCREEN_H - 232);
    g.lineStyle(2, accent, 0.85);
    g.lineBetween(102, 113, SCREEN_W - 102, 113);

    // Offset neon glow beneath a pale chrome-looking headline.
    this.add.text(CX + 3, 15, meta.headline, {
      fontSize: '64px', fontFamily: IMPACT,
      color: accentCss, stroke: accentCss, strokeThickness: 8,
    }).setOrigin(0.5, 0).setAlpha(0.52);
    this.add.text(CX, 11, meta.headline, {
      fontSize: '64px', fontFamily: IMPACT,
      color: '#EAF2FF', stroke: '#152250', strokeThickness: 6,
      shadow: { offsetX: 1, offsetY: 2, color: accentCss, blur: 8, fill: true },
    }).setOrigin(0.5, 0);
    this.add.text(CX, 88, meta.subtitle, {
      fontSize: '17px', fontFamily: IMPACT,
      color: accentCss, stroke: '#070A18', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    const panelX = 24;
    const panelY = 244;
    const panelW = 398;
    const panelH = 113;
    const panel = this.add.graphics();
    panel.fillStyle(0x040711, 0.90);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 6);
    panel.lineStyle(2, accent, 0.92);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);
    panel.lineStyle(1, 0xE4EEFF, 0.40);
    panel.lineBetween(panelX + 15, panelY + 30, panelX + panelW - 15, panelY + 30);

    this.add.text(panelX + 16, panelY + 9, 'RUN REPORT', {
      fontSize: '12px', fontFamily: IMPACT, color: '#EAF2FF',
      letterSpacing: 2,
    });

    const drugLabel = DRUG_CONFIG[this.deathDrug]?.label ?? null;
    const rows = isBust
      ? [
          ['CHARGE', this.charge || 'DUI'],
          ['DISTANCE / TIME', `${this.finalMiles.toFixed(2)} MI   ${this._formatRunTime()}`],
          ['BAIL LOSSES', `-$${Math.max(0, this.losses).toLocaleString()}`],
          ['CHECKPOINT CODE', this.checkpointCode ?? 'NONE SAVED'],
        ]
      : [
          ['CAUSE', drugLabel ? `${drugLabel} OVERDOSE` : 'OVERDOSE'],
          ['DISTANCE / TIME', `${this.finalMiles.toFixed(2)} MI   ${this._formatRunTime()}`],
          ['CASH', `$${this.finalScore.toLocaleString()}`],
          ['CHECKPOINT CODE', this.checkpointCode ?? 'NONE SAVED'],
        ];
    rows.forEach(([label, value], idx) => {
      const y = panelY + 38 + idx * 17;
      this.add.text(panelX + 16, y, `${label}:`, {
        fontSize: '11px', fontFamily: IMPACT, color: idx % 2 ? secondCss : accentCss,
      });
      this.add.text(panelX + 162, y, value, {
        fontSize: '11px', fontFamily: IMPACT, color: '#FFFFFF',
      });
    });

    const cp = this.lastCheckpoint;
    this._makeNeonButton(520, 263, 242, 39, 'RETRY', accent, () => this._retrySameSettings());
    this._makeNeonButton(520, 310, 242, 39, 'START OVER', 0x2D9BFF, () => this._startOver());

    this.add.text(520, 365, 'NEED SUPPORT?', {
      fontSize: '12px', fontFamily: IMPACT, color: accentCss,
    }).setOrigin(0.5, 0);
    this.add.text(520, 383, 'CALL OR TEXT 988  |  CRISIS SUPPORT', {
      fontSize: '11px', fontFamily: IMPACT, color: '#FFFFFF',
    }).setOrigin(0.5, 0);
    this.add.text(520, 400, 'SAMHSA: 1-800-662-HELP (4357)', {
      fontSize: '10px', fontFamily: IMPACT, color: '#D6E8FF',
    }).setOrigin(0.5, 0);
    this.add.text(CX, 432, isBust
      ? "IT'S NOT JUST YOUR LIFE. IT'S EVERYONE ELSE'S."
      : 'HELP IS AVAILABLE. YOU DO NOT HAVE TO DO THIS ALONE.', {
      fontSize: '10px', fontFamily: IMPACT, color: '#A9B7CC',
      letterSpacing: 1,
    }).setOrigin(0.5);

    if (this.drugSummary) {
      this._makeNeonButton(SCREEN_W - 68, 20, 114, 25, 'DRUG LOG', accent, () => this._openDrugLog());
    }
    this.input.keyboard?.once('keydown-SPACE', () => this._retrySameSettings());
    this.input.keyboard?.once('keydown-ENTER', () => this._startOver());
    this.input.keyboard?.on('keydown-L', () => this._openDrugLog());
  }

  _formatRunTime() {
    const total = Math.max(0, Math.floor(this.runTimeSec ?? 0));
    const min = Math.floor(total / 60).toString().padStart(2, '0');
    const sec = (total % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  /** Fully broken windshield laid above the wreck artwork, below the UI text. */
  _drawWreckedGlass() {
    // Created after the artwork/scrim and before labels/buttons, so default
    // display order gives glass-over-scene without cracking the UI itself.
    const g = this.add.graphics();
    const hubs = [
      [638, 104, 94, 7], [172, 162, 112, 8],
      [534, 282, 126, 8], [286, 76, 104, 7],
    ];
    for (const [cx, cy, radius, arms] of hubs) {
      g.lineStyle(3, 0x111820, 0.42);
      for (let pass = 0; pass < 2; pass++) {
        g.lineStyle(pass === 0 ? 3 : 2, pass === 0 ? 0x111820 : 0xEAF6FF, pass === 0 ? 0.42 : 0.92);
        for (let i = 0; i < arms; i++) {
          const ang = i * (Math.PI * 2 / arms) + cx * 0.002;
          const bend = Math.sin(i * 7.3 + cy) * 0.24;
          const mx = cx + Math.cos(ang) * radius * 0.54;
          const my = cy + Math.sin(ang) * radius * 0.54;
          const ex = cx + Math.cos(ang + bend) * radius;
          const ey = cy + Math.sin(ang + bend) * radius;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(mx, my);
          g.lineTo(ex, ey);
          g.strokePath();
          if ((i % 2) === 0) {
            g.beginPath();
            g.moveTo(mx, my);
            g.lineTo(mx + Math.cos(ang + 1.05) * radius * 0.28, my + Math.sin(ang + 1.05) * radius * 0.28);
            g.strokePath();
          }
        }
      }
      g.fillStyle(0xF2FAFF, 0.90);
      g.fillCircle(cx, cy, 3);
    }
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

  _makeNeonButton(cx, cy, w, h, label, neonColor, onClick) {
    const g = this.add.graphics().setDepth(50);
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(0x050812, hover ? 0.97 : 0.90);
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
      g.lineStyle(hover ? 3 : 2, neonColor, 1);
      g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
    };
    draw(false);
    g.setInteractive(
      new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    g.input.cursor = 'pointer';
    const css = `#${neonColor.toString(16).padStart(6, '0')}`;
    const txt = this.add.text(cx, cy, label, {
      fontSize: label.length > 17 ? '12px' : '15px',
      fontFamily: IMPACT,
      color: '#EEF5FF',
      stroke: css,
      strokeThickness: 1,
      align: 'center',
    }).setOrigin(0.5).setDepth(51);
    g.on('pointerover', () => draw(true));
    g.on('pointerout', () => draw(false));
    g.on('pointerdown', () => onClick?.());
    return { bg: g, txt };
  }

  _makeImageButtonZone(points, neonColor, onClick) {
    const polygon = new Phaser.Geom.Polygon(points);
    const hit = this.add.graphics().setDepth(50);
    const draw = (active = false) => {
      hit.clear();
      if (!active) return;
      hit.lineStyle(3, neonColor, 1);
      hit.strokePoints(points, true);
    };
    hit.setInteractive(polygon, Phaser.Geom.Polygon.Contains);
    hit.input.cursor = 'pointer';
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout', () => draw(false));
    hit.on('pointerdown', () => {
      draw(true);
      onClick?.();
    });
    return hit;
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
    const restartData = { resumeFromPosition: position };
    if (this.cause === 'busted') {
      // Busted already displayed/applied its bail loss before this screen.
      restartData.checkpointRestartScore = this.finalScore ?? 0;
    } else {
      // Wreck/OD checkpoint retries use the existing half-cash consequence.
      restartData.crashRestartScore = this.finalScore ?? 0;
    }
    this.scene.start('Game', restartData);
  }

  /** Retry the run with the same difficulty + steering settings —
   *  skip the title screen, preserve drug unlocks/progress, just drop
   *  the player straight into a fresh Seattle start.  Used by the
   *  RETRY button on the Crashed / Busted plate. */
  _retrySameSettings() {
    this.scene.start('Game', { skipTitle: true });
  }

  _startOver() {
    // Mirror the pause-menu Start Over wipe: clear persistent drug
    // unlocks, drug-progress, last-rest-stop pointer, and any leftover
    // Custom-mode opt-ins so a Custom run can't bleed `noPolice` /
    // `noNpcDamage` / starting stars into the fresh launch.  Without
    // this wipe, this scene's "START OVER" was semantically a "From
    // Checkpoint stripped of stars" — same persisted state, just zeroed
    // score.  GameScene.init() rebuilds scene-instance state from
    // registry, so wiping registry + save is enough here.
    this.registry?.remove?.('drugUnlocks');
    this.registry?.remove?.('drugProgress');
    const save = this.registry?.get?.('save');
    save?.set?.('lastRestStop', null);
    this.scene.start('Game', {});
  }

  _returnToTitle() {
    // Exit the ended run without wiping persistent saves/unlocks; a new
    // Game scene with no resume data presents the normal title screen.
    this.scene.start('Game', {});
  }
}
