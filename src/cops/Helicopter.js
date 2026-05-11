// INTEGRATION CONTRACT:
//   Input:  playerSegIdx (int), playerLateralPos (float -1..1), playerSpeed (float), dt (seconds)
//   Output: getRenderInfo() → {x, y, scale, spotlightWidth, spotlightAlpha, screenSpace:bool}
//           getSpotlightCenter() → {segIdx, lateralPos}; isPlayerSpotted() → bool
//   Renderer: draws helicopter sprite at (x,y) with scale; cone drawn from (x,y) downward
//   Events:  emits 'spotted' when player enters spotlight beam (one-shot per entry)

const TWO_PI      = Math.PI * 2;
const SWAY_PERIOD = 4.2;        // seconds for one full side-to-side cycle
const SWAY_AMP    = 0.38;       // lateral amplitude in -1..1 road space
const SPOT_LAG    = 0.08;       // spotlight lerp factor per frame (chase-camera feel)
const EMP_DURATION = 4;

// Minimal event emitter — no external imports needed
class MiniEmitter {
  constructor() { this._handlers = {}; }
  on(ev, cb)   { (this._handlers[ev] ??= []).push(cb); }
  emit(ev, ...args) { (this._handlers[ev] ?? []).forEach(fn => fn(...args)); }
}

export class Helicopter extends MiniEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.height         - World units above road surface (default 1500)
   * @param {number} opts.hoverDistance  - World units ahead of player (default 800)
   */
  constructor(opts = {}) {
    super();
    this._height        = opts.height        ?? 1500;
    this._hoverDistance = opts.hoverDistance ?? 800;

    // Helicopter position in road-space
    this._segIdx     = 0;
    this._lateral    = 0;        // current sway -1..1
    this._swayTimer  = 0;

    // Spotlight state (trails helicopter with lag)
    this._spotLateral = 0;       // spotlight center in road lateral space
    this._spotSegIdx  = 0;

    // State flags
    this._active      = false;
    this._empTimer    = 0;
    this._wasSpotted  = false;   // edge-detect so 'spotted' only fires on entry
  }

  // -------------------------------------------------------------------------
  //  Public control
  // -------------------------------------------------------------------------

  setActive(active) {
    this._active = !!active;
    if (!active) this._wasSpotted = false;
  }

  applyEMP() {
    this._empTimer = EMP_DURATION;
  }

  isDisabled() {
    return this._empTimer > 0;
  }

  // -------------------------------------------------------------------------
  //  Update — call once per frame
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt                - Delta time in seconds
   * @param {number} playerSegIdx      - Player's current road segment index
   * @param {number} playerLateralPos  - Player's lateral position (-1..1)
   * @param {number} playerSpeed       - Player's current speed (world units/s)
   * @param {number} [visibilityFactor=1] - 0=fog/dark, 1=clear; affects spotlight width
   */
  update(dt, playerSegIdx, playerLateralPos, playerSpeed, visibilityFactor = 1) {
    if (this._empTimer > 0) {
      this._empTimer = Math.max(0, this._empTimer - dt);
      return;
    }
    if (!this._active) return;

    // Hover a fixed segment count ahead of the player.
    // SEG_LENGTH is not imported to avoid coupling; we track in seg-space directly.
    this._segIdx = playerSegIdx + Math.round(this._hoverDistance / 200);  // approx 200 units/seg

    // Side-to-side sway
    this._swayTimer += dt;
    this._lateral = Math.sin((this._swayTimer / SWAY_PERIOD) * TWO_PI) * SWAY_AMP;

    // Spotlight lags behind helicopter lateral position (chase feel)
    this._spotLateral += (this._lateral - this._spotLateral) * Math.min(1, SPOT_LAG * (dt / (1 / 60)));
    this._spotSegIdx   = this._segIdx;

    // Spotlight width: wider at night, narrower in fog
    // visibilityFactor: 0=fog, 1=clear — night handled externally via same factor
    this._currentVisibility = visibilityFactor;

    // Detect player-in-spotlight
    const spotted = this.isPlayerSpotted(playerLateralPos, playerSegIdx);
    if (spotted && !this._wasSpotted) {
      this.emit('spotted');
    }
    this._wasSpotted = spotted;
  }

  // -------------------------------------------------------------------------
  //  Queries
  // -------------------------------------------------------------------------

  /**
   * Returns screen-space position and spotlight parameters for the renderer.
   * The renderer is expected to:
   *   1. Draw the helicopter sprite at (x, y) with the given scale.
   *   2. Draw a downward cone from (x, y) with width spotlightWidth, alpha spotlightAlpha.
   * screenSpace is always true — x/y are already in 320×240 screen coordinates.
   */
  getRenderInfo() {
    if (!this._active || this._empTimer > 0) {
      return { x: 0, y: 0, scale: 0, spotlightWidth: 0, spotlightAlpha: 0, screenSpace: true };
    }

    // Helicopter renders above the horizon: fixed screen position based on lateral offset
    // x maps lateral (-1..1) to screen width (0..320), y is above road horizon
    const screenW = 320;
    const screenH = 240;
    const x = screenW / 2 + this._lateral * (screenW * 0.35);
    const y = screenH * 0.22;  // above horizon, where aerial object would appear
    const scale = 0.6 + 0.1 * Math.abs(this._lateral);  // slight size variation with sway

    // Spotlight cone is wider when clear, narrower in fog (fog diffuses the beam)
    const vis = this._currentVisibility ?? 1;
    const baseWidth = 60;
    const spotlightWidth  = baseWidth * (0.6 + 0.4 * vis);
    const spotlightAlpha  = 0.18 + 0.25 * vis;

    return { x, y, scale, spotlightWidth, spotlightAlpha, screenSpace: true };
  }

  /**
   * Center of the spotlight on the road surface in road-space coordinates.
   * @returns {{ segIdx: number, lateralPos: number }}
   */
  getSpotlightCenter() {
    return { segIdx: this._spotSegIdx, lateralPos: this._spotLateral };
  }

  /**
   * True if player is within the spotlight beam.
   * Can be called with explicit position args during update or with no args to read last result.
   * @param {number} [playerLateralPos] - optional override for lateral check
   * @param {number} [playerSegIdx]     - optional override for seg check
   */
  isPlayerSpotted(playerLateralPos, playerSegIdx) {
    if (!this._active || this._empTimer > 0) return false;

    const vis = this._currentVisibility ?? 1;
    // Spotlight half-width in lateral space: wider when clear, narrower in fog
    const halfWidth = 0.18 + 0.22 * vis;

    const latDiff = Math.abs((playerLateralPos ?? 0) - this._spotLateral);
    // Segment-depth check: spotlight only reaches ~4 segments ahead or behind its center
    const segDiff  = Math.abs((playerSegIdx ?? 0) - this._spotSegIdx);

    return latDiff < halfWidth && segDiff < 5;
  }
}
