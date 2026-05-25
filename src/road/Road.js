import {
  SCREEN_W, SCREEN_H, ROAD_WIDTH, SEG_LENGTH, RUMBLE_SEGS, LANE_DASH_LEN, LANE_DASH_GAP,
  LANES, DRAW_DIST, CAM_HEIGHT, CAM_DEPTH, FOG_DENSITY, ROUTE_SEGS, TOTAL_ROUTE_MILES,
  PLAYER_VIRTUAL_Z,
} from '../constants.js';
import { project, fillTrap, rumbleW, laneW, toInt, SeededRNG, clamp } from '../utils/Helpers.js';
import { getPaletteAtProgress, REGION_ORDER, REGION_PALETTES, lerpColor } from '../utils/Colors.js';
import { buildRoute } from './RouteData.js';
import { TimeOfDay } from '../world/TimeOfDay.js';
import { Weather }   from '../world/Weather.js';

const HALF_W = SCREEN_W / 2;
const HALF_H = SCREEN_H / 2;

export class Road {
  constructor() {
    this.segments = [];
    this.length   = 0;
    this.build();

    // ── Per-frame caches, allocated ONCE here, mutated in render() ─
    // The earlier attempt at boundary samples allocated all of these on
    // every frame, producing ~1500 short-lived objects/frame and
    // periodic GC stalls.  Pre-allocating eliminates the churn entirely.
    this._slopeBnd       = new Float32Array(DRAW_DIST + 1);
    this._surfaceSamples = new Array(DRAW_DIST + 1);
    for (let n = 0; n <= DRAW_DIST; n++) {
      this._surfaceSamples[n] = {
        worldZ:  0, screenX: 0, screenY: 0,
        screenW: 0, scale:   0, valid:   false, visible: false,
      };
    }
    this._drawnByN = new Array(DRAW_DIST);
    // Pre-allocated polyline points for the shoulder ribbons.  Sized
    // for the worst case (every boundary visible).  Reused frame-to-
    // frame by mutating x/y; the polygon's effective length is passed
    // to fillPoints via a slice (one allocation per side per frame —
    // unavoidable since fillPoints reads .length).
    const maxPts = (DRAW_DIST + 1) * 2;
    this._leftRibbonPts  = new Array(maxPts);
    this._rightRibbonPts = new Array(maxPts);
    for (let i = 0; i < maxPts; i++) {
      this._leftRibbonPts[i]  = { x: 0, y: 0 };
      this._rightRibbonPts[i] = { x: 0, y: 0 };
    }
  }

  build() {
    this.segments = buildRoute(ROUTE_SEGS);
    this.length   = this.segments.length * SEG_LENGTH;
  }

  getSegment(position) {
    if (position < 0) position += this.length;
    const idx = Math.floor(position / SEG_LENGTH) % this.segments.length;
    return this.segments[idx];
  }

