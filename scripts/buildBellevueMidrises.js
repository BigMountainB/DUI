/**
 * Generate 2 stand-alone Bellevue mid-rise PNGs that match the palette
 * and composition of public/assets/buildings/codex/bellevue_roadside_strip.png.
 *
 * Output: 256×384 PNG (non-power-of-2, ~1.5 MB GPU memory each).  Two unique
 * textures total → two batched draw calls regardless of how many copies
 * are scattered along the road.
 *
 *   public/assets/buildings/codex/bellevue_midrise_brick.png
 *   public/assets/buildings/codex/bellevue_midrise_stucco.png
 *
 * Run with:  node scripts/buildBellevueMidrises.js
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT    = path.resolve(path.dirname(__filename), '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'buildings', 'codex');

const W = 256;
const H = 384;

// Palette pulled from the strip image — warm brick browns, cream stucco,
// teal-grey accents, sky-reflection blues, awning reds + teals.
const C = {
  brickLight:  '#A87555',
  brickMid:    '#8B5A3C',
  brickDark:   '#6B4423',
  brickMortar: '#3E2A1C',
  stuccoCream: '#E8D5B5',
  stuccoTan:   '#D4B888',
  stuccoDeep:  '#B89968',
  trimDark:    '#2C2A28',
  trimGrey:    '#4A5660',
  trimMidGrey: '#5C6A7A',
  windowSky:   '#9CC5DD',
  windowMid:   '#7AAFCC',
  windowDark:  '#5A88A5',
  windowFrame: '#1F1E1D',
  awningRed:   '#B85040',
  awningTeal:  '#4A8090',
  storeGlass:  '#C8D4D8',
  storeFrame:  '#3A3836',
  shadowSoft:  'rgba(0,0,0,0.18)',
  highlightSoft:'rgba(255,255,255,0.12)',
};

/** Draw a row of windows across a floor band. */
function windowsRow(yTop, yBot, count, frameColor, glassA, glassB) {
  const margin = 14;
  const gap    = 6;
  const usableW = W - margin * 2;
  const winW    = (usableW - gap * (count - 1)) / count;
  const winH    = (yBot - yTop) - 18;
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = margin + i * (winW + gap);
    const y = yTop + 12;
    // Window frame
    out += `<rect x="${x}" y="${y}" width="${winW}" height="${winH}" fill="${frameColor}"/>`;
    // Glass — vertical gradient from sky-light at top to deeper at bottom
    out += `<rect x="${x+2}" y="${y+2}" width="${winW-4}" height="${winH-4}" fill="url(#glassGrad)"/>`;
    // Center mullion
    out += `<rect x="${x + winW/2 - 0.5}" y="${y+2}" width="1" height="${winH-4}" fill="${frameColor}" opacity="0.7"/>`;
    // Sill — narrow band below window for depth
    out += `<rect x="${x-1}" y="${y+winH}" width="${winW+2}" height="2" fill="${C.trimDark}" opacity="0.6"/>`;
  }
  return out;
}

/** Storefront with awning, glass front, door at one side. */
function storefront(yTop, yBot, awningColor) {
  const margin = 8;
  const fullW  = W - margin * 2;
  const fullH  = yBot - yTop;
  // Awning (scalloped band along the top)
  const awningH = 14;
  let s = '';
  s += `<rect x="${margin-2}" y="${yTop}" width="${fullW+4}" height="${awningH}" fill="${awningColor}"/>`;
  // Awning scallops
  for (let i = 0; i < 8; i++) {
    const sx = margin + i * (fullW / 8);
    s += `<path d="M ${sx} ${yTop+awningH} q ${(fullW/16)} 6 ${(fullW/8)} 0" fill="${awningColor}"/>`;
  }
  // Awning shadow line
  s += `<rect x="${margin-2}" y="${yTop+awningH-3}" width="${fullW+4}" height="2" fill="rgba(0,0,0,0.25)"/>`;
  // Storefront base — dark frame
  const baseY = yTop + awningH + 6;
  const baseH = yBot - baseY - 2;
  s += `<rect x="${margin}" y="${baseY}" width="${fullW}" height="${baseH}" fill="${C.storeFrame}"/>`;
  // Glass panels — 3 across
  const panelGap = 3;
  const panelW   = (fullW - 4 - panelGap * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const px = margin + 2 + i * (panelW + panelGap);
    s += `<rect x="${px}" y="${baseY+2}" width="${panelW}" height="${baseH-4}" fill="url(#storeGlassGrad)"/>`;
  }
  // Door at center (overlay)
  const doorW = 18;
  const doorH = baseH - 6;
  const doorX = W / 2 - doorW / 2;
  s += `<rect x="${doorX}" y="${baseY+3}" width="${doorW}" height="${doorH}" fill="${C.trimDark}" opacity="0.9"/>`;
  s += `<rect x="${doorX+2}" y="${baseY+5}" width="${doorW-4}" height="${doorH-8}" fill="url(#storeGlassGrad)"/>`;
  // Door handle
  s += `<rect x="${doorX+doorW-5}" y="${baseY+doorH/2 + 1}" width="2" height="6" fill="${C.stuccoCream}"/>`;
  return s;
}

