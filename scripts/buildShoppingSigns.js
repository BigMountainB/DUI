/**
 * Build per-stop "Freeway Shopping" signs by compositing brand logos onto
 * the user-supplied blank template (Images/Freeway-Shopping---blank.png).
 *
 * The blank template is a blue placard with a 2x3 grid of empty white
 * rectangles + a "SHOPPING - NEXT RIGHT" header.  This script:
 *   1. Auto-detects the 6 white slot rectangles (so the template can be
 *      swapped without re-measuring).
 *   2. For each REST_STOP with declared `amenities`, picks the brand
 *      logo for each amenity (region-aware where the brand differs by
 *      side of the Cascades — CarGo west / Huff's east, Lord west /
 *      SUCK east), resizes each logo to fit its slot ("contain" with
 *      ~12% padding so the logo doesn't kiss the rounded corners),
 *      and composites it centered into the next available slot.
 *   3. Writes the finished sign to public/assets/businesses/sign_<id>.png.
 *
 * Run with:  npm run build:signs
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const TEMPLATE_PATH = path.join(ROOT, 'Images', 'Freeway-Shopping---blank.png');
const OUT_DIR       = path.join(ROOT, 'public', 'assets', 'businesses');

// Source brand-logo files supplied by the user in /Images.  Keys are the
// in-game brand IDs used by AssetManifest.js (biz_*), values are the
// raw PNGs we composite into the sign.
const LOGO_FILES = {
  biz_aok:        'Business - Camp - AOK.png',
  biz_lord:       'Business - Car - Lord.png',
  biz_suck:       'Business - Car - SUCK.png',
  biz_cargo:      'Business - Gas - CarGo.png',
  biz_huffs:      'Business - Gas - Huffs.png',
  biz_cowbellas:  'Business - Hunting - Cowbellas.png',
  biz_pharmabros: 'Business - Pharma - Bros.png',
};

// Pick the brand to show for each amenity.  Region-aware where two brands
// compete for the slot:
//   gas    — CarGo west of the Cascades, Huff's east of them
//   dealer — Lord (EV) at western stops, SUCK (used cars) elsewhere
//   camp   — always AOK
//   hunt   — always Cowbellas
//   drugs  — always PharmaBros
function brandFor(amenity, mileage) {
  switch (amenity) {
    case 'gas':     return mileage <= 60 ? 'biz_cargo' : 'biz_huffs';
    case 'dealer':  return mileage <= 60 ? 'biz_lord'  : 'biz_suck';
    case 'camp':    return 'biz_aok';
    case 'hunting': return 'biz_cowbellas';
    case 'drugs':   return 'biz_pharmabros';
    default:        return null;
  }
}

// Inline copy of REST_STOPS' shape — keeps this script free of source-file
// imports (constants.js pulls in Phaser indirectly via siblings).  Update
// this list if you add a stop in constants.js.
const REST_STOPS = [
  { id: 'S',  mileage:    5, amenities: ['gas', 'drugs', 'dealer'] },
  { id: 'M',  mileage:  8.5, amenities: ['camp'] },
  { id: 'B',  mileage: 11.6, amenities: ['dealer', 'drugs'] },
  { id: 'I',  mileage:   18, amenities: ['hunting', 'camp'] },
  { id: 'SQ', mileage:   25, amenities: ['dealer'] },
  { id: 'N',  mileage:   32, amenities: ['gas', 'hunting', 'drugs'] },
  { id: 'SP', mileage:   53, amenities: ['camp', 'gas'] },
  { id: 'EA', mileage:   70, amenities: ['camp'] },
  { id: 'C',  mileage:   84, amenities: ['gas', 'hunting'] },
  { id: 'TH', mileage:  101, amenities: ['camp'] },
  { id: 'E',  mileage:  109, amenities: ['dealer', 'gas'] },
  { id: 'V',  mileage:  137, amenities: ['gas'] },
  { id: 'Y',  mileage:  158, amenities: ['hunting'] },
  { id: 'O',  mileage:  184, amenities: ['drugs', 'gas'] },
  { id: 'W',  mileage:  228, amenities: ['gas'] },
  { id: 'L',  mileage:  253, amenities: ['camp'] },
  { id: 'CO', mileage:  274, amenities: ['dealer', 'gas'] },
  { id: 'P',  mileage:  289, amenities: ['gas', 'hunting', 'camp', 'dealer', 'drugs'] },
];

/**
 * Scan the template PNG for the 6 white slot rectangles.  Approach:
 *   1. Read the raw RGBA buffer.
 *   2. Mark each pixel as "white-ish" (R,G,B all > 220) → a binary mask.
 *   3. Connected-component label the mask, dropping components that
 *      are too small (anti-alias halos, header letter holes) or too thin.
 *   4. For each surviving component compute its bounding box.
 *   5. Sort the boxes top-to-bottom, left-to-right and return them.
 *
 * Letter holes inside "SHOPPING - NEXT RIGHT" are also white but they're
 * dramatically smaller than the slots, so the area filter discards them.
 */
