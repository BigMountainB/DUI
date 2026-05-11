export const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp   = (a, b, t)   => a + (b - a) * t;
export const easeIn = (t)         => t * t;
export const increase = (base, increment, max) => (base + increment) % max;
export const toInt  = Math.round;

/** Project a world-space point to screen space.
 *  Returns sub-pixel float coords — segment-edge stair-stepping at the
 *  rumble strip came from rounding x/y/w to ints per segment, which made
 *  each trapezoid offset by an integer pixel from its neighbor.  fillPoints
 *  / Phaser Graphics accept floats and the GPU handles the AA. */
export function project(worldX, worldY, worldZ, camX, camY, camZ, camDepth, screenW, screenH, roadW) {
  const cz = worldZ - camZ;
  if (cz <= 0) return null;
  const scale = camDepth / cz;
  return {
    scale,
    x: (screenW / 2) + scale * (worldX - camX) * screenW / 2,
    y: (screenH / 2) - scale * (worldY - camY) * screenH / 2,
    w: scale * roadW * screenW / 2,
  };
}

/** Draw filled trapezoid on a Phaser Graphics object */
export function fillTrap(g, color, x1, y1, x2, y2, x3, y3, x4, y4, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints([
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x3, y: y3 },
    { x: x4, y: y4 },
  ], true);
}

/** Rumble strip width in pixels given half-road width */
export function rumbleW(w, lanes) { return w / Math.max(6, 2 * lanes); }

/** Lane marker width */
export function laneW(w, lanes) { return w / Math.max(32, 8 * lanes); }

/** Simple seeded pseudo-random (for deterministic segment placement) */
export class SeededRNG {
  constructor(seed = 42) { this.s = seed; }
  next() {
    this.s = (this.s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (this.s >>> 0) / 0xFFFFFFFF;
  }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  bool(p = 0.5)  { return this.next() < p; }
  pick(arr)       { return arr[Math.floor(this.next() * arr.length)]; }
}