/** Common SVG defs — gradients reused by both buildings. */
function defs() {
  return `<defs>
    <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="${C.windowSky}"/>
      <stop offset="55%" stop-color="${C.windowMid}"/>
      <stop offset="100%" stop-color="${C.windowDark}"/>
    </linearGradient>
    <linearGradient id="storeGlassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="${C.storeGlass}"/>
      <stop offset="100%" stop-color="#7A8487"/>
    </linearGradient>
    <linearGradient id="brickFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="${C.brickLight}"/>
      <stop offset="100%" stop-color="${C.brickDark}"/>
    </linearGradient>
    <linearGradient id="stuccoFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="${C.stuccoCream}"/>
      <stop offset="100%" stop-color="${C.stuccoDeep}"/>
    </linearGradient>
    <pattern id="brickPattern" patternUnits="userSpaceOnUse" width="14" height="6">
      <rect width="14" height="6" fill="${C.brickMid}"/>
      <rect x="0" y="0" width="14" height="0.6" fill="${C.brickMortar}" opacity="0.55"/>
      <rect x="0" y="0" width="0.6" height="6" fill="${C.brickMortar}" opacity="0.45"/>
      <rect x="7" y="3" width="0.6" height="3" fill="${C.brickMortar}" opacity="0.45"/>
    </pattern>
  </defs>`;
}

/** Building 1 — Brown brick mid-rise, 5 floors + retail. */
function brickBuilding() {
  // Floor bands
  const groundTop = 296;   // ground floor + retail begins here
  const groundBot = 374;   // foundation strip below 374
  const upperBot  = groundTop; // upper floors stack above
  const floorH    = 56;
  const f5Top = 16;        // top setback above
  const f4Top = f5Top + floorH;
  const f3Top = f4Top + floorH;
  const f2Top = f3Top + floorH;
  // f2Top should equal upperBot - floorH for the bottom upper floor
  // Recompute to fit cleanly:
  const numUpper = 4;
  const upperH   = upperBot - 16; // top edge of brick band
  const fH       = upperH / numUpper;

  let s = '';
  // Background brick wall (uses brick pattern + subtle vertical fade overlay)
  s += `<rect x="0" y="16" width="${W}" height="${upperBot - 16}" fill="url(#brickPattern)"/>`;
  s += `<rect x="0" y="16" width="${W}" height="${upperBot - 16}" fill="url(#brickFade)" opacity="0.30"/>`;

  // Top parapet
  s += `<rect x="0" y="8" width="${W}" height="14" fill="${C.brickDark}"/>`;
  s += `<rect x="0" y="14" width="${W}" height="3" fill="${C.trimDark}"/>`;
  s += `<rect x="0" y="20" width="${W}" height="2" fill="rgba(255,255,255,0.12)"/>`;

  // Floor windows
  for (let f = 0; f < numUpper; f++) {
    const yTop = 16 + f * fH;
    const yBot = yTop + fH;
    s += windowsRow(yTop, yBot, 3, C.brickMortar, '', '');
  }

  // Subtle vertical pillars dividing into a 3-bay façade
  for (const px of [W/3, W*2/3]) {
    s += `<rect x="${px - 1}" y="16" width="2" height="${upperBot - 16}" fill="rgba(0,0,0,0.15)"/>`;
  }
  // Edge shadowing (depth on left + right)
  s += `<rect x="0" y="16" width="3" height="${upperBot - 16}" fill="rgba(0,0,0,0.30)"/>`;
  s += `<rect x="${W-3}" y="16" width="3" height="${upperBot - 16}" fill="rgba(0,0,0,0.20)"/>`;

  // Cornice between brick and retail (concrete sill)
  s += `<rect x="0" y="${upperBot - 4}" width="${W}" height="6" fill="${C.stuccoTan}"/>`;
  s += `<rect x="0" y="${upperBot + 1}" width="${W}" height="1" fill="${C.trimDark}"/>`;

  // Storefront
  s += storefront(groundTop + 4, groundBot, C.awningRed);

  // Sidewalk
  s += `<rect x="0" y="${groundBot}" width="${W}" height="${H - groundBot}" fill="${C.trimGrey}"/>`;
  s += `<rect x="0" y="${groundBot}" width="${W}" height="2" fill="rgba(0,0,0,0.30)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}${s}</svg>`;
}