async function detectSlots(templatePath) {
  const img = sharp(templatePath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;

  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += channels) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    mask[i] = (r > 220 && g > 220 && b > 220) ? 1 : 0;
  }

  // Iterative flood fill (stack-based, no recursion blow-up on big runs).
  const visited = new Uint8Array(W * H);
  const components = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (!mask[idx] || visited[idx]) continue;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      const stack = [idx];
      visited[idx] = 1;
      while (stack.length) {
        const c = stack.pop();
        const cx = c % W, cy = (c - cx) / W;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        // 4-neighbour
        if (cx > 0     && mask[c - 1] && !visited[c - 1])   { visited[c - 1] = 1;   stack.push(c - 1); }
        if (cx < W - 1 && mask[c + 1] && !visited[c + 1])   { visited[c + 1] = 1;   stack.push(c + 1); }
        if (cy > 0     && mask[c - W] && !visited[c - W])   { visited[c - W] = 1;   stack.push(c - W); }
        if (cy < H - 1 && mask[c + W] && !visited[c + W])   { visited[c + W] = 1;   stack.push(c + W); }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      // Slot heuristic: rectangular, sizeable, roughly landscape.
      const minSlotArea = (W * H) * 0.012;       // ≥ ~1.2 % of total image
      const aspect = w / h;
      if (area >= minSlotArea && aspect > 0.9 && aspect < 1.8 && w > W * 0.10 && h > H * 0.10) {
        components.push({ x: minX, y: minY, w, h, area });
      }
    }
  }

  // Sort top→bottom (group by row using a y-tolerance), then left→right.
  components.sort((a, b) => a.y - b.y);
  const ROW_TOL = H * 0.05;
  const rows = [];
  for (const c of components) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(c.y - last[0].y) < ROW_TOL) last.push(c);
    else rows.push([c]);
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x);
  const ordered = rows.flat();
  return ordered;
}

/**
 * Composite one stop's logos onto a copy of the template.
 *   slots:   array of {x,y,w,h} from detectSlots()
 *   logoIds: ordered array of brand keys (biz_*) to place into the first
 *            N slots; remaining slots stay blank (template white).
 */
async function buildSign(templatePath, slots, logoIds, outPath) {
  const composites = [];
  const PAD = 0.12;       // 12 % inner padding inside each slot
  for (let i = 0; i < logoIds.length && i < slots.length; i++) {
    const id  = logoIds[i];
    const file = LOGO_FILES[id];
    if (!file) {
      console.warn(`  ⚠ no logo file mapped for ${id} — skipping slot ${i + 1}`);
      continue;
    }
    const slot = slots[i];
    const targetW = Math.round(slot.w * (1 - PAD * 2));
    const targetH = Math.round(slot.h * (1 - PAD * 2));
    const logoBuf = await sharp(path.join(ROOT, 'Images', file))
      // "contain" — preserve aspect ratio, fit inside the box, transparent edges.
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    // After contain-resize the logo is exactly targetW × targetH; place it
    // centered inside the slot.
    const offsetX = slot.x + Math.round((slot.w - targetW) / 2);
    const offsetY = slot.y + Math.round((slot.h - targetH) / 2);
    composites.push({ input: logoBuf, top: offsetY, left: offsetX });
  }
  await sharp(templatePath)
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`reading template: ${path.relative(ROOT, TEMPLATE_PATH)}`);
  const slots = await detectSlots(TEMPLATE_PATH);
  console.log(`detected ${slots.length} slots:`);
  for (const [i, s] of slots.entries()) {
    console.log(`  slot ${i + 1}: x=${s.x} y=${s.y} w=${s.w} h=${s.h}`);
  }
  if (slots.length < 6) {
    console.warn(`⚠ expected 6 slots, got ${slots.length}. Check the template — script will still place logos in the slots it found.`);
  }

  let written = 0;
  for (const stop of REST_STOPS) {
    if (!stop.amenities?.length) continue;
    const logoIds = stop.amenities
      .map(a => brandFor(a, stop.mileage))
      .filter(Boolean);
    if (!logoIds.length) continue;
    const outPath = path.join(OUT_DIR, `sign_${stop.id}.png`);
    await buildSign(TEMPLATE_PATH, slots, logoIds, outPath);
    console.log(`  ✓ ${path.basename(outPath)}  (${logoIds.join(', ')})`);
    written++;
  }
  console.log(`done — wrote ${written} sign PNGs to ${path.relative(ROOT, OUT_DIR)}/`);
}

main().catch(err => {
  console.error('build:signs failed:', err);
  process.exit(1);
});
