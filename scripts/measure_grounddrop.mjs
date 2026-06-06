// Measure bottom transparent-alpha padding for ground-level home/town
// textures so groundDrop can be set per-PNG (visible base lands on the
// road plane). groundDrop = measuredBottomPadFrac + 0.010 shoulder tuck,
// matching the west_seattle_* convention already in SCENERY_IMAGE_PROFILES.
import sharp from 'sharp';
import path from 'node:path';

const ROOT = '/Users/brendanbaughn/Documents/Claude/DUI/public';

// Keys to measure: residential homes + eastern/Issaquah town frontage —
// every ground-level structure Codex flagged as using the generic 0.010.
const TARGETS = [
  ['codex_issaquah_front_supply',   'assets/buildings/codex/issaquah_front_st_supply.png'],
  ['codex_issaquah_highlands',      'assets/buildings/codex/issaquah_highlands_market.png'],
  ['codex_issaquah_cottage',        'assets/buildings/codex/issaquah_craftsman_cottage.png'],
  ['codex_issaquah_roadside_strip_perspective', 'assets/buildings/codex/issaquah_roadside_strip_perspective.png'],
  ['codex_cle_elum_general_store',  'assets/buildings/codex/cle_elum_general_store.webp'],
  ['codex_ellensburg_main_street_shops', 'assets/buildings/codex/ellensburg_main_street_shops.webp'],
  ['codex_east_wa_weathered_house', 'assets/buildings/codex/east_wa_weathered_house.webp'],
  ['codex_east_wa_barn',            'assets/buildings/codex/east_wa_barn.webp'],
  ['codex_east_wa_abandoned_bungalow', 'assets/buildings/codex/east_wa_abandoned_bungalow.webp'],
  ['codex_east_wa_silos',           'assets/buildings/codex/east_wa_silos.png'],
  ['codex_east_wa_brick_storefront_1', 'assets/buildings/codex/east_wa_brick_storefront_1.webp'],
  ['codex_east_wa_brick_storefront_2', 'assets/buildings/codex/east_wa_brick_storefront_2.webp'],
  ['codex_east_wa_doublewide_tan',  'assets/buildings/codex/east_wa_doublewide_tan.webp'],
  ['codex_east_wa_doublewide_white','assets/buildings/codex/east_wa_doublewide_white.webp'],
  ['codex_east_wa_fenced_house_tan','assets/buildings/codex/east_wa_fenced_house_tan.webp'],
  ['codex_east_wa_fenced_house_white','assets/buildings/codex/east_wa_fenced_house_white.webp'],
  ['codex_east_wa_two_story_brick_shop', 'assets/buildings/codex/east_wa_two_story_brick_shop.webp'],
  ['codex_east_wa_block_repair_shop','assets/buildings/codex/east_wa_block_repair_shop.webp'],
  ['codex_east_wa_main_street_storefront','assets/buildings/codex/east_wa_main_street_storefront.webp'],
  ['codex_east_wa_cafe_storefront', 'assets/buildings/codex/east_wa_cafe_storefront.webp'],
  ['codex_east_wa_auto_parts_store','assets/buildings/codex/east_wa_auto_parts_store.webp'],
  ['codex_east_wa_market_storefront','assets/buildings/codex/east_wa_market_storefront.webp'],
  ['codex_east_wa_vantage_truck_stop','assets/buildings/codex/east_wa_vantage_truck_stop.webp'],
  ['codex_east_wa_ritzville_diner_motel','assets/buildings/codex/east_wa_ritzville_diner_motel.webp'],
  ['codex_east_wa_palouse_farm_store','assets/buildings/codex/east_wa_palouse_farm_store.webp'],
  ['codex_east_wa_pullman_party_house','assets/buildings/codex/east_wa_pullman_party_house.webp'],
];

const ALPHA_THRESH = 10;   // 0..255; below this a pixel counts as transparent

for (const [key, rel] of TARGETS) {
  const file = path.join(ROOT, rel);
  try {
    const img = sharp(file).ensureAlpha();
    const { width, height } = await img.metadata();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;            // 4 (RGBA)
    // Walk rows from the bottom; count fully-transparent rows.
    let transparentRows = 0;
    for (let y = info.height - 1; y >= 0; y--) {
      let rowHasContent = false;
      for (let x = 0; x < info.width; x++) {
        const a = data[(y * info.width + x) * ch + (ch - 1)];
        if (a > ALPHA_THRESH) { rowHasContent = true; break; }
      }
      if (rowHasContent) break;
      transparentRows++;
    }
    const padFrac = transparentRows / info.height;
    const groundDrop = +(padFrac + 0.010).toFixed(3);
    const note = padFrac < 0.003 ? 'full-bleed (keep 0.010)' : 'PAD';
    console.log(
      `${key.padEnd(42)} ${info.width}x${info.height}  pad=${(padFrac*100).toFixed(1).padStart(5)}%  -> groundDrop ${groundDrop.toFixed(3)}  ${note}`
    );
  } catch (e) {
    console.log(`${key.padEnd(42)} ERROR ${e.message}`);
  }
}