/** Building 2 — Cream stucco mid-rise with teal accents. */
function stuccoBuilding() {
  const groundTop = 296;
  const groundBot = 374;
  const upperBot  = groundTop;
  const numUpper  = 4;
  const fH        = (upperBot - 16) / numUpper;

  let s = '';
  // Background stucco wall
  s += `<rect x="0" y="16" width="${W}" height="${upperBot - 16}" fill="url(#stuccoFade)"/>`;

  // Top parapet (teal accent)
  s += `<rect x="0" y="8" width="${W}" height="14" fill="${C.trimMidGrey}"/>`;
  s += `<rect x="0" y="14" width="${W}" height="3" fill="${C.trimDark}"/>`;

  // Horizontal banding lines between floors (typical of stucco mid-rise)
  for (let f = 1; f < numUpper; f++) {
    const y = 16 + f * fH;
    s += `<rect x="0" y="${y - 1}" width="${W}" height="2" fill="${C.stuccoDeep}" opacity="0.6"/>`;
  }

  // Floor windows — 3 per floor, slightly wider than brick variant
  for (let f = 0; f < numUpper; f++) {
    const yTop = 16 + f * fH;
    const yBot = yTop + fH;
    s += windowsRow(yTop, yBot, 3, C.trimDark, '', '');
  }

  // Decorative side accents (teal "fin" columns)
  s += `<rect x="2" y="16" width="6" height="${upperBot - 16}" fill="${C.awningTeal}" opacity="0.85"/>`;
  s += `<rect x="${W - 8}" y="16" width="6" height="${upperBot - 16}" fill="${C.awningTeal}" opacity="0.85"/>`;
  // Soft edge shadows
  s += `<rect x="8" y="16" width="2" height="${upperBot - 16}" fill="rgba(0,0,0,0.18)"/>`;
  s += `<rect x="${W-10}" y="16" width="2" height="${upperBot - 16}" fill="rgba(0,0,0,0.18)"/>`;

  // Balcony details on middle floor (typical Pacific NW mid-rise)
  const balconyY = 16 + 2 * fH + fH - 12;
  for (let i = 0; i < 3; i++) {
    const bx = 22 + i * ((W - 44) / 3);
    const bw = (W - 44) / 3 - 6;
    s += `<rect x="${bx}" y="${balconyY}" width="${bw}" height="3" fill="${C.trimDark}"/>`;
    // Railing
    for (let r = 0; r < 5; r++) {
      const rx = bx + 2 + r * ((bw - 4) / 4);
      s += `<rect x="${rx}" y="${balconyY - 6}" width="1" height="6" fill="${C.trimDark}" opacity="0.8"/>`;
    }
  }

  // Cornice between upper and retail
  s += `<rect x="0" y="${upperBot - 4}" width="${W}" height="6" fill="${C.stuccoDeep}"/>`;
  s += `<rect x="0" y="${upperBot + 1}" width="${W}" height="1" fill="${C.trimDark}"/>`;

  // Storefront (teal awning to match accents)
  s += storefront(groundTop + 4, groundBot, C.awningTeal);

  // Sidewalk
  s += `<rect x="0" y="${groundBot}" width="${W}" height="${H - groundBot}" fill="${C.trimGrey}"/>`;
  s += `<rect x="0" y="${groundBot}" width="${W}" height="2" fill="rgba(0,0,0,0.30)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}${s}</svg>`;
}

const buildings = [
  { key: 'bellevue_midrise_brick',  svg: brickBuilding()  },
  { key: 'bellevue_midrise_stucco', svg: stuccoBuilding() },
];

await fs.mkdir(OUT_DIR, { recursive: true });

for (const { key, svg } of buildings) {
  const out = path.join(OUT_DIR, `${key}.png`);
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`Wrote ${out}`);
}