  /** Main render call — called every frame from GameScene */
  render(g, ghostG, playerPos, playerX, palette, effects, propsG, frontG) {
    g.clear();
    if (propsG) propsG.clear();
    if (frontG) frontG.clear();
    this._propsG = propsG ?? null;
    // Bridge "front overlay" — when present, bridge-segment guardrails
    // paint here (at a higher depth than the crane sprite band) so the
    // bridge railings properly occlude the West Seattle Bridge cranes
    // instead of letting the cranes show through the railing.
    this._frontG = frontG ?? null;
    // Stash so per-sprite draw can hide cop_roadblock when stars < 3.
    this._currentStars = effects?.currentStars ?? 0;
    // Stash so _drawSprites can render NPC cars at their correct depth
    // interleaved with the per-segment building sprites.
    this._playerPos    = playerPos;
    this._lightFlash   = effects?.lightFlash ?? false;
    // Stash so _drawSprites can route sign frames to the high-depth
    // signGfx overlay (above tunnel walls).
    this._effects      = effects;

    // Render with margin so alcohol-sway, crash-shake, AND ketamine-tilt
    // (up to ~20°) on the main camera don't reveal the void past the
    // painted area.  150px covers sway + ket tilts; the K-hole quad-split
    // at peak ket replaces the old 80° rotation that needed more.
    const MARGIN  = 150;
    const W       = SCREEN_W + MARGIN * 2;
    const SKY_TOP = -MARGIN;             // paint sky up past the rotated viewport corners

    // --- SKY gradient (8 bands, top-blue → haze, mile-based day/night) ---
    // Day-time palette is lerped toward a warm dusk band and a deep
    // night band as the player progresses past mile 120.  TimeOfDay
    // returns 0..1 amounts; we mix the originals against fixed dusk /
    // night colours so each region keeps its character but the sky
    // tracks the in-game clock.
    const _mileNow  = (playerPos / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const duskAmt   = TimeOfDay.duskAmount(_mileNow);
    const nightAmt  = TimeOfDay.nightAmount(_mileNow);
    const darknessAmt = TimeOfDay.darkness(_mileNow);
    const DUSK_TOP   = 0xC56B3D;   // burnt orange
    const DUSK_FOG   = 0xE8A06E;   // pink-orange near horizon
    const NIGHT_TOP  = 0x06080F;   // deep blue-black
    const NIGHT_FOG  = 0x0E1424;   // slightly lighter near horizon
    const skyTopMix = lerpColor(
      lerpColor(palette.sky, DUSK_TOP, duskAmt),
      NIGHT_TOP, nightAmt,
    );
    const skyFogMix = lerpColor(
      lerpColor(palette.fog, DUSK_FOG, duskAmt),
      NIGHT_FOG, nightAmt,
    );
    // Sky gradient — was 8 stepped bands, which read as visible
    // horizontal stripes (especially behind the tunnel embankment when
    // approaching from a distance).  Bumped to 64 thin slices so the
    // lerp reads as a smooth gradient instead of stripes.
    const skyBands = 64;
    const skyH     = HALF_H + 14;
    // Cap the sky region with a solid block of the top-band colour so a
    // rotated camera (ketamine tilt) doesn't reveal black above the
    // gradient.
    g.fillStyle(skyTopMix, 1);
    g.fillRect(-MARGIN, SKY_TOP, W, -SKY_TOP);
    for (let b = 0; b < skyBands; b++) {
      const t   = b / skyBands;
      const col = lerpColor(skyTopMix, skyFogMix, t * 0.65);
      g.fillStyle(col, 1);
      const bandY = Math.floor(t * skyH);
      const bandH = Math.ceil(skyH / skyBands) + 2;
      g.fillRect(-MARGIN, bandY, W, bandH);
    }

    // --- Shrooms rainbow (≥ 65%) — drawn AFTER the sky but BEFORE
    // any road / scenery, so the rainbow sits behind everything but
    // the sky bands.  Six ROYGBV arcs across the upper sky. ---
    const shroomsBar = effects?.shroomsBar ?? 0;
    if (shroomsBar >= 0.65) {
      const a = Math.min(1, (shroomsBar - 0.65) / 0.35) * 0.55;
      const cx = 400, cy = 300, baseR = 220;
      const arcCols = [0xFF3333, 0xFF8800, 0xFFEE00, 0x33CC33, 0x3388FF, 0x8833FF];
      for (let i = 0; i < arcCols.length; i++) {
        g.lineStyle(7, arcCols[i], a);
        g.beginPath();
        g.arc(cx, cy, baseR + i * 8, Math.PI, Math.PI * 2);
        g.strokePath();
      }
    }

    // --- Stars / Milky Way / planets / moon ---
    // Sky modelled after a user-supplied Stellarium screenshot: a
    // diagonal Milky Way arch, scattered field stars in three
    // brightness tiers, a few named bright stars (Vega, Arcturus,
    // Altair), the galactic-centre cluster (Sagittarius region) on
    // the right, planets sitting just above the horizon, and the
    // crescent moon near where the photo had it.
    //
    // Visibility ramp uses `darknessAmt` (combines dusk + night) so
    // stars start fading in around mile 110–120 instead of holding
    // until mile 180.
    const skyDark = Math.min(1, darknessAmt * 1.15);
    if (skyDark > 0.04) {
      // Moon — slow arc across the sky over the night portion of the run.
      const moonPhase = clamp((_mileNow - 150) / 143, 0, 1);
      const moonX = MARGIN * -1 + moonPhase * W;
      const moonArcY = HALF_H * 0.18 + Math.abs(moonPhase - 0.5) * HALF_H * 0.55;

      // Reusable integer-hash PRNG so star positions are deterministic
      // but look like actual scattered light (the previous golden-ratio
      // modulo aliased into faint horizontal rows).
      const starHash = (n) => {
        let v = (n * 2654435761) >>> 0;
        v ^= v >>> 16; v = (v * 0x85ebca6b) >>> 0;
        v ^= v >>> 13;
        return ((v * 0xc2b2ae35) >>> 0) / 4294967296;
      };

      // ── Slow celestial rotation ────────────────────────────────
      // Stars + Milky Way + constellations rotate together around a
      // virtual celestial pole as game time passes — mimics Earth's
      // rotation.  Tied to playerPos so the sky pauses when the game
      // does.  Pole is off-screen above + slightly left, like looking
      // south-east at the night sky from mid-latitudes.  Rate halved
      // from 1.5e-6 to 7.5e-7 per user — ~1 full revolution per 20 min
      // at 80 mph.
      const skyRot = playerPos * 7.5e-7;
      const rotCx  = SCREEN_W * 0.30;
      const rotCy  = -HALF_H * 0.20;
      const cosR   = Math.cos(skyRot);
      const sinR   = Math.sin(skyRot);
      const rotX = (x, y) => rotCx + (x - rotCx) * cosR - (y - rotCy) * sinR;
      const rotY = (x, y) => rotCy + (x - rotCx) * sinR + (y - rotCy) * cosR;

      // ── Milky Way band ──────────────────────────────────────────
      // Diagonal soft glow from lower-left through upper-centre to the
      // right edge, matching the photo's curve.  Drawn as two overlaid
      // strokes (wide+dim, narrow+brighter) plus a sprinkle of extra
      // dim stars along the curve so it reads as a dense star field
      // rather than a flat painted line.
      const mwAlpha = skyDark * 0.55;
      if (mwAlpha > 0.02) {
        // Flatter MW arc to match the user's Stellarium reference — the
        // band is mostly horizontal with a slight rise toward the middle
        // (was a steep "smile" before, with the apex too high).
        const mwP0 = { x: -MARGIN - 40,         y: HALF_H * 0.78 };
        const mwP1 = { x: SCREEN_W * 0.45,      y: HALF_H * 0.55 };
        const mwP2 = { x: SCREEN_W + MARGIN + 40, y: HALF_H * 0.82 };
        // Bezier helper — returns the spine point at parameter t.
        const mwAt = (t) => {
          const oneT = 1 - t;
          return {
            x: oneT*oneT*mwP0.x + 2*oneT*t*mwP1.x + t*t*mwP2.x,
            y: oneT*oneT*mwP0.y + 2*oneT*t*mwP1.y + t*t*mwP2.y,
          };
        };
        // Tangent at parameter t (used to compute the band-perpendicular
        // direction so dust lanes / clusters offset across the band, not
        // along it).
        const mwTangent = (t) => {
          const dx = 2*(1-t)*(mwP1.x - mwP0.x) + 2*t*(mwP2.x - mwP1.x);
          const dy = 2*(1-t)*(mwP1.y - mwP0.y) + 2*t*(mwP2.y - mwP1.y);
          const len = Math.hypot(dx, dy) || 1;
          return { tx: dx/len, ty: dy/len, nx: -dy/len, ny: dx/len };
        };

        // ── Soft puffy band ────────────────────────────────────────
        // 1000 small overlapping blobs along the spine give the band
        // an irregular, granular shape (vs the prior 110 large blobs
        // that read as a smooth band).  Single-pass per blob (was 3) so
        // 1000 fillCircle calls instead of 3000 — about the same total
        // cost as the prior pass.  Galactic-core brightening adds a
        // brighter, wider zone at t≈0.55 to suggest the Sgr A* region
        // visible in the user's Stellarium reference.
        const MW_PUFFS = 1000;
        for (let i = 0; i < MW_PUFFS; i++) {
          const t = i / (MW_PUFFS - 1);
          const { x: cx, y: cy } = mwAt(t);
          const { nx, ny } = mwTangent(t);
          const taper     = Math.sin(t * Math.PI);             // 0..1..0
          // Galactic-core gaussian — peak brightness/width near t=0.55.
          const coreBoost = Math.exp(-Math.pow((t - 0.55) * 2.6, 2));
          const noise     = 0.40 + starHash(i * 91 + 13) * 0.95;
          const wander    = (starHash(i * 137 + 29) - 0.5) * 36;
          const px = cx + nx * wander;
          const py = cy + ny * wander;
          const rx = rotX(px, py);
          const ry = rotY(px, py);
          if (rx < -40 || rx > SCREEN_W + 40) continue;
          if (ry < -40 || ry > HALF_H + 20)   continue;
          const radius = (3 + 5 * taper) * noise * (1 + coreBoost * 0.6);
          const brightMod = (0.40 + starHash(i * 113 + 7) * 0.65)
                          * (0.75 + 0.55 * coreBoost);
          const baseA = mwAlpha * brightMod;
          // Warm (cream) puffs in the core region, cool (blue-grey)
          // puffs elsewhere — matches the spectrum gradient in the
          // reference image.
          const color = coreBoost > 0.45 ? 0xC8BFA0 : 0x6E84A4;
          g.fillStyle(color, baseA * 0.45);
          g.fillCircle(rx, ry, radius);
        }

        // ── Dust lanes — dark patches eating into the band ──────────
        const MW_DUST = 140;
        for (let i = 0; i < MW_DUST; i++) {
          const t = starHash(i * 173 + 5);
          const { x: cx, y: cy } = mwAt(t);
          const { nx, ny } = mwTangent(t);
          const off = (starHash(i * 211 + 3) - 0.5) * 28;
          const dx = cx + nx * off;
          const dy = cy + ny * off;
          const rx = rotX(dx, dy);
          const ry = rotY(dx, dy);
          if (rx < -40 || rx > SCREEN_W + 40) continue;
          if (ry < -40 || ry > HALF_H + 20)   continue;
          // Smaller dust patches now that we have more of them.
          const radius = 4 + starHash(i * 251 + 11) * 14;
          g.fillStyle(0x050B18, 0.40 * mwAlpha);
          g.fillCircle(rx, ry, radius);
        }

        // ── Bright cluster knots ───────────────────────────────────
        const MW_KNOTS = 50;
        for (let i = 0; i < MW_KNOTS; i++) {
          const t = 0.10 + starHash(i * 311 + 9) * 0.80;
          const { x: cx, y: cy } = mwAt(t);
          const { nx, ny } = mwTangent(t);
          const off = (starHash(i * 379 + 13) - 0.5) * 22;
          const kx = cx + nx * off;
          const ky = cy + ny * off;
          const rx = rotX(kx, ky);
          const ry = rotY(kx, ky);
          if (rx < -40 || rx > SCREEN_W + 40) continue;
          if (ry < -40 || ry > HALF_H + 20)   continue;
          const radius = 3 + starHash(i * 421 + 17) * 8;
          g.fillStyle(0xE0DFC0, 0.16 * mwAlpha);
          g.fillCircle(rx, ry, radius * 1.5);
          g.fillStyle(0xFFF6D8, 0.32 * mwAlpha);
          g.fillCircle(rx, ry, radius);
        }

        // ── Sprinkled stars along the band (denser than the field) ─
        const MW_STARS = 1100;
        for (let i = 0; i < MW_STARS; i++) {
          const t = (i + 0.5) / MW_STARS;
          const { x: cx, y: cy } = mwAt(t);
          // Perpendicular spread of ~30px so the sprinkle has thickness.
          const ang = starHash(i * 41 + 13) * Math.PI * 2;
          const r   = (starHash(i * 53 + 17) ** 0.5) * 30;
          const baseSx = cx + Math.cos(ang) * r;
          const baseSy = cy + Math.sin(ang) * r;
          const sx = rotX(baseSx, baseSy);
          const sy = rotY(baseSx, baseSy);
          if (sx < -8 || sx > SCREEN_W + 8) continue;
          if (sy < -8 || sy > HALF_H + 12)  continue;
          if (Math.abs(sx - moonX) < 28 && Math.abs(sy - moonArcY) < 28) continue;
          const a = (0.35 + starHash(i * 67 + 23) * 0.45) * mwAlpha;
          g.fillStyle(0xE0E8FF, a);
          g.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
        }
      }

      // ── Background field stars ─────────────────────────────────
      // Spawned in POLAR coordinates around the rotation pole — every
      // star sits at a fixed (radius, angle) from the pole, so when we
      // rotate by skyRot the field is gap-free at any angle (rotation
      // preserves radius and just shifts angle).  Disc covers screen
      // diagonal + margin so the visible sky is always saturated.
      // Color variety: ~15% blue-white (hot), ~10% warm yellow (cool),
      // rest white — mirrors the reference Stellarium image.
      const STAR_COUNT = 1500;
      const STAR_R_MAX = Math.hypot(SCREEN_W, SCREEN_H) + 100;
      for (let i = 0; i < STAR_COUNT; i++) {
        // sqrt() on the radius hash gives uniform area density (otherwise
        // stars cluster near the pole because polar samples concentrate
        // toward the centre).
        const u   = starHash(i * 7 + 11);
        const ang = starHash(i * 13 + 19) * Math.PI * 2;
        const r   = Math.sqrt(u) * STAR_R_MAX;
        const baseSx = rotCx + Math.cos(ang) * r;
        const baseSy = rotCy + Math.sin(ang) * r;
        const sx = rotX(baseSx, baseSy);
        const sy = rotY(baseSx, baseSy);
        // Cull rotated stars that landed outside the visible sky band.
        if (sx < -8 || sx > SCREEN_W + 8) continue;
        if (sy < -8 || sy > HALF_H + 12) continue;
        if (Math.abs(sx - moonX) < 32 && Math.abs(sy - moonArcY) < 32) continue;
        const baseBright = 0.30 + starHash(i * 17 + 31) * 0.55;
        const phase      = starHash(i * 23 + 41) * Math.PI * 2;
        const twinkle    = 0.60 + 0.40 * Math.sin(phase + playerPos * 0.0002);
        const a          = Math.min(1, baseBright * twinkle * Math.min(1, skyDark * 1.3));
        // Spectral colour variety — most stars white, some hot-blue, a
        // few cool-yellow.
        const cRoll = starHash(i * 29 + 47);
        const color = cRoll < 0.15 ? 0xC8D4FF
                    : cRoll < 0.25 ? 0xFFE8C0
                    :                0xFFFFFF;
        g.fillStyle(color, a);
        const size = baseBright > 0.82 ? 3 : (baseBright > 0.60 ? 2 : 1);
        g.fillRect(Math.floor(sx), Math.floor(sy), size, size);
      }

      // ── Named bright stars + photo-traced constellations ───────
      // Positions normalised to [0..1] of (W, HALF_H), traced from the
      // Stellarium reference screenshot.  Each entry has a colour for
      // the named star (slight blue / yellow tint per real spectral
      // class) and an optional connecting-line list for the
      // constellation figure it anchors.
      if (skyDark > 0.20) {
        const conA = Math.min(1, skyDark * 1.2);
        const figures = [
          // Lyra (anchor: Vega) — small parallelogram below Vega.
          { name: 'Vega',
            stars: [[0.49, 0.32], [0.485, 0.40], [0.475, 0.43],
                    [0.500, 0.43], [0.510, 0.40]],
            lines: [[0,1],[1,2],[2,3],[3,4],[4,1]],
            tint:  0xE6F0FF, mainIdx: 0, mainSize: 5 },
          // Boötes (anchor: Arcturus) — kite shape rising from Arcturus.
          { name: 'Arcturus',
            stars: [[0.69, 0.10], [0.71, 0.16], [0.73, 0.13],
                    [0.685, 0.06], [0.66, 0.04]],
            lines: [[0,1],[1,2],[2,3],[3,4],[4,0]],
            tint:  0xFFE4B0, mainIdx: 0, mainSize: 5 },
          // Aquila (anchor: Altair) — small arrow shape mid-right.
          { name: 'Altair',
            stars: [[0.43, 0.50], [0.40, 0.54], [0.46, 0.54]],
            lines: [[0,1],[0,2]],
            tint:  0xFFFFFF, mainIdx: 0, mainSize: 4 },
          // Sagittarius "teapot" — galactic-centre cluster, photo-right.
          { name: 'Sagittarius',
            stars: [[0.74, 0.62], [0.79, 0.62], [0.76, 0.66],
                    [0.81, 0.66], [0.78, 0.70], [0.72, 0.66], [0.83, 0.70]],
            lines: [[0,1],[0,5],[5,2],[2,3],[3,4],[4,6],[1,3]],
            tint:  0xFFFFFF, mainIdx: -1, mainSize: 0 },
          // Cygnus (Northern Cross) — visible through Milky Way upper-left.
          { name: 'Cygnus',
            stars: [[0.30, 0.18], [0.34, 0.26], [0.38, 0.34],
                    [0.31, 0.30], [0.40, 0.27]],
            lines: [[0,1],[1,2],[3,1],[1,4]],
            tint:  0xFFFFFF, mainIdx: -1, mainSize: 0 },
        ];
        for (const f of figures) {
          // Faint constellation lines (rotated with the rest of the field).
          g.lineStyle(1, 0x88AACC, 0.18 * conA);
          for (const [ai, bi] of f.lines) {
            const [ax, ay] = f.stars[ai];
            const [bx, by] = f.stars[bi];
            const bx1 = ax * W - MARGIN, by1 = ay * HALF_H;
            const bx2 = bx * W - MARGIN, by2 = by * HALF_H;
            const x1 = rotX(bx1, by1), y1 = rotY(bx1, by1);
            const x2 = rotX(bx2, by2), y2 = rotY(bx2, by2);
            if (Math.abs((x1 + x2) / 2 - moonX) < 28
                && Math.abs((y1 + y2) / 2 - moonArcY) < 28) continue;
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.strokePath();
          }
          // Star pips.  Anchor (mainIdx) gets a bigger glow + bigger pip.
          for (let j = 0; j < f.stars.length; j++) {
            const [nx, ny] = f.stars[j];
            const baseX = nx * W - MARGIN, baseY = ny * HALF_H;
            const x = rotX(baseX, baseY), y = rotY(baseX, baseY);
            if (Math.abs(x - moonX) < 32 && Math.abs(y - moonArcY) < 32) continue;
            const tw = 0.85 + 0.15 * Math.sin(j * 1.3 + playerPos * 0.00015);
            const isMain = j === f.mainIdx;
            const haloR  = isMain ? 7 : 3;
            const pipSz  = isMain ? f.mainSize : 2;
            g.fillStyle(f.tint, (isMain ? 0.32 : 0.20) * conA);
            g.fillCircle(x, y, haloR);
            g.fillStyle(0xFFFFFF, Math.min(1, tw * conA));
            g.fillRect(Math.floor(x) - Math.floor(pipSz / 2),
                       Math.floor(y) - Math.floor(pipSz / 2),
                       pipSz, pipSz);
          }
        }
      }

      // ── Planets near horizon (Mars, Saturn) ────────────────────
      // Solid coloured dots low on the screen, just above the
      // horizon line.  Photo had Mercury at the extreme edge — too
      // close to the screen border to read at game scale, dropped.
      if (skyDark > 0.40) {
        const planA = Math.min(1, (skyDark - 0.40) / 0.30);
        const planets = [
          { x: 0.18, y: 0.93, col: 0xFF7A4A, r: 2.5 },   // Mars (orange)
          { x: 0.26, y: 0.94, col: 0xE8C078, r: 2.0 },   // Saturn (pale yellow)
        ];
        for (const pl of planets) {
          const px = pl.x * W - MARGIN;
          const py = pl.y * HALF_H;
          // Soft halo
          g.fillStyle(pl.col, 0.30 * planA);
          g.fillCircle(px, py, pl.r * 2.4);
          // Solid body
          g.fillStyle(pl.col, planA);
          g.fillCircle(px, py, pl.r);
        }
      }

      // Moon — painted last so it sits above the Milky Way + stars.
      g.fillStyle(0xF6F2D8, 0.30 * skyDark);
      g.fillCircle(moonX, moonArcY, 22);
      g.fillStyle(0xFFF8E0, Math.min(1, 1.2 * skyDark));
      g.fillCircle(moonX, moonArcY, 14);
      g.fillStyle(0xFFFFFF, Math.min(1, skyDark));
      g.fillCircle(moonX - 3, moonArcY - 3, 9);
    }

    // --- MOUNTAIN SILHOUETTES (parallax + Cascade-pass progression) ---
    // Geographic progression along the route — Seattle (mile 0) is flat
    // marine air, the foothills rise around mile 30, peaks crescendo at
    // Snoqualmie Pass (mile 47-50), the road threads BETWEEN them for
    // ~14 miles, then they fade as we drop into eastern WA.
    const mileProgress = (playerPos / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const lerpClamp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
    // Height multiplier — 0.5 at mile 0, 2.0 by mile 47, holds 2.5 through
    // the pass (47-64), fades to 0 by mile 70.
    let heightMul;
    if      (mileProgress < 47) heightMul = lerpClamp(0.5, 2.0, mileProgress / 47);
    else if (mileProgress < 50) heightMul = lerpClamp(2.0, 2.5, (mileProgress - 47) / 3);
    else if (mileProgress < 64) heightMul = 2.5;
    else if (mileProgress < 70) heightMul = lerpClamp(2.5, 0,   (mileProgress - 64) / 6);
    else                         heightMul = 0;
    // Pass-gap — 0 before mile 47, opens to 0.55 of the screen by mile 50,
    // holds through the parted section, closes back to 0 as the range fades.
    let passGap;
    if      (mileProgress < 47) passGap = 0;
    else if (mileProgress < 50) passGap = lerpClamp(0,    0.55, (mileProgress - 47) / 3);
    else if (mileProgress < 64) passGap = 0.55;
    else if (mileProgress < 70) passGap = lerpClamp(0.55, 0,   (mileProgress - 64) / 6);
    else                         passGap = 0;
    // Detail unlocks — staggered from mile 30 onward.
    const snowAmt   = lerpClamp(0, 1, (mileProgress - 30) / 5);   // 30 → 35
    const shadeAmt  = lerpClamp(0, 1, (mileProgress - 35) / 5);   // 35 → 40
    const outcropAmt= lerpClamp(0, 1, (mileProgress - 40) / 5);   // 40 → 45
    const vegAmt    = lerpClamp(0, 1, (mileProgress - 45) / 5);   // 45 → 50

    const mBaseY = HALF_H + 2;
    // Helper: should this peak's screen X land in the road-pass gap?
    const inGap = (mx) => {
      if (passGap <= 0) return false;
      const gapHalf = SCREEN_W * passGap * 0.5;
      return Math.abs(mx - SCREEN_W * 0.5) < gapHalf;
    };

    // Per-peak draw — base triangle plus optional snow / shade / outcrop /
    // vegetation layers.  Skips the peak entirely if it falls inside the
    // road-pass gap so the mountains visually "part" around the highway.
    const drawPeak = (mx, mw, mh, baseColor, isNear) => {
      if (heightMul <= 0) return;
      if (inGap(mx)) return;
      const top = mBaseY - mh;
      g.fillStyle(baseColor, 1);
      g.fillTriangle(mx - mw, mBaseY, mx + mw, mBaseY, mx, top);

      // Shade — darker right-flank wedge (sun from upper-left).
      if (shadeAmt > 0.02 && isNear) {
        const shadeCol = lerpColor(baseColor, 0x000000, 0.30 * shadeAmt);
        g.fillStyle(shadeCol, 1);
        g.fillTriangle(mx, top, mx + mw, mBaseY, mx, mBaseY);
      }

      // Outcrops — secondary jagged sub-peak on the left flank, suggests
      // ridgeline topography rather than a clean cone.
      if (outcropAmt > 0.02 && isNear) {
        const subH = mh * (0.55 + 0.10 * ((mx | 0) % 5) / 5);
        const subW = mw * 0.55;
        const subX = mx - mw * 0.40;
        if (!inGap(subX)) {
          g.fillStyle(baseColor, 1);
          g.fillTriangle(subX - subW, mBaseY, subX + subW, mBaseY, subX, mBaseY - subH);
          if (shadeAmt > 0.02) {
            g.fillStyle(lerpColor(baseColor, 0x000000, 0.25 * shadeAmt), 1);
            g.fillTriangle(subX, mBaseY - subH, subX + subW, mBaseY, subX, mBaseY);
          }
        }
      }

      // Snow caps — white triangle on the upper third, intensity scales.
      if (snowAmt > 0.02 && isNear) {
        const capH = mh * 0.32;
        const capW = mw * 0.32;
        g.fillStyle(0xFFFFFF, 0.85 * snowAmt);
        g.fillTriangle(mx - capW, top + capH, mx + capW, top + capH, mx, top);
        // Subtle blue-grey under-snow shadow line so the cap reads as 3D.
        g.fillStyle(0xC8D4DC, 0.55 * snowAmt);
        g.fillTriangle(mx, top + capH * 0.4, mx + capW * 0.85, top + capH, mx + capW * 0.15, top + capH);
      }

      // Vegetation — thin green stipple band along the lower 18%, gives
      // the mountain a treeline at its base instead of bare rock.
      if (vegAmt > 0.02 && isNear) {
        const treeY = mBaseY - mh * 0.18;
        const treeCol = lerpColor(baseColor, 0x1F4A24, 0.65 * vegAmt);
        g.fillStyle(treeCol, 1);
        // Wedge from base up to the tree-line, narrower than the peak.
        const tw = mw * 0.92;
        g.fillTriangle(mx - tw, mBaseY, mx + tw, mBaseY, mx, treeY);
      }
    };

    // Far range: lighter, shorter
    const farColor = lerpColor(palette.fog, palette.horizon, 0.5);
    const farShift = ((playerX * 7) % SCREEN_W + SCREEN_W * 2) % SCREEN_W;
    for (let m = 0; m < 8; m++) {
      const mx = ((m / 8) * SCREEN_W + farShift) % SCREEN_W;
      const mh = (14 + (m * 29 % 20)) * heightMul;
      const mw = 70 + (m * 37 % 55);
      drawPeak(mx,            mw, mh, farColor, false);
      if (mx + mw > SCREEN_W) drawPeak(mx - SCREEN_W, mw, mh, farColor, false);
      if (mx - mw < 0)        drawPeak(mx + SCREEN_W, mw, mh, farColor, false);
    }

    // Near range: darker, taller
    const nearColor = lerpColor(palette.horizon, 0x001100, 0.18);
    const nearShift = ((playerX * 18) % SCREEN_W + SCREEN_W * 2) % SCREEN_W;
    for (let m = 0; m < 5; m++) {
      const mx = ((m / 5) * SCREEN_W + nearShift) % SCREEN_W;
      const mh = (28 + (m * 41 % 28)) * heightMul;
      const mw = 100 + (m * 53 % 80);
      drawPeak(mx,            mw, mh, nearColor, true);
      if (mx + mw > SCREEN_W) drawPeak(mx - SCREEN_W, mw, mh, nearColor, true);
      if (mx - mw < 0)        drawPeak(mx + SCREEN_W, mw, mh, nearColor, true);
    }

    // Horizon haze band
    g.fillStyle(palette.horizon, 0.82);
    g.fillRect(-MARGIN, HALF_H - 8, W, 22);
    // Fail-safe world fill. On steep descents the projected road can drop
    // below the horizon for a few frames, leaving the cleared Graphics
    // background visible as a black band. Paint a terrain/water backing
    // from the haze line down; actual road, bridge water, sidewalks, and
    // tunnel pieces still draw over this per segment.
    const startSegIdx = Math.floor(playerPos / SEG_LENGTH) % this.segments.length;
    const startSeg = this.segments[startSegIdx];
    if (startSeg?.water || startSeg?.bridge) {
      const waterTop = HALF_H - 5;
      const waterA = startSeg.bridge ? 0x183852 : 0x2D5B82;
      const waterB = startSeg.bridge ? 0x0E273D : 0x173A58;
      const bands = 7;
      for (let b = 0; b < bands; b++) {
        const t = b / Math.max(1, bands - 1);
        const y = waterTop + Math.floor(t * (SCREEN_H - waterTop));
        const h = Math.ceil((SCREEN_H - waterTop) / bands) + 2;
        g.fillStyle(lerpColor(waterA, waterB, t), 1);
        g.fillRect(-MARGIN, y, W, h);
      }
      // Distant opposite shoreline — varied silhouette in two layers so
      // the horizon doesn't read as one flat blue bar.  Far hills behind,
      // closer warehouse / downtown building blocks in front.  Both
      // layers use deterministic pseudo-noise (sin-mix on x) so the
      // skyline stays stable across frames instead of flickering.
      //
      // The skyline ALSO parts as the player leaves Seattle (similar to
      // the Cascades pass-gap): full silhouette through the West Seattle
      // bridge crossing, growing center gap on the Murrow floating bridge
      // (looking back at the receding skyline), gone by the East Channel
      // bridge.  Implemented as `cityGap` — fraction of screen-width
      // around centre where peaks/blocks are skipped.
      const horizonY     = HALF_H - 4;
      const farHillCol   = lerpColor(palette.horizon, 0x0E273D, 0.25);
      const buildingCol  = lerpColor(palette.horizon, 0x081A2E, 0.55);
      const buildingLit  = lerpColor(buildingCol, 0xFFE9A8, 0.18);   // warm window glow tint
      const cityMile = (playerPos / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      let cityGap;
      if      (cityMile < 7)  cityGap = 0;
      else if (cityMile < 11) cityGap = (cityMile - 7) / 4;        // 0 → 1 across mile 7-11
      else                     cityGap = 1;
      const gapHalfPx = SCREEN_W * 0.5 * cityGap;
      const inCityGap = (cx) => gapHalfPx > 0 && Math.abs(cx - SCREEN_W * 0.5) < gapHalfPx;

      // Layer 1 — far hills.  Stepped silhouette of varying heights
      // forming a low, rolling ridgeline.  Step width 24 px keeps the
      // shape readable but not blocky.
      if (cityGap < 1) {
        const farStep = 24;
        g.fillStyle(farHillCol, 0.95);
        for (let x = -MARGIN; x < SCREEN_W + MARGIN; x += farStep) {
          if (inCityGap(x + farStep * 0.5)) continue;
          const n = Math.sin(x * 0.013) + Math.sin(x * 0.041 + 1.7) * 0.6
                  + Math.sin(x * 0.087 + 3.1) * 0.4;
          const h = 6 + Math.max(0, n + 1.6) * 4;          // 6–18 px tall
          g.fillRect(x, horizonY - h * 0.4, farStep + 1, h + 8);
        }
        // Layer 2 — building blocks (warehouses + downtown skyline).
        // Deterministic per-block: width and height pseudo-randomised by
        // index so the row reads as a city silhouette, not a sawtooth.
        let bx = -MARGIN;
        let blockI = 0;
        while (bx < SCREEN_W + MARGIN) {
          const r1 = Math.sin(blockI * 12.9898) * 43758.5453;
          const r2 = Math.sin(blockI * 78.233 + 1.7) * 43758.5453;
          const r3 = Math.sin(blockI * 39.346 + 4.2) * 43758.5453;
          const w = 14 + Math.floor((r1 - Math.floor(r1)) * 36);     // 14–50 px wide
          const h = 4 + Math.floor((r2 - Math.floor(r2)) * 22);      // 4–26 px tall
          const tall = (r3 - Math.floor(r3)) > 0.82;                 // ~18% are skyscrapers
          const realH = tall ? h + 10 + Math.floor((r3 - Math.floor(r3)) * 14) : h;
          if (!inCityGap(bx + w * 0.5)) {
            g.fillStyle(buildingCol, 1);
            g.fillRect(bx, horizonY - realH + 6, w, realH + 6);
            // Sparse warm window dots on tall blocks
            if (tall && realH > 14) {
              g.fillStyle(buildingLit, 0.7);
              const winRows = Math.max(1, Math.floor(realH / 6));
              for (let row = 0; row < winRows; row++) {
                if ((blockI + row) % 3 === 0) {
                  g.fillRect(bx + 2 + (row % 3) * 4, horizonY - realH + 8 + row * 5, 2, 2);
                }
              }
            }
          }
          bx += w + 2;
          blockI++;
        }
      }
      g.fillStyle(0xC8D8E0, 0.20);
      g.fillRect(-MARGIN, HALF_H + 16, W, 3);
      g.fillStyle(0xFFFFFF, 0.18);
      for (let gl = 0; gl < 9; gl++) {
        const gx = ((gl * 173 + Math.floor(playerPos / 400)) % (SCREEN_W + MARGIN * 2)) - MARGIN;
        const gy = HALF_H + 34 + (gl % 3) * 12;
        g.fillRect(gx, gy, 26 + (gl % 4) * 12, 2);
      }
    } else {
      // Extend grass past the screen bottom by MARGIN so a rotated camera
      // doesn't reveal void below the painted area.
      g.fillStyle(palette.grass2, 1);
      g.fillRect(-MARGIN, HALF_H + 10, W, SCREEN_H - HALF_H + 20 + MARGIN);
    }

    // --- PROJECT VISIBLE SEGMENTS ---
    const cameraZ = playerPos - (Math.floor(playerPos / SEG_LENGTH) * SEG_LENGTH);
    this._cameraZ = cameraZ;
    // Camera lateral tracking. When enabled (default), the camera follows
    // the player's X so the road stays centered on the player's view.
    // When disabled (debug toggle F4), the camera stays at world X=0 so
    // the player visibly slides across the road and roadside scenery
    // doesn't appear to drift in the opposite direction.
    const cameraX = (this._cameraTracksPlayer === false ? 0 : playerX) * ROAD_WIDTH;
    // Camera Y interpolates across the segment boundary instead of
    // snapping to the current segment's elevation.  Sampling discretely
    // made the road jolt by (segB.y − segA.y) every time the player
    // crossed a boundary — at speed that's many times a second, which
    // reads as a constant bumpy ride even with smoothed hills[].  The
    // fractional position within the segment (cameraZ / SEG_LENGTH)
    // weights the interp so cameraY moves continuously.
    const _segLen = this.segments.length;
    const _segA   = this.segments[startSegIdx];
    const _segB   = this.segments[(startSegIdx + 1) % _segLen];
    const _tZ     = cameraZ / SEG_LENGTH;
    const _yA     = _segA?.y ?? 0;
    const _yB     = _segB?.y ?? _yA;
    const cameraY = CAM_HEIGHT + (_yA + (_yB - _yA) * _tZ);

    let screenX     = 0;   // accumulated lateral offset (for curves)
    let screenDX    = 0;
    let maxScreenY  = 0;  // clip Y — skip segments hidden behind hills (must increase far→near)

    // ── Accumulated slope offset across the visible window ──────────
    // Pseudo-3D projection compresses elevation, so use real grade percent
    // as a camera-pitch hint.  Positive grade lifts the far road toward
    // the horizon; negative grade drops it away.  The clamp keeps long
    // mountain grades dramatic without letting a steep keyframe fold the
    // visible road into the sky.
    const UPHILL_PITCH_BOOST   = 16;
    const DOWNHILL_PITCH_BOOST = 8;
    const SLOPE_DAMP           = 0.975;
    const MAX_UPHILL_OFFSET    = 88;
    const MAX_DOWNHILL_OFFSET  = 42;

    // ── Pre-compute slope offsets, pivot around PLAYER_VIRTUAL_Z ──
    // Old behavior: slopeOffset accumulated forward from n=0, so n=0
    // (camera plane) was the stable point and far segments pitched
    // around it.  Problem: the player CAR sits visually at
    // PLAYER_VIRTUAL_Z (~15 segments ahead), not at n=0, so on a
    // downhill the road under the visual car dropped while the sprite
    // tried to chase it — reading as "floating".
    //
    // New behavior: compute the raw slope offsets in a first pass,
    // then subtract the offset value at N_PIVOT so segment N_PIVOT
    // has offset = 0.  The road UNDER the car is planted, and the
    // horizon / near-camera ribbon pitches around the player.
    const slopeRaw = new Array(DRAW_DIST);
    {
      let so = 0;
      for (let n = 0; n < DRAW_DIST; n++) {
        slopeRaw[n] = so;
        const segIdx = (startSegIdx + n) % this.segments.length;
        const seg    = this.segments[segIdx];
        const gradePct   = clamp(seg.gradePct ?? 0, -0.075, 0.075);
        const pitchBoost = gradePct >= 0 ? UPHILL_PITCH_BOOST : DOWNHILL_PITCH_BOOST;
        so = clamp(so * SLOPE_DAMP - gradePct * pitchBoost,
                   -MAX_UPHILL_OFFSET, MAX_DOWNHILL_OFFSET);
      }
    }
    const _slopeAt = (fIdx) => {
      const idxA = Math.max(0, Math.min(DRAW_DIST - 1, Math.floor(fIdx)));
      const idxB = Math.max(0, Math.min(DRAW_DIST - 1, idxA + 1));
      const t    = Math.max(0, Math.min(1, fIdx - idxA));
      return (slopeRaw[idxA] || 0) + ((slopeRaw[idxB] || slopeRaw[idxA] || 0) - (slopeRaw[idxA] || 0)) * t;
    };
    // drawn[n] is projected at relative depth n*SEG + SEG/2 - cameraZ.
    // To pivot at PLAYER_VIRTUAL_Z in camera space, convert that relative
    // Z back into the matching fractional drawn index.  The previous
    // rounded index ignored cameraZ, so the pivot slid/snap-stepped as
    // the player crossed segment boundaries.
    const pivotFIdx = (PLAYER_VIRTUAL_Z + cameraZ - SEG_LENGTH / 2) / SEG_LENGTH;
    const pivotOffset = _slopeAt(pivotFIdx);

    // We store projected data so we can draw far→near
    const drawn = [];

    for (let n = 0; n < DRAW_DIST; n++) {
      const segIdx = (startSegIdx + n) % this.segments.length;
      const seg    = this.segments[segIdx];

      // World z relative to camera
      const worldZ = n * SEG_LENGTH + SEG_LENGTH / 2;

      const p = project(
        0, seg.y, worldZ,
        cameraX, cameraY, cameraZ,
        CAM_DEPTH, SCREEN_W, SCREEN_H,
        ROAD_WIDTH * (seg.roadScale ?? 1)
      );

      if (!p || p.y < 0) continue;

      // Fog: 0 = no fog, 1 = fully fogged
      const fog = Math.min(1, Math.pow(n / DRAW_DIST, FOG_DENSITY));

      // Slope offset — relative to the pivot at PLAYER_VIRTUAL_Z so
      // the road UNDER the visual player car stays planted on slopes.
      const slopeOffset = slopeRaw[n] - pivotOffset;
      drawn.push({
        seg, n, fog,
        relZ:    worldZ - cameraZ,
        screenX: p.x + screenX,
        screenY: p.y + slopeOffset,
        screenW: p.w,
        scale:   p.scale,
        visible: false,   // flipped to true in the render pass below if
                          // this segment actually paints (not crest-clipped,
                          // not below the screen bottom).  NPC cars / sprite
                          // pickups query this via getVehicleProjection() —
                          // a relZ that lands on an invisible segment
                          // returns null so the sprite is culled.
      });

      // (slope accumulation moved to the pre-pass above the loop)
      screenX  += screenDX;
      screenDX += seg.curve;
    }

    // No pre-pass dark fill — the tunnel is now rendered entirely
    // per-segment as wall + ceiling trapezoids that hug the road's
    // perspective.  This keeps the blue sky / horizon untouched
    // outside the tunnel structure (no more "dark consuming the
    // entire skyline").
    //
    // Stash the first visible tunnel segment for the post-pass
    // entrance-arch paint — only used when the player isn't already
    // inside (drawn[0] isn't tunnel).
    let _firstTunnelDrawn = null;
    let _firstTunnelIdx   = -1;
    for (let i = 0; i < drawn.length; i++) {
      if (drawn[i].seg?.tunnel) { _firstTunnelDrawn = drawn[i]; _firstTunnelIdx = i; break; }
    }

    // Render far → near so near overwrites far
    for (let i = drawn.length - 1; i >= 0; i--) {
      const curr = drawn[i];
      const next = i > 0 ? drawn[i - 1] : curr;

      if (curr.screenY < maxScreenY) continue;
      maxScreenY = curr.screenY;

      // Skip segments whose top edge is below the screen bottom.
      // Off-screen trapezoids with huge coordinates can corrupt the WebGL pipeline.
      if (curr.screenY > SCREEN_H) continue;

      curr.visible = true;
      this._drawSegment(g, curr, next, palette, effects);
    }

    // ── Inside-tunnel ceiling cover ───────────────────────────────────
    // When in a tunnel, sky bands bleed through above the per-segment
    // ceiling trapezoids.  Paint a "sheet" from the top of the screen
    // down to the FARTHEST visible tunnel segment's ceiling line — that
    // leaves the bright daylight at the tunnel EXIT (any non-tunnel
    // segments past the last tunnel one) visible, while still hiding the
    // sky bleed in the seams between ceilings.
    //
    // Cover ONLY when the camera is genuinely inside a tunnel segment —
    // not approaching (the embankment hill already frames the mouth) and
    // not just-exited (the open road should be fully visible).  This
    // tighter trigger prevents the cover from bleeding over the road on
    // either side of the actual tunnel run.
    const segLen = this.segments.length;
    const _camIdx = ((Math.floor(playerPos / SEG_LENGTH)) % segLen + segLen) % segLen;
    const inTunnel = !!this.segments[_camIdx]?.tunnel;
    if (inTunnel) {
      // Find the FARTHEST visible tunnel segment.  Its ceiling line
      // marks the bottom of the sky-cover sheet — anything below that
      // (the tunnel exit / open road past it) shows through.
      let farthestTunnel = null;
      for (let k = 0; k < drawn.length; k++) {
        const d = drawn[k];
        if (d?.seg?.tunnel && d.screenY >= 0 && d.screenY <= SCREEN_H) {
          farthestTunnel = d;
        }
      }
      if (farthestTunnel) {
        const H_CEIL    = 4500;
        const ceilDrop  = farthestTunnel.scale * H_CEIL * SCREEN_H / 2;
        const coverBotY = Math.max(0, farthestTunnel.screenY - ceilDrop);
        if (coverBotY > -MARGIN) {
          g.fillStyle(0x6B665B, 1);
          g.fillRect(-MARGIN, -MARGIN, W, coverBotY + MARGIN);
        }
      }
    }

    // ── Tunnel entrance: hillside silhouette + portal arch ────────────
    // The tunnel is cut INTO a hill, so what the player sees on the
    // horizon is a SLOPED hillside with the tunnel mouth as a notch in
    // its base.  The hill is drawn as one concave polygon: peak above
    // the mouth, flanks dropping diagonally to ground level on each
    // side, with a rectangular cutout for the mouth opening.
    //
    // Crucially we look BEYOND DRAW_DIST for the next tunnel segment so
    // the hill grows naturally on the horizon as the player approaches,
    // rather than blinking in at full size when the tunnel road becomes
    // visible.
    let _embTunnelProj = null;
    // Only render the embankment hill when the tunnel mouth is at least
    // a few segments out — otherwise its base (anchored to the mouth's
    // projected road-Y) ends up near the bottom of the screen and the
    // hill polygon paints over the road in front of the player.  At a
    // distance of ~30 segs the hill silhouette sits cleanly above the
    // horizon and frames the approach.
    const EMB_MIN_DIST = 30;
    if (_firstTunnelDrawn && _firstTunnelIdx >= EMB_MIN_DIST) {
      _embTunnelProj = _firstTunnelDrawn;
    } else if (!_firstTunnelDrawn) {
      // Continue the curve accumulator past the draw loop so the
      // far-out projection inherits the right lateral offset.
      const EXTRA_PEEK = 600;
      let pSx  = screenX;
      let pSdx = screenDX;
      for (let n = DRAW_DIST; n < DRAW_DIST + EXTRA_PEEK; n++) {
        const segIdx = (startSegIdx + n) % this.segments.length;
        const s = this.segments[segIdx];
        if (!s) break;
        if (s.tunnel) {
          const worldZ = n * SEG_LENGTH + SEG_LENGTH / 2;
          const p = project(
            0, s.y, worldZ,
            cameraX, cameraY, cameraZ,
            CAM_DEPTH, SCREEN_W, SCREEN_H,
            ROAD_WIDTH * (s.roadScale ?? 1)
          );
          if (p) {
            _embTunnelProj = {
              seg: s, n, scale: p.scale,
              screenX: p.x + pSx,
              screenY: p.y,
              screenW: p.w,
            };
          }
          break;
        }
        pSx  += pSdx;
        pSdx += s.curve ?? 0;
      }
    }

    // Facade drawing MOVED into _drawTunnelFacade(), invoked from
    // renderTunnelOverlay() so it paints on tunnelGfx (depth 9.82) AFTER
    // scene sprites — that way buildings geographically behind the tunnel
    // can't bleed through the concrete face.  Store the projection so
    // the overlay pass can read it without re-walking the segments.
    this._embTunnelProj = _embTunnelProj;
    // Also publish the first-visible-tunnel segment N so the scenery
    // renderer can cull buildings whose segments sit past the mouth.
    this._firstTunnelN = _firstTunnelIdx >= 0
      ? _firstTunnelIdx
      : (_embTunnelProj?.n ?? -1);

    // Render sprites FAR → NEAR so close-up buildings paint over distant ones
    // (drawn[] is built near→far, so iterate backwards). Without this,
    // distant skyscrapers showed THROUGH closer houses.
    for (let i = drawn.length - 1; i >= 0; i--) {
      this._drawSprites(g, drawn[i]);
    }

    // Stash for vehicle-projection lookup (GameScene needs the curve-accumulated
    // screenX so traffic stays in its lane through bends).
    this._drawn = drawn;

    // ── Build boundary surface cache (no new allocations) ─────────
    // surfaceSamples[n] is the projected road position at the boundary
    // between segment n-1 and n (worldZ = n * SEG_LENGTH).  Players,
    // NPCs, shoulder polylines and shadows all read from this single
    // canonical source so road graphics and entities stay in sync.
    {
      const slopeBnd = this._slopeBnd;
      let so = 0;
      slopeBnd[0] = 0;
      for (let n = 0; n < DRAW_DIST; n++) {
        const segIdx = ((startSegIdx + n) % this.segments.length + this.segments.length) % this.segments.length;
        const seg = this.segments[segIdx];
        const gradePct   = clamp(seg.gradePct ?? 0, -0.075, 0.075);
        const pitchBoost = gradePct >= 0 ? UPHILL_PITCH_BOOST : DOWNHILL_PITCH_BOOST;
        so = clamp(so * SLOPE_DAMP - gradePct * pitchBoost,
                   -MAX_UPHILL_OFFSET, MAX_DOWNHILL_OFFSET);
        slopeBnd[n + 1] = so;
      }
      const _slopeBndAt = (fIdx) => {
        const idxA = Math.max(0, Math.min(DRAW_DIST, Math.floor(fIdx)));
        const idxB = Math.max(0, Math.min(DRAW_DIST, idxA + 1));
        const t    = Math.max(0, Math.min(1, fIdx - idxA));
        return (slopeBnd[idxA] || 0) + ((slopeBnd[idxB] || slopeBnd[idxA] || 0) - (slopeBnd[idxA] || 0)) * t;
      };
      // Boundary n is projected at camera-space depth n*SEG - cameraZ.
      // Convert PLAYER_VIRTUAL_Z into the corresponding fractional
      // boundary index so the pitch pivot is continuous within segments.
      const pivOff_B = _slopeBndAt((PLAYER_VIRTUAL_Z + cameraZ) / SEG_LENGTH);

      const samples = this._surfaceSamples;
      let bsx = 0, bsdx = 0;
      for (let n = 0; n <= DRAW_DIST; n++) {
        const segIdx = ((startSegIdx + Math.min(n, DRAW_DIST - 1)) % this.segments.length + this.segments.length) % this.segments.length;
        const seg = this.segments[segIdx];
        const worldZ = n * SEG_LENGTH;
        const cz = worldZ - cameraZ;
        const s = samples[n];
        if (cz <= 0) {
          // At/behind camera plane — mark invalid.  Boundary 0 typically
          // lands here right after a position update.
          s.valid = false;
        } else {
          const scale = CAM_DEPTH / cz;
          const projX = (SCREEN_W / 2) + scale * (0 - cameraX) * SCREEN_W / 2;
          const projY = (SCREEN_H / 2) - scale * (seg.y - cameraY) * SCREEN_H / 2;
          const projW = scale * (ROAD_WIDTH * (seg.roadScale ?? 1)) * SCREEN_W / 2;
          s.worldZ  = worldZ;
          s.screenX = projX + bsx;
          s.screenY = projY + (slopeBnd[n] - pivOff_B);
          s.screenW = projW;
          s.scale   = scale;
          s.valid   = true;
        }
        if (n < DRAW_DIST) {
          bsx  += bsdx;
          bsdx += seg.curve ?? 0;
        }
      }
      // Visibility: cross-index drawn[] by .n once, then mark each
      // boundary visible if either adjacent segment painted.
      const dByN = this._drawnByN;
      for (let i = 0; i < DRAW_DIST; i++) dByN[i] = null;
      for (let i = 0; i < drawn.length; i++) {
        const d = drawn[i];
        if (d && d.n >= 0 && d.n < DRAW_DIST) dByN[d.n] = d;
      }
      for (let n = 0; n <= DRAW_DIST; n++) {
        const s = samples[n];
        if (!s.valid) { s.visible = false; continue; }
        const left  = n > 0         ? dByN[n - 1] : null;
        const right = n < DRAW_DIST ? dByN[n]     : null;
        s.visible = !!(left?.visible || right?.visible);
      }
    }

    // ── Continuous shoulder ribbons (one polygon per side) ──────────
    // Draw AFTER rebuilding _surfaceSamples, otherwise the side lines use
    // the previous frame's road surface and visibly lag/jitter.
    this._drawShoulderRibbons(g);

    // Double-vision ghost pass (alcohol effect).  Pass the lateral
    // offset as a parameter instead of cloning the drawn[] entries —
    // the old `{ ...curr, screenX: curr.screenX + offset }` allocated
    // 200-350 short-lived objects per frame at 60fps when drunk.
    if (ghostG && effects && effects.doubleVision > 0.01) {
      const offset = toInt(effects.doubleVision * 38);
      ghostG.clear();
      ghostG.setAlpha(effects.doubleVision * 0.62);
      for (let i = drawn.length - 1; i >= 0; i--) {
        const curr = drawn[i];
        const next = i > 0 ? drawn[i - 1] : curr;
        this._drawSegment(ghostG, curr, next, palette, effects, offset);
      }
      // Include sprites in the ghost so trees/buildings also double-vision.
      // isGhost=true → signs are skipped (rendered by GameScene separately).
      for (let i = drawn.length - 1; i >= 0; i--) {
        this._drawSprites(ghostG, drawn[i], true, offset);
      }
    } else if (ghostG) {
      ghostG.clear();
    }
  }

  renderTunnelOverlay(g) {
    if (!g) return;
    g.clear();
    const drawn = this._drawn;
    if (!drawn?.length) return;
    const segLen = this.segments.length;
    const playerPos = this._playerPos ?? 0;
    const camIdx = ((Math.floor(playerPos / SEG_LENGTH)) % segLen + segLen) % segLen;
    const inTunnel = !!this.segments[camIdx]?.tunnel;
    if (inTunnel) {
      let farthestTunnel = null;
      for (let k = 0; k < drawn.length; k++) {
        const d = drawn[k];
        if (d?.seg?.tunnel && d.screenY >= 0 && d.screenY <= SCREEN_H) {
          farthestTunnel = d;
        }
      }
      if (farthestTunnel) {
        const H_CEIL = 4500;
        const ceilDrop = farthestTunnel.scale * H_CEIL * SCREEN_H / 2;
        const coverBotY = Math.max(0, farthestTunnel.screenY - ceilDrop);
        if (coverBotY > -150) {
          g.fillStyle(0x6B665B, 1);
          g.fillRect(-150, -150, SCREEN_W + 300, coverBotY + 150);
        }
      }
    }
    for (let i = drawn.length - 1; i >= 0; i--) {
      const curr = drawn[i];
      if (!curr?.seg?.tunnel) continue;
      const next = i > 0 ? drawn[i - 1] : curr;
      this._drawTunnelShell(g, curr, next);
    }
  }

  /**
   * Tunnel entrance facade — invoked from GameScene._renderFrame() on
   * its own graphics layer (tunnelFacadeGfx).  Sets the layer's depth
   * DYNAMICALLY each frame so the facade slots into the same depth
   * band a scene sprite at the tunnel's distance would occupy:
   *   • sprites CLOSER than the tunnel (higher depth) render OVER the
   *     facade → correct perspective for houses in front of the tunnel
   *   • sprites AT or PAST the tunnel (≤ same depth) render UNDER the
   *     facade → correctly occluded
   *   • past-tunnel buildings are also culled in _renderSceneSprites
   * Skipped while the camera is inside the tunnel.
   */
  renderTunnelFacade(g) {
    // Mouth rect cleared by default; set by _drawTunnelFacade when
    // the facade is actually drawn (camera outside tunnel + valid
    // embankment projection + mouth resolvable at this distance).
    this._tunnelMouthRect = null;
    if (!g) return;
    g.clear();
    const segLen = this.segments.length;
    const playerPos = this._playerPos ?? 0;
    const camIdx = ((Math.floor(playerPos / SEG_LENGTH)) % segLen + segLen) % segLen;
    const inTunnel = !!this.segments[camIdx]?.tunnel;
    if (inTunnel) return;
    const e = this._embTunnelProj;
    if (!e) return;
    // Match scenery depth formula at the tunnel's distance, then nudge
    // down by 0.05 so any sprite AT exact tunnel distance still wins.
    // Formula mirrors _renderSceneSprites: depth = 9.5 - min(1, relZ/76000) * 2.5.
    const tunnelRelZ = (e.n ?? DRAW_DIST) * SEG_LENGTH;
    const sceneDepthAtTunnel = 9.5 - Math.max(0, Math.min(1, tunnelRelZ / 76000)) * 2.5;
    g.setDepth(sceneDepthAtTunnel - 0.05);
    this._drawTunnelFacade(g);
  }

  /**
   * Tunnel entrance facade — the hillside silhouette + portal mouth.
   *
   * Drawn as TWO explicit opaque pieces (left flank + right flank) that
   * meet along the vertical centerline above the mouth.  This is
   * deterministic occlusion: no concave polygons, no cutout edge cases.
   * The mouth opening is simply the rectangular area between the two
   * pieces, below the lintel — left undrawn so the tunnel interior
   * (drawn by _drawTunnelShell) shows through.
   *
   *      ┌─────crest─────┐
   *     /│               │\
   *    / │   LEFT  RIGHT │ \
   *   /  │   FLANK FLANK │  \
   *  /   │               │   \
   *  ──lintel─┐       ┌──lintel──
   *          │  mouth │
   *          │ (open) │
   *  ────────┴────────┴──────── ground
   *
   * The two flanks share the edge (centerX, crestY) → (centerX, lintelY)
   * so the area ABOVE the mouth (between lintel and crest) is filled by
   * the union of both pieces.  Below the lintel, the pieces step LEFT
   * and RIGHT to the mouth jambs and down to ground — leaving the mouth
   * opening empty.
   */
  _drawTunnelFacade(g) {
    const e = this._embTunnelProj;
    if (!e) return;

    const w2 = e.screenW;
    const x2 = e.screenX;
    const segLanes = e.seg?.lanes ?? 4;
    const rw2    = rumbleW(w2, segLanes);
    const wallW2 = w2 * 0.95;
    const outerL = x2 - w2 - rw2 - wallW2;
    const outerR = x2 + w2 + rw2 + wallW2;

    const sH = e.scale * SCREEN_H / 2;
    const sW = e.scale * SCREEN_W / 2;

    // Lintel + hill geometry, all in world units so they scale with
    // perspective.  W_FLANK restored to 337500 per user request to
    // undo the temporary 30000 narrowing.  H_HILL = 2× original 12500
    // (tall hill); H_CEIL kept at original (mouth height).
    const H_CEIL  = 4500;
    const H_HILL  = 25000;
    const W_FLANK = 337500;

    const ceilDrop = H_CEIL * sH;
    const archTopY = e.screenY - ceilDrop;
    const archThk  = Math.max(3, ceilDrop * 0.42);
    const lintelY  = archTopY - archThk;
    const crestY   = e.screenY - H_HILL * sH;
    // Hill base = tunnel's projected road Y.  Previously this was
    // clamped to SCREEN_H * 0.55 (mid-screen) "to keep the polygon
    // from painting over the asphalt" — but that left a visible GAP
    // between the hill's bottom edge and the actual tunnel-road
    // surface on screen, through which the player could see the
    // tunnel interior / horizon / scenery that the front wall is
    // supposed to occlude.  The polygon doesn't actually overlap the
    // foreground road because the foreground road sits BELOW e.screenY
    // in screen space (closer to the bottom), while the hill polygon
    // sits ABOVE e.screenY (its upper bound is crestY).
    const groundY  = e.screenY;
    const flankX   = W_FLANK * sW;
    const baseLeftX  = outerL - flankX;
    const baseRightX = outerR + flankX;
    const centerX    = (outerL + outerR) / 2;
    const dropY      = groundY - crestY;

    const peekFog = clamp(e.n / DRAW_DIST, 0, 4);
    const baseAlpha = 1;
    const rimAlpha  = clamp(1 - Math.pow(peekFog * 0.45, 1.4), 0.30, 1);

    const cutMouth = (groundY - lintelY) > 4 && (outerR - outerL) > 6;

    // Publish the tunnel-mouth screen rectangle so GameScene can:
    //   (a) mask the tunnel interior (tunnelGfx) to ONLY render
    //       inside the mouth opening — interior can't bleed past
    //       the facade anymore
    //   (b) cull scene sprites whose screen bounding box overlaps
    //       the mouth (their transparent PNG padding would otherwise
    //       let the masked interior peek through)
    if (cutMouth) {
      this._tunnelMouthRect = {
        x: outerL,
        y: lintelY,
        w: outerR - outerL,
        h: groundY - lintelY,
      };
    } else {
      this._tunnelMouthRect = null;
    }

    // ── Left flank polygon ────────────────────────────────────────────
    // Traced clockwise from base-left up the left silhouette to the
    // peak, then DOWN along the centerline to lintel level, then LEFT
    // along the lintel to the left jamb, then DOWN to ground and back
    // along the ground to base.  When cutMouth is false (far away,
    // mouth not resolvable), the polygon simply closes at (centerX,
    // groundY) — no mouth notch.
    const leftPiece = cutMouth ? [
      { x: baseLeftX,                    y: groundY },
      { x: baseLeftX + flankX * 0.30,    y: groundY - dropY * 0.28 },
      { x: baseLeftX + flankX * 0.62,    y: groundY - dropY * 0.62 },
      { x: baseLeftX + flankX * 0.88,    y: groundY - dropY * 0.92 },
      { x: centerX,                      y: crestY },
      { x: centerX,                      y: lintelY },
      { x: outerL,                       y: lintelY },
      { x: outerL,                       y: groundY },
    ] : [
      { x: baseLeftX,                    y: groundY },
      { x: baseLeftX + flankX * 0.30,    y: groundY - dropY * 0.28 },
      { x: baseLeftX + flankX * 0.62,    y: groundY - dropY * 0.62 },
      { x: baseLeftX + flankX * 0.88,    y: groundY - dropY * 0.92 },
      { x: centerX,                      y: crestY },
      { x: centerX,                      y: groundY },
    ];

    // ── Right flank polygon (mirror) ──────────────────────────────────
    const rightPiece = cutMouth ? [
      { x: centerX,                      y: crestY },
      { x: baseRightX - flankX * 0.88,   y: groundY - dropY * 0.92 },
      { x: baseRightX - flankX * 0.62,   y: groundY - dropY * 0.62 },
      { x: baseRightX - flankX * 0.30,   y: groundY - dropY * 0.28 },
      { x: baseRightX,                   y: groundY },
      { x: outerR,                       y: groundY },
      { x: outerR,                       y: lintelY },
      { x: centerX,                      y: lintelY },
    ] : [
      { x: centerX,                      y: crestY },
      { x: baseRightX - flankX * 0.88,   y: groundY - dropY * 0.92 },
      { x: baseRightX - flankX * 0.62,   y: groundY - dropY * 0.62 },
      { x: baseRightX - flankX * 0.30,   y: groundY - dropY * 0.28 },
      { x: baseRightX,                   y: groundY },
      { x: centerX,                      y: groundY },
    ];

    // Concrete face — both pieces solid-fill, no overlap issues since
    // they share only the centerline edge.
    g.fillStyle(0xB7B0A0, baseAlpha);
    g.fillPoints(leftPiece, true);
    g.fillPoints(rightPiece, true);

    // Subtle vertical shading band on the LEFT slope for depth.
    if (sH > 0.05) {
      g.fillStyle(0x9F988A, 0.35);
      g.fillPoints([
        leftPiece[0], leftPiece[1], leftPiece[2], leftPiece[3], leftPiece[4],
        { x: centerX, y: crestY + dropY * 0.04 },
      ], true);
    }

    // Lighter rim band along the upper silhouette — a thin highlight
    // strip hugging the top edge.  Built from the OUTER silhouette of
    // both pieces (base-left → peak → base-right) so the rim wraps
    // continuously across the structure.
    if (sH > 0.02) {
      const rimDrop = Math.max(2, dropY * 0.035);
      const upper = [
        { x: baseLeftX,                  y: groundY },
        { x: baseLeftX + flankX * 0.30,  y: groundY - dropY * 0.28 },
        { x: baseLeftX + flankX * 0.62,  y: groundY - dropY * 0.62 },
        { x: baseLeftX + flankX * 0.88,  y: groundY - dropY * 0.92 },
        { x: centerX,                    y: crestY },
        { x: baseRightX - flankX * 0.88, y: groundY - dropY * 0.92 },
        { x: baseRightX - flankX * 0.62, y: groundY - dropY * 0.62 },
        { x: baseRightX - flankX * 0.30, y: groundY - dropY * 0.28 },
        { x: baseRightX,                 y: groundY },
      ];
      const rimBand = [
        ...upper,
        ...upper.slice().reverse().map(p => ({ x: p.x, y: p.y + rimDrop })),
      ];
      g.fillStyle(0xCFC9B6, rimAlpha);
      g.fillPoints(rimBand, true);
    }

    // Concrete lintel beam above the mouth — only when mouth is sized.
    if (cutMouth && archThk > 1) {
      const archW = outerR - outerL;
      const lintelL = outerL - archThk * 0.4;
      const lintelW = archW + archThk * 0.8;
      // Concrete face of the lintel.
      g.fillStyle(0xC4BFA8, 1);
      g.fillRect(lintelL, archTopY - archThk, lintelW, archThk);
      // Lighter rim band along the lintel TOP — same colour as the
      // hillside crest rim, so the silhouette reads as a single
      // continuous edge wrapping across the whole structure.
      g.fillStyle(0xCFC9B6, rimAlpha);
      g.fillRect(lintelL, archTopY - archThk,
                 lintelW, Math.max(1, archThk * 0.22));
      // Soft shadow under the lintel.
      g.fillStyle(0x000000, 0.35);
      g.fillRect(outerL, archTopY,
                 archW, Math.max(1, archThk * 0.30));
      // Dark stroke on jamb edges + lintel underside so the mouth reads
      // as a hole cut into the concrete face.
      const stroke = Math.max(1.2, archThk * 0.10);
      g.fillStyle(0x4A453B, 1);
      // Left jamb interior edge
      g.fillRect(outerL - stroke * 0.5, archTopY,
                 stroke, Math.max(0, groundY - archTopY));
      // Right jamb interior edge
      g.fillRect(outerR - stroke * 0.5, archTopY,
                 stroke, Math.max(0, groundY - archTopY));
      // Lintel underside (top of the mouth opening)
      g.fillRect(outerL - stroke * 0.5, archTopY - stroke * 0.3,
                 archW + stroke, stroke);
    }
  }

  /**
   * Sign overlay — drawn per-sign into a pool of Graphics objects so
   * each sign can have its OWN depth matching its world distance.
   * That way a close house/tree naturally occludes a distant sign,
   * instead of all signs being batched into one always-on-top layer.
   *
   * @param {Phaser.GameObjects.Graphics[]} pool - pre-allocated pool;
   *   each visible sign claims one slot.  Unused slots are hidden.
   */
  renderSignOverlay(pool) {
    if (!Array.isArray(pool) || pool.length === 0) return;
    const drawn = this._drawn;
    let used = 0;
    if (!drawn?.length) {
      for (let i = 0; i < pool.length; i++) pool[i].clear().setVisible(false);
      return;
    }
    // Iterate FAR → NEAR so the pool's draw order matches scene
    // sprites (close signs claim later pool slots = drawn last within
    // same-depth batches).  Depth is set per-slot below.
    for (let i = drawn.length - 1; i >= 0 && used < pool.length; i--) {
      const d = drawn[i];
      const seg = d?.seg;
      if (!seg?.sprites?.length) continue;
      const screenX = d.screenX;
      const spriteScale = d.scale * SCREEN_W / 2;
      // `n` is the segment offset from camera for this drawn entry.
      // Stored on d by render() — falls back to index reconstruction
      // if missing (older snapshots).
      const n = d.n ?? (drawn.length - 1 - i);
      const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
      // Mirror the scene-sprite depth ramp so signs land in the
      // same band as the buildings/trees that should occlude them.
      // Add +0.10 so when a sign and a scene sprite share the same
      // world distance, the sign sits slightly above (signs are
      // meant to be readable; tied scenery shouldn't beat them).
      const signDepth = (9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5) + 0.10;
      for (const sp of seg.sprites) {
        if (used >= pool.length) break;
        if (sp.collected) continue;
        if (sp.type !== 'mileage_sign'
         && sp.type !== 'exit_sign_green'
         && sp.type !== 'amenities_sign'
         && sp.type !== 'next_stops_sign'
         && sp.type !== 'rest_sign'
         && sp.type !== 'grade_sign'
         && sp.type !== 'sign') continue;
        const spriteX = toInt(screenX + d.screenW * sp.offset);
        const spriteH = toInt(sp.baseH * spriteScale * 0.5);
        const spriteW = toInt(sp.baseW * spriteScale * 0.5);
        if (spriteH < 1) continue;
        const g = pool[used++];
        g.clear();
        g.setDepth(signDepth).setVisible(true);
        this._drawSpriteShape(g, sp.type, spriteX, d.screenY - spriteH, spriteW, spriteH, sp.collected, sp);
      }
    }
    for (let i = used; i < pool.length; i++) {
      pool[i].clear().setVisible(false);
    }
  }

  _drawTunnelShell(g, curr, next, xOffset = 0) {
    const { screenW: w2, seg } = curr;
    const { screenW: w1 } = next;
    const x2 = curr.screenX + xOffset;
    const x1 = next.screenX + xOffset;
    const fy = Math.floor(curr.screenY) - 1;
    const ny = next ? Math.ceil(next.screenY) + 1 : Math.ceil(curr.screenY) + 5;
    const segH = Math.max(1, ny - fy);
    const segLanes = seg.lanes ?? LANES;
    const rw1 = rumbleW(w1, segLanes);
    const rw2 = rumbleW(w2, segLanes);

    const shoulder1 = Math.max(rw1 * 1.35, w1 * 0.10);
    const shoulder2 = Math.max(rw2 * 1.35, w2 * 0.10);
    const wallW1 = w1 * 0.78;
    const wallW2 = w2 * 0.78;
    const roadFar_L  = x2 - w2 - rw2;
    const roadFar_R  = x2 + w2 + rw2;
    const roadNear_L = x1 - w1 - rw1;
    const roadNear_R = x1 + w1 + rw1;
    const inFar_L   = roadFar_L - shoulder2;
    const inFar_R   = roadFar_R + shoulder2;
    const inNear_L  = roadNear_L - shoulder1;
    const inNear_R  = roadNear_R + shoulder1;
    const outFar_L  = inFar_L - wallW2;
    const outFar_R  = inFar_R + wallW2;
    const outNear_L = inNear_L - wallW1;
    const outNear_R = inNear_R + wallW1;

    const H_CEIL       = 4500;
    const ceilDropFar  = curr.scale * H_CEIL * SCREEN_H / 2;
    const ceilDropNear = next.scale * H_CEIL * SCREEN_H / 2;
    const ceilFy       = Math.max(0, fy - ceilDropFar);
    const ceilNy       = Math.max(0, ny - ceilDropNear);

    fillTrap(g, 0xA8A498,
      outFar_L,  ceilFy, outFar_R,  ceilFy,
      outNear_R, ceilNy, outNear_L, ceilNy);

    fillTrap(g, 0xB5B0A0,
      outFar_L,  ceilFy, inFar_L,   fy,
      inNear_L,  ny,     outNear_L, ny);
    fillTrap(g, 0xB5B0A0,
      inFar_R,   fy,     outFar_R,  ceilFy,
      outNear_R, ny,     inNear_R,  ny);

    fillTrap(g, 0x8F8A7D,
      roadFar_L,  fy, inFar_L,  fy,
      inNear_L,   ny, roadNear_L, ny);
    fillTrap(g, 0x8F8A7D,
      inFar_R,    fy, roadFar_R, fy,
      roadNear_R, ny, inNear_R,  ny);

    const shadowFy = fy + segH * 0.70;
    fillTrap(g, 0x6E6660,
      inFar_L - wallW2 * 0.35, shadowFy, inFar_L, shadowFy,
      inNear_L, ny, inNear_L - wallW1 * 0.35, ny);
    fillTrap(g, 0x6E6660,
      inFar_R, shadowFy, inFar_R + wallW2 * 0.35, shadowFy,
      inNear_R + wallW1 * 0.35, ny, inNear_R, ny);

    const curbW1 = Math.max(2, rw1 * 0.6);
    const curbW2 = Math.max(2, rw2 * 0.6);
    fillTrap(g, 0xD8D4C0,
      inFar_L - curbW2, ny - Math.max(1, segH * 0.20),
      inFar_L,          ny - Math.max(1, segH * 0.20),
      inNear_L,         ny,
      inNear_L - curbW1, ny);
    fillTrap(g, 0xD8D4C0,
      inFar_R, ny - Math.max(1, segH * 0.20),
      inFar_R + curbW2, ny - Math.max(1, segH * 0.20),
      inNear_R + curbW1, ny,
      inNear_R, ny);

    if ((seg.index % 3) === 0) {
      const lightLenFar  = Math.max(2, wallW2 * 0.55);
      const lightLenNear = Math.max(2, wallW1 * 0.55);
      const lightThk     = Math.max(2, segH * 0.5);
      fillTrap(g, 0xFFD060,
        inFar_L - lightLenFar,   ceilFy,
        inFar_L,                 ceilFy,
        inNear_L,                ceilNy + lightThk,
        inNear_L - lightLenNear, ceilNy + lightThk);
      fillTrap(g, 0xFFD060,
        inFar_R,                 ceilFy,
        inFar_R + lightLenFar,   ceilFy,
        inNear_R + lightLenNear, ceilNy + lightThk,
        inNear_R,                ceilNy + lightThk);
    }
  }

  /** Two continuous white shoulder ribbons — the LEFT and RIGHT
   *  polylines that define the road's edges across all visible
   *  boundaries.  Everything between these lines is the playable road;
   *  cars / sprites / NPCs Y-position from the same _surfaceSamples
   *  cache so they stay glued to whichever segment they're over.
   *
   *  Drawn via beginPath / lineTo / fillPath instead of fillPoints to
   *  avoid the {x,y} object allocations that produced the prior GC
   *  stalls. */
  _drawShoulderRibbons(g) {
    const samples = this._surfaceSamples;
    if (!samples) return;
    const SHOULDER_RATIO = 0.016;

    // Quick visibility count — bail if fewer than 2 boundaries paint.
    let visCount = 0;
    for (let n = 0; n <= DRAW_DIST; n++) {
      const s = samples[n];
      if (s.valid && s.visible !== false) visCount++;
      if (visCount >= 2) break;
    }
    if (visCount < 2) return;

    g.fillStyle(0xFFFFFF, 1);

    // ── LEFT ribbon ──────────────────────────────────────────────
    g.beginPath();
    let first = true;
    // Outer edge: far → near along x = screenX - screenW
    for (let n = DRAW_DIST; n >= 0; n--) {
      const s = samples[n];
      if (!s.valid || s.visible === false) continue;
      if (first) { g.moveTo(s.screenX - s.screenW, s.screenY); first = false; }
      else       { g.lineTo(s.screenX - s.screenW, s.screenY); }
    }
    // Inner edge: near → far along x = screenX - screenW + sw
    for (let n = 0; n <= DRAW_DIST; n++) {
      const s = samples[n];
      if (!s.valid || s.visible === false) continue;
      const sw = Math.max(0.8, s.screenW * SHOULDER_RATIO);
      g.lineTo(s.screenX - s.screenW + sw, s.screenY);
    }
    g.closePath();
    g.fillPath();

    // ── RIGHT ribbon ─────────────────────────────────────────────
    g.beginPath();
    first = true;
    // Outer edge: far → near along x = screenX + screenW (going DOWN
    // the right side, mirrored from the left)
    for (let n = DRAW_DIST; n >= 0; n--) {
      const s = samples[n];
      if (!s.valid || s.visible === false) continue;
      if (first) { g.moveTo(s.screenX + s.screenW, s.screenY); first = false; }
      else       { g.lineTo(s.screenX + s.screenW, s.screenY); }
    }
    // Inner edge: near → far along x = screenX + screenW - sw
    for (let n = 0; n <= DRAW_DIST; n++) {
      const s = samples[n];
      if (!s.valid || s.visible === false) continue;
      const sw = Math.max(0.8, s.screenW * SHOULDER_RATIO);
      g.lineTo(s.screenX + s.screenW - sw, s.screenY);
    }
    g.closePath();
    g.fillPath();
  }

  _drawSegment(g, curr, next, palette, effects, xOffset = 0) {
    // xOffset is added to the segment's screenX so the alcohol-ghost
    // pass can request a laterally-offset draw without cloning curr/next.
    const { screenY: y2, screenW: w2, seg, fog } = curr;
    const { screenY: y1, screenW: w1 } = next; // "next" is one closer (lower y)
    const x2 = curr.screenX + xOffset;
    const x1 = next.screenX + xOffset;

    // For our loop (far→near), curr is further and next is closer.
    // But after reversing, curr.screenY < next.screenY (curr is higher on screen)
    // Re-label for clarity.  Float-precision edges with ±1 px overshoot
    // for hairline-gap insurance — Phaser's Graphics fill takes floats
    // and the GPU AA blends sub-pixel boundaries cleanly.
    const fy = curr.screenY - 1;
    const ny = next ? next.screenY + 1 : curr.screenY + 5;
    const segH = Math.max(1, ny - fy);

    const stripe   = Math.floor(seg.index / RUMBLE_SEGS) % 2;
    // Single grass shade — lighter of the two — so the roadside reads as
    // a continuous field instead of striped bands (matches the road's
    // single-tone treatment).
    let grass    = palette.grass1;
    let road     = stripe ? palette.road1   : palette.road2;
    let rumble   = stripe ? palette.rumble1 : palette.rumble2;
    let laneCol  = palette.lane;
    // Lane dashes use a real-road ratio (short paint, long gap) so each
    // dash reads as a discrete stripe at perspective distance rather
    // than stacking into a vertical column of cream blocks.  Paint when
    // the segment lands inside the LANE_DASH_LEN window of the cycle.
    const dashCycle = LANE_DASH_LEN + LANE_DASH_GAP;
    let   dashOn    = (seg.index % dashCycle) < LANE_DASH_LEN;
    // ── Snow blanket: dissolve the road / rumble / grass toward white
    // and suppress lane markings entirely.  Intensity ramps with the
    // weather envelope so the transition into / out of the snow zone is
    // smooth instead of a hard color flip.
    const segMile = (seg.index / this.segments.length) * TOTAL_ROUTE_MILES;
    if (Weather.isSnow(segMile)) {
      const snowI = Weather.intensity(segMile);
      grass    = lerpColor(grass,    0xE6E8EC, snowI * 0.85);
      road     = lerpColor(road,     0xE0E2E0, snowI * 0.80);
      rumble   = lerpColor(rumble,   0xC8CACC, snowI * 0.80);
      laneCol  = lerpColor(laneCol,  road,     snowI);   // lanes vanish into road
      if (snowI > 0.7) dashOn = false;                   // no lane paint visible
    }
    const segLanes = seg.lanes ?? LANES;

    const rw1 = rumbleW(w1, segLanes);
    const rw2 = rumbleW(w2, segLanes);
    const lw1 = laneW(w1, segLanes);
    const lw2 = laneW(w2, segLanes);

    // Grass — full-width regular grass for all segments, including
    // tunnel.  The tunnel structure (walls + ceiling) paints on top of
    // this, bounded to the road's screen-area, so the sky and grass
    // outside the tunnel structure stay visible.
    // For LAND segments (no water/bridge overpaint coming), enforce a
    // generous minimum slice height so distant land doesn't render as
    // a 1-2 px sliver that gets visually dominated by foreground
    // bridge/water.  This acts as a "shoreline apron" at bridge→land
    // transitions: when the player is on a bridge looking at the
    // upcoming island, the dry segments past the bridge end project
    // as thin horizon bands.  Extending those bands DOWN (toward
    // larger screen Y) by 60 px makes the green island shore clearly
    // visible underneath any homes spawned there.  Bridge segments
    // are iterated near-first and paint their water at smaller
    // screen Y (higher up they're not, smaller cz means LARGER fy
    // — closer to bottom), so the dry land's grass extends down
    // toward the bridge water and forms a visible shoreline edge.
    const isLandSeg = !seg.water && !seg.bridge;
    const grassH = isLandSeg ? Math.max(60, segH) : segH;
    g.fillStyle(grass, 1);
    g.fillRect(-150, fy, SCREEN_W + 300, grassH);

    // ── Tunnel: concrete portal structure rendered per-segment ─────────
    // Walls + ceiling are concrete-coloured trapezoids that taper with
    // the road's perspective.  The ceiling extends UP from the road
    // by H_CEIL world-units, projected to screen-Y with the segment's
    // own scale.  Because every paint is bounded to the wall's outer
    // edges (which mirror the road's taper), the structure converges
    // to the road's vanishing point and never bleeds into the sky.
    if (seg.tunnel) {
      // Leave a 3-5 ft visual shoulder between the fog line and the
      // tunnel wall.  Wall edges still use the same near/far road
      // projection, so they stay parallel to the fog line through curves.
      const shoulder1 = Math.max(rw1 * 1.35, w1 * 0.10);
      const shoulder2 = Math.max(rw2 * 1.35, w2 * 0.10);
      const wallW1 = w1 * 0.78;
      const wallW2 = w2 * 0.78;
      const roadFar_L  = x2 - w2 - rw2;
      const roadFar_R  = x2 + w2 + rw2;
      const roadNear_L = x1 - w1 - rw1;
      const roadNear_R = x1 + w1 + rw1;
      const inFar_L   = roadFar_L - shoulder2;
      const inFar_R   = roadFar_R + shoulder2;
      const inNear_L  = roadNear_L - shoulder1;
      const inNear_R  = roadNear_R + shoulder1;
      const outFar_L  = inFar_L - wallW2;
      const outFar_R  = inFar_R + wallW2;
      const outNear_L = inNear_L - wallW1;
      const outNear_R = inNear_R + wallW1;

      // CEILING — projects H_CEIL world-units above the road.  At far
      // depth the ceiling is just above the road on screen; at near
      // depth it's far above (often off-screen top, clamped).  The
      // ceiling trapezoid spans BETWEEN the wall outer edges so it
      // doesn't leak past the tunnel's perceived width.
      const H_CEIL       = 4500;
      const ceilDropFar  = curr.scale  * H_CEIL * SCREEN_H / 2;
      const ceilDropNear = next.scale  * H_CEIL * SCREEN_H / 2;
      const ceilFy       = Math.max(0, fy - ceilDropFar);
      const ceilNy       = Math.max(0, ny - ceilDropNear);
      // Concrete ceiling (pale grey, matches the entrance arch tone).
      fillTrap(g, 0xA8A498,
        outFar_L,  ceilFy, outFar_R,  ceilFy,
        outNear_R, ceilNy, outNear_L, ceilNy);

      // WALLS — pale concrete trapezoids flanking the road.  Each
      // wall extends from the ceiling line down to the road's outer
      // rumble at the segment's bottom edge, mirroring the road's
      // perspective taper.
      // Left wall (concrete)
      fillTrap(g, 0xB5B0A0,
        outFar_L,  ceilFy, inFar_L,   fy,
        inNear_L,  ny,     outNear_L, ny);
      // Right wall (concrete)
      fillTrap(g, 0xB5B0A0,
        inFar_R,   fy,     outFar_R,  ceilFy,
        outNear_R, ny,     inNear_R,  ny);

      // Concrete shoulder between fog line/rumble and wall.
      fillTrap(g, 0x8F8A7D,
        roadFar_L,  fy, inFar_L,  fy,
        inNear_L,   ny, roadNear_L, ny);
      fillTrap(g, 0x8F8A7D,
        inFar_R,    fy, roadFar_R, fy,
        roadNear_R, ny, inNear_R,  ny);

      // Wall-base shadow — bottom strip of each wall darker so it
      // reads as "shadow under the lights."  Trapezoid hugging the
      // road's outer rumble for the lower 30 % of the wall.
      const shadowFy = fy + segH * 0.70;
      // Left base shadow
      fillTrap(g, 0x6E6660,
        inFar_L - wallW2 * 0.35, shadowFy, inFar_L, shadowFy,
        inNear_L, ny, inNear_L - wallW1 * 0.35, ny);
      // Right base shadow
      fillTrap(g, 0x6E6660,
        inFar_R, shadowFy, inFar_R + wallW2 * 0.35, shadowFy,
        inNear_R + wallW1 * 0.35, ny, inNear_R, ny);

      // Concrete CURB — pale strip between road rumble and wall base.
      // Reads as "where the floor meets the wall" line.
      const curbW1 = Math.max(2, rw1 * 0.6);
      const curbW2 = Math.max(2, rw2 * 0.6);
      fillTrap(g, 0xD8D4C0,
        inFar_L - curbW2, ny - Math.max(1, segH * 0.20),
        inFar_L,          ny - Math.max(1, segH * 0.20),
        inNear_L,         ny,
        inNear_L - curbW1, ny);
      fillTrap(g, 0xD8D4C0,
        inFar_R, ny - Math.max(1, segH * 0.20),
        inFar_R + curbW2, ny - Math.max(1, segH * 0.20),
        inNear_R + curbW1, ny,
        inNear_R, ny);

      // Sodium-orange ceiling lights — paired rows running along the
      // top corners (where wall meets ceiling).  Painted at the
      // ceiling-line on each side, every 3rd segment, sized with
      // segment scale so far lights = tiny dots and near lights =
      // bright bars.
      if ((seg.index % 3) === 0) {
        const lightLenFar  = Math.max(2, wallW2 * 0.55);
        const lightLenNear = Math.max(2, wallW1 * 0.55);
        const lightThk     = Math.max(2, segH * 0.5);
        // Left light strip — sits on the ceiling-meets-wall corner.
        fillTrap(g, 0xFFD060,
          inFar_L - lightLenFar,   ceilFy,
          inFar_L,                 ceilFy,
          inNear_L,                ceilNy + lightThk,
          inNear_L - lightLenNear, ceilNy + lightThk);
        // Right light strip
        fillTrap(g, 0xFFD060,
          inFar_R,                  ceilFy,
          inFar_R + lightLenFar,    ceilFy,
          inNear_R + lightLenNear,  ceilNy + lightThk,
          inNear_R,                 ceilNy + lightThk);
      }
    }

    // ── Water (Lake Washington floating bridge segments) ─────────────
    // Water sits ABOVE the grass fill but UNDER the road, so the road
    // still paints cleanly on top.  Drawn as horizontal stripes so the
    // segment animates as scrolling waves rather than a flat blue field.
    // West Seattle Bridge — same water-flanks-road rendering as the
    // floating bridge but painted DARKER (you're 200 ft up over the
    // Duwamish, not at lake level), plus tall concrete pylons in the
    // distance below.  The water field stretches off-screen to the
    // edges so you don't see ground past the railings.
    if (seg.bridge) {
      const waterCol  = 0x1A3550;   // Duwamish at depth — dark steel blue
      const waterCol2 = 0x122438;   // shadow band
      g.fillStyle(waterCol, 1);
      g.fillRect(-150, fy, Math.max(0, x2 - w2 - rw2 + 150), segH);
      g.fillRect(x2 + w2 + rw2, fy, Math.max(0, SCREEN_W + 150 - (x2 + w2 + rw2)), segH);
      // Wave streak every 2 segments (subtler than the floating bridge —
      // water reads as deep & far away, not lapping at the road).
      if ((seg.index & 1) === 0) {
        g.fillStyle(waterCol2, 0.55);
        g.fillRect(-150, fy + segH * 0.55, Math.max(0, x2 - w2 - rw2 + 150), Math.max(1, segH * 0.08));
        g.fillRect(x2 + w2 + rw2, fy + segH * 0.55, Math.max(0, SCREEN_W + 150 - (x2 + w2 + rw2)), Math.max(1, segH * 0.08));
      }
      // Concrete piers every few spans. Taller/tapered so they read as
      // supports under the bridge deck instead of tiny water-level posts.
      if ((seg.index % 10) === 0) {
        const pylonH = Math.max(16, segH * 4.8);
        const pylonW = Math.max(5, w2 * 0.15);
        const topY = fy + segH * 0.12;
        const botY = Math.min(SCREEN_H + 40, topY + pylonH);
        const leftX = x2 - w2 - rw2 - pylonW * 1.45;
        const rightX = x2 + w2 + rw2 + pylonW * 0.45;
        const flare = Math.max(2, pylonW * 0.28);
        fillTrap(g, 0x9A968C,
          leftX, topY, leftX + pylonW, topY,
          leftX + pylonW + flare, botY, leftX - flare, botY);
        fillTrap(g, 0x9A968C,
          rightX, topY, rightX + pylonW, topY,
          rightX + pylonW + flare, botY, rightX - flare, botY);
        fillTrap(g, 0x5A554C,
          leftX + pylonW * 0.72, topY, leftX + pylonW, topY,
          leftX + pylonW + flare, botY, leftX + pylonW * 0.72, botY);
        fillTrap(g, 0x5A554C,
          rightX + pylonW * 0.72, topY, rightX + pylonW, topY,
          rightX + pylonW + flare, botY, rightX + pylonW * 0.72, botY);
        // Dark reflection directly below each pier.
        g.fillStyle(0x0A1E30, 0.35);
        g.fillRect(leftX - flare, botY - Math.max(1, segH * 0.2), pylonW + flare * 2, Math.max(1, segH * 0.35));
        g.fillRect(rightX - flare, botY - Math.max(1, segH * 0.2), pylonW + flare * 2, Math.max(1, segH * 0.35));
      }
    }

    // Left-side-only water (Elliott Bay along the West Seattle approach).
    // Painted before the bilateral `seg.water` block so a future segment
    // that wants BOTH flags can still get bilateral water from the block
    // below.  Doesn't paint waves/streaks — bay water is just a flat field.
    if (seg.waterLeft && !seg.water && !seg.bridge) {
      const wave = (Math.sin(seg.index * 0.18) * 0.5 + 0.5);
      const waterCol = lerpColor(0x224A6E, 0x4A7FA8, wave * 0.6);
      g.fillStyle(waterCol, 1);
      g.fillRect(-150, fy, Math.max(0, x2 - w2 - rw2 + 150), segH);
    }

    if (seg.water) {
      const wave = (Math.sin(seg.index * 0.18) * 0.5 + 0.5);
      const waterCol  = lerpColor(0x224A6E, 0x4A7FA8, wave * 0.6);
      const waterCol2 = lerpColor(0x1A3A58, 0x2D5B82, wave * 0.6);
      // Left water field
      g.fillStyle(waterCol, 1);
      g.fillRect(-150, fy, Math.max(0, x2 - w2 - rw2 + 150), segH);
      // Right water field
      g.fillRect(x2 + w2 + rw2, fy, Math.max(0, SCREEN_W + 150 - (x2 + w2 + rw2)), segH);
      // Wave streaks every 2 segments — gives motion as the road scrolls
      if ((seg.index & 1) === 0) {
        g.fillStyle(waterCol2, 0.65);
        g.fillRect(-150, fy + segH * 0.45, Math.max(0, x2 - w2 - rw2 + 150), Math.max(1, segH * 0.10));
        g.fillRect(x2 + w2 + rw2, fy + segH * 0.45, Math.max(0, SCREEN_W + 150 - (x2 + w2 + rw2)), Math.max(1, segH * 0.10));
      }
      // White-cap glints
      if ((seg.index % 7) === 0) {
        g.fillStyle(0xE8F4FA, 0.55);
        g.fillRect(-150 + ((seg.index * 13) % (SCREEN_W + 300)) - 150,
                   fy + segH * 0.30, 22, Math.max(1, segH * 0.06));
      }
    }

    // Under-bridge structure for both the high West Seattle bridge and
    // the Lake Washington floating bridge. Drawn before railings/road
    // edge details, so it tucks under the deck instead of sitting on top.
    if (seg.water || seg.bridge) {
      const deckDrop1 = Math.max(2, segH * (seg.bridge ? 0.38 : 0.26));
      const deckDrop2 = Math.max(2, segH * (seg.bridge ? 0.42 : 0.28));
      const outerFarL  = x2 - w2 - rw2;
      const outerFarR  = x2 + w2 + rw2;
      const outerNearL = x1 - w1 - rw1;
      const outerNearR = x1 + w1 + rw1;

      // Dark fascia under the entire bridge deck, visible along both
      // road edges as the bridge bends away.
      fillTrap(g, 0x3F423C,
        outerFarL, fy, outerFarR, fy,
        outerNearR, ny + deckDrop1, outerNearL, ny + deckDrop1);
      fillTrap(g, 0x77746A,
        outerFarL, fy, outerFarR, fy,
        outerNearR, ny + Math.max(1, deckDrop1 * 0.35),
        outerNearL, ny + Math.max(1, deckDrop1 * 0.35));

      // Repeating paired supports/pontoons. On Lake Washington these read
      // as floating bridge pontoons; on the elevated bridge they read as
      // pier columns under the deck.
      if ((seg.index % (seg.bridge ? 10 : 8)) === 0) {
        const pierW2 = Math.max(3, w2 * (seg.bridge ? 0.13 : 0.18));
        const pierW1 = Math.max(5, w1 * (seg.bridge ? 0.15 : 0.20));
        const pierDrop = Math.max(10, segH * (seg.bridge ? 4.8 : 2.4));
        const pierTopFar = fy + Math.max(1, segH * 0.15);
        const pierTopNear = ny + deckDrop2 * 0.55;
        const pierBotNear = Math.min(SCREEN_H + 50, pierTopNear + pierDrop);
        const farInset = w2 * 0.58;
        const nearInset = w1 * 0.58;

        const drawPier = (side) => {
          const farX = x2 + side * farInset;
          const nearX = x1 + side * nearInset;
          fillTrap(g, 0x9C988E,
            farX - pierW2 * 0.5, pierTopFar,
            farX + pierW2 * 0.5, pierTopFar,
            nearX + pierW1 * 0.5, pierBotNear,
            nearX - pierW1 * 0.5, pierBotNear);
          fillTrap(g, 0x5C584F,
            farX + side * pierW2 * 0.12, pierTopFar,
            farX + side * pierW2 * 0.5,  pierTopFar,
            nearX + side * pierW1 * 0.5, pierBotNear,
            nearX + side * pierW1 * 0.12, pierBotNear);
          g.fillStyle(0x0A1E30, 0.32);
          g.fillRect(nearX - pierW1 * 0.65, pierBotNear - Math.max(1, segH * 0.18),
                     pierW1 * 1.3, Math.max(1, segH * 0.45));
        };
        drawPier(-1);
        drawPier(1);
      }
    }

    // ── Bridge guardrails (floating bridge water + West Seattle Bridge) ─
    // Solid concrete Jersey-barrier on each side of the road, painted
    // outboard of the rumble strip.  Tall enough that we draw the side
    // wall as a vertical strip extending UPWARD from the road surface
    // toward the horizon — looks like a real barrier, not a flat band.
    // The West Seattle Bridge gets a TALLER railing (1.8× width) since
    // you're 200 ft up over the Duwamish.
    if (seg.water || seg.bridge) {
      const railMul = seg.bridge ? 1.8 : 1.0;
      const railW1 = Math.max(2, w1 * 0.06 * railMul);
      const railW2 = Math.max(2, w2 * 0.06 * railMul);
      const RAIL_BASE = 0xC8C4BB;
      const RAIL_DARK = 0x6E6A60;
      const RAIL_TOP  = 0xE6E2D6;
      // Route bridge guardrails to the front-overlay layer so their edges
      // stay crisp.
      const rg = (seg.bridge && this._frontG) ? this._frontG : g;
      // Left guardrail face
      fillTrap(rg, RAIL_BASE,
        x2 - w2 - rw2 - railW2, fy, x2 - w2 - rw2, fy,
        x1 - w1 - rw1,         ny, x1 - w1 - rw1 - railW1, ny);
      // Top edge highlight (thin)
      fillTrap(rg, RAIL_TOP,
        x2 - w2 - rw2 - railW2, fy, x2 - w2 - rw2 - railW2 + Math.max(1, railW2 * 0.30), fy,
        x1 - w1 - rw1 - railW1 + Math.max(1, railW1 * 0.30), ny, x1 - w1 - rw1 - railW1, ny);
      // Bottom shadow (thin)
      fillTrap(rg, RAIL_DARK,
        x2 - w2 - rw2 - Math.max(1, railW2 * 0.30), fy, x2 - w2 - rw2, fy,
        x1 - w1 - rw1, ny, x1 - w1 - rw1 - Math.max(1, railW1 * 0.30), ny);
      // Right guardrail face
      fillTrap(rg, RAIL_BASE,
        x2 + w2 + rw2,         fy, x2 + w2 + rw2 + railW2, fy,
        x1 + w1 + rw1 + railW1, ny, x1 + w1 + rw1,         ny);
      fillTrap(rg, RAIL_TOP,
        x2 + w2 + rw2 + railW2 - Math.max(1, railW2 * 0.30), fy, x2 + w2 + rw2 + railW2, fy,
        x1 + w1 + rw1 + railW1, ny, x1 + w1 + rw1 + railW1 - Math.max(1, railW1 * 0.30), ny);
      fillTrap(rg, RAIL_DARK,
        x2 + w2 + rw2,         fy, x2 + w2 + rw2 + Math.max(1, railW2 * 0.30), fy,
        x1 + w1 + rw1 + Math.max(1, railW1 * 0.30), ny, x1 + w1 + rw1, ny);
      // Reflector posts every 6 segments — orange dots on top of the rail
      if ((seg.index % 6) === 0) {
        const postH = Math.max(2, segH * 0.45);
        rg.fillStyle(0xFF8800, 1);
        rg.fillRect(x2 - w2 - rw2 - railW2 - 1, fy - postH * 0.4, 2, postH * 0.4);
        rg.fillRect(x2 + w2 + rw2 + railW2 - 1, fy - postH * 0.4, 2, postH * 0.4);
      }
    }

    // Urban sidewalk — wide concrete band immediately outboard of each
    // rumble strip. Drawn AFTER the grass and BEFORE the road so the road
    // paints over the inner edge cleanly. Only in urban segments.
    if (seg.urban) {
      // ~½-lane wide.  The earlier 10% was too thin to read and blended
      // with grass; 24% reads as a clear sidewalk band.
      const sidewalkW1 = Math.max(3, w1 * 0.24);
      const sidewalkW2 = Math.max(3, w2 * 0.24);
      // Darker concrete — visible against most palette grass colors.
      const SIDEWALK_DK = 0x9C968C;
      const SIDEWALK_LT = 0xB8B0A4;
      const CURB_SHADOW = 0x4E4A44;
      // Left sidewalk (concrete fill)
      fillTrap(g, SIDEWALK_DK,
        x2 - w2 - rw2 - sidewalkW2, fy, x2 - w2 - rw2, fy,
        x1 - w1 - rw1,             ny, x1 - w1 - rw1 - sidewalkW1, ny);
      // Right sidewalk
      fillTrap(g, SIDEWALK_DK,
        x2 + w2 + rw2,             fy, x2 + w2 + rw2 + sidewalkW2, fy,
        x1 + w1 + rw1 + sidewalkW1, ny, x1 + w1 + rw1,             ny);
      // Pavement highlight strip down the middle of each sidewalk —
      // gives the band visible volume under direct overhead sun.
      const hi1 = sidewalkW1 * 0.40, hi2 = sidewalkW2 * 0.40;
      fillTrap(g, SIDEWALK_LT,
        x2 - w2 - rw2 - sidewalkW2 + hi2 * 0.5, fy,
        x2 - w2 - rw2 - sidewalkW2 + hi2 * 1.5, fy,
        x1 - w1 - rw1 - sidewalkW1 + hi1 * 1.5, ny,
        x1 - w1 - rw1 - sidewalkW1 + hi1 * 0.5, ny);
      fillTrap(g, SIDEWALK_LT,
        x2 + w2 + rw2 + sidewalkW2 - hi2 * 1.5, fy,
        x2 + w2 + rw2 + sidewalkW2 - hi2 * 0.5, fy,
        x1 + w1 + rw1 + sidewalkW1 - hi1 * 0.5, ny,
        x1 + w1 + rw1 + sidewalkW1 - hi1 * 1.5, ny);
      // Curb — thick dark line ALONGSIDE THE ROAD (between rumble and
      // sidewalk) — this is what reads as "step up to the sidewalk".
      const curbW1 = Math.max(1, sidewalkW1 * 0.16);
      const curbW2 = Math.max(1, sidewalkW2 * 0.16);
      fillTrap(g, CURB_SHADOW,
        x2 - w2 - rw2 - curbW2, fy, x2 - w2 - rw2, fy,
        x1 - w1 - rw1,         ny, x1 - w1 - rw1 - curbW1, ny);
      fillTrap(g, CURB_SHADOW,
        x2 + w2 + rw2,         fy, x2 + w2 + rw2 + curbW2, fy,
        x1 + w1 + rw1 + curbW1, ny, x1 + w1 + rw1,         ny);
      // Sidewalk seam lines (perpendicular cracks) every ~3 segments —
      // keyed on segment index so they march past at speed instead of
      // floating in place.
      if ((seg.index % 3) === 0) {
        g.fillStyle(CURB_SHADOW, 0.5);
        g.fillRect(x2 - w2 - rw2 - sidewalkW2, fy, sidewalkW2, 1);
        g.fillRect(x2 + w2 + rw2,             fy, sidewalkW2, 1);
      }
    }

    // For bridge segments, route the road surface + markings to the
    // front-overlay layer (bridgeFrontGfx, depth 4) so the asphalt
    // paints OVER cranes (depth 2) — they can't be seen "through" the
    // road — while NPCs / cops / drugs / signs (depth ≥ 7) still paint
    // on top of the road as expected.
    const surfaceG = (seg.bridge && this._frontG) ? this._frontG : g;

    // Road surface (top edge = far/narrow = curr; bottom edge = near/wide = next)
    fillTrap(surfaceG, road,
      x2 - w2, fy, x2 + w2, fy,
      x1 + w1, ny, x1 - w1, ny);

    // ── Exit ramp diverging right ─────────────────────────────────────
    // RouteData.js tags segments leading into a rest stop with
    // `rampStrength` ∈ (0,1].  We paint a paved trapezoid that grows
    // outward from the right edge of the road as the strength climbs,
    // giving the unmistakable visual of an off-ramp peeling away.
    if (seg.rampStrength > 0) {
      const rs = seg.rampStrength;
      // ── TRUE DIVERGING LANE — gore + width grow TOGETHER ──────────
      // The previous two-phase shape kept the ramp glued to the road
      // for the first half (gore=0 while width grew), which looked
      // like the road getting wider — exactly the "pullout" feel the
      // player kept calling out.  Real I-90/FHWA diverging exit ramps
      // open the grass GORE wedge from a single apex point WHILE the
      // ramp width grows.  Both 0 at apex, both reach max at the exit.
      //
      //  rs = 0:    width=0, gore=0      (single-point apex)
      //  rs = 0.5:  width=0.5w, gore=0.5w (half-divergence, clear fork)
      //  rs = 1.0:  width=w, gore=0.95w   (fully separate ramp)
      //
      // The grass between the road's right edge and the ramp's inner
      // edge IS the visible gore — no special draw, the underlying
      // grass shows through because we leave that band unpainted.
      const t = rs * rs * (3 - 2 * rs);   // smoothstep — gentle apex, sharp peel
      const rampW1 = w1 * 1.25 * t;
      const rampW2 = w2 * 1.25 * t;
      // Wider gore wedge — at peak (t=1), the ramp's inner edge sits
      // ~2 road half-widths away from the road's outer edge, with a
      // 1.25-lane ramp beyond it.  This makes the exit lane pull well
      // away from traffic instead of reading as a shoulder bulge.
      const gap1   = w1 * 2.05 * t;
      const gap2   = w2 * 2.05 * t;
      // Asphalt fill — same color as the active road stripe so the ramp
      // doesn't read as a different road type, just a continuation.
      fillTrap(g, road,
        x2 + w2 + gap2,         fy, x2 + w2 + gap2 + rampW2, fy,
        x1 + w1 + gap1 + rampW1, ny, x1 + w1 + gap1,         ny);
      // White edge stripe along the OUTSIDE of the ramp — the unmistakable
      // "ramp shoulder" stripe.
      const edgeW1 = Math.max(2, w1 * 0.025);
      const edgeW2 = Math.max(2, w2 * 0.025);
      fillTrap(g, 0xFFFFFF,
        x2 + w2 + gap2 + rampW2 - edgeW2, fy, x2 + w2 + gap2 + rampW2, fy,
        x1 + w1 + gap1 + rampW1,         ny, x1 + w1 + gap1 + rampW1 - edgeW1, ny);
      // (Gore chevrons removed — at the game's perspective scale the
      // tiny V-arrows read as glitchy white triangles in the ramp wedge
      // rather than as a readable "do-not-cross" zone.  The white edge
      // stripe + yellow RPM dots are enough to communicate the split.)
      // (Yellow RPM dots in the gore removed — they read as "lane
      // markings painted on grass" without the underlying pavement.)
      // ── Right-shoulder delineators — small black bars along the
      // outside edge of the ramp, classic delineator post pattern from
      // the reference image.  Drawn every 3rd segment (about every
      // ~30 ft of road) so they're visually recognizable.
      if (rs > 0.20 && (seg.index % 3) === 0) {
        const delX1 = x1 + w1 + gap1 + rampW1 + edgeW1 + 4;
        const delX2 = x2 + w2 + gap2 + rampW2 + edgeW2 + 4;
        const delW  = Math.max(1, edgeW1 * 1.6);
        g.fillStyle(0x222222, 0.95);
        g.fillRect(delX2 - delW / 2, fy + segH * 0.30, delW, Math.max(1, segH * 0.40));
        g.fillRect(delX1 - delW / 2, ny - segH * 0.70, delW, Math.max(1, segH * 0.40));
      }
      // ── White edge stripe along INSIDE of the ramp (next to the gore).
      // Pairs with the OUTSIDE edge stripe drawn earlier so the ramp has
      // a real lane boundary on both sides.
      const innerW1 = Math.max(2, w1 * 0.020);
      const innerW2 = Math.max(2, w2 * 0.020);
      fillTrap(g, 0xFFFFFF,
        x2 + w2 + gap2,         fy, x2 + w2 + gap2 + innerW2, fy,
        x1 + w1 + gap1 + innerW1, ny, x1 + w1 + gap1,         ny);
      // ── Bright "EXIT" arrow chevron painted on the ramp pavement near
      // peak strength — gives the player something obvious to aim at.
      if (rs > 0.55) {
        const cx2 = x2 + w2 + gap2 + rampW2 * 0.55;
        const chevW = (rampW1 + rampW2) * 0.18;
        g.fillStyle(0xFFFFFF, 0.85);
        g.fillTriangle(
          cx2 - chevW * 0.3, fy + segH * 0.3,
          cx2 + chevW * 0.3, fy + segH * 0.5,
          cx2 - chevW * 0.3, fy + segH * 0.7,
        );
      }
    }

    // Left rumble
    fillTrap(surfaceG, rumble,
      x2 - w2 - rw2, fy, x2 - w2, fy,
      x1 - w1, ny, x1 - w1 - rw1, ny);

    // Right rumble
    fillTrap(surfaceG, rumble,
      x2 + w2, fy, x2 + w2 + rw2, fy,
      x1 + w1 + rw1, ny, x1 + w1, ny);

    // White shoulder line drawn once-per-frame as a continuous ribbon
    // sourced from _surfaceSamples — see _drawShoulderRibbons() called
    // at the end of render().  No per-segment paint here.

    // Lane markers (dashed — short paint, long gap, independent of
    // the rumble parallax cycle).  Skip the centerline lane on
    // even-lane roads — the double yellow paints there instead, and
    // the white dashes were showing through the gap between the two
    // yellow lines.
    if (dashOn) {
      const skipLane = (segLanes % 2 === 0) ? segLanes / 2 : -1;
      for (let lane = 1; lane < segLanes; lane++) {
        if (lane === skipLane) continue;
        const lx1 = x1 + (lane / segLanes) * 2 * w1 - w1;
        const lx2 = x2 + (lane / segLanes) * 2 * w2 - w2;
        fillTrap(surfaceG, laneCol,
          lx2 - lw2, fy, lx2 + lw2, fy,
          lx1 + lw1, ny, lx1 - lw1, ny);
      }
    }

    // Double solid yellow center line — only on multi-lane roads
    if (segLanes >= 2) {
      const clw1 = Math.max(1, Math.round(lw1 * 0.55));
      const clw2 = Math.max(1, Math.round(lw2 * 0.55));
      const gap1 = lw1 * 1.1;
      const gap2 = lw2 * 1.1;
      fillTrap(surfaceG, 0xFFEE00,
        x2 - gap2 - clw2, fy, x2 - gap2,       fy,
        x1 - gap1,        ny, x1 - gap1 - clw1, ny);
      fillTrap(surfaceG, 0xFFEE00,
        x2 + gap2,        fy, x2 + gap2 + clw2, fy,
        x1 + gap1 + clw1, ny, x1 + gap1,        ny);
    }

    // Fog overlay — same treatment for tunnel and non-tunnel segments
    // now that the tunnel structure is bounded to the road's screen
    // area.  Fog tints both the surrounding world and the tunnel
    // walls slightly toward the haze colour at distance.
    if (fog > 0.05) {
      g.fillStyle(palette.fog ?? palette.sky, fog * 0.85);
      g.fillRect(0, fy, SCREEN_W, segH);
    }
  }

  _drawSprites(g, drawn, isGhost = false, xOffset = 0) {
    // xOffset is added to screenX so the ghost pass can request an
    // offset draw without cloning the drawn[] entry.
    const { seg, screenY, screenW, scale } = drawn;
    const screenX = drawn.screenX + xOffset;
    if (!seg.sprites || !seg.sprites.length) return;
    if (screenY > SCREEN_H + 100 || screenY < 0) return;  // skip off-screen segments

    for (const sp of seg.sprites) {
      // Roadblocks are gated on wanted level — under 3 stars they're not a
      // "thing yet" so we hide them entirely (and GameScene also skips the
      // collision in _onCollect).
      if (sp.type === 'cop_roadblock' && (this._currentStars ?? 0) < 3) continue;
      // Drug sprites that haven't been resolved to a real drug type yet
      // (out of GameScene's lazy-assign window) — skip until typed.
      if (sp.type === 'drug-pending') continue;
      // Signs are rendered EXCLUSIVELY by renderSignOverlay (high-depth
      // signGfx layer) so they paint on top of trees / buildings.  Drawing
      // them here too produced a stacked second copy at low depth, which
      // could read as "two signs, one smaller than the other" when
      // perspective interpolation diverged between the two passes.
      if (sp.type === 'mileage_sign'
       || sp.type === 'exit_sign_green'
       || sp.type === 'amenities_sign'
       || sp.type === 'next_stops_sign'
       || sp.type === 'rest_sign'
       || sp.type === 'grade_sign'
       || sp.type === 'sign') continue;
      // Scale sprites by depth
      const spriteScale = scale * SCREEN_W / 2;

      // Roadside offset: sp.offset > 1 = right side, < -1 = left side.
      // Procedural houses are wide enough that their footprint can bleed
      // into the sidewalk/road if the anchor is too close, so enforce a
      // minimum visual setback even for already-generated route segments.
      let visualOffset = sp.offset;
      if (sp.type === 'house' || sp.type === 'building') {
        const minOffset = sp.type === 'house' ? 2.35 : 2.10;
        const sign = visualOffset >= 0 ? 1 : -1;
        visualOffset = sign * Math.max(Math.abs(visualOffset), minOffset);
      }
      const spriteH = toInt(sp.baseH * spriteScale * 0.5);
      const spriteW = toInt(sp.baseW * spriteScale * 0.5);
      if (sp.type === 'house' || sp.type === 'building' || sp.type === 'tree'
          || sp.type === 'cactus' || sp.type === 'palm' || sp.type === 'shrub'
          || sp.type === 'landmark') {
        const sign = visualOffset >= 0 ? 1 : -1;
        const carPx = scale * 825 * SCREEN_W / 2;
        const neededOffset = 1 + (spriteW * 0.5 + carPx * 2) / Math.max(1, screenW);
        visualOffset = sign * Math.max(Math.abs(visualOffset), neededOffset);
      }
      const spriteX = toInt(screenX + screenW * visualOffset);
      const spriteTopY = screenY - spriteH;

      // Only skip if entirely below the screen or vanishingly small.
      // Allow sprites taller than the screen — Phaser clips them automatically.
      if (spriteTopY > SCREEN_H || spriteH < 1) continue;

      this._drawSpriteShape(g, sp.type, spriteX, spriteTopY, spriteW, spriteH, sp.collected, sp, isGhost);
    }
  }

  _drawSpriteShape(g, type, x, y, w, h, collected, sp, isGhost = false) {
    // Drug pickups and F12 weapon tokens are rendered by GameScene's
    // sprite pool (using the player's images). Skip procedural drawing.
    if (sp?.collectibleType === 'drug' || sp?.collectibleType === 'f12') return;
    // Buildings / trees that have an image texture are rendered by
    // GameScene._renderSceneSprites using Phaser Images.
    if (sp?.texKey) return;
    if (collected) return;

    // Houses + buildings paint to the dedicated props Graphics layer (if
    // provided) so they live in the higher-depth band and don't hide
    // behind image-based trees rendered by GameScene._renderSceneSprites.
    // Skipped during the ghost (alcohol double-vision) pass — that overlay
    // owns its own Graphics with a translucent global alpha; diverting
    // houses elsewhere would erase them from the doubled image.
    if ((type === 'house' || type === 'building') && this._propsG && !isGhost) {
      g = this._propsG;
    }
    switch (type) {
      case 'tree': {
        // Solid trunk
        g.fillStyle(0x5D3A1A, 1);
        g.fillRect(x - w * 0.09, y + h * 0.70, w * 0.18, h * 0.30);
        g.fillStyle(0x3D2510, 1);
        g.fillRect(x + w * 0.01, y + h * 0.70, w * 0.08, h * 0.30);
        // Three solid overlapping ellipses — no see-through gaps
        g.fillStyle(0x1A6E1A, 1);
        g.fillEllipse(x, y + h * 0.62, w * 1.0, h * 0.52);
        g.fillStyle(0x228B22, 1);
        g.fillEllipse(x, y + h * 0.42, w * 0.82, h * 0.46);
        g.fillStyle(0x2EA82E, 1);
        g.fillEllipse(x, y + h * 0.22, w * 0.60, h * 0.36);
        // Bright top
        g.fillStyle(0x44CC44, 1);
        g.fillEllipse(x, y + h * 0.08, w * 0.38, h * 0.20);
        // Left-side highlight (sun on upper-left)
        g.fillStyle(0x66EE66, 0.5);
        g.fillEllipse(x - w * 0.12, y + h * 0.06, w * 0.22, h * 0.14);
        break;
      }
      case 'shrub': {
        // Sagebrush — low, broad, dusty olive-green clump.  Sits ground-
        // level (no trunk) so it reads at a glance as "high-desert brush".
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(x + w * 0.05, y + h, w * 0.95, h * 0.10);
        // Three overlapping ellipses give it a tufted silhouette.
        g.fillStyle(0x6B7A48, 1);
        g.fillEllipse(x - w * 0.20, y + h * 0.55, w * 0.70, h * 0.55);
        g.fillStyle(0x7C8C58, 1);
        g.fillEllipse(x + w * 0.18, y + h * 0.50, w * 0.78, h * 0.65);
        g.fillStyle(0x8E9C68, 1);
        g.fillEllipse(x,             y + h * 0.30, w * 0.62, h * 0.55);
        // Sun-side highlight
        g.fillStyle(0xB7C088, 0.55);
        g.fillEllipse(x - w * 0.15, y + h * 0.18, w * 0.32, h * 0.22);
        break;
      }
      case 'cactus': {
        // (Legacy — Columbia Basin no longer spawns cactus, but kept so
        // any cached segments still render.)
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(x + w * 0.1, y + h, w * 0.4, h * 0.08);
        g.fillStyle(0x2E8B2E, 1);
        g.fillRect(x - w * 0.13, y, w * 0.26, h);
        g.fillStyle(0x1A6E1A, 1);
        g.fillRect(x + w * 0.02, y, w * 0.11, h);
        g.fillStyle(0x2E8B2E, 1);
        g.fillRect(x - w * 0.52, y + h * 0.28, w * 0.39, h * 0.2);
        g.fillRect(x + w * 0.13, y + h * 0.48, w * 0.4, h * 0.2);
        g.fillStyle(0x44BB44, 0.5);
        g.fillRect(x - w * 0.52, y + h * 0.28, w * 0.39, h * 0.07);
        g.fillRect(x + w * 0.13, y + h * 0.48, w * 0.4, h * 0.07);
        g.fillStyle(0x44BB44, 1);
        g.fillRect(x - w * 0.1, y - h * 0.06, w * 0.2, h * 0.1);
        break;
      }
      case 'palm': {
        // Shadow
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(x + w * 0.15, y + h, w * 0.6, h * 0.09);
        // Trunk (slightly curved look via two rects)
        g.fillStyle(0x9B7928, 1);
        g.fillRect(x - w * 0.09, y + h * 0.32, w * 0.18, h * 0.68);
        g.fillStyle(0x7A5E1A, 1);
        g.fillRect(x + w * 0.01, y + h * 0.32, w * 0.08, h * 0.68);
        // Trunk rings
        for (let r = 0; r < 4; r++) {
          g.fillStyle(0x7A5E1A, 0.4);
          g.fillRect(x - w * 0.09, y + h * (0.35 + r * 0.16), w * 0.18, h * 0.04);
        }
        // Fronds (5 leaf directions)
        const fColors = [0x2D9B2D, 0x3DBF3D, 0x22881A];
        const fronds = [[-0.7,-0.7],[-0.4,-0.5],[0,-0.6],[0.45,-0.5],[0.72,-0.65]];
        for (let f = 0; f < fronds.length; f++) {
          const [fx, fy_] = fronds[f];
          g.fillStyle(fColors[f % 3], 1);
          const baseX = x, baseY = y + h * 0.32;
          const tipX = x + w * fx * 0.9, tipY = baseY + h * fy_ * 0.45;
          const midX = (baseX + tipX) / 2, midY = (baseY + tipY) / 2;
          g.fillTriangle(baseX - w * 0.06, baseY, baseX + w * 0.06, baseY, tipX, tipY);
          g.fillStyle(0x88FF88, 0.15);
          g.fillTriangle(baseX - w * 0.02, baseY, midX, midY, tipX, tipY);
        }
        break;
      }
      case 'rest_sign': {
        // Highway-style green sign — text painted directly on the green
        // face by the GameScene overlay (no white inset plates).
        const POST_COL  = 0x6E665A;
        const FACE_COL  = 0x0E5C24;
        const FACE_HI   = 0x2A8E3F;
        const BORDER    = 0xFFFFFF;
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.36, y + h * 0.55, w * 0.07, h * 0.45);
        g.fillRect(x + w * 0.29, y + h * 0.55, w * 0.07, h * 0.45);
        // White-bordered green face
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.62, y - h * 0.02, w * 1.24, h * 0.60);
        g.fillStyle(FACE_COL, 1);
        g.fillRect(x - w * 0.58, y + h * 0.02, w * 1.16, h * 0.52);
        g.fillStyle(FACE_HI, 1);
        g.fillRect(x - w * 0.58, y + h * 0.02, w * 1.16, h * 0.06);
        // Yellow flag for the 1mi / exit subs
        if (sp?.sub === '1mi') {
          g.fillStyle(0xFFCC00, 1);
          g.fillRect(x - w * 0.30, y - h * 0.10, w * 0.60, h * 0.10);
        } else if (sp?.sub === 'exit') {
          g.fillStyle(0xFFEE00, 1);
          g.fillRect(x - w * 0.30, y - h * 0.10, w * 0.60, h * 0.10);
          // Right-pointing arrow on the green face
          g.fillStyle(BORDER, 0.95);
          g.fillTriangle(
            x + w * 0.10, y + h * 0.40,
            x + w * 0.40, y + h * 0.40,
            x + w * 0.40, y + h * 0.55,
          );
          g.fillRect(x + w * 0.10, y + h * 0.42, w * 0.30, h * 0.08);
        }
        break;
      }
      case 'exit_sign_green': {
        // Big I-90-style green overhead sign.  Text (REST STOP, EXIT label,
        // town name) is painted directly on the green face by the
        // GameScene text overlay; the highway-shield badge in the top-left
        // corner is overlaid as an Image by GameScene._renderSignDecals.
        const POST_COL = 0x6E665A;
        const FACE     = 0x0E5C24;     // interstate green
        const FACE_HI  = 0x2A8E3F;
        const BORDER   = 0xFFFFFF;
        // Two tall steel posts
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.40, y + h * 0.65, w * 0.07, h * 0.35);
        g.fillRect(x + w * 0.33, y + h * 0.65, w * 0.07, h * 0.35);
        // White-bordered green sign face
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.66, y - h * 0.02, w * 1.32, h * 0.72);
        g.fillStyle(FACE, 1);
        g.fillRect(x - w * 0.62, y + h * 0.02, w * 1.24, h * 0.64);
        g.fillStyle(FACE_HI, 1);
        g.fillRect(x - w * 0.62, y + h * 0.02, w * 1.24, h * 0.06);
        // Yellow plaque on top — header reads "REST STOP".
        g.fillStyle(0xFFEE00, 1);
        g.fillRect(x - w * 0.42, y - h * 0.18, w * 0.84, h * 0.18);
        g.fillStyle(0x000000, 1);
        g.fillRect(x - w * 0.40, y - h * 0.16, w * 0.80, h * 0.02);
        // Down-arrow indicator (right-side exit)
        g.fillStyle(BORDER, 0.95);
        g.fillTriangle(
          x + w * 0.30, y + h * 0.66,
          x + w * 0.55, y + h * 0.66,
          x + w * 0.42, y + h * 0.74,
        );
        break;
      }
      case 'amenities_sign': {
        // White rectangle "frame" sized slightly larger than the pre-baked
        // PNG that GameScene._renderSignDecals overlays — the white halos
        // the artwork on every side.  Tall steel legs run from the bottom
        // of the white rect down to the road surface so the sign reads as
        // an overhead gantry, not a ground-mounted placard.  All
        // measurements are in `w` units (= signW in _renderSignDecals)
        // so the procedural frame and PNG overlay always align.
        //
        // PNG natural aspect 1277:840 ≈ 1.52:1.  PNG drawn at width
        // 1.20 w (height 0.789 w).  White frame is 1.30 w × 0.87 w —
        // 4 % padding all around.  Legs extend from frame bottom
        // (y + 0.83 w) down to the road (y + h).
        const POST_COL = 0x6E665A;
        const BORDER   = 0xFFFFFF;
        const frameTop    = y - w * 0.04;
        const frameBottom = y + w * 0.83;
        // White rectangle
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.65, frameTop, w * 1.30, frameBottom - frameTop);
        // Legs — only draw if there's room below the frame for them
        // (sprite height must be > frame bottom).
        const legBottom = y + h;
        if (legBottom > frameBottom) {
          g.fillStyle(POST_COL, 1);
          g.fillRect(x - w * 0.40, frameBottom, w * 0.07, legBottom - frameBottom);
          g.fillRect(x + w * 0.33, frameBottom, w * 0.07, legBottom - frameBottom);
        }
        break;
      }
      case 'grade_sign': {
        // Yellow regulatory warning sign — diamond-on-square aesthetic with
        // a black border.  Used for "STEEP GRADE" / "TRUCKS USE LOWER GEAR"
        // warnings before sustained 4 %+ descents/climbs.  Text is painted
        // by GameScene._renderSignText on top of the yellow face.
        const POST_COL = 0x6E665A;
        const FACE     = 0xFFCC22;
        const BORDER   = 0x000000;
        // Posts
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.25, y + h * 0.55, w * 0.06, h * 0.45);
        g.fillRect(x + w * 0.19, y + h * 0.55, w * 0.06, h * 0.45);
        // Black diamond border (rectangle, since fillTriangle math costs more)
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.50, y - h * 0.02, w * 1.00, h * 0.62);
        // Yellow face slightly inset
        g.fillStyle(FACE, 1);
        g.fillRect(x - w * 0.46, y + h * 0.02, w * 0.92, h * 0.54);
        break;
      }
      case 'mileage_sign': {
        // Highway green location sign — town + mile painted directly on
        // the green face by the GameScene overlay (no white inset plates).
        const POST_COL = 0x6E665A;
        const FACE     = 0x0E5C24;
        const FACE_HI  = 0x2A8E3F;
        const BORDER   = 0xFFFFFF;
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.30, y + h * 0.55, w * 0.06, h * 0.45);
        g.fillRect(x + w * 0.24, y + h * 0.55, w * 0.06, h * 0.45);
        // White-bordered green face
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.55, y - h * 0.02, w * 1.10, h * 0.62);
        g.fillStyle(FACE, 1);
        g.fillRect(x - w * 0.51, y + h * 0.02, w * 1.02, h * 0.54);
        g.fillStyle(FACE_HI, 1);
        g.fillRect(x - w * 0.51, y + h * 0.02, w * 1.02, h * 0.06);
        break;
      }
      case 'next_stops_sign': {
        // Tall green I-90-style upcoming-exits placard — a single big
        // green face listing the next three town names + mile counts.
        // Header band at top reads "NEXT EXITS" (painted by GameScene).
        const POST_COL = 0x6E665A;
        const FACE     = 0x0E5C24;
        const FACE_HI  = 0x2A8E3F;
        const BORDER   = 0xFFFFFF;
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.34, y + h * 0.65, w * 0.06, h * 0.35);
        g.fillRect(x + w * 0.28, y + h * 0.65, w * 0.06, h * 0.35);
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.62, y - h * 0.02, w * 1.24, h * 0.74);
        g.fillStyle(FACE, 1);
        g.fillRect(x - w * 0.58, y + h * 0.02, w * 1.16, h * 0.66);
        g.fillStyle(FACE_HI, 1);
        g.fillRect(x - w * 0.58, y + h * 0.02, w * 1.16, h * 0.06);
        break;
      }
      case 'sign': {
        // Legacy random sign (no longer spawned, kept for any old cached
        // segments).  Re-route to the new mileage_sign style for parity.
        const POST_COL = 0x6E665A;
        const FACE     = 0x0E5C24;
        const FACE_HI  = 0x2A8E3F;
        const BORDER   = 0xFFFFFF;
        g.fillStyle(POST_COL, 1);
        g.fillRect(x - w * 0.30, y + h * 0.55, w * 0.06, h * 0.45);
        g.fillRect(x + w * 0.24, y + h * 0.55, w * 0.06, h * 0.45);
        g.fillStyle(BORDER, 1);
        g.fillRect(x - w * 0.55, y - h * 0.02, w * 1.10, h * 0.62);
        g.fillStyle(FACE, 1);
        g.fillRect(x - w * 0.51, y + h * 0.02, w * 1.02, h * 0.54);
        g.fillStyle(FACE_HI, 1);
        g.fillRect(x - w * 0.51, y + h * 0.02, w * 1.02, h * 0.06);
        g.fillStyle(BORDER, 0.95);
        g.fillRect(x - w * 0.42, y + h * 0.10, w * 0.84, h * 0.16);
        g.fillRect(x - w * 0.18, y + h * 0.34, w * 0.36, h * 0.13);
        break;
      }
      case 'beer': {
        // Shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(x + w * 0.08, y + h, w * 0.55, h * 0.09);
        // Bottle body
        g.fillStyle(0xCC8800, 1);
        g.fillRoundedRect(x - w * 0.28, y + h * 0.32, w * 0.56, h * 0.64, w * 0.1);
        // Bottle neck
        g.fillStyle(0xBB7700, 1);
        g.fillRect(x - w * 0.15, y + h * 0.10, w * 0.3, h * 0.24);
        // Cap
        g.fillStyle(0xCC2222, 1);
        g.fillRect(x - w * 0.18, y + h * 0.06, w * 0.36, h * 0.08);
        // Label
        g.fillStyle(0xFFFFFF, 0.95);
        g.fillRect(x - w * 0.22, y + h * 0.44, w * 0.44, h * 0.32);
        g.fillStyle(0xCC4400, 1);
        g.fillRect(x - w * 0.16, y + h * 0.50, w * 0.32, h * 0.07);
        g.fillRect(x - w * 0.12, y + h * 0.62, w * 0.24, h * 0.05);
        // Highlight
        g.fillStyle(0xFFDD88, 0.38);
        g.fillRect(x - w * 0.08, y + h * 0.35, w * 0.1, h * 0.55);
        break;
      }
      case 'weed': {
        // Shadow
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(x + w * 0.1, y + h, w * 0.7, h * 0.1);
        // Stem
        g.fillStyle(0x5B8C2A, 1);
        g.fillRect(x - w * 0.05, y + h * 0.55, w * 0.1, h * 0.45);
        // Leaf clusters
        g.fillStyle(0x33AA22, 1);
        g.fillCircle(x, y + h * 0.42, w * 0.36);
        g.fillStyle(0x28882A, 1);
        g.fillCircle(x - w * 0.28, y + h * 0.30, w * 0.27);
        g.fillCircle(x + w * 0.28, y + h * 0.30, w * 0.27);
        g.fillStyle(0x44CC33, 1);
        g.fillCircle(x, y + h * 0.22, w * 0.22);
        // Highlights
        g.fillStyle(0x88FF66, 0.22);
        g.fillCircle(x - w * 0.1, y + h * 0.35, w * 0.15);
        break;
      }
      case 'cocaine': {
        // Dark surface
        g.fillStyle(0x111122, 1);
        g.fillRect(x - w * 0.44, y + h * 0.3, w * 0.88, h * 0.45);
        // White powder lines
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(x - w * 0.38, y + h * 0.4, w * 0.76, h * 0.1);
        g.fillRect(x - w * 0.32, y + h * 0.55, w * 0.64, h * 0.09);
        // Shimmer
        g.fillStyle(0xDDDDFF, 0.6);
        g.fillRect(x - w * 0.38, y + h * 0.08, w * 0.76, h * 0.12);
        // Card/mirror reflection
        g.fillStyle(0x8888CC, 0.35);
        g.fillRect(x - w * 0.44, y + h * 0.3, w * 0.88, h * 0.05);
        break;
      }
      case 'hitchhiker': {
        // Shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(x + w * 0.1, y + h, w * 0.55, h * 0.08);
        // Legs
        g.fillStyle(0x334488, 1); // jeans
        g.fillRect(x - w * 0.14, y + h * 0.62, w * 0.12, h * 0.38);
        g.fillRect(x + w * 0.02, y + h * 0.62, w * 0.12, h * 0.38);
        // Body / shirt
        g.fillStyle(0xDD4422, 1);
        g.fillRect(x - w * 0.18, y + h * 0.30, w * 0.36, h * 0.35);
        // Body shading
        g.fillStyle(0xAA2211, 0.5);
        g.fillRect(x + w * 0.02, y + h * 0.30, w * 0.16, h * 0.35);
        // Arms — one raised (thumb out)
        g.fillStyle(0xDD9966, 1); // skin
        g.fillRect(x - w * 0.36, y + h * 0.32, w * 0.18, h * 0.08); // left arm down
        g.fillRect(x + w * 0.18, y + h * 0.18, w * 0.08, h * 0.18); // right arm up
        // Thumb
        g.fillRect(x + w * 0.26, y + h * 0.18, w * 0.1, h * 0.06);
        // Head
        g.fillStyle(0xDD9966, 1);
        g.fillCircle(x, y + h * 0.16, w * 0.2);
        // Hair
        g.fillStyle(0x442211, 1);
        g.fillRect(x - w * 0.2, y + h * 0.04, w * 0.4, h * 0.1);
        break;
      }
      case 'f12_gun': {
        g.fillStyle(0x888888, 1);
        g.fillRect(x - w * 0.45, y + h * 0.35, w * 0.9, h * 0.3);
        g.fillRect(x - w * 0.15, y + h * 0.15, w * 0.3, h * 0.55);
        g.fillStyle(0xCCCCCC, 1);
        g.fillRect(x - w * 0.1, y + h * 0.18, w * 0.2, h * 0.18);
        break;
      }
      case 'f12_spike': {
        g.fillStyle(0xFF7700, 1);
        g.fillRect(x - w * 0.5, y + h * 0.65, w, h * 0.2);
        for (let s = 0; s < 5; s++) {
          const sx = x - w * 0.4 + s * w * 0.2;
          g.fillTriangle(sx, y + h * 0.65, sx - w * 0.08, y + h * 0.85, sx + w * 0.08, y + h * 0.85);
        }
        g.fillStyle(0xFFAA44, 0.7);
        g.fillRect(x - w * 0.4, y + h * 0.25, w * 0.8, h * 0.2);
        break;
      }
      case 'f12_paint': {
        g.fillStyle(0xFFEE00, 1);
        g.fillCircle(x, y + h * 0.55, w * 0.42);
        g.fillStyle(0xFF9900, 0.8);
        g.fillCircle(x + w * 0.28, y + h * 0.3, w * 0.22);
        g.fillCircle(x - w * 0.3,  y + h * 0.72, w * 0.18);
        g.fillStyle(0xFFCC00, 0.9);
        g.fillCircle(x - w * 0.22, y + h * 0.35, w * 0.16);
        break;
      }
      case 'f12_rocket': {
        g.fillStyle(0xFF3300, 1);
        g.fillRect(x - w * 0.12, y + h * 0.2, w * 0.24, h * 0.65);
        g.fillTriangle(x, y, x - w * 0.22, y + h * 0.28, x + w * 0.22, y + h * 0.28);
        g.fillStyle(0xFF8800, 1);
        g.fillTriangle(x - w * 0.12, y + h * 0.85, x + w * 0.12, y + h * 0.85, x, y + h * 1.0);
        break;
      }
      case 'f12_emp': {
        g.fillStyle(0x2244FF, 1);
        g.fillCircle(x, y + h * 0.5, w * 0.45);
        g.fillStyle(0xFFFFFF, 0.9);
        // Lightning bolt
        g.fillTriangle(x + w * 0.1, y + h * 0.1, x - w * 0.12, y + h * 0.52, x + w * 0.06, y + h * 0.52);
        g.fillTriangle(x - w * 0.06, y + h * 0.48, x + w * 0.12, y + h * 0.9, x - w * 0.1, y + h * 0.9);
        break;
      }
      case 'f12_disguise': {
        g.fillStyle(0xFFCC00, 1);
        g.fillCircle(x, y + h * 0.45, w * 0.42);
        g.fillStyle(0x000000, 1);
        g.fillEllipse(x - w * 0.14, y + h * 0.38, w * 0.14, h * 0.1);
        g.fillEllipse(x + w * 0.14, y + h * 0.38, w * 0.14, h * 0.1);
        g.fillStyle(0xCC3300, 1);
        g.fillEllipse(x, y + h * 0.58, w * 0.28, h * 0.1);
        break;
      }
      case 'house': {
        const wall      = sp?.wallColor || 0xC8B89A;
        const roof      = sp?.roofColor || 0x4A2E2A;
        const wallDark  = lerpColor(wall, 0x000000, 0.30);
        const wallLight = lerpColor(wall, 0xFFFFFF, 0.20);
        const roofDark  = lerpColor(roof, 0x000000, 0.35);
        const twoStory  = !!sp?.twoStory;
        const hasGarage = !!sp?.hasGarage;
        const hasChimney= !!sp?.hasChimney;
        const hasDormer = !!sp?.hasDormer;
        const flatRoof  = !!sp?.flatRoof;
        // Two-story homes have a taller body (smaller roof relative to body).
        const bodyTopY = y + h * (twoStory ? 0.20 : 0.32);
        const bodyH    = h * (twoStory ? 0.80 : 0.68);
        // Garage on the right side narrows the main body; otherwise full width.
        const bodyL    = -0.45;
        const bodyR    = hasGarage ?  0.18 :  0.45;
        const bodyW    = (bodyR - bodyL) * w;
        const bodyX    = x + bodyL * w;

        // Body rectangle (wall color).
        g.fillStyle(wall, 1);
        g.fillRect(bodyX, bodyTopY, bodyW, bodyH);
        // Side shadow on the right edge of the body
        g.fillStyle(wallDark, 1);
        g.fillRect(x + (bodyR - 0.07) * w, bodyTopY, w * 0.07, bodyH);
        // Top trim where wall meets roof
        g.fillStyle(wallLight, 1);
        g.fillRect(bodyX, bodyTopY, bodyW, h * 0.03);

        const ridgeY = bodyTopY - h * (twoStory ? 0.18 : 0.30);
        if (flatRoof) {
          // Modern / contemporary — flat parapet roof.  Just a short
          // band of roof color sitting on top of the body, plus a thin
          // dark line as the parapet edge.  No gable triangle.
          const flatTop = bodyTopY - h * 0.06;
          g.fillStyle(roof, 1);
          g.fillRect(bodyX - w * 0.02, flatTop, bodyW + w * 0.04, h * 0.06);
          g.fillStyle(roofDark, 1);
          g.fillRect(bodyX - w * 0.02, flatTop, bodyW + w * 0.04, Math.max(1, h * 0.014));
        } else {
          // Gable roof — triangle on top of the body.  Bottom edge
          // slightly wider than the body for an eaves overhang.
          g.fillStyle(roof, 1);
          g.fillTriangle(
            bodyX - w * 0.05,           bodyTopY,
            x + bodyR * w + w * 0.05,   bodyTopY,
            x + (bodyL + bodyR) / 2 * w, ridgeY
          );
          // Roof shadow side
          g.fillStyle(roofDark, 1);
          g.fillTriangle(
            x + (bodyL + bodyR) / 2 * w, ridgeY,
            x + bodyR * w + w * 0.05,    bodyTopY,
            x + bodyR * w - w * 0.10,    bodyTopY
          );
        }

        // Garage box + door (right side of house, single-story).
        if (hasGarage) {
          const garL = x + 0.20 * w;
          const garW = w * 0.28;
          const garTop = bodyTopY + h * 0.20;
          const garH = bodyTopY + bodyH - garTop;
          g.fillStyle(wall, 1);
          g.fillRect(garL, garTop, garW, garH);
          g.fillStyle(wallDark, 1);
          g.fillRect(garL + garW - w * 0.04, garTop, w * 0.04, garH);
          // Garage roof — gable on a gabled house, flat band on a
          // flat-roofed house so the garage matches the main roofline.
          if (flatRoof) {
            g.fillStyle(roof, 1);
            g.fillRect(garL - w * 0.02, garTop - h * 0.04, garW + w * 0.04, h * 0.04);
          } else {
            g.fillStyle(roof, 1);
            g.fillTriangle(
              garL - w * 0.02,        garTop,
              garL + garW + w * 0.02, garTop,
              garL + garW / 2,        garTop - h * 0.10
            );
          }
          // Garage door (lighter rectangle with horizontal lines)
          g.fillStyle(0xAAA39C, 1);
          g.fillRect(garL + w * 0.02, garTop + h * 0.06, garW - w * 0.04, garH - h * 0.10);
          g.fillStyle(wallDark, 0.6);
          for (let lineY = garTop + h * 0.10; lineY < garTop + garH - h * 0.06; lineY += h * 0.04) {
            g.fillRect(garL + w * 0.02, lineY, garW - w * 0.04, Math.max(1, h * 0.005));
          }
        }

        // Chimney — short brick stack.  Skipped on flat-roof homes
        // (modern houses don't have chimneys).
        if (hasChimney && !flatRoof) {
          const chX = x + (bodyL + 0.10) * w;
          const chW = w * 0.06;
          const chTop = ridgeY + h * 0.04;
          const chH = h * 0.14;
          g.fillStyle(0x6B4030, 1);
          g.fillRect(chX, chTop, chW, chH);
          g.fillStyle(0x4A2E22, 1);
          g.fillRect(chX, chTop, chW, h * 0.018);
        }

        // Dormer — small gable poking out of the main roof.  Skipped on
        // flat-roof homes (no roof to dormer).
        if (hasDormer && !flatRoof) {
          const dmX = x + (bodyL + bodyR) / 2 * w;
          const dmW = w * 0.18;
          const dmTop = bodyTopY - h * 0.10;
          g.fillStyle(wall, 1);
          g.fillRect(dmX - dmW / 2, dmTop, dmW, h * 0.10);
          g.fillStyle(roof, 1);
          g.fillTriangle(
            dmX - dmW / 2 - w * 0.01, dmTop,
            dmX + dmW / 2 + w * 0.01, dmTop,
            dmX,                      dmTop - h * 0.06
          );
          // Dormer window
          g.fillStyle(0x88AACC, 0.95);
          g.fillRect(dmX - dmW * 0.30, dmTop + h * 0.025, dmW * 0.60, h * 0.05);
        }

        // Door (centered on body, full-height-ish)
        const doorY = bodyTopY + bodyH * 0.45;
        const doorX = bodyX + bodyW * 0.45;
        g.fillStyle(0x3A2A1A, 1);
        g.fillRect(doorX, doorY, w * 0.10, bodyH * 0.50);
        g.fillStyle(0xCCAA22, 1);
        g.fillRect(doorX + w * 0.075, doorY + bodyH * 0.20, w * 0.018, h * 0.025);

        // Two windows flanking the door (on the body, not the garage)
        const winY = bodyTopY + bodyH * 0.20;
        const winH = bodyH * 0.22;
        for (const wxOff of [-0.18, 0.05]) {
          const wx = bodyX + bodyW * 0.50 + wxOff * w;
          g.fillStyle(wallDark, 1);
          g.fillRect(wx - w * 0.005, winY, w * 0.13, winH);
          g.fillStyle(0x88AACC, 0.95);
          g.fillRect(wx, winY + h * 0.005, w * 0.12, winH - h * 0.01);
          g.fillStyle(wallDark, 0.9);
          g.fillRect(wx + w * 0.058, winY + h * 0.005, w * 0.005, winH - h * 0.01);
          g.fillRect(wx, winY + winH * 0.5, w * 0.12, Math.max(1, h * 0.004));
        }

        // Second-story windows for two-story homes.
        if (twoStory) {
          const winY2 = bodyTopY + bodyH * 0.04;
          const winH2 = bodyH * 0.16;
          for (const wxOff of [-0.18, 0.05]) {
            const wx = bodyX + bodyW * 0.50 + wxOff * w;
            g.fillStyle(wallDark, 1);
            g.fillRect(wx - w * 0.005, winY2, w * 0.13, winH2);
            g.fillStyle(0x88AACC, 0.95);
            g.fillRect(wx, winY2 + h * 0.004, w * 0.12, winH2 - h * 0.008);
          }
        }
        break;
      }
      case 'building': {
        const floors    = sp?.floors || 3;
        const wall      = sp?.wallColor || 0xCC8844;
        const wallDark  = lerpColor(wall, 0x000000, 0.38);
        const wallLight = lerpColor(wall, 0xFFFFFF, 0.22);

        // Main facade
        g.fillStyle(wall, 1);
        g.fillRect(x - w * 0.5, y, w * 0.78, h);

        // Shadow side (right face — angled away)
        g.fillStyle(wallDark, 1);
        g.fillRect(x + w * 0.28, y, w * 0.22, h);

        // Top highlight strip
        g.fillStyle(wallLight, 1);
        g.fillRect(x - w * 0.5, y, w * 0.78, h * 0.04);

        // Bottom shadow strip
        g.fillStyle(wallDark, 0.6);
        g.fillRect(x - w * 0.5, y + h * 0.94, w * 0.78, h * 0.06);

        // Window grid
        const winRows = Math.max(2, floors);
        const winCols = 3;
        for (let r = 0; r < winRows; r++) {
          for (let c = 0; c < winCols; c++) {
            const wx = x - w * 0.38 + c * (w * 0.25);
            const wy = y + h * 0.10 + r * (h * 0.72 / winRows);
            const ww = w * 0.14;
            const wh = h * 0.60 / winRows;
            // Window frame
            g.fillStyle(wallDark, 1);
            g.fillRect(wx - w * 0.01, wy - h * 0.01, ww + w * 0.02, wh + h * 0.02);
            // Window glass — lit yellow/blue at random (seeded by position)
            const lit = ((r * 7 + c * 13 + floors) % 3) !== 0;
            g.fillStyle(lit ? 0xFFEEAA : 0x4488CC, 0.85);
            g.fillRect(wx, wy, ww, wh);
            // Window reflection
            g.fillStyle(0xFFFFFF, 0.18);
            g.fillRect(wx, wy, ww * 0.4, wh * 0.45);
          }
        }

        // Ground-floor awning / sign strip
        g.fillStyle(lerpColor(wall, 0x000000, 0.25), 1);
        g.fillRect(x - w * 0.5, y + h * 0.84, w * 0.78, h * 0.09);
        // Awning highlight
        g.fillStyle(wallLight, 0.5);
        g.fillRect(x - w * 0.5, y + h * 0.84, w * 0.78, h * 0.02);
        break;
      }
      case 'cop_roadblock': {
        // Large bright police barricade — unmissable
        // Orange/white road barrier strips
        g.fillStyle(0xFF6600, 1);
        g.fillRect(x - w * 0.55, y + h * 0.55, w * 1.1, h * 0.18);
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(x - w * 0.55, y + h * 0.73, w * 1.1, h * 0.12);
        g.fillStyle(0xFF6600, 1);
        g.fillRect(x - w * 0.55, y + h * 0.85, w * 1.1, h * 0.10);

        // Police car body (strong blue)
        g.fillStyle(0x1133CC, 1);
        g.fillRect(x - w * 0.42, y + h * 0.22, w * 0.84, h * 0.38);
        // Roof
        g.fillStyle(0x0A1A88, 1);
        g.fillRect(x - w * 0.28, y + h * 0.06, w * 0.56, h * 0.20);
        // Windshield
        g.fillStyle(0x88AAFF, 0.9);
        g.fillRect(x - w * 0.24, y + h * 0.08, w * 0.48, h * 0.15);

        // Flashing light bar — always-on vivid red+blue
        g.fillStyle(0xFF1111, 1);
        g.fillRect(x - w * 0.28, y, w * 0.26, h * 0.10);
        g.fillStyle(0x1144FF, 1);
        g.fillRect(x + w * 0.02, y, w * 0.26, h * 0.10);

        // POLICE text bar
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(x - w * 0.38, y + h * 0.28, w * 0.76, h * 0.06);

        // Wheels
        g.fillStyle(0x111111, 1);
        g.fillEllipse(x - w * 0.28, y + h * 0.58, w * 0.24, h * 0.14);
        g.fillEllipse(x + w * 0.28, y + h * 0.58, w * 0.24, h * 0.14);
        break;
      }
      case 'cop_light': {
        // Red/blue flashing — caller handles timing
        g.fillStyle(0x2244CC, 1);
        g.fillRect(x - w * 0.5, y, w, h * 0.5);
        g.fillStyle(0xCC2222, 1);
        g.fillRect(x - w * 0.5, y + h * 0.5, w, h * 0.5);
        break;
      }
      default:
        break;
    }
  }

  /** Draw on-road vehicles (traffic + cops) scaled by depth */
  /** Curve-aware projection for vehicles. Given a relative Z (units ahead
   *  of the player), return the segment's accumulated screenX/screenY/screenW
   *  so a vehicle at lateral lane-offset `laneOffset` stays glued to its lane
   *  through curves AND through the player's own lateral steering.
   *
   *  IMPORTANT: drawn[].screenX is already computed relative to the player's
   *  camera (Road.render() passes `cameraX = playerX * ROAD_WIDTH` into
   *  project()), so we MUST NOT subtract playerLatX again here. Doing so
   *  double-counted player lateral and made cars appear to "follow" the
   *  player's steering by 2× what they should. */
  /**
   *  Canonical road-surface query — every system that needs to know
   *  "where is the drivable pavement on screen at this depth?" should
   *  go through this one function.  Player car, NPC cars, drug pickups,
   *  cops, shadows, signage — all consume sampleSurface() so the road
   *  owns its own surface position and nothing else has to invent one.
   *
   *    relativeZ:  distance ahead of the camera, world units.
   *    laneOffset: ±0.5 normalized lane position (left/right of centre).
   *    opts.allowClipped (default false):
   *      when false, segments hidden by crest-clipping return null so
   *      NPC sprites get culled instead of floating over grass/sky.
   *      When true, the projection is returned regardless of visibility
   *      — used by the PLAYER car so it never loses road contact.
   *
   *  Returns { sx, sy, sw, scale, visible } or null.  Float coords —
   *  no integer rounding, so road geometry stays sub-pixel for clean AA.
   */
  sampleSurface(relativeZ, laneOffset, opts) {
    const allowClipped = opts && opts.allowClipped === true;
    const samples = this._surfaceSamples;
    if (samples) {
      // Boundary n is projected at camera-space depth n*SEG - cameraZ.
      // Convert requested camera-relative Z into the matching fractional
      // boundary index.  Ignoring cameraZ here made cars and shadows sample
      // the wrong surface for most of each segment, then snap at boundaries.
      const fIdx = (relativeZ + (this._cameraZ ?? 0)) / SEG_LENGTH;
      const idxA = Math.max(0, Math.min(DRAW_DIST, Math.floor(fIdx)));
      const idxB = Math.max(0, Math.min(DRAW_DIST, idxA + 1));
      const t    = Math.max(0, Math.min(1, fIdx - idxA));
      const a = samples[idxA];
      const b = samples[idxB];
      if (a && a.valid) {
        const useB = b && b.valid;
        const visible = (a.visible !== false) && (!useB || b.visible !== false);
        if (!visible && !allowClipped) return null;
        const bw = useB ? b.screenW : a.screenW;
        const bx = useB ? b.screenX : a.screenX;
        const by = useB ? b.screenY : a.screenY;
        const bs = useB ? b.scale   : a.scale;
        const screenW = a.screenW + (bw - a.screenW) * t;
        const sx = a.screenX + (bx - a.screenX) * t + screenW * laneOffset;
        const sy = a.screenY + (by - a.screenY) * t;
        const scale = a.scale + (bs - a.scale) * t;
        const sw = scale * 825 * SCREEN_W / 2;
        return { sx, sy, sw, scale, visible, roadHalfW: screenW };
      }
    }
    // First-frame fallback (samples not yet populated).
    const scale = CAM_DEPTH / Math.max(1, relativeZ);
    return {
      sx: SCREEN_W / 2 + scale * laneOffset * ROAD_WIDTH * SCREEN_W / 2,
      sy: SCREEN_H / 2 + scale * 1000 * SCREEN_H / 2,
      sw: scale * 825 * SCREEN_W / 2,
      roadHalfW: scale * ROAD_WIDTH * SCREEN_W / 2,
      scale,
      visible: true,
    };
  }

  /** Back-compat NPC projection — same shape as before (sx/sy/sw, no
   *  visible/scale).  Returns null on clipped segments so callers that
   *  currently `if (!proj) return` cull cleanly. */
  getVehicleProjection(relativeZ, laneOffset /* playerLatX not needed */) {
    const s = this.sampleSurface(relativeZ, laneOffset);
    if (!s) return null;
    return { sx: s.sx, sy: s.sy, sw: s.sw };
  }

  renderVehicle(g, screenX, screenY, screenW, scale, isCop, color, flash) {
    const vw = toInt(screenW * 0.72);
    const vh = toInt(vw * 0.52);
    const vx = screenX - vw / 2;
    const vy = screenY - vh;

    if (vy + vh < 0 || vy > SCREEN_H || vw < 4) return;

    // Ground shadow
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(screenX, screenY + 1, vw * 0.9, vh * 0.18);

    // Body — slightly lighter shade on top for shading
    const bodyLight = lerpColor(color, 0xFFFFFF, 0.15);
    const bodyShadow = lerpColor(color, 0x000000, 0.2);
    g.fillStyle(color, 1);
    g.fillRect(vx, vy + vh * 0.28, vw, vh * 0.52);
    // Top of body slightly lighter
    g.fillStyle(bodyLight, 1);
    g.fillRect(vx, vy + vh * 0.28, vw, vh * 0.14);
    // Side shadow
    g.fillStyle(bodyShadow, 0.45);
    g.fillRect(vx + vw * 0.72, vy + vh * 0.28, vw * 0.28, vh * 0.52);

    // Roof
    g.fillStyle(isCop ? 0x1A1A1A : lerpColor(color, 0x000000, 0.4), 1);
    g.fillRect(vx + vw * 0.14, vy + vh * 0.04, vw * 0.72, vh * 0.28);

    // Windshield
    g.fillStyle(0x99CCFF, 0.8);
    g.fillRect(vx + vw * 0.17, vy + vh * 0.06, vw * 0.66, vh * 0.2);
    // Windshield reflection
    g.fillStyle(0xFFFFFF, 0.25);
    g.fillRect(vx + vw * 0.17, vy + vh * 0.06, vw * 0.2, vh * 0.2);

    // Rear window
    g.fillStyle(0x6699BB, 0.7);
    g.fillRect(vx + vw * 0.20, vy + vh * 0.08, vw * 0.28, vh * 0.16);

    // Wheels + wheel arch
    g.fillStyle(0x1A1A1A, 1);
    g.fillEllipse(vx + vw * 0.2,  vy + vh * 0.78, vw * 0.26, vh * 0.28);
    g.fillEllipse(vx + vw * 0.8,  vy + vh * 0.78, vw * 0.26, vh * 0.28);
    // Hubcaps
    g.fillStyle(0xCCCCCC, 1);
    g.fillCircle(vx + vw * 0.2,  vy + vh * 0.78, vw * 0.07);
    g.fillCircle(vx + vw * 0.8,  vy + vh * 0.78, vw * 0.07);

    // Headlights
    g.fillStyle(0xFFFFCC, 0.9);
    g.fillRect(vx + vw * 0.06, vy + vh * 0.54, vw * 0.14, vh * 0.12);
    g.fillRect(vx + vw * 0.80, vy + vh * 0.54, vw * 0.14, vh * 0.12);
    // Headlight glow
    g.fillStyle(0xFFFFAA, 0.3);
    g.fillRect(vx + vw * 0.04, vy + vh * 0.52, vw * 0.18, vh * 0.16);

    if (isCop) {
      // Light bar housing
      g.fillStyle(0x333333, 1);
      g.fillRect(vx + vw * 0.18, vy, vw * 0.64, vh * 0.09);
      // Flashing lights
      g.fillStyle(flash ? 0xFF3333 : 0x440000, 1);
      g.fillRect(vx + vw * 0.19, vy + vh * 0.01, vw * 0.28, vh * 0.07);
      g.fillStyle(flash ? 0x2255FF : 0x000044, 1);
      g.fillRect(vx + vw * 0.53, vy + vh * 0.01, vw * 0.28, vh * 0.07);
    }
  }

  /** Absolute screen Y at road surface for a given depth index */
  roadScreenYAtDepth(n) {
    if (n <= 0) return HALF_H;
    const scale = CAM_DEPTH / (n * SEG_LENGTH);
    return toInt(HALF_H - scale * CAM_HEIGHT * HALF_H);
  }
}
