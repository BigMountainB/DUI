import Phaser from 'phaser';
import {
  SCREEN_W, SCREEN_H, SEG_LENGTH, ROUTE_SEGS, ROAD_WIDTH, DRAW_DIST,
  MAX_SPEED, ACCEL, BRAKE, DECEL, TURN_SPEED, OFFROAD_SLOW, CENTRIFUGAL,
  PTS_DIST, PTS_CRASH, PTS_HITCH, DRUG_MULT, DRUG_PTS, FULL_BAR_THRESHOLD,
  DRUGS, DRUG_CONFIG, DRUG_COMBOS, CHECKPOINTS, TOTAL_ROUTE_MILES, REST_STOPS, PASS_THROUGH_CITIES,
  getLocationName,
  getLastSignTown,
  CAR_LEN_Z, CAR_WIDTH_LANES, PLAYER_VIRTUAL_Z,
  VEHICLES, GAS_LIGHT_AT_MI,
  setCameraMode, CAM, COP_TRAP_SPEED_MPH,
  COP_TRAP_COMPLY_SEC, COP_TRAP_PULLOVER_MPH, COP_TRAP_SHOULDER_X, COP_TRAP_ABORT_X, COP_TRAP_HOLD_SEC,
  COP_DUI_ALCOHOL_LIMIT, COP_DUI_DRUG_LIMIT, COP_DUI_MULTI_COUNT, COP_DUI_MULTI_LIMIT,
  COP_TICKET_SPEEDING_FRAC, COP_TICKET_SPEEDING_CAP, COP_TICKET_DUI_FRAC, COP_TICKET_DUI_CAP,
  COP_DUI_EARN_MULT, COP_DUI_EARN_MI,
  COP_DUI_BUST_COUNT, COP_DUI_BUST_COUNT_LAWYER, COP_DUI_WINDOW_MI,
  FINISH_PARK_SEC, FINISH_PARK_X, FINISH_PARK_LERP,
  GIRL_MAX_SKIPS, GIRL_PARTY_BONUS,
} from '../constants.js';
import { clamp, lerp } from '../utils/Helpers.js';
import { Road }          from '../road/Road.js';
import geoData           from '../road/routeGeo.json';
import { DrugSystem }    from '../systems/DrugSystem.js';
import { EffectsSystem } from '../systems/EffectsSystem.js';
import { CopSystem }     from '../systems/CopSystem.js';
import { HapticSystem }  from '../systems/HapticSystem.js';
import { Difficulty }    from '../systems/Difficulty.js';
import { TimeOfDay }     from '../world/TimeOfDay.js';
import { Weather }       from '../world/Weather.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { DamageModel }   from '../car/DamageModel.js';
import { getPaletteAtProgress, REGION_ORDER, REGION_PALETTES, lerpColor } from '../utils/Colors.js';

const CAM_DEPTH = 0.84;
const IMPACT    = 'Impact, "Arial Black", Arial, sans-serif';
const PLAYER_CAR_VISUAL_H = 49;
// Bottom-anchored Y for chase-view popups + speed-trap sign — just ABOVE the
// mile/town location line (SCREEN_H-8) and its wanted-stars row (SCREEN_H-26).
// Bump this if the toasts ever crowd the location text.
const HUD_POPUP_BOTTOM_Y = SCREEN_H - 40;
// License-plate art per save slot (slot 0/1/2 → WA/OR/ID).  Used on the title
// "WHO'S DRIVING?" slots and the active player's car rear bumper.
const PLATE_KEYS = ['plate_wa', 'plate_or', 'plate_id'];
const PLATE_ASPECT = 827 / 374;   // source plate art aspect (w/h)
const SCENERY_ROAD_CLEARANCE_CAR_LENGTHS = 2;
const SCENERY_IMAGE_PROFILES = {
  // City-photo cutouts need height-led sizing. Width-led sizing makes
  // tall tower assets gigantic and wide skyline assets oddly squat. Near
  // skyline caps land around 4-6 player-car heights.
  //
  // Why minOffset 1.05 (was 2.05–4.85): the fog-line spawn model
  // (RouteData.js: fogLineOffset) now computes per-asset placement that
  // accounts for the building's own half-width, so the renderer no
  // longer needs to floor it.  Keeping a low floor (1.05 = just past
  // the fog line) as a safety net so a bug can never place a building
  // INSIDE the road, but real positioning is now spawn-time.
  codex_seattle_skyline:        { heightMult: 3.90, maxW: 500, maxH: PLAYER_CAR_VISUAL_H * 5.4, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_office_cluster: { heightMult: 3.80, maxW: 500, maxH: PLAYER_CAR_VISUAL_H * 5.3, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_tower_pair:     { heightMult: 4.60, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_skyline:       { heightMult: 6.0, maxW: 560, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_wavy_residential: { heightMult: 6.0, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_city_center_dark: { heightMult: 6.0, maxW: 230, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_braced_glass_tower: { heightMult: 6.0, maxW: 210, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_residential_cluster: { heightMult: 6.0, maxW: 520, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_columbia_center: { heightMult: 5.90, maxW: 170, maxH: PLAYER_CAR_VISUAL_H * 6.7, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_rainier_square:  { heightMult: 5.45, maxW: 230, maxH: PLAYER_CAR_VISUAL_H * 6.1, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_two_union_square: { heightMult: 5.35, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_1201_third:      { heightMult: 5.15, maxW: 210, maxH: PLAYER_CAR_VISUAL_H * 5.8, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_municipal_tower: { heightMult: 5.05, maxW: 230, maxH: PLAYER_CAR_VISUAL_H * 5.7, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_f5_tower:        { heightMult: 5.25, maxW: 180, maxH: PLAYER_CAR_VISUAL_H * 5.9, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_safeco_plaza:    { heightMult: 4.70, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 5.3, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_city_centre:     { heightMult: 4.55, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 5.1, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_russell_investments: { heightMult: 4.55, maxW: 260, maxH: PLAYER_CAR_VISUAL_H * 5.1, minOffset: 1.05, groundDrop: 0.010 },
  codex_seattle_lumen_field:     { widthMult: 5.75, maxW: 540, maxH: PLAYER_CAR_VISUAL_H * 3.8, minOffset: 5.25, groundDrop: 0.045 },
  codex_seattle_tmobile_park:    { widthMult: 5.65, maxW: 540, maxH: PLAYER_CAR_VISUAL_H * 3.9, minOffset: 5.45, groundDrop: 0.045 },
  codex_bellevue_roadside_strip: { widthMult: 3.45, maxW: 480, maxH: PLAYER_CAR_VISUAL_H * 2.75, minOffset: 4.50, groundDrop: 0.010 },
  // Directional Bellevue variants — uniform 6× car height; minOffset
  // 1.05 (was 2.05) lets fog-line spawn math win, see top-of-table note.
  codex_pse_bellevue_office_left:         { heightMult: 6.0, maxW: 300, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_pse_bellevue_office_right:        { heightMult: 6.0, maxW: 300, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_pse_bellevue_second_office_left:  { heightMult: 6.0, maxW: 320, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_pse_bellevue_second_office_right: { heightMult: 6.0, maxW: 320, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  codex_bellevue_twin_residential_left:   { heightMult: 6.0, maxW: 340, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  // West Seattle homes retain proportional roadside scale.  Their fixed
  // spawn offset comes from WEST_SEATTLE_FRONTAGE_GAP_CARS (3.50 car-widths
  // past the fog line) — the near edge lands ~1.9 car-widths behind the
  // urban sidewalk (sidewalk outer edge ≈ 1.59 car-widths past the fog
  // line), so they read as set back, not crowding the curb.
  // groundDrop is PER-TEXTURE = each PNG's measured transparent bottom
  // padding + a 0.010 shoulder tuck, so every home's visible base lands
  // just at the road plane.  The old uniform 0.15 over-dropped them: the
  // full-bleed PNGs (WS3/WS4, 0 % bottom padding) sank ~15 %, shoving
  // their yards down over the sidewalk and leaving the bottom of the art
  // below the collision band.
  west_seattle_1: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.102 },
  west_seattle_2: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.086 },
  west_seattle_3: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  west_seattle_4: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.010 },
  west_seattle_5: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.086 },
  west_seattle_6: { heightMult: 6.0, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 6.0, minOffset: 1.05, groundDrop: 0.096 },
  // Container cranes — strict left/right pairing.  Same dimensions across
  // all variants (6.6× car height, generous maxW for the wider rigs).
  codex_ws_crane_crate_left:        { heightMult: 25, maxW: 1900, maxH: PLAYER_CAR_VISUAL_H * 25, minOffset: 6.0, groundDrop: 0.15 },
  codex_ws_crane_white_boxes_left:  { heightMult: 25, maxW: 1900, maxH: PLAYER_CAR_VISUAL_H * 25, minOffset: 6.0, groundDrop: 0.15 },
  codex_ws_crane_crate_right:       { heightMult: 25, maxW: 1900, maxH: PLAYER_CAR_VISUAL_H * 25, minOffset: 6.0, groundDrop: 0.15 },
  codex_ws_crane_white_boxes_right: { heightMult: 25, maxW: 1900, maxH: PLAYER_CAR_VISUAL_H * 25, minOffset: 6.0, groundDrop: 0.15 },
  codex_west_seattle_container_stack_18: { widthMult: 3.15, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 2.7, minOffset: 3.15, groundDrop: 0.015 },
  // Issaquah / Eastside suburbs — close roadside houses and small-town
  // frontage, not skyline backdrop. Keep them just past the sidewalk and
  // size by height so they don't read as tiny piles in the field.
  // Issaquah residences — fixed offsets are selected from a 1.25-car-width
  // shoulder setback; minOffset is only a safety floor.
  // groundDrop is PER-PNG measured transparent bottom padding + a 0.010
  // shoulder tuck (same convention as west_seattle_*) so the visible base
  // lands on the road plane instead of floating.  Regenerate with
  // scripts/measure_grounddrop.mjs.  Full-bleed PNGs keep 0.010.
  codex_issaquah_front_supply:  { heightMult: 4.8, maxW: 520, maxH: PLAYER_CAR_VISUAL_H * 4.8, minOffset: 1.05, groundDrop: 0.036 },
  codex_issaquah_highlands:     { heightMult: 4.8, maxW: 520, maxH: PLAYER_CAR_VISUAL_H * 4.8, minOffset: 1.05, groundDrop: 0.034 },
  codex_issaquah_cottage:       { heightMult: 4.4, maxW: 440, maxH: PLAYER_CAR_VISUAL_H * 4.4, minOffset: 1.05, groundDrop: 0.036 },
  codex_issaquah_roadside_strip_perspective: { widthMult: 3.35, maxW: 420, maxH: PLAYER_CAR_VISUAL_H * 2.25, minOffset: 2.65, groundDrop: 0.029 },
  // Eastern Washington town frontage and rural field accents. They are
  // intentionally smaller than the dense Issaquah/Seattle roadside art.
  codex_cle_elum_general_store:       { heightMult: 3.45, maxW: 295, maxH: PLAYER_CAR_VISUAL_H * 3.45, minOffset: 1.05, groundDrop: 0.118 },
  codex_ellensburg_main_street_shops: { heightMult: 3.75, maxW: 330, maxH: PLAYER_CAR_VISUAL_H * 3.75, minOffset: 1.05, groundDrop: 0.104 },
  codex_east_wa_weathered_house:      { heightMult: 3.00, maxW: 250, maxH: PLAYER_CAR_VISUAL_H * 3.00, minOffset: 1.05, groundDrop: 0.179 },
  codex_east_wa_barn:                 { heightMult: 2.70, maxW: 270, maxH: PLAYER_CAR_VISUAL_H * 2.70, minOffset: 2.40, groundDrop: 0.174 },
  // Silos — wide cluster (1388x779 source).  Width-driven so the row of
  // silos reads as a wide bank, not a single tall column.  minOffset
  // pushes it well off-road since the cluster spans ~3 lanes wide.
  codex_east_wa_silos:                { widthMult: 3.20, maxW: 460, maxH: PLAYER_CAR_VISUAL_H * 2.40, minOffset: 2.20, groundDrop: 0.010 },
  // Wind warning sign — composite PNG (pole on right + cantilever sign
  // body to the left).  Width-driven so the sign visibly cantilevers
  // across the right travel lane.  minOffset 0 lets the spawn offset
  // place the sprite center wherever the world placement says — the
  // pole base lands at the right shoulder via the spawn offset, not
  // via this clamp.  groundDrop 0 so the pole foot meets the road
  // plane cleanly instead of sinking below.
  freeway_sign_wind:                  { widthMult: 4.20, maxW: 540, maxH: PLAYER_CAR_VISUAL_H * 2.90, minOffset: 0, groundDrop: 0.000 },
  codex_east_wa_abandoned_bungalow:   { heightMult: 2.80, maxW: 250, maxH: PLAYER_CAR_VISUAL_H * 2.80, minOffset: 1.08, groundDrop: 0.010 },
  codex_east_wa_two_story_brick_shop: { heightMult: 4.00, maxW: 250, maxH: PLAYER_CAR_VISUAL_H * 4.00, minOffset: 1.10, groundDrop: 0.010 },
  codex_east_wa_block_repair_shop:    { heightMult: 2.35, maxW: 300, maxH: PLAYER_CAR_VISUAL_H * 2.35, minOffset: 1.15, groundDrop: 0.010 },
  codex_east_wa_main_street_storefront:{ widthMult: 2.80, maxW: 330, maxH: PLAYER_CAR_VISUAL_H * 2.35, minOffset: 1.12, groundDrop: 0.010 },
  codex_east_wa_cafe_storefront:      { widthMult: 2.75, maxW: 330, maxH: PLAYER_CAR_VISUAL_H * 2.35, minOffset: 1.12, groundDrop: 0.010 },
  codex_east_wa_auto_parts_store:     { widthMult: 2.85, maxW: 340, maxH: PLAYER_CAR_VISUAL_H * 2.35, minOffset: 1.12, groundDrop: 0.010 },
  codex_east_wa_market_storefront:    { widthMult: 2.75, maxW: 330, maxH: PLAYER_CAR_VISUAL_H * 2.35, minOffset: 1.12, groundDrop: 0.010 },
  codex_east_wa_vantage_truck_stop:   { widthMult: 3.10, maxW: 420, maxH: PLAYER_CAR_VISUAL_H * 2.45, minOffset: 1.20, groundDrop: 0.010 },
  codex_east_wa_ritzville_diner_motel:{ widthMult: 3.35, maxW: 440, maxH: PLAYER_CAR_VISUAL_H * 2.65, minOffset: 1.18, groundDrop: 0.010 },
  codex_east_wa_palouse_farm_store:   { heightMult: 3.45, maxW: 350, maxH: PLAYER_CAR_VISUAL_H * 3.45, minOffset: 1.28, groundDrop: 0.010 },
  codex_east_wa_pullman_party_house:  { heightMult: 3.25, maxW: 330, maxH: PLAYER_CAR_VISUAL_H * 3.25, minOffset: 1.18, groundDrop: 0.010 },
  // Single-story doublewide mobile homes — wide rectangles, low roofline.
  // Aspect ratio ~640/232 (tan) / 640/223 (white) means widthMult-driven
  // sizing reads better than heightMult here; maxH clamps the short
  // dimension so they don't tower over the bungalows next door.
  codex_east_wa_doublewide_tan:       { widthMult: 8.55, maxW: 960, maxH: PLAYER_CAR_VISUAL_H * 5.55, minOffset: 1.10, groundDrop: 0.040 },
  codex_east_wa_doublewide_white:     { widthMult: 8.55, maxW: 960, maxH: PLAYER_CAR_VISUAL_H * 5.55, minOffset: 1.10, groundDrop: 0.037 },
  // Fenced houses — modest one/two-story residential.
  codex_east_wa_fenced_house_tan:     { heightMult: 2.80, maxW: 280, maxH: PLAYER_CAR_VISUAL_H * 2.80, minOffset: 1.08, groundDrop: 0.034 },
  codex_east_wa_fenced_house_white:   { heightMult: 2.85, maxW: 280, maxH: PLAYER_CAR_VISUAL_H * 2.85, minOffset: 1.08, groundDrop: 0.030 },
  east_wa_herd_3_cows:                { widthMult: 1.35, maxW: 145, maxH: PLAYER_CAR_VISUAL_H * 0.48, minOffset: 3.40, groundDrop: 0.002 },
  east_wa_herd_5_cows:                { widthMult: 1.80, maxW: 190, maxH: PLAYER_CAR_VISUAL_H * 0.76, minOffset: 3.60, groundDrop: 0.002 },
  east_wa_herd_6_cows:                { widthMult: 1.90, maxW: 205, maxH: PLAYER_CAR_VISUAL_H * 0.82, minOffset: 3.80, groundDrop: 0.002 },
  codex_west_seattle_horizon_left:  { widthMult: 4.15, maxW: 560, maxH: PLAYER_CAR_VISUAL_H * 2.4, minOffset: 5.35, groundDrop: 0.010 },
  codex_west_seattle_horizon_right: { widthMult: 4.15, maxW: 560, maxH: PLAYER_CAR_VISUAL_H * 2.4, minOffset: 5.35, groundDrop: 0.010 },
  codex_west_seattle_lowrise_apartments: { heightMult: 3.35, maxW: 280, maxH: PLAYER_CAR_VISUAL_H * 4.0, minOffset: 3.85, groundDrop: 0.010 },
  codex_west_seattle_junction_shops:     { widthMult: 2.75, maxW: 360, maxH: PLAYER_CAR_VISUAL_H * 2.7, minOffset: 3.05, groundDrop: 0.010 },
  codex_west_seattle_warehouse_row:      { widthMult: 2.95, maxW: 360, maxH: PLAYER_CAR_VISUAL_H * 2.45, minOffset: 3.20, groundDrop: 0.010 },
  codex_west_seattle_hillside_condos:    { heightMult: 3.65, maxW: 280, maxH: PLAYER_CAR_VISUAL_H * 4.3, minOffset: 4.10, groundDrop: 0.010 },
  codex_west_seattle_overpass_ramp:      { widthMult: 2.85, maxW: 380, maxH: PLAYER_CAR_VISUAL_H * 2.2, minOffset: 2.95, groundDrop: 0.010 },
  space_needle:                 { heightMult: 9.0, maxW: 165, maxH: PLAYER_CAR_VISUAL_H * 9.0, minOffset: 1.5, groundDrop: 0.010 },
  // ── Trees & shrubs ────────────────────────────────────────────────
  // Urban broadleaves — Bigleaf Maple + Vine Maple.  Crown is wider
  // than tall (heightMult lower than conifers, generous maxW).
  tree_bigleaf_maple_1: { heightMult: 2.0, maxW: 280, maxH: PLAYER_CAR_VISUAL_H * 3.4, minOffset: 1.75, groundDrop: 0.010 },
  tree_bigleaf_maple_2: { heightMult: 1.9, maxW: 260, maxH: PLAYER_CAR_VISUAL_H * 3.2, minOffset: 1.75, groundDrop: 0.010 },
  tree_vine_maple_1:    { heightMult: 1.5, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 2.4, minOffset: 1.65, groundDrop: 0.005 },
  // Tall Western WA conifers (mile 14–88) — Doug fir, Western Hemlock,
  // Western Red Cedar.  Sized so a roadside tree sits ~4 player-car
  // heights tall at close projection — bigger than a residential house
  // would be silly, smaller and they read as bushes.
  tree_douglas_fir_1: { heightMult: 2.6, maxW: 240, maxH: PLAYER_CAR_VISUAL_H * 4.6, minOffset: 1.85, groundDrop: 0.010 },
  tree_douglas_fir_2: { heightMult: 2.5, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 4.3, minOffset: 1.85, groundDrop: 0.010 },
  tree_hemlock1:      { heightMult: 2.5, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 4.4, minOffset: 1.85, groundDrop: 0.010 },
  tree_hemlock2:      { heightMult: 2.2, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 3.8, minOffset: 1.85, groundDrop: 0.010 },
  tree_hemlock3:      { heightMult: 2.4, maxW: 210, maxH: PLAYER_CAR_VISUAL_H * 4.2, minOffset: 1.85, groundDrop: 0.010 },
  tree_red_cedar_1:   { heightMult: 2.6, maxW: 240, maxH: PLAYER_CAR_VISUAL_H * 4.6, minOffset: 1.85, groundDrop: 0.010 },
  tree_red_cedar_2:   { heightMult: 2.5, maxW: 230, maxH: PLAYER_CAR_VISUAL_H * 4.4, minOffset: 1.85, groundDrop: 0.010 },
  tree_cedar1:        { heightMult: 2.3, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 4.0, minOffset: 1.85, groundDrop: 0.010 },
  tree_cedar2:        { heightMult: 2.3, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 4.0, minOffset: 1.85, groundDrop: 0.010 },
  // Eastern WA dry-side pines (mile 88–195) — Ponderosa, Western White
  // Pine.  Slightly shorter / sparser silhouette than the wet-side
  // conifers but the renderer profile is similar.
  tree_ponderosa_1:   { heightMult: 2.4, maxW: 220, maxH: PLAYER_CAR_VISUAL_H * 4.2, minOffset: 1.85, groundDrop: 0.010 },
  tree_ponderosa_2:   { heightMult: 2.2, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 3.8, minOffset: 1.85, groundDrop: 0.010 },
  tree_white_pine_1:  { heightMult: 2.4, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 4.2, minOffset: 1.85, groundDrop: 0.010 },
  tree_white_pine_2:  { heightMult: 2.3, maxW: 200, maxH: PLAYER_CAR_VISUAL_H * 4.0, minOffset: 1.85, groundDrop: 0.010 },
  // Columbia Basin shrubs — low, round, wider than tall.
  shrub_sage_1:        { heightMult: 0.95, maxW: 180, maxH: PLAYER_CAR_VISUAL_H * 1.4, minOffset: 1.55, groundDrop: 0.005 },
  shrub_sage_2:        { heightMult: 0.85, maxW: 160, maxH: PLAYER_CAR_VISUAL_H * 1.2, minOffset: 1.55, groundDrop: 0.005 },
  shrub_rabbitbrush_1: { heightMult: 1.10, maxW: 180, maxH: PLAYER_CAR_VISUAL_H * 1.6, minOffset: 1.55, groundDrop: 0.005 },
};

// ────────────────────────────────────────────────────────────────────────
// STRUCTURE_BBOX — per-texture painted-content bbox in normalized
// frame-fractions (0..1).  Used by the painted-edge invariant in
// _renderSceneSprites + matching collision rect so the VISIBLE
// road-facing edge of each building lands at a fixed projected gap
// outside the projected road edge every frame, regardless of:
//   • per-PNG transparent padding (varies 85 %–99.9 % content fraction)
//   • per-region roadScale (spawn-time SW_TO_ROADHALF assumes 1.0)
//   • approach distance (eliminates "houses crowd road when far, back
//     off when close" perception)
// Auto-generated from PNG alpha-channel analysis (75 textures scanned).
// Full-bleed PNGs (content ≥ 99.5 %) fall through to the default
// { leftFrac: 0, rightFrac: 1 } below — they don't need an entry.
// To regenerate: see /tmp/measure_bboxes.py.
const STRUCTURE_BBOX = {
  'bellevue_braced_glass_tower':                     { leftFrac: 0.029,  rightFrac: 0.971  },
  'codex_bellevue_braced_glass_tower':               { leftFrac: 0.029,  rightFrac: 0.971  },
  'bellevue_city_center_dark':                       { leftFrac: 0.0245, rightFrac: 0.9755 },
  'codex_bellevue_city_center_dark':                 { leftFrac: 0.0245, rightFrac: 0.9755 },
  'bellevue_pse_office_left':                        { leftFrac: 0.0193, rightFrac: 0.9807 },
  'codex_pse_bellevue_office_left':                  { leftFrac: 0.0193, rightFrac: 0.9807 },
  'bellevue_pse_office_right':                       { leftFrac: 0.0193, rightFrac: 0.9807 },
  'codex_pse_bellevue_office_right':                 { leftFrac: 0.0193, rightFrac: 0.9807 },
  'bellevue_pse_second_office_left':                 { leftFrac: 0.0181, rightFrac: 0.9819 },
  'codex_pse_bellevue_second_office_left':           { leftFrac: 0.0181, rightFrac: 0.9819 },
  'bellevue_pse_second_office_right':                { leftFrac: 0.0181, rightFrac: 0.9819 },
  'codex_pse_bellevue_second_office_right':          { leftFrac: 0.0181, rightFrac: 0.9819 },
  'bellevue_residential_cluster':                    { leftFrac: 0.013,  rightFrac: 0.987  },
  'codex_bellevue_residential_cluster':              { leftFrac: 0.013,  rightFrac: 0.987  },
  'bellevue_skyline':                                { leftFrac: 0.0143, rightFrac: 0.9857 },
  'codex_bellevue_skyline':                          { leftFrac: 0.0143, rightFrac: 0.9857 },
  'bellevue_wavy_residential':                       { leftFrac: 0.0244, rightFrac: 0.9756 },
  'codex_bellevue_wavy_residential':                 { leftFrac: 0.0244, rightFrac: 0.9756 },
  'codex_issaquah_cottage':                          { leftFrac: 0.0156, rightFrac: 0.9844 },
  'codex_issaquah_front_supply':                     { leftFrac: 0.0156, rightFrac: 0.9883 },
  'codex_issaquah_highlands':                        { leftFrac: 0.0156, rightFrac: 0.9844 },
  'codex_issaquah_roadside_strip_perspective':       { leftFrac: 0.0039, rightFrac: 0.9987 },
  'codex_seattle_1201_third':                        { leftFrac: 0.0292, rightFrac: 0.9708 },
  'codex_seattle_city_centre':                       { leftFrac: 0.0262, rightFrac: 0.9738 },
  'codex_seattle_columbia_center':                   { leftFrac: 0.038,  rightFrac: 0.962  },
  'codex_seattle_f5_tower':                          { leftFrac: 0.0428, rightFrac: 0.9572 },
  'codex_seattle_lumen_field':                       { leftFrac: 0.0104, rightFrac: 0.9896 },
  'codex_seattle_municipal_tower':                   { leftFrac: 0.022,  rightFrac: 0.978  },
  'codex_seattle_rainier_square':                    { leftFrac: 0.0256, rightFrac: 0.9744 },
  'codex_seattle_russell_investments':               { leftFrac: 0.0251, rightFrac: 0.9749 },
  'codex_seattle_safeco_plaza':                      { leftFrac: 0.0299, rightFrac: 0.9701 },
  'codex_seattle_tmobile_park':                      { leftFrac: 0.0039, rightFrac: 0.9961 },
  'codex_seattle_two_union_square':                  { leftFrac: 0.0279, rightFrac: 0.9721 },
  'space_needle':                                    { leftFrac: 0.0568, rightFrac: 0.9432 },
  'west_seattle_1':                                  { leftFrac: 0.0586, rightFrac: 0.944  },
  'west_seattle_2':                                  { leftFrac: 0.0365, rightFrac: 0.974  },
  'west_seattle_5':                                  { leftFrac: 0.0417, rightFrac: 0.957  },
  'west_seattle_6':                                  { leftFrac: 0.0781, rightFrac: 0.9284 },
  'codex_west_seattle_container_stack_18':           { leftFrac: 0.0456, rightFrac: 0.9427 },
  'codex_west_seattle_hillside_condos':              { leftFrac: 0.0028, rightFrac: 0.9972 },
  'codex_west_seattle_horizon_left':                 { leftFrac: 0.0182, rightFrac: 0.9792 },
  'codex_west_seattle_horizon_right':                { leftFrac: 0.0208, rightFrac: 0.9805 },
  'codex_west_seattle_overpass_ramp':                { leftFrac: 0.0312, rightFrac: 0.9661 },
  // ── Added 2026-05-31 — alpha-bbox sweep of all active building
  //    textures (70 scanned).  Previously these fell back to the
  //    full-frame default {0,1}, so transparent side-padding pushed the
  //    painted road-facing edge ~1% of width off its intended fog-line
  //    gap.  Only textures with real padding are listed; the many
  //    full-bleed eastern homes/businesses (weathered_house, barn,
  //    storefronts, etc.) AND west_seattle_3 / west_seattle_4 are
  //    genuinely edge-to-edge and correctly keep the default.
  // Downtown Seattle skyline clusters:
  'codex_seattle_skyline':                           { leftFrac: 0.0143, rightFrac: 0.9857 },
  'codex_seattle_tower_pair':                        { leftFrac: 0.0242, rightFrac: 0.9758 },
  'codex_seattle_office_cluster':                    { leftFrac: 0.0143, rightFrac: 0.9857 },
  // Eastern WA town frontage (Royal City / Hatton / etc.):
  'codex_east_wa_brick_storefront_1':                { leftFrac: 0.0109, rightFrac: 0.9891 },
  'codex_east_wa_brick_storefront_2':                { leftFrac: 0.0094, rightFrac: 0.9906 },
  'codex_east_wa_doublewide_tan':                    { leftFrac: 0.0078, rightFrac: 0.9938 },
  'codex_east_wa_doublewide_white':                  { leftFrac: 0.0078, rightFrac: 0.9922 },
  'codex_east_wa_fenced_house_tan':                  { leftFrac: 0.0063, rightFrac: 0.9938 },
  'codex_east_wa_fenced_house_white':                { leftFrac: 0.0078, rightFrac: 0.9906 },
};
const STRUCTURE_BBOX_DEFAULT = { leftFrac: 0, rightFrac: 1 };

function makePlayer() {
  return {
    position:      0,
    speed:         MAX_SPEED * 0.4,
    // Start in lane 2 (rightmost lane immediately right of the yellow center
    // line). x = 0 is the centre line — sitting there means your right half
    // is in same-direction lane 2 traffic.
    x:             0.25,
    screenX:       SCREEN_W / 2,
    xImpulse:      0,
    steerVelocity: 0,
  };
}

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'Game' }); }

  init(data) {
    // Phaser reuses the scene instance across restarts.  The shutdown
    // hook in _setupTilt uses events.once() which auto-removes after
    // firing — so the second and later restarts wouldn't re-arm the
    // cleanup unless we reset the guard here.  Without this reset, the
    // tilt deviceorientation listener leaks on every restart past the
    // first crash.
    this._tiltShutdownHooked = false;

    this._missionConfig = data?.mission ?? null;
    this._hubReturn     = data?.hubReturn ?? null;
    // Skip-title flag — Game Over's RETRY uses this to jump straight
    // into a new run with the player's persisted difficulty / steering
    // settings instead of bouncing through the title screen first.
    this._skipTitle     = !!data?.skipTitle;
    // Resume-from-rest-stop: scene.start('Game', { resumeFromStop: 'C', score, ... })
    // tells us to skip the title overlay and place the player at the saved
    // mileage with the saved score. Set in RestStopScene "CONTINUE" or in
    // MenuScene/title "ENTER CODE".
    this._resumeFromStop = data?.resumeFromStop ?? null;
    this._resumeScore    = data?.resumeScore    ?? 0;
    this._resumeStars    = data?.resumeStars    ?? 0;
    this._resumePurchases = data?.purchases    ?? null;
    // Forward-warp flag — true when the player skipped ahead via the
    // map's level-select.  Triggers a gas deduction equal to the trip
    // distance (mile 0 → destination), so warping forward isn't a
    // free fuel skip on top of being a clock/trophy skip.
    this._warpedForward  = !!data?.warpForward;
    // Restart-from-checkpoint after death: position + the pre-crash
    // score (half-survives the crash per user spec).  GameOverScene's
    // "RESTART FROM CHECKPOINT" button passes both.
    this._resumeFromPosition = data?.resumeFromPosition ?? null;
    this._crashRestartScore  = data?.crashRestartScore  ?? 0;
    // Arrest endings already assess their displayed bail loss before the
    // player reaches GameOver, so their checkpoint retry preserves that
    // post-bail total instead of applying the crash half-cash penalty too.
    this._checkpointRestartScore = data?.checkpointRestartScore ?? null;
    // Slider-restart drug levels (technical-loss / custom-mode flow) —
    // applied once after the scene reaches gameplay.
    this._customStartLevels  = data?.startDrugLevels ?? null;

    // CRITICAL: clear lazily-built per-scene-run caches.  Phaser reuses the
    // same scene instance across `scene.start('Game')` calls, but it also
    // destroys the previous run's display objects.  If we don't drop the
    // stale references here, the next _renderHUD pass calls setText() on a
    // destroyed Text, which crashes with "Cannot read properties of null
    // (reading 'drawImage')" inside Phaser's canvas pipeline.
    this._f12Texts     = null;
    this._drugLabels   = null;
    this._signTextPool  = null;      // sign-label overlay pool (same scene-restart issue)
    this._signDecalPool = null;      // hwy-shield + sign-face image pool
    // Pause-button refs from the previous scene's _buildHUD point at
    // destroyed GameObjects after scene.start.  If _togglePause or the
    // mute-sync renderer fires before _buildHUD reassigns these, the
    // stale Image.setTexture call throws inside Phaser's TextureManager
    // ("Cannot read properties of undefined (reading 'sys')").  Drop
    // the refs here so the guarded `if (this._pauseLblRef)` checks
    // short-circuit cleanly until _buildHUD reattaches.
    this._pauseBtnRef     = null;
    this._pauseLblRef     = null;
    this._redrawPauseBtn  = null;
    this.hudMuteLbl       = null;
    this.hudSkipLbl       = null;
    // Also reset stateful flags that survive across `scene.start('Game')`.
    // _takingExit was the culprit behind the Issaquah pull-over not firing
    // — it stayed `true` from the prior Bellevue exit, blocking subsequent
    // _takeRestStopExit calls until the page was reloaded.
    this._takingExit          = false;
    this._touchExitArmed      = false;
    // Reset rest-stop / checkpoint history so a "Start Over" from the
    // pause menu actually re-prompts every stop.  Previously these sets
    // accumulated across runs — once you'd taken the Seattle exit on one
    // playthrough, the next playthrough's Seattle window was disabled
    // because the id was still in this._passedRestStops from before.
    this._passedRestStops    = new Set();
    this._passedCheckpoints  = new Set();
    // The tumbleweed pool holds this.add.image() objects bound to the PREVIOUS
    // scene instance.  scene.start('Game') (rest-stop exit) destroys those
    // GameObjects, but this plain-array property survives on the reused scene
    // instance — so _renderTumbleweeds would call setTexture() on a destroyed
    // Image (its .scene is undefined → "reading 'sys' of undefined") and FREEZE
    // the game on the first Vantage frame after a rest stop.  Null it so the
    // pool rebuilds fresh.
    this._tumbleweeds        = null;
    // Cleared so a fresh run (incl. the DUI bust-to-start restart) doesn't boot
    // straight into the frozen busted-screen state.
    this._bustingToStart     = false;
    this._npcCrashesPostDrink = 0;
    this._drugBumpCount       = 0;
    this._drugBumpFired       = false;
    this._playerCopCrashes    = 0;
    this._copCrashCount       = 0;
    this._lastMixedLineMile   = 0;
    this._beerLineTimer       = 90;
    this._bonusWeaponTimer    = 0;
    this._flatTireTimer       = 0;
    // Speed-trap civil stop (0★ police layer, Stage 1).  When the player blows
    // a trap doing > COP_TRAP_SPEED_MPH at 0★, a pursuer spawns and a comply
    // window opens; pull to the right shoulder in time or it escalates to +1★.
    this._trapPursuitActive   = false;
    this._trapComplyTimer     = 0;
    this._trapStopping        = false;   // auto-stop assist engaged
    this._trapStopHeld        = false;   // held at a full stop for the traffic stop
    this._trapStopHoldTimer   = 0;
    // Stage 3 — the ticket.  `_trapTicket` snapshots the offense (sober vs DUI
    // + base fine) at the MOMENT of pulling over; it's resolved when the hold
    // ends.  `_duiStopMiles` is the rolling list of odometer-miles where an
    // intoxicated stop happened (suspended-license bust = too many inside
    // COP_DUI_WINDOW_MI).  `_duiEarnPenaltyMi` is the odometer mile through
    // which a DUI's ×COP_DUI_EARN_MULT earnings debuff stays in effect.
    this._trapTicket          = null;
    this._duiStopMiles        = [];
    this._duiEarnPenaltyMi    = -1;
    this._trapWarnSent        = new Set();   // trap miles a friend has already texted about
    // Flavor contacts (The Ex / Mom / The Boss / The Unknown) text you on the
    // road — pure tone, no gameplay effect.  Per-run threads + a cadence timer.
    this._buddyThreads        = { friend: [], ex: [], mom: [], boss: [], unknown: [], spam: [] };
    this._buddyTextTimer      = 35 + Math.random() * 20;   // first text ~35-55s in
    // Per-run contact/service state that lives in the save (so it would
    // otherwise carry across games).  Reset on a FRESH new game (New / Start
    // Over / Retry) — NOT a checkpoint or rest-stop resume, which continues the
    // same trip.  The buddy threads above already reset per run; the Friend
    // then re-populates with THIS run's (re-randomized) trap miles.
    //   • Crush (the Girl) — text her again from scratch each game.
    //   • Lawyer retainer — re-hire the $15k lawyer each game (fits the
    //     per-run economy: money == this run's score).
    //   • Dealer orders — unfilled orders don't carry into the next game.
    if (!this._resumeFromStop && this._resumeFromPosition == null) {
      const _save = this.registry.get('save');
      _save?.set?.('girlResponded',    false);
      _save?.set?.('girlTexts',        0);
      _save?.set?.('girlSkips',        0);
      _save?.set?.('girlGone',         false);
      _save?.set?.('lawyerRetained',   false);
      _save?.set?.('dealerOrders',     []);
    }
    // Crush per-run scene state.  `_girlTextPending`: they're awaiting a text
    // in the CURRENT town (cleared when you text; re-armed on entering a new
    // town, where an un-cleared flag = a skip).  `_girlThread`: the message log
    // they send YOU (annoyed → angry → silent → gone, plus a miss-you reply on
    // a 3-town streak).  `_girlStreak`: consecutive towns texted.
    this._girlTextPending     = true;
    this._girlThread          = [];
    this._girlStreak          = 0;
    this._steerHistory        = null;     // drunk-delay input ring
    // Overdose freezes the final frame until GameOver appears. Phaser
    // reuses this GameScene instance on restart, so clear the latch or a
    // checkpoint respawn after an OD stays permanently frozen.
    this._odEnding            = false;
    // Restart-from-pause / GameOver re-attach: the title-screen "any key
    // dismisses the title" listener is `once`-style.  After it fires the
    // first time, _anyKeyAttached stays true on the reused scene instance,
    // so the listener never re-attaches on the next run and the player is
    // stuck on the title screen.  Reset here every init.
    this._anyKeyAttached = false;
    // Touch-input latches — same Phaser-reuse issue.  If the player was
    // mid-tap (or held a touch button) when scene.start fired, the latch
    // stayed true into the next run and triggered phantom input.
    this._touchLeft  = false;
    this._touchRight = false;
    this._touchF12   = false;
    this._touchBrake = false;
    this._touchBoost = false;
    // ACCEL pedal charge — 0-100%.  Holding accel drains 100% over 5
    // min real-time; releasing refills 100% over 20 min.  Hits 0 →
    // boost auto-disables; refills passively whenever boost is off.
    // Bar lives under the gas HUD readout (see _renderHUD).
    this._accelCharge = 100;
    // HUD drug-bar drag handler — same reuse issue.  The Phaser input
    // system tears down its listeners on scene shutdown, but our
    // `_drugBarDragWired` flag persisted into the next run so the
    // re-attach was skipped and the bars stopped responding.  Clearing
    // the flag here lets _ensureDrugBarDragHandler re-register cleanly.
    this._drugBarDragWired = false;
    this._draggingDrugId   = null;
    this._drugBarHits      = null;
    // Maxed-out + full-tank per-run gates — clear so each new run can
    // award them fresh.
    this._maxedFired       = null;
    this._fullTankFired    = null;
    // Gas-stranded popup gate — fires once per empty event.
    this._strandedShown    = false;
    // Tilt-steer state — listener was attached to `window`, not the
    // scene, so a scene-restart leaves it dangling.  Detach + reset
    // so the next create() can re-attach cleanly.
    if (this._tiltAttached && this._tiltOnOrient) {
      window.removeEventListener('deviceorientation', this._tiltOnOrient, true);
    }
    if (this._tiltPrefetchCleanup) this._tiltPrefetchCleanup();
    this._tiltAttached         = false;
    this._tiltLeftActive       = false;
    this._tiltRightActive      = false;
    this._tiltGamma            = 0;
    this._tiltRequestInFlight  = false;
    this._tiltPendingCbs       = null;
    this._tiltPrefetchInstalled = false;
  }

  create() {
    // Registry of every top-row button — populated below as each is
    // created.  _applyTopRowHandedness() iterates this on flip to
    // mirror all buttons around SCREEN_W/2.
    this._topRowButtons = [];
    // ── Perf diagnostic flags (URL params) ─────────────────────────
    // Toggle expensive render passes via ?nomirror / ?nosprites /
    // ?noeffects to isolate where frame time is going.
    const _q = (typeof location !== 'undefined' ? location.search : '') || '';
    this._perf = {
      noMirror:  /[?&]nomirror(=|&|$)/.test(_q),
      noSprites: /[?&]nosprites(=|&|$)/.test(_q),
      noEffects: /[?&]noeffects(=|&|$)/.test(_q),
    };
    this._renderedSpriteCount = 0;
    try {
      this._doCreate();
    } catch (e) {
      console.error('[GameScene.create] FAILED:', e);
      this.add.text(SCREEN_W / 2, SCREEN_H / 2, 'GAME ERROR\n' + (e?.message ?? e), {
        fontSize: '14px', color: '#FF4444', backgroundColor: '#000', align: 'center',
      }).setOrigin(0.5);
    }
  }

  _doCreate() {
    this.cameras.main.setBackgroundColor(0x000000);

    // Handedness — DEFAULT is left-handed (weapon/HP/gas/speed column
    // on the LEFT, drug bars on the RIGHT) per the new game baseline.
    // Persisted in the global settings slot; toggled from the
    // phone-menu (future) or the Shift+L debug keybind below.
    const _save = this.registry.get('save');
    this._leftHanded = _save?.get?.('settings.handedness', 'left') !== 'right';

    // Track which objects belong to the world (shake/sway with the main camera)
    // vs the HUD (must remain perfectly static on a separate UI camera).
    this._worldObjects = [];
    this._hudObjects   = [];
    // Drug status-bar icon cache. MUST reset on every (re)create: Phaser
    // reuses this scene instance across scene.start('Game') (rest-stop
    // continue — including after buying a car), which destroys all
    // GameObjects but leaves this._drugIcons pointing at the dead ones.
    // The lazy-create guard in _drawDrugIcons would then treat them as
    // "already created" and never rebuild them, so the icons vanish.
    this._drugIcons    = {};

    // ── Core systems ──────────────────────────────────────────────────
    // Difficulty needs to be hydrated FIRST — its flags gate weather,
    // day/night, damage scaling, and cop escalation for the rest of the
    // scene.  Stored on the registry so child scenes (Rest stop, Game over)
    // see the same value.
    Difficulty.hydrate(this.registry);
    // Achievement toast wiring — AchievementSystem fires this callback
    // whenever a badge is earned (or upgraded to a higher tier).  The
    // toast renders bottom-of-screen in HUD camera so it survives camera
    // tilt and shake.
    AchievementSystem.setAwardCallback((evt) => this._showAchievementToast(evt));
    // Achievement run-state trackers.
    this._noDamageTimer    = 0;          // seconds since last damage (Untouchable)
    this._noDamageFlags    = { '1m': false, '2m': false, '3m': false, '5m': false };
    this._peakStars        = 0;          // for 5★ Survivor
    this._fiveStarSurvived = false;
    this._everHitStars     = false;      // for Crystal Clean (Pullman-end)
    this._everUsedRestStop = false;      // for Iron Bladder (Pullman-end)
    // Custom-mode opt-in flags from the start-screen controls.  Reset
    // every init() so a previous Custom run can't bleed `noPolice` /
    // `noNpcDamage` into the next Normal/Easy/Hard launch.  The CUSTOM
    // modal sets these AFTER init() runs, before calling _startGameplay,
    // so the modal flow isn't broken by the unconditional reset.
    this._customFlags      = { noNpcDamage: false, noPolice: false };
    this._customStartStars = null;
    this._customStartPosition = null;
    this._customStartAccessories = null;
    this._customStartVehicleId   = null;

    this.road    = new Road();
    this.drugs   = new DrugSystem();
    // Hydrate persistent drug unlocks from the Phaser registry — survives
    // arrest/death/respawn within the same play session.  See "drugUnlocks"
    // writes after _drugUpdate (below).
    this.drugs.hydrateUnlocks?.(this.registry.get('drugUnlocks'));
    // Also restore partial-unlock progress (e.g. meth Phase 1) so a rest
    // stop or arrest doesn't wipe the cocaine-peak flag the gate depends on.
    this.drugs.hydrateProgress?.(this.registry.get('drugProgress'));
    this.effects = new EffectsSystem(this);
    this.cops    = new CopSystem();
    this.haptics = new HapticSystem();
    // Honor the phone-menu Settings → Haptics toggle (persisted in save).
    this.haptics.setEnabled(this.registry.get('save')?.get?.('settings.haptics', true) !== false);
    this.audio   = this.registry.get('audio'); // shared from BootScene — already playing
    // Always unpause on scene-create.  _endGame() and _onArrested() pause
    // the audio when a run ends, but the audio object is a registry
    // singleton so the paused flag survives into the next scene.start.
    // Without this, restarting from GameOver / FROM CHECKPOINT / START
    // OVER / rest-stop continue all left the music silent.
    this.audio?.setPaused?.(false);
    this.player  = makePlayer();

    // ── Vehicle + gas state ───────────────────────────────────────────
    // Player owns one vehicle from VEHICLES catalog; the dealership
    // (Phase 3) lets them swap.  vehicleId persists across runs via the
    // registry; defaults to the Beater on first boot.
    const _savedVehId = this.registry.get('vehicleId');
    this.player.vehicleId = (_savedVehId && VEHICLES[_savedVehId]) ? _savedVehId : 'beater';
    const _veh = VEHICLES[this.player.vehicleId];
    // Gas tank: full on each new run.  Decrements per mile in update().
    this.player.gasMi    = _veh.rangeMi;
    this.player.gasMaxMi = _veh.rangeMi;

    // ── New overhaul systems ──────────────────────────────────────────
    // HP cap pulls from the chosen vehicle's spec so a Truck can soak
    // more damage than a Beater out of the box.
    this.damage  = new DamageModel({ max: _veh.hp, durability: _veh.hp });
    this.wallet  = this.registry.get('wallet');
    // Career stats tracker (registry singleton).  Hot-path methods mutate
    // in-memory; tripStart/Complete/End + rest-stop transitions flush.
    this.stats   = this.registry.get('stats');
    // Phone-menu Settings (persisted in save) → cached for in-run reads.
    // unitsKmh: speed/distance in km·h / km vs mph / mi.  shakeMult: screen-
    // shake scale (0–1).  hudHidden: "Hide HUD" toggle.
    {
      const _save = this.registry.get('save');
      this._unitsKmh   = _save?.get?.('settings.units', 'mph') === 'kmh';
      this._shakeMult  = _save?.get?.('settings.shake', 1);
      this._hudHidden  = _save?.get?.('settings.hud', true) === false;
      // Colorblind-safe mode: remaps the red/green score-multiplier tiers to
      // a blue→amber→orange ramp (distinguishable across all CVD types).
      this._colorblind = _save?.get?.('settings.colorblind', false) === true;
    }
    // Keep per-vehicle stat routing in sync on every (re)create — a fresh
    // start, rest-stop resume, or checkpoint respawn may be on a new car.
    this.stats?.setVehicle(this.player.vehicleId);

    // Zero-HP wreck → game-over screen.  Now that the HP bar is on the
    // HUD the player can see this coming, so auto-ending the run is fair.
    this.damage.on('wreck', () => { this.stats?.recordWreck(); this._endGame('crash'); });
    // First HP loss flips the run out of the "drive straight" intro:
    // Tap-mode's auto-pull-left kicks in from the moment the player
    // takes damage, even if they haven't tapped yet.  Same flags the
    // first-tap path clears.
    this.damage.on('damage', ({ amount } = {}) => {
      this.stats?.recordDamage(amount);
      if (this._awaitingFirstGameTap || this._steerLockUntilTap) {
        this._awaitingFirstGameTap = false;
        this._steerLockUntilTap    = false;
      }
      // Floating "-X HP" popup beside the HP readout for 1.5 s.
      if (this.hudHPDamage && amount > 0) {
        const n = Math.round(amount * 10) / 10;
        const txt = (n === Math.floor(n)) ? `-${n.toFixed(0)}` : `-${n.toFixed(1)}`;
        this.hudHPDamage.setText(txt).setVisible(true);
        // Position just on the CENTER side of the live HP text — right
        // of HP in left-handed mode, left of HP otherwise.
        const hb = this.hudHP?.getBounds?.();
        if (hb) {
          const GAP = 8;
          this.hudHPDamage.x = this._leftHanded ? (hb.right + GAP) : (hb.left - GAP);
        }
        this._hpDamageUntil = (this.time?.now ?? 0) + 1500;
      }
    });

    // ── Graphics layers ───────────────────────────────────────────────
    this.roadGfx      = this.add.graphics();
    // Smoke layer sits ABOVE the player car so low-HP puffs read
    // clearly instead of being half-hidden behind the chassis.
    // (Player car is at depth 9.95; this lands just above.)
    this._smokeGfx    = this.add.graphics().setDepth(9.97);
    // Cracked windshield treatment for critical HP. It is procedural and
    // screen-aligned, so the same damage warning works in chase and cockpit.
    this._damageGlassGfx = this.add.graphics().setDepth(9.99);
    // Scenery crash explosion (fire/smoke ring) — high-depth layer so
    // the fire burst is visible OVER buildings the player crashed into.
    // Previously the explosion was painted into roadGfx (depth 0), which
    // meant it was hidden behind every building sprite (depth 7-9.5) —
    // the collision was happening (car reset / HP loss) but the player
    // saw no visual feedback because the fire was painted behind the
    // building they just hit.
    this._explosionGfx = this.add.graphics().setDepth(9.96);
    this.ghostGfx     = this.add.graphics();
    // Procedural-sprite layer (houses, buildings, etc.) — sits in the
    // tree/car depth band so they don't always render *behind* image-
    // based trees on roadGfx (depth 0).  9.45 lands above most trees
    // (which use 9.5 - relZ/76000 × 2.5, so depth ≤ 9.45 once relZ ≥
    // ~1500), so far trees paint behind houses while very close trees
    // and the player's car still paint in front.
    this.propsGfx     = this.add.graphics().setDepth(9.45);
    // Continuous pasture fencing is projected procedurally, avoiding a
    // large repeating bitmap or hundreds of post sprite instances.
    this._ruralFenceGfx = this.add.graphics().setDepth(7.35);
    // Utility wires use one line layer and a tiny reusable pole pool rather
    // than inserting dozens of repeated props into the general scenery pool.
    this._utilityLineGfx = this.add.graphics().setDepth(7.34);
    this.tunnelGfx    = this.add.graphics().setDepth(9.82);
    // Tunnel interior mask — the actual stencil shape that limits
    // where tunnelGfx (interior walls/ceiling) can render.  Each
    // frame we draw EITHER the mouth-opening rectangle (when
    // approaching the tunnel) OR a full-screen rect (when the camera
    // is inside).  Outside of those cases the mask is empty, so the
    // tunnel interior can't paint anywhere.  This replaces the
    // depth-juggling approach: the interior CAN'T leak past the
    // mouth opening because Phaser stencils it out.
    this._tunnelMaskGfx = this.add.graphics().setVisible(false);
    this.tunnelGfx.setMask(this._tunnelMaskGfx.createGeometryMask());
    // Tunnel ambient dim — a full-screen black wash that darkens the bore
    // ~40% while the camera is inside a tunnel.  Sits ABOVE the tunnel shell
    // (9.82) so it dims walls + ceiling + pavement, but BELOW the player car
    // (9.95) and the HUD/vignette (11+) so those stay lit.  The rect is drawn
    // once at full alpha; the per-frame fade just eases the layer's ALPHA
    // toward the target (see _renderFrame) so entering / exiting is a quick
    // fade, not a hard lighting flip.
    this.tunnelDimGfx = this.add.graphics().setDepth(9.85);
    this.tunnelDimGfx.fillStyle(0x000000, 1)
      .fillRect(-150, -150, SCREEN_W + 300, SCREEN_H + 300);
    this.tunnelDimGfx.setAlpha(0).setVisible(false);
    this._tunnelDim = 0;   // current eased darkness (0 → TUNNEL_DIM_MAX)
    // signGfx replaced by _signGfxPool (per-sign Graphics with dynamic
    // depths matched to each sign's distance — see below).
    // Bridge front-overlay (depth 4) — acts as an opaque road-surface
    // re-paint layer for bridge segments.  Road.js routes bridge-segment
    // asphalt + lane markings + rumbles + guardrails here, so the
    // bridge deck paints OVER cranes (renderDepth 2) but stays UNDER
    // NPCs / cops / drugs / signs (depth ≥ 7) which still appear on
    // top of the road as expected.
    this.bridgeFrontGfx = this.add.graphics().setDepth(4);
    // Tunnel entrance facade — depth is set DYNAMICALLY per frame by
    // Road.renderTunnelFacade() based on the tunnel's actual distance,
    // so closer scenery renders in front and past-tunnel scenery is
    // occluded.  Initial depth here is just a placeholder.
    this.tunnelFacadeGfx = this.add.graphics().setDepth(7.6);
    // Sign overlay pool — one Graphics per visible sign, depth set
    // per-frame based on the sign's world distance so closer scenery
    // can naturally occlude distant signs (instead of all signs
    // batching into one always-on-top layer).
    this._signGfxPool = [];
    for (let i = 0; i < 24; i++) {
      this._signGfxPool.push(this.add.graphics().setVisible(false));
    }
    this.overlayGfx   = this.add.graphics().setDepth(10);
    this.vignetteGfx  = this.add.graphics().setDepth(11);
    this.hudFlashGfx  = this.add.graphics().setDepth(12);
    // Player headlight beams — sit ABOVE the road graphics (depth 1)
    // but BELOW scenery sprites (depth ~7+) so beams illuminate the
    // pavement without painting over trees and buildings.  Additive
    // blend mode is set per-draw so the beams glow rather than mask.
    this.headlightGfx = this.add.graphics().setDepth(5);
    // Fixture glows render ABOVE the car (depth 9.95) so the small
    // warm-yellow dots show through the back of the body — implying
    // active headlights at the bumper without drawing them where the
    // beams can't reach.  Below the HUD vignette at depth 11.
    this.headlightFixtureGfx = this.add.graphics().setDepth(10);
    // Rain / snow particle overlay.  Sits above scenery (depth 7.5
    // ramp) but below crash flash + vignette, so weather paints over
    // the world without obscuring HUD effects.
    this.weatherFxGfx = this.add.graphics().setDepth(9.7);
    // Windshield wipers — drawn ABOVE the weather FX (so they appear
    // to clear droplets) but BELOW the HUD vignette.
    this.wipersGfx    = this.add.graphics().setDepth(9.8);
    // Third-person glass overlay uses the same real wiper-arm asset as
    // the cockpit. The image is 384x768; deriving width from height keeps
    // the blade at its native proportions rather than squeezing it thin.
    const chaseWiperH = 405;
    const chaseWiperW = chaseWiperH * (384 / 768);
    this.chaseWipers = [
      { x: 125, y: SCREEN_H + 6 },
      { x: 410, y: SCREEN_H + 6 },
    ].map(w => this.add.image(w.x, w.y, 'beater_wiper_arm')
      .setOrigin(0.5, 1)
      .setDisplaySize(chaseWiperW, chaseWiperH)
      .setRotation(Phaser.Math.DegToRad(90))
      .setDepth(9.8)
      .setVisible(false));
    this.effects.setGraphics(this.overlayGfx, this.vignetteGfx, this.hudFlashGfx);

    // Weed cushion: dampen all crash-shake intensity by phys.collisionShakeDamp.
    // Wrapping the existing triggerShake means every call site (vehicle/cop/
    // roadblock/etc.) gets the cushion without touching ~16 spots.
    {
      const _origTriggerShake = this.effects.triggerShake.bind(this.effects);
      this.effects.triggerShake = (durationMs, intensity) => {
        const _phys = this.effects.getPhysics?.(this.drugs);
        const damp  = _phys?.collisionShakeDamp ?? 0;
        _origTriggerShake(durationMs, intensity * (1 - damp) * (this._shakeMult ?? 1));
      };
    }

    this.hudGfx = this.add.graphics().setDepth(20);
    this._hudObjects.push(this.hudGfx);

    // Flashing red/blue cruiser lights for the held traffic stop (depth 19 =
    // under the HUD text/popup at 20, over the world).  Drawn in the held-stop
    // tick, cleared when the stop ends.
    this._trapLightGfx = this.add.graphics().setDepth(19);
    this._hudObjects.push(this._trapLightGfx);
    this._trapLightWasOn = false;

    // ── DEBUG OVERLAY ────────────────────────────────────────────────
    // Toggle with F3.  Draws on-screen collision rectangles, sprite
    // anchor points, the tunnel mouth rect, and a live text readout
    // (mile / region / x / speed / counts).  Lets us see "what the
    // game thinks is happening" vs "what the player sees", which is
    // the only sane way to debug the rendering↔collision divergences
    // that have bitten us repeatedly (Bellevue offset mismatch,
    // Mercer house hitbox, tunnel see-through).  Zero per-frame cost
    // when off — _renderDebugOverlay early-returns on this._debugOn.
    this._debugOn  = false;
    this._debugGfx = this.add.graphics().setDepth(19).setVisible(false);
    // F2 painted-edge overlay — independent of F3.  Lives on its own
    // graphics layer so the user can see ONLY the yellow / magenta /
    // cyan lines without the F3 blue frames + red boxes + labels.
    this._paintedEdgeGfx = this.add.graphics().setDepth(19).setVisible(false);
    this._debugText = this.add.text(8, 8, '', {
      fontFamily: 'monospace, Courier', fontSize: '11px',
      color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { x: 5, y: 4 },
    }).setDepth(19).setScrollFactor?.(0).setVisible(false);
    this._debugLegend = this.add.text(8, SCREEN_H - 108, '', {
      fontFamily: 'monospace, Courier', fontSize: '10px',
      color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { x: 5, y: 3 },
    }).setDepth(19).setScrollFactor?.(0).setVisible(false);
    this._debugLegend.setText([
      'RED   active collision band',
      'BLU   PNG frame (transparent allowed)',
      'GRAY  PNG frame skipped',
      'CYN   sprite anchor',
      'LIME  player trapezoid (chassis)',
      'ORG   NPC AABB',
      'MAG   tunnel mouth',
    ].join('\n'));

    // ── Player sprite ─────────────────────────────────────────────────
    // Sprite sits ~120 px above the bottom of the screen so there is visible
    // road *below* the car — the apparent "behind the car" view the player
    // asked for.
    // Per-vehicle PNGs land via `spriteBack` (rear view of the player's
    // car).  Vehicles without a back-PNG fall back to the procedural
    // `car_player` texture + a vehicle tint.
    const _vehSpriteBack = _veh?.spriteBack;
    const playerTex = (_vehSpriteBack && this.textures.exists(_vehSpriteBack))
      ? _vehSpriteBack
      : (this.textures.exists('car_player') ? 'car_player' : 'player_car');
    this.playerSprite = this.add.image(SCREEN_W / 2, SCREEN_H - 130, playerTex)
      .setOrigin(0.5, 1)
      .setDepth(9.95);
    this._applyPlayerSpriteDisplaySize();
    // Apply vehicle tint ONLY when falling back to the procedural texture
    // (per-vehicle PNGs already carry their own colour).
    if (playerTex === 'car_player') {
      const _vehTint = _veh?.tint;
      if (_vehTint && this.player.vehicleId !== 'beater') {
        this.playerSprite.setTint(_vehTint);
      }
    }

    // ── Rear license plate — the player's leaderboard handle painted on
    // the car's back bumper.  A small Text we re-anchor to the player
    // sprite every frame in _updateRearPlate (tracks x / y / lean / scale).
    // Rendered at a high internal resolution (setResolution below) because
    // it gets scaled DOWN to ~4 px tall on the car — a low-res glyph would
    // turn to mush.  "Arial Black" filled in at that size, so a plain bold
    // weight + near-black-on-white (max contrast) reads better.
    // State-plate art for the active player's car (slot 0/1/2 → WA/OR/ID),
    // sized to the car's painted plate area in _updateRearPlate.  Sits just
    // UNDER the handle text.  The handle no longer needs a cream background —
    // the plate art is the background now.
    this._rearPlateImg = this.textures.exists(PLATE_KEYS[0])
      ? this.add.image(SCREEN_W / 2, SCREEN_H - 130, PLATE_KEYS[0]).setDepth(9.955).setVisible(false)
      : null;
    this._rearPlate = this.add.text(SCREEN_W / 2, SCREEN_H - 130, '', {
      fontFamily: 'Arial, "Helvetica Neue", sans-serif',
      fontStyle: 'bold',
      fontSize: '16px',
      color: '#111111',
      stroke: '#FFFFFF', strokeThickness: 3,   // contrasting outline over the plate art
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(9.96).setVisible(false);
    this._rearPlate.setResolution(4);
    this._rearPlateStr = '';

    // ── First-person cockpit (currently beater only) ──────────────────
    // Transparent dashboard overlay covers the lower screen; the upper
    // windshield region of the PNG is transparent so world / weather
    // remain visible through it.  Other vehicles still use the third-
    // person playerSprite above until their own cockpit art ships.
    //
    // Build the cockpit overlay objects up-front (so the V toggle
    // doesn't pay the first-press build cost), then immediately leave
    // cockpit so the game defaults to 3rd-person.  Beater drivers
    // opt into cockpit via the V key.
    this._buildCockpit();
    this._leaveCockpitView();

    // ── Vehicle sprite pool — same SHAPE as player car, white-bodied
    // texture so each car's tint comes through cleanly. Uses Phaser Images
    // so they match the player visually.
    this._carSpritePool = [];
    // Parallel pool of Graphics objects, one per car slot, each
    // BitmapMasked by its NPC sprite (inverted) — same trick as the
    // player car's headlights.  The mask makes each NPC's beam
    // Graphics visible only OUTSIDE that NPC's silhouette, so opaque
    // body pixels (truck bed, trunk, bumper) can't reveal light
    // through them.  Each Graphics renders at depth 5 (below all
    // NPC sprites at 7-9.5) so depth ordering also reinforces the
    // occlusion.
    this._npcHeadlightGfxPool = [];
    for (let i = 0; i < 36; i++) {
      // setOrigin(0.5, 1) → sprite is anchored at its bottom-centre, so when
      // we place it at the road-surface y the car SITS on the road instead
      // of being half-sunken at sprite centre.
      const s = this.add.image(0, 0, 'npc_car_white')
        .setOrigin(0.5, 1)
        .setDepth(8)
        .setVisible(false);
      this._carSpritePool.push(s);
      const hg = this.add.graphics().setDepth(5);
      const mask = s.createBitmapMask();
      mask.invertAlpha = true;
      hg.setMask(mask);
      this._npcHeadlightGfxPool.push(hg);
    }
    // Dedicated overlay for cop light bars at higher depth than car sprites
    // (was drawing on roadGfx at depth 0, which was hidden behind the cars).
    this._copLightGfx = this.add.graphics().setDepth(9.75);

    // Tire-shadow overlay — small dark ellipses glued to the road-contact
    // point of every car (player + NPC + cop).  Sampled from the road
    // surface, NOT from sprite Y, so a 1-3 px sprite mismatch reads as
    // grounded instead of floating.  Depth 7.4 sits below sprites (8) but
    // above the road fill (0).
    this._tireShadowGfx = this.add.graphics().setDepth(7.4);

    // Drug sprite pool — Phaser Images for the road-side drug pickups.
    this._drugSpritePool = [];
    for (let i = 0; i < 24; i++) {
      const s = this.add.image(0, 0, 'drug_beer')
        .setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
      this._drugSpritePool.push(s);
    }
    // Drug halo overlay — sits one depth-tier below the drug sprite pool
    // so the halo paints UNDER each pickup.  Used for ketamine (dark
    // outer ring + bright inner glow) and fentanyl (uniform red glow)
    // since their PNGs are too dark to spot on dark asphalt.
    this._drugHaloGfx = this.add.graphics().setDepth(8.4);

    // Double-vision ghost pools — mirror the car + drug pools at reduced
    // alpha and a lateral pixel offset.  Sized at 24 each (drug pool size)
    // since traffic count and visible pickups stay in that range.
    this._carGhostPool = [];
    for (let i = 0; i < 24; i++) {
      this._carGhostPool.push(this.add.image(0, 0, 'npc_car_white')
        .setOrigin(0.5, 1).setDepth(8).setVisible(false));
    }
    this._drugGhostPool = [];
    for (let i = 0; i < 24; i++) {
      this._drugGhostPool.push(this.add.image(0, 0, 'drug_beer')
        .setOrigin(0.5, 1).setDepth(8.5).setVisible(false));
    }

    // Building / tree sprite pool — bumped to 600 so dense urban regions can
    // populate BOTH the close foreground and the far horizon.  At the prior
    // size of 200 the pool filled with the closest ~120 buildings before the
    // iterator reached anything past mid-range, so distant blocks never got
    // sprites and buildings appeared to "pop in" only when the player was
    // ~100 feet away.
    // Pool sized to the realistic per-frame visible sprite count
    // (post min-size cull below).  Mobile GPUs can't batch sprites
    // with mismatched textures, so each unique building texture is a
    // draw call — keeping the active count down is the single biggest
    // perf win for scenery-heavy regions.
    this._sceneSpritePool = [];
    // Pool size 1900 (was 400 → 1500 → 2500 → 1900).  Drops 600
    // Image-instance startup cost + memory; per-frame perf is dominated
    // by VISIBLE count not pool size, so this only helps startup +
    // memory pressure.  If frame rate still drags, the next lever is
    // dropping tree DENSE_SLOTS_PER_MILE in RouteData.js.
    for (let i = 0; i < 1900; i++) {
      const s = this.add.image(0, 0, 'codex_bellevue_skyline')
        .setOrigin(0.5, 1).setDepth(7.5).setVisible(false);
      this._sceneSpritePool.push(s);
    }

    // Tiny repeated image pool for fenced pasture spans. Rails remain one
    // procedural strip; only the recognizable wooden posts use texture art.
    // Small scale/tilt variation keeps the single tiny asset from feeling rigid.
    this._fencePostPool = [];
    for (let i = 0; i < 64; i++) {
      const post = this.add.image(0, 0, 'east_wa_fence_post')
        .setOrigin(0.5, 1).setDepth(7.36).setVisible(false);
      this._fencePostPool.push(post);
    }
    this._utilityPolePool = [];
    for (let i = 0; i < 18; i++) {
      const pole = this.add.image(0, 0, 'east_wa_utility_pole_plain')
        .setOrigin(0.5, 1).setDepth(7.37).setVisible(false);
      this._utilityPolePool.push(pole);
    }

    // (No Plane/Mesh 3D pool for the Bellevue strip — Phaser's mesh
    // perspective doesn't align with the road's pseudo-3D projection,
    // so attempts at a true road-parallel quad produced broken visuals.
    // The strip renders as a regular face-on billboard via the scene
    // sprite pool; perspective should be baked into the source PNG.)
    this._strip3dPool = [];

    // ── City horizon strips ───────────────────────────────────────────
    // Per-city wide images that sit at the horizon line like the
    // mountains do — they parallax slightly with player.x and drift
    // down slightly as the player progresses through the city.
    // Updated each frame by _renderHorizonStrips().
    this._horizonStripL = this.add.image(0, 0, 'codex_bellevue_roadside_strip')
      .setOrigin(0.5, 1)            // anchor at bottom-center so it sits on the horizon line
      .setDepth(5.7)                // above road graphics (~5), below scenery sprites (7.5)
      .setVisible(false);
    this._horizonStripR = this.add.image(0, 0, 'codex_bellevue_roadside_strip')
      .setOrigin(0.5, 1)
      .setDepth(5.7)
      .setVisible(false);

    // ── Input ─────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd    = this.input.keyboard?.addKeys({ up:'W', down:'S', left:'A', right:'D' });
    this.keyF     = this.input.keyboard?.addKey('F');
    this.keyM     = this.input.keyboard?.addKey('M');
    this.keyR     = this.input.keyboard?.addKey('R');
    // Q cycles the selected weapon (forward/backward rocket variants count
    // as separate slots so the player can pick direction).
    this.keyQ     = this.input.keyboard?.addKey('Q');
    this.keySpace = this.input.keyboard?.addKey('SPACE');
    this.keyEnter = this.input.keyboard?.addKey('ENTER');

    // Shift+L toggles left/right-handed HUD layout — temporary until
    // the phone-menu has an interactive widget for it.  Forces a scene
    // restart so all HUD elements re-bind to the new mirror state.
    this._handednessHandler = (ev) => {
      if (ev.key !== 'L' && ev.key !== 'l') return;
      if (!ev.shiftKey) return;
      const save = this.registry.get('save');
      const cur = save?.get?.('settings.handedness', 'right');
      save?.set?.('settings.handedness', cur === 'left' ? 'right' : 'left');
      this.scene.restart();
    };
    this.input.keyboard?.on('keydown', this._handednessHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._handednessHandler));

    // ── DEV WARP — REMOVE BEFORE RELEASE ──────────────────────────────
    // Digit 1-9 jumps the player to a predefined mile marker so
    // verification of bridge / pass / palouse rendering doesn't require
    // driving the whole route.  Search "DEV WARP" before shipping and
    // delete this block.
    const _DEV_WARP_MILES = {
      1:   3,   // West Seattle Bridge descent
      2:   7,   // Lacey V Murrow Bridge
      3:   9,   // Mercer Island climb
      4:  11,   // East Channel Bridge
      5:  31,   // North Bend (rain zone — Exit 31)
      6:  45,   // Snoqualmie Pass climb
      7:  52,   // Snoqualmie Pass summit
      8: 132,   // Vantage descent
      9: 220,   // Palouse hills
    };
    this._devWarpHandler = (ev) => {
      const n = Number(ev.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const mile = _DEV_WARP_MILES[n];
      if (mile == null || !this.player) return;
      this.player.position = (mile / TOTAL_ROUTE_MILES) * ROUTE_SEGS * SEG_LENGTH;
      // Clear traffic + cops + wanted state so the warp doesn't immediately
      // crash or trigger BUSTED at the finish line (warp 9 = mile 220 +
      // late-game wanted level can otherwise instantly bust the player).
      if (this.npcs) this.npcs.length = 0;
      if (this.cops?.cops) this.cops.cops.length = 0;
      if (this.cops) {
        this.cops.stars = 0;
        this.cops.headOnHits = 0;
        this.cops.rearBumps  = 0;
        this.cops.pitsLanded = 0;
      }
      this._trapPursuitActive = false;
      this._trapComplyTimer   = 0;
      this._trapStopping      = false;
      this._trapStopHeld      = false;
      this._trapStopHoldTimer = 0;
      this._trapTicket        = null;   // drop any unresolved ticket snapshot
      // Refresh the party clock so a near-finish warp registers as
      // ON-TIME (otherwise warp 9 finishes the run immediately with
      // clock=0 → TOO LATE).
      this._partyClockSec = Difficulty.partyClockSec();
      this._showPopup?.(`WARP → mile ${mile}`, '#FFCC00');
    };
    this.input.keyboard?.on('keydown', this._devWarpHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._devWarpHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._devWarpHandler));
    // ── /DEV WARP ─────────────────────────────────────────────────────

    // ── BACK-WARP HOTKEY (B) — jump 0.25 mi back ────────────────────────
    // Quick dev/QA shortcut so you can re-test a section you just drove
    // through without restarting the run.  Pure position rewind — no
    // gas drain, no cop reset (matches DEV WARP convention).
    this._backWarpHandler = (ev) => {
      if (ev.key !== 'b' && ev.key !== 'B') return;
      if (!this.player) return;
      const dPos = (0.25 / TOTAL_ROUTE_MILES) * ROUTE_SEGS * SEG_LENGTH;
      this.player.position = Math.max(0, this.player.position - dPos);
      this._showPopup?.('WARP ← 0.25 mi', '#FFCC00');
    };
    this.input.keyboard?.on('keydown', this._backWarpHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._backWarpHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._backWarpHandler));

    // ── FORWARD-WARP HOTKEY (N) — jump 0.25 mi forward ──────────────────
    // Companion to B (back).  Pure position skip — no gas drain, no
    // cop/state reset.  Capped at the final mile so we don't overshoot
    // the Pullman finish.
    this._fwdWarpHandler = (ev) => {
      if (ev.key !== 'n' && ev.key !== 'N') return;
      if (!this.player) return;
      const dPos = (0.25 / TOTAL_ROUTE_MILES) * ROUTE_SEGS * SEG_LENGTH;
      const maxPos = ROUTE_SEGS * SEG_LENGTH - SEG_LENGTH;
      this.player.position = Math.min(maxPos, this.player.position + dPos);
      this._showPopup?.('WARP → 0.25 mi', '#FFCC00');
    };
    this.input.keyboard?.on('keydown', this._fwdWarpHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._fwdWarpHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._fwdWarpHandler));

    // F3 toggles the debug overlay.  Matches the dev-warp pattern so
    // it auto-detaches on scene shutdown / destroy.
    // F4 toggles camera lateral tracking — the camera-follows-player
    // behavior (default) keeps the road centered on the player's view
    // but makes roadside scenery appear to slide away when the player
    // drifts to the opposite lane.  Disable to keep the camera fixed
    // at world X=0 so scenery stays put and the player visibly slides
    // across the road instead.  Tested side-by-side via this key.
    this._cameraToggleHandler = (ev) => {
      if (ev.code !== 'F4' && ev.key !== 'F4') return;
      ev.preventDefault?.();
      if (this.road) {
        this.road._cameraTracksPlayer = this.road._cameraTracksPlayer === false;
        const mode = this.road._cameraTracksPlayer === false ? 'CENTERED' : 'TRACKS PLAYER';
        this._showPopup?.(`Camera: ${mode}`, '#FFCC00');
      }
    };
    this.input.keyboard?.on('keydown', this._cameraToggleHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._cameraToggleHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._cameraToggleHandler));

    // V key toggles between FIRST-PERSON cockpit and THIRD-PERSON
    // rear-view sprite.  Only meaningful in the beater (the only car
    // with cockpit art so far); silently no-ops otherwise.
    this._viewToggleHandler = (ev) => {
      if (ev.code !== 'KeyV' && ev.key !== 'v' && ev.key !== 'V') return;
      ev.preventDefault?.();
      this._toggleCockpit();
    };
    this.input.keyboard?.on('keydown', this._viewToggleHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._viewToggleHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._viewToggleHandler));

    // K key toggles cockpit CALIBRATION mode — needles sweep through
    // 0 → 50 % → 100 % on a 3-second cycle so gauge positioning can
    // be visually confirmed without driving / refueling / pausing.
    // Off by default; only fires in cockpit view.
    this._cockpitCalibHandler = (ev) => {
      if (ev.code !== 'KeyK' && ev.key !== 'k' && ev.key !== 'K') return;
      ev.preventDefault?.();
      this._cockpitCalibrate = !this._cockpitCalibrate;
      this._showPopup?.(`Cockpit calib: ${this._cockpitCalibrate ? 'ON' : 'OFF'}`, '#FFCC00');
    };
    this.input.keyboard?.on('keydown', this._cockpitCalibHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._cockpitCalibHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._cockpitCalibHandler));

    this._debugToggleHandler = (ev) => {
      if (ev.code !== 'F3' && ev.key !== 'F3') return;
      ev.preventDefault?.();
      this._debugOn = !this._debugOn;
      this._debugGfx?.setVisible(this._debugOn);
      this._debugText?.setVisible(this._debugOn);
      this._debugLegend?.setVisible(this._debugOn);
      if (!this._debugOn) {
        this._debugGfx?.clear();
        if (this._debugTexLabels) {
          for (const t of this._debugTexLabels) t.setVisible(false);
        }
      }
    };
    this.input.keyboard?.on('keydown', this._debugToggleHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._debugToggleHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._debugToggleHandler));

    // F2 — painted-edge overlay only (yellow road edge, magenta
    // desired inner edge, cyan actual inner edge).  Independent of
    // F3; draws on its own graphics layer so the viewer is clean.
    this._paintedEdgeDebugOn = false;
    // G — one-shot dump: prints the full painted-edge math for every
    // currently-visible structure to the browser console.  Designed
    // so the user can pause, hit G, and paste the console block back
    // into the conversation as a precise telemetry snapshot.
    this._paintedEdgeDumpRequested = false;
    this._paintedEdgeToggleHandler = (ev) => {
      const isF2 = ev.code === 'F2' || ev.key === 'F2';
      const isG  = ev.code === 'KeyG' || ev.key === 'g' || ev.key === 'G';
      if (!isF2 && !isG) return;
      ev.preventDefault?.();
      if (isF2) {
        this._paintedEdgeDebugOn = !this._paintedEdgeDebugOn;
        this._paintedEdgeGfx?.setVisible(this._paintedEdgeDebugOn);
        if (!this._paintedEdgeDebugOn) this._paintedEdgeGfx?.clear();
        console.log('[painted-edge debug]', this._paintedEdgeDebugOn ? 'ON' : 'OFF');
      } else if (isG) {
        // Stamp once; _renderSceneSprites will pick it up next frame
        // and dump every visible structure's painted-edge math.
        this._paintedEdgeDumpRequested = true;
        console.log('[painted-edge] dump requested — output below ↓');
      }
    };
    this.input.keyboard?.on('keydown', this._paintedEdgeToggleHandler);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this._paintedEdgeToggleHandler));
    this.events.once('destroy',  () => this.input.keyboard?.off('keydown', this._paintedEdgeToggleHandler));

    this._setupTouch();
    this._setupTilt();
    // Detach the window-level deviceorientation listener if the scene
    // shuts down (e.g. transition to RestStopScene) — otherwise we keep
    // burning battery and may double-attach on the next create().
    this.events.once('shutdown', () => this._disableTiltSteer());
    this.events.once('destroy',  () => this._disableTiltSteer());

    // ── State ─────────────────────────────────────────────────────────
    this.score           = 0;
    this.gameTime        = 0;
    // Party clock — counts down from Difficulty.partyClockSec() until
    // hitting 0.  Pullman finish before 0 → ON TIME (cash bonus).
    this._partyClockSec    = Difficulty.partyClockSec();
    this._partyClockSecMax = this._partyClockSec;    // read by the phone-menu clock UI
    this.lastSegIdx      = 0;
    this.popupTimer      = 0;
    this.explosions      = [];
    // ms-timestamp until which the player is invulnerable after a
    // scenery crash (tree / building / barrier).  During this window the
    // sprite blinks and _applyDamage is no-op.
    this._invincibleUntil = 0;
    // ms-timestamp until which the post-crash "rolling start" auto-pilot
    // is active — auto-ramps the player up to 60 mph regardless of input
    // so the recovery lane delivers a controlled re-entry into traffic.
    // Set only by the major crashes (scenery / head-on), NOT by the
    // short bush-nudge i-frame.
    this._crashRecoveryUntil = 0;
    // Timestamp when the rolling-start ramp begins.  Each crash sets
    // this to (now + 1000) so the first second of the i-frame blink
    // keeps the car frozen at 0 mph; after that the auto-pilot ramps
    // up to 60 mph for the remainder of the recovery window.
    this._crashRollStartAt = 0;
    this.traffic         = [];
    this._trafficTimer   = 0;
    this._prevRegion     = 0;
    this._announcedUnlocks = {};
    this._touchLeft      = false;
    this._touchRight     = false;
    this._touchF12       = false;
    this._f12KeyPressed  = false;

    // ── Odometer — advances at speed × 4× time compression ───────────
    // At 120 mph display: 120 × 4 / 3600 = 0.1333 mi/s → 120 mi in 15 min ✓
    this._odometer = 0;

    // ── Checkpoint system ─────────────────────────────────────────────
    // Start at Seattle with no score yet
    this._lastCheckpoint = { name: 'Seattle, WA', position: 0, scoreAtCP: 0 };
    this._passedCheckpoints = new Set(['Seattle, WA']);
    this._probationTimer = 0;  // seconds remaining where drug use = +2 stars
    this._gameFinished   = false;
    // Finish cinematic — set when crossing mile-289; the car parks in front
    // of the Pullman Party House (input locked) before Game Over.  `_finishCause`
    // is the _endGame cause to fire once parked.
    this._finishCinematic = false;
    this._finishCineT     = 0;
    this._finishCineEnded = false;
    this._finishCause     = null;
    this._statsTripEnded = false;   // one-shot guard for the stats trip-end hook

    // ── Pause state ───────────────────────────────────────────────────
    this._paused = false;
    this._pauseGfx = this.add.graphics().setDepth(60);
    // PAUSED moved down (was 0.22) so the music-volume slider + tilt
    // toggle can sit at the top under the HUD radio/mute/genre row.
    this._pauseText = this.add.text(SCREEN_W / 2, SCREEN_H * 0.32, 'PAUSED', {
      fontSize: '42px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 8, align: 'center',
    }).setOrigin(0.5).setDepth(61).setVisible(false);
    // (Removed: SPACE to resume hint — clutter, the START OVER /
    // FROM CHECKPOINT buttons + tilt + slider make the action obvious.)
    this._pauseHint = this.add.text(SCREEN_W / 2, SCREEN_H * 0.42, '', {
      fontSize: '13px', fontFamily: 'Arial', color: '#CCCCCC',
    }).setOrigin(0.5).setDepth(61).setVisible(false);
    this._pauseObjects = [this._pauseText, this._pauseHint];

    // ── Route map modal ─────────────────────────────────────────────────
    // Built on demand by _buildMapModal() — opened from a 🗺 button on the
    // title screen and a MAP button in the pause menu.  Modal lives at a
    // higher depth than the garage modal so it can stack on top.  All
    // map graphics + labels are owned by the modal lifecycle so they're
    // destroyed when the modal closes (preventing the "labels remain up
    // after pause restart" leak the previous auto-map version had).
    this._mapModalOpen = false;
    this._mapModalObjs = null;

    // ── Pause menu: two restart buttons + music volume slider ─────────
    // Built once, hidden until the player pauses.  Each control is
    // listed in _pauseObjects so _togglePause can flip them all together.
    // Two buttons stacked horizontally:
    //   • START OVER    — fresh game from West Seattle (drops checkpoint)
    //   • FROM CHECKPOINT — replays from the last passed checkpoint
    //                       (rest stop / town).  Disabled when none exists.
    // Buttons sit BELOW the player car (~y=348) — y=388 keeps them just
    // above the BRAKE/ACCEL pedals (top edge at y=392) so the whole
    // pause column is bottom-half of the screen.
    const buttonY = SCREEN_H - 62;
    const startOverBtn = this._buildPauseButton(
      SCREEN_W / 2 - 110, buttonY, 200, 38, 'START OVER',
      0xFF39AF,
      () => {
        // In-game confirm — window.confirm freezes iOS WKWebView, so use a
        // Phaser-rendered modal that's reliable on every platform.
        this._buildConfirmPopup(
          'CONFIRM START OVER?',
          'This wipes your drug unlocks and sends you back to West Seattle.',
          () => {
            this._paused = false;
            this.audio?.setPaused?.(false);
            this.registry?.remove?.('drugUnlocks');
            this.registry?.remove?.('drugProgress');
            // Hardening: explicitly null out every "where were we?"
            // pointer so the next scene.start CANNOT accidentally
            // resume from a stale checkpoint snapshot.
            const _save = this.registry?.get?.('save');
            _save?.set?.('lastRestStop', null);
            this._resumeFromStop     = null;
            this._resumeFromPosition = null;
            this._resumePurchases    = null;
            this._resumeScore        = 0;
            this._resumeStars        = 0;
            this._lastCheckpoint     = null;
            this._odometer           = 0;
            this.score               = 0;
            // Wipe Custom-mode opt-ins so a Custom run's noPolice /
            // noNpcDamage / starting stars can't bleed into the fresh
            // Normal/Easy/Hard run that follows.  init() also resets
            // these, but explicit clear here makes the intent obvious.
            this._customFlags       = { noNpcDamage: false, noPolice: false };
            this._customStartStars  = null;
            this._customStartPosition = null;
            this._customStartLevels = null;
            this._customStartAccessories = null;
            this._customStartVehicleId   = null;
            if (this.player) this.player.position = 0;
            // Reset HP to the current vehicle's max so the player
            // starts fresh, not at whatever durability they crashed at.
            const _vehId = this.registry?.get?.('vehicleId') ?? 'beater';
            const _veh   = VEHICLES[_vehId] ?? VEHICLES.beater;
            this.damage?.setMax?.(_veh.hp);
            this.damage?.setDurability?.(_veh.hp);
            this.scene.start('Game', {});
          },
        );
      },
    );
    this._pauseObjects.push(startOverBtn.bg, startOverBtn.txt);

    // ── MAP + GARAGE icon buttons ────────────────────────────────────
    // Positioned in a row JUST RIGHT of the rear-view mirror (swapped
    // from the left side per UX request — music cluster moved to the
    // left).  Same 56-px size + dark-gray fill + cyan stroke as the
    // music buttons so the whole top bar reads as one unified cluster.
    const MIRROR_RIGHT = SCREEN_W / 2 + 130;
    const iconRowY = 2;                       // mirror top
    const iconSize = 56;                      // mirror height
    // 1-px gap matches the tighter spacing applied to the music
    // cluster on the left side of the mirror.
    const iconGap  = 1;
    const makeIconBtn = (px, iconId, onClick) => {
      const bg = this.add.graphics().setDepth(62);
      bg.setInteractive(new Phaser.Geom.Rectangle(px, iconRowY, iconSize, iconSize), Phaser.Geom.Rectangle.Contains);
      bg.input.cursor = 'pointer';
      const lbl = this.add.image(px + iconSize / 2, iconRowY + iconSize / 2, this._topRowButtonTexture(iconId))
        .setDisplaySize(iconSize, iconSize)
        .setDepth(63);
      bg.on('pointerover', () => lbl.setAlpha(1));
      bg.on('pointerout',  () => lbl.setAlpha(0.96));
      bg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        onClick();
      });
      return [bg, lbl];
    };
    // New layout — readout reservation (speed/time/$) sits adjacent to
    // the mirror, then Mute, then Map, then Garage further right.
    // (Wiper, when shown, sits beyond Garage; see music-cluster code.)
    const READOUT_W = 95;
    const mapX = MIRROR_RIGHT + READOUT_W + iconGap + iconSize + iconGap;   // past Mute
    const garX = mapX + iconSize + iconGap;
    const [mapBg, mapLbl] = makeIconBtn(mapX, 'map', () => this._buildMapModal());
    const [garBg, garLbl] = makeIconBtn(garX, 'garage', () => this._buildGarageModal());
    // Tracked via _hudObjects (always-visible HUD pool) instead of
    // _pauseObjects so they survive the _togglePause visibility sweep.
    this._hudObjects.push(mapBg, mapLbl, garBg, garLbl);
    if (this._topRowButtons) {
      this._topRowButtons.push({ id: 'map',    bg: mapBg, lbl: mapLbl, artType: 'map',    baseLeft: mapX, size: iconSize });
      this._topRowButtons.push({ id: 'garage', bg: garBg, lbl: garLbl, artType: 'garage', baseLeft: garX, size: iconSize });
    }

    const checkpointBtn = this._buildPauseButton(
      SCREEN_W / 2 + 110, buttonY, 200, 38, 'FROM CHECKPOINT',
      0x39A8FF,
      () => {
        // Prompt for the save code instead of auto-loading the last
        // checkpoint.  Default the entry to the most recent saved code
        // so the common case is one click + Enter; the prompt's
        // built-in Cancel returns the player to the paused screen.
        const save = this.registry?.get?.('save');
        const last = save?.get?.('lastRestStop');
        const defaultCode = last?.code ?? '';
        this._promptForCode(defaultCode);
        // Note: _promptForCode handles unpause / scene.start internally
        // when the player acce$ a valid code.  If they cancel, we
        // stay paused and the menu remains visible.
      },
    );
    this._pauseObjects.push(checkpointBtn.bg, checkpointBtn.txt);

    // Music volume slider — sits centered just ABOVE the big PAUSED
    // text.  PAUSED is at y = SCREEN_H * 0.32 (origin .5), so the
    // slider tucks in just above the text's top edge.
    const PAUSED_Y    = SCREEN_H * 0.32;
    const sliderW     = 240, sliderH = 16;
    const sliderL     = SCREEN_W / 2 - sliderW / 2;
    const sliderY     = PAUSED_Y - 50;
    const labelY      = sliderY - 22;
    this._pauseVolLabel = this.add.text(SCREEN_W / 2, labelY,
      `MUSIC VOLUME  ${Math.round((this.audio?.volume ?? 0.32) * 100)}%`, {
      fontSize: '14px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(62).setVisible(false);
    this._pauseObjects.push(this._pauseVolLabel);

    const sliderTrack = this.add.rectangle(sliderL, sliderY, sliderW, sliderH, 0x050812, 0.94)
      .setOrigin(0, 0.5).setStrokeStyle(2, 0x39A8FF).setDepth(62).setVisible(false)
      .setInteractive({ useHandCursor: true });
    const sliderFill = this.add.rectangle(sliderL + 2, sliderY, Math.max(0, sliderW * (this.audio?.volume ?? 0.32) - 4), sliderH - 4, 0xFF39AF, 0.90)
      .setOrigin(0, 0.5).setDepth(63).setVisible(false);
    // Invisible "safe zone" wrapping the slider track + label area.
    // Catches tap-near-misses as a UI tap (firing gameobjectdown) so
    // tap-to-resume doesn't unpause the run when the player aims for
    // the thin slider track and hits a few px off.  Same pointerdown
    // handler that the track has, so dragging works from anywhere in
    // the zone too.
    const sliderSafeY = labelY - 14;
    const sliderSafeH = (sliderY - sliderSafeY) + sliderH + 14;
    const sliderSafeX = sliderL - 30;
    const sliderSafeW = sliderW + 60;
    const sliderSafe  = this.add.rectangle(sliderSafeX, sliderSafeY, sliderSafeW, sliderSafeH, 0x000000, 0)
      .setOrigin(0, 0).setDepth(61).setVisible(false)
      .setInteractive({ useHandCursor: true });
    const setVolFromX = (px) => {
      const t = Math.max(0, Math.min(1, (px - sliderL) / sliderW));
      if (this.audio) {
        this.audio.volume = t;
        // Dragging the pause-menu slider counts as a user-initiated
        // volume change; on resume we keep this value instead of
        // snapping back to the pre-pause level.
        if (this.audio.paused) this.audio._userTouchedVolumeWhilePaused = true;
        // Single source of truth for gain — applies the perceptual
        // curve so the slider feels linear to the ear.
        this.audio._applyMasterGain?.();
      }
      sliderFill.setSize(Math.max(0, sliderW * t - 4), sliderH - 4);
      this._pauseVolLabel.setText(`MUSIC VOLUME  ${Math.round(t * 100)}%`);
    };
    sliderTrack.on('pointerdown', (ptr) => setVolFromX(ptr.x));
    sliderTrack.on('pointermove', (ptr) => { if (ptr.isDown) setVolFromX(ptr.x); });
    sliderSafe.on('pointerdown',  (ptr) => setVolFromX(ptr.x));
    sliderSafe.on('pointermove',  (ptr) => { if (ptr.isDown) setVolFromX(ptr.x); });
    this._pauseObjects.push(sliderTrack, sliderFill, sliderSafe);

    // Steering-mode picker removed from the pause menu — the iPhone
    // home-screen widget (Tap / Tilt / L-R Steer) is now the
    // canonical place to pick it.  _refreshSteeringBtn is kept as a
    // no-op so any leftover callers don't break.
    this._refreshSteeringBtn = () => {};

    this._hudObjects.push(this._pauseGfx, ...this._pauseObjects);

    // ── Resume from rest stop ─────────────────────────────────────────
    // If we were started with `resumeFromStop`, jump the player to that
    // stop's road position and restore the saved score / stars.  Skip the
    // title overlay so the player drops right back into action.
    if (this._resumeFromPosition != null) {
      // Death-respawn at last checkpoint — per user spec, the crash
      // costs HALF of pre-crash money and the player respawns at 50 %
      // HP (which they have to refill at rest stops).  Stars + drugs
      // still zero so the chase / chemical state genuinely resets.
      this.player.position = this._resumeFromPosition;
      this.score           = this._checkpointRestartScore != null
        ? Math.max(0, Math.floor(this._checkpointRestartScore))
        : Math.floor((this._crashRestartScore ?? 0) / 2);
      this.cops.stars         = 0;
      this.cops.cops          = [];
      this.cops.bumpCount     = 0;
      this.cops.rearBumpCount = 0;
      this.cops.headOnCount   = 0;
      this.cops.pitCount      = 0;
      if (this.drugs?.levels) {
        for (const id of Object.keys(this.drugs.levels)) this.drugs.levels[id] = 0;
      }
      // Apply slider-chosen drug levels after the zero-out so the
      // technical-loss restart actually reflects the player's choices.
      if (this._customStartLevels) {
        for (const [id, lvl] of Object.entries(this._customStartLevels)) {
          this.drugs.levels[id] = lvl;
          if (lvl > 0 && this.drugs.unlocked) this.drugs.unlocked[id] = true;
        }
        this._customStartLevels = null;
      }
      // Custom-mode starting stars also reapply on death-respawn — the
      // resume path zeroed stars above, but a Custom run that began
      // with 3★ should respawn at 3★, not 0★.  _startGameplay only
      // runs on the fresh-game path, so we have to seed here too.
      if (typeof this._customStartStars === 'number' && this.cops) {
        this.cops.stars     = this._customStartStars;
        this.cops.starTimer = 4;
      }
      // Half-HP respawn (per user spec).  reset() puts the model at
      // full HP; immediately set durability to 50 % of the current
      // vehicle's max so the player has to refill the rest at a stop.
      this.damage?.reset?.();
      const _vehHpForResume = VEHICLES[this.player.vehicleId]?.hp ?? 100;
      this.damage?.setDurability?.(_vehHpForResume * 0.5);
      // Skip the title overlay so the player drops straight back in.
      this._awaitingStart = false;
      this._introDone     = true;
      // Checkpoint respawn now mirrors the fresh-game intro: car goes
      // straight until the player taps to take control.  Unlike the
      // fresh start, the party clock + gameTime tick IMMEDIATELY —
      // they don't wait for the first tap.  See `_steerLockUntilTap`
      // gate in _updatePlayer for the steering side.
      this._steerLockUntilTap = true;
    } else if (this._resumeFromStop) {
      const rs = REST_STOPS.find(r => r.id === this._resumeFromStop);
      if (rs) {
        this.player.position = rs.t * (ROUTE_SEGS * SEG_LENGTH);
        this.score           = this._resumeScore || 0;
        // Forward warp burns gas equal to the trip skipped — same as
        // if the player had actually driven those miles.  Gas can go
        // straight to empty on long warps (intentional: refuel at the
        // destination's rest stop before driving on).
        if (this._warpedForward && this.player) {
          this.player.gasMi = Math.max(0, (this.player.gasMi ?? 0) - rs.mileage);
        }
        // Seed the "last checkpoint" so a crash before reaching the next
        // CHECKPOINT still offers "Start at Bellevue" (or whichever stop
        // they just left), instead of falling all the way back to Seattle.
        this._lastCheckpoint = {
          name:      rs.name,
          position:  rs.t * (ROUTE_SEGS * SEG_LENGTH),
          scoreAtCP: this.score,
        };
        // Any reset of the game (new game, game-over restart, rest-stop
        // resume, save-code resume) clears the wanted level — the player
        // shouldn't carry stars from one run into the next.  resumeStars is
        // intentionally ignored here for the same reason.
        this.cops.stars         = 0;
        this.cops.starTimer     = 0;
        this.cops.bumpCount     = 0;
        this.cops.rearBumpCount = 0;
        this.cops.headOnCount   = 0;
        this.cops.pitCount      = 0;
        this.cops.cops          = [];
        // Mark this stop and all earlier stops as "passed" so we don't
        // re-prompt the player as they continue.
        if (!this._passedRestStops) this._passedRestStops = new Set();
        for (const r of REST_STOPS) {
          if (r.t <= rs.t) this._passedRestStops.add(r.id);
        }
        if (!this._passedCheckpoints) this._passedCheckpoints = new Set();
        for (const cp of CHECKPOINTS) {
          if (cp.t <= rs.t) this._passedCheckpoints.add(cp.name);
        }

        // Apply purchases bought at the rest-stop menu.
        const buys = this._resumePurchases;
        if (buys) {
          // Car durability preservation — DamageModel was just constructed
          // at 100, so we restore the value the player walked in with
          // (or 100 if REPAIR CAR was purchased — durabilityOnResume is
          // overridden to 100 by RestStopScene._applyPurchase in that case).
          if (typeof buys.durabilityOnResume === 'number' && this.damage?.setDurability) {
            this.damage.setDurability(buys.durabilityOnResume);
          }
          // Sex Worker bonus HP — extra above the vehicle's max, granted
          // immediately on resume.  Implemented by bumping the cap and
          // adding HP both, so the player visibly sees "60/60" instead
          // of "50/50 (+10)".  Damage naturally consumes it first since
          // takeDamage just subtracts.  Stacks across multiple visits.
          if ((buys.bonusHp ?? 0) > 0 && this.damage?.setMax && this.damage?.setDurability) {
            const _curMax = this.damage.getDurability?.() != null
              ? (this.damage._max ?? buys.durabilityOnResume ?? 100)
              : 100;
            const _curDur = this.damage.getDurability?.() ?? _curMax;
            this.damage.setMax(_curMax + buys.bonusHp);
            this.damage.setDurability(_curDur + buys.bonusHp);
          }
          // Restore drug levels from the rest-stop snapshot FIRST — drug
          // status is paused during the menu, so the player resumes at the
          // bar levels they walked in with.  The new DrugSystem otherwise
          // starts every bar at zero, silently wiping the player's high.
          if (buys.drugLevelsOnResume && this.drugs?.levels) {
            for (const [id, lvl] of Object.entries(buys.drugLevelsOnResume)) {
              this.drugs.levels[id] = Math.max(0, Math.min(1, lvl));
            }
          }
          if (buys.restock && this.drugs?.refillAll) this.drugs.refillAll();
          // Coffee / Snooze — multiplier applied to ALL drug bars FIRST so
          // any subsequent top-ups (beers, weed, etc.) win on top of the
          // sobered baseline.  Coffee = ×0.5, Snooze = ×0, stackable.
          if (typeof buys.reduceDrugs === 'number' && this.drugs?.levels) {
            for (const id of Object.keys(this.drugs.levels)) {
              this.drugs.levels[id] = (this.drugs.levels[id] ?? 0) * buys.reduceDrugs;
            }
          }
          // Per-drug top-ups — set each named drug's bar to >= the stored
          // amount.  Lets players buy weed alone without restocking everything.
          if (buys.drugTopUps && this.drugs?.levels) {
            for (const [drugId, amount] of Object.entries(buys.drugTopUps)) {
              const cur = this.drugs.levels[drugId] ?? 0;
              this.drugs.levels[drugId] = Math.max(cur, Math.min(1, amount));
            }
          }
          // "Top all to N" — every UNLOCKED bar lifts to >= N.  Use
          // this.drugs.unlocked (already hydrated from registry above)
          // as the authoritative source — the previous version read the
          // registry directly and checked `instanceof Set`, but the
          // registry stores unlocks as a plain object, so the check
          // always fell through to DRUG_CONFIG which only marks
          // alcohol/weed as default-unlocked.  Result: nothing topped up.
          if (buys.topAllTo && this.drugs?.levels) {
            for (const id of Object.keys(this.drugs.levels)) {
              if (!this.drugs.unlocked?.[id]) continue;
              this.drugs.levels[id] = Math.max(this.drugs.levels[id] ?? 0, buys.topAllTo);
            }
          }
          // Sex-worker dirt-on-a-politician buff — caps cops at 2★ for
          // the next N miles after resume.  Tracked on this.cops so
          // CopSystem can clamp star-add operations against the cap.
          if (buys.starCapMiles && buys.starCapMax != null && this.cops) {
            this.cops.starCapMax    = buys.starCapMax;
            this.cops.starCapEndPos = this.player.position +
              (buys.starCapMiles * (ROUTE_SEGS * SEG_LENGTH) / TOTAL_ROUTE_MILES);
          }
          if (buys.clearStars) {
            this.cops.stars = 0;
            if ('bumpCount'     in this.cops) this.cops.bumpCount     = 0;
            if ('rearBumpCount' in this.cops) this.cops.rearBumpCount = 0;
            if ('headOnCount'   in this.cops) this.cops.headOnCount   = 0;
            if ('pitCount'      in this.cops) this.cops.pitCount      = 0;
            this.cops.cops = [];
          }
          if (Array.isArray(buys.f12)) {
            for (const t of buys.f12) {
              const raw = t === 'gun' ? 'f12_gun'
                       : t === 'spike_strip' ? 'f12_spike'
                       : t === 'paint_bomb'  ? 'f12_paint'
                       : t === 'rocket'      ? 'f12_rocket'
                       : t === 'grenade'     ? 'grenade'
                       : t === 'disguise'    ? 'disguise' : null;
              if (raw) {
                // grenade/disguise don't have an f12_* sprite key; pass the
                // normalised name straight to addF12Token (it acce$ both).
                this.cops.addF12Token?.(raw);
              }
            }
          }
          // Persistent garage upgrades — tracked so future repairs / damage
          // calls can read them from this._upgrades.
          if (Array.isArray(buys.upgrade) && buys.upgrade.length) {
            this._upgrades = new Set([...(this._upgrades ?? []), ...buys.upgrade]);
          }
          // ── Phase 2-4 effects on resume ─────────────────────────
          // Refuel / charge — fill the tank.  Both purchases set the
          // same flag.  Charge additionally sets `chargeAdMs` (handled
          // below as a black-screen ad).
          if (buys.refuelToFull) {
            this.player.gasMi = this.player.gasMaxMi;
            this._strandedShown = false;
          }
          if (buys.tractionTires) {
            this._tractionTires = true;
            this.registry.set('tractionTires', true);
          }
          if (typeof buys.starsToDrop === 'number' && buys.starsToDrop > 0 && this.cops) {
            this.cops.stars = Math.max(0, (this.cops.stars ?? 0) - buys.starsToDrop);
          }
          if (typeof buys.bumpStarsOnResume === 'number' && buys.bumpStarsOnResume > 0 && this.cops) {
            this.cops.addStar?.(buys.bumpStarsOnResume);
          }
          if (typeof buys.partyClockPenalty === 'number' && buys.partyClockPenalty > 0) {
            this._partyClockSec = Math.max(0, (this._partyClockSec ?? 0) - buys.partyClockPenalty);
          }
          if (Array.isArray(buys.boughtVehicles) && buys.boughtVehicles.length) {
            const owned = new Set(this.registry.get('ownedVehicles') ?? ['beater']);
            for (const v of buys.boughtVehicles) owned.add(v);
            this.registry.set('ownedVehicles', [...owned]);
            // Auto-swap into the most-recently-purchased car: full HP,
            // HALF tank.  Half-gas is the "drive-it-off-the-lot" feel
            // — full would make the purchase feel free of consequence,
            // empty would feel punishing.  The HP cap and tint match
            // the new vehicle's spec.
            const newId  = buys.boughtVehicles[buys.boughtVehicles.length - 1];
            const newVeh = VEHICLES[newId];
            if (newVeh) {
              this.player.vehicleId = newId;
              if (newId !== 'beater') this._leaveCockpitView?.();
              this.registry.set('vehicleId', newId);
              this.player.gasMaxMi = newVeh.rangeMi;
              this.player.gasMi    = Math.round(newVeh.rangeMi * 0.5);   // half tank
              if (this.damage?.setMax)        this.damage.setMax(newVeh.hp);
              if (this.damage?.setDurability) this.damage.setDurability(newVeh.hp);
              // Apply the new sprite (or fall back to tint) immediately
              // so the player visibly sees the swap on resume.
              if (this.playerSprite) {
                this.playerSprite.clearTint();
                const _newBack = newVeh.spriteBack;
                if (_newBack && this.textures.exists(_newBack)) {
                  this.playerSprite.setTexture(_newBack);
                  this._applyPlayerSpriteDisplaySize();
                } else {
                  this.playerSprite.setTexture('car_player');
                  this._applyPlayerSpriteDisplaySize();
                  if (newVeh.tint && newId !== 'beater') {
                    this.playerSprite.setTint(newVeh.tint);
                  }
                }
              }
              this._strandedShown = false;
            }
          }
          // Sleep / charge ad — show a black-screen ad for buys.sleepAdMs
          // or buys.chargeAdMs ms, then resume gameplay.  Pause input
          // during the ad.  Ad time is in REAL ms but is gated by the
          // game pause flag so it doesn't progress the world either.
          const adMs = (buys.sleepAdMs ?? 0) + (buys.chargeAdMs ?? 0);
          if (adMs > 0) {
            this._showAdScreen?.(adMs);
          }
          // Score bonus from hitchhiker / hooker — already merged into
          // resumeScore by RestStopScene._continue, but re-add here just in
          // case a tip path missed it.
          if (buys.scoreBonus && (this.score ?? 0) < this._resumeScore + buys.scoreBonus) {
            this.score = this._resumeScore;        // already includes bonus
          }
        }
      }
    }

    // ── Title-screen overlay (drawn over the actual gameplay road) ────
    // Until first tap, gameplay is "paused at idle" — the road is rendered
    // every frame, the player car sits at idle speed, but score/distance/
    // collisions are off, and a title + tap-to-start overlay is shown.
    // Resume-from-stop bypasses the title.
    this._awaitingStart = !this._missionConfig
                       && !this._resumeFromStop
                       && !this._skipTitle
                       && this._resumeFromPosition == null;
    this._introDone     = !this._awaitingStart;
    this._introGfx      = null;
    this.player.speed   = this._awaitingStart ? MAX_SPEED * 0.18 : MAX_SPEED * 0.4;
    // Rest-stop / save-code resume now mirrors the fresh-game intro:
    // car drives straight until the player taps.  Unlike the fresh
    // start, the party clock + gameTime tick from the moment the
    // scene boots — they don't wait for the first tap.
    if (this._resumeFromStop) {
      this._steerLockUntilTap = true;
    }

    // ── HUD ───────────────────────────────────────────────────────────
    // _buildHUD also creates the title overlay objects (used pre-tap).
    this._buildHUD();
    this._setHudVisible(!this._awaitingStart);

    // ── UI camera so shake/sway only affects the world, never the HUD ──
    // Phaser draws every object on every camera by default. We split:
    // main cam → world only; uiCam → HUD only.
    this._worldObjects.push(
      ...[
        this.roadGfx, this.ghostGfx, this.propsGfx, this._ruralFenceGfx, this._utilityLineGfx, this.bridgeFrontGfx, this.tunnelFacadeGfx, this.tunnelGfx, this._tunnelMaskGfx, this.tunnelDimGfx, ...this._signGfxPool, this._explosionGfx, this._smokeGfx, this._damageGlassGfx, this.overlayGfx, this.vignetteGfx,
        this.weatherFxGfx, this.wipersGfx, ...this.chaseWipers,
        this.hudFlashGfx, this.playerSprite, this._rearPlateImg, this._rearPlate,
        this._copLightGfx,
        ...this._carSpritePool,
        ...this._drugSpritePool,
        this._drugHaloGfx,
        ...this._sceneSpritePool,
        ...this._fencePostPool,
        ...this._utilityPolePool,
        ...(this._strip3dPool ?? []),
        this._horizonStripL, this._horizonStripR,
        ...(this._carGhostPool ?? []),
        ...(this._drugGhostPool ?? []),
      ].filter(Boolean),
    );
    // Default cameras.add() is transparent — do NOT setBackgroundColor here or
    // it will paint over the main camera's world.
    this._uiCam = this.cameras.add(0, 0, SCREEN_W, SCREEN_H);
    this.cameras.main.ignore(this._hudObjects);
    this._uiCam.ignore(this._worldObjects);
  }

  // ─── Input ───────────────────────────────────────────────────────────
  _setupTouch() {
    // Pedal buttons (BRAKE / ACCEL) live in the bottom-left and
    // bottom-right corners — same x-zones as the steering bands.
    // Skip steering for any tap within the pedal y-band so the
    // gas/brake taps don't also veer the car.  Pedals are PEDAL_H=50
    // tall with origin at PEDAL_Y=SCREEN_H-8, so they cover roughly
    // y ∈ [SCREEN_H-58, SCREEN_H-8].  Use a 70-px guard for safety.
    const PEDAL_BAND_TOP = SCREEN_H - 70;
    // Helper — true if the pointer is currently over a draggable HUD
    // drug bar.  Used to suppress the touch-steer latch so adjusting
    // bars in custom mode doesn't also steer the car.
    const overDrugBar = (p) => {
      const hits = this._drugBarHits;
      if (!hits || !hits.length) return false;
      for (const h of hits) {
        if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return true;
      }
      return false;
    };

    // Tap-to-resume — Phaser fires `gameobjectdown` BEFORE the
    // scene-level `pointerdown` for any interactive object that was
    // hit.  We set a one-shot flag in that handler; the scene-level
    // pointerdown handler then checks it to know whether the tap
    // landed on a UI button (skip resume) or on the open road
    // (toggle pause off).
    this.input.on('gameobjectdown', () => { this._uiTapBlocker = true; });
    this.input.on('pointerdown', (p) => {
      if (this._paused) {
        const onUI = !!this._uiTapBlocker;
        this._uiTapBlocker = false;
        // Belt-and-suspenders: even if gameobjectdown didn't fire in
        // time (Phaser event ordering can race on Graphics-based
        // interactive objects), any tap landing in the top-button
        // band keeps the game paused so the music / pause / map /
        // garage buttons stay usable mid-pause.
        // Also: if a modal (map / garage / achievements / etc.) is
        // open OR was just closed by this same tap, the tap is part
        // of dismissing the modal — NOT a "resume gameplay" intent.
        const _modalActive = this._anyModalOpen?.()
          || this._mapModalJustClosed
          || this._garageModalJustClosed
          || this._achievementsModalJustClosed;
        if (onUI || p.y < 64 || _modalActive) return;
        this._togglePause();
        return;
      }
      this._uiTapBlocker = false;
      if (this._anyModalOpen()) return;
      // While the title is up, taps must hit one of the explicit
      // difficulty buttons — don't latch any steer/F12 flags from
      // anywhere else on screen, so the player isn't accidentally
      // starting the run by tapping near a difficulty button.
      if (this._awaitingStart) return;
      if (p.y > PEDAL_BAND_TOP) return;        // pedal area — pedals handle it
      // HUD drug bars (custom mode) — let the bar drag handler own
      // this pointer without also veering the car.
      if (overDrugBar(p)) return;
      // Top-row UI band + weapon stack — initial tap must NOT
      // start on these zones (so buttons work), but once a valid
      // steer-tap has started, the player can drag across them.
      // The entire top band (y < 64) hosts the Pause / FF / Genre /
      // Mirror / Mute / Map / Garage cluster — taps there should
      // never latch a steer.  The weapon stack sits on whichever
      // edge is the player's dominant thumb (left when _leftHanded).
      const overTopButtons = p.y < 64;
      const overWeaponCol  = this._leftHanded
        ? (p.x < 80  && p.y > 50)
        : (p.x > SCREEN_W - 80 && p.y > 50);
      // If the gesture STARTS on a button band, suppress steering
      // for the entire down-up cycle.  Without this, classic-mode
      // pointermove would re-evaluate x-position on every finger
      // jitter and latch a turn while the player is just holding
      // Pause / FF / Genre.
      if (overTopButtons || overWeaponCol) {
        this._noSteerThisGesture = true;
        return;
      }
      this._noSteerThisGesture = false;
      // Tap mode: ANY tap in the play area = action.  Latch sticky —
      // once on, stays on until pointerup, regardless of where the
      // finger drags afterward.
      if (this._activeSteeringMode() === 'flappy') {
        this._touchRight = true;
        this._tapLatchValid = true;
        return;
      }
      // Classic mode keeps the explicit left/right halves + center-tap
      // weapon shortcut.
      if (p.x < SCREEN_W * 0.30)      { this._touchLeft  = true; }
      else if (p.x > SCREEN_W * 0.70) { this._touchRight = true; }
      else if (p.y < SCREEN_H * 0.35) { this._touchF12   = true; }
      this._tapLatchValid = (this._touchLeft || this._touchRight);
    });
    this.input.on('pointerup', () => {
      this._touchLeft  = false;
      this._touchRight = false;
      this._touchF12   = false;
      this._tapLatchValid    = false;
      this._noSteerThisGesture = false;
    });
    this.input.on('pointermove', (p) => {
      if (this._anyModalOpen()) return;
      if (!p.isDown) return;
      // No-steer-this-gesture — set when the down-event landed on a
      // top-row button or weapon column.  Suppresses move-tracked
      // steering until pointerup so holding a button doesn't latch a
      // turn.
      if (this._noSteerThisGesture) {
        this._touchLeft = this._touchRight = false;
        return;
      }
      // While dragging a drug bar, never steer.
      if (this._draggingDrugId) {
        this._touchLeft = this._touchRight = false;
        return;
      }
      // Tap mode: if the touch started in a valid area, KEEP the
      // steer engaged no matter where the finger moves now — including
      // over UI clusters, pedals, edges.  Released only on pointerup.
      if (this._activeSteeringMode() === 'flappy') {
        if (this._tapLatchValid) this._touchRight = true;
        return;
      }
      // Classic mode — position-tracked left/right zones during drag.
      if (p.y > PEDAL_BAND_TOP) {
        this._touchLeft = this._touchRight = false;
        return;
      }
      this._touchLeft  = p.x < SCREEN_W * 0.30;
      this._touchRight = p.x > SCREEN_W * 0.70;
    });
  }

  /** Phone tilt steering — opt-in.  Toggle from the title screen sets
   *  registry key `tiltSteerEnabled`; that drives whether we attach
   *  `deviceorientation` and feed tilt into the raw-steering path.
   *  iOS 13+ requires explicit permission, requested from a user gesture
   *  (the toggle button itself).  Mapping accounts for landscape vs
   *  portrait via `screen.orientation.angle`. */
  _setupTilt() {
    this._tiltGamma = 0;
    this._tiltLeftActive  = false;
    this._tiltRightActive = false;
    this._tiltSteerAmt = 0;
    this._tiltAttached = false;
    // Forward/back pitch for accel + brake.  Auto-calibrates by
    // averaging the first 30 orientation samples (~0.5s @ 60Hz) so a
    // single odd reading at the wrong moment doesn't poison the zero.
    // The intro-end hook also forces a fresh cal once gameplay really
    // begins — by then the player is settled into playing posture.
    this._tiltPitchZero   = 0;
    this._tiltCalibrating = true;   // true → accumulating samples
    this._tiltCalSamples  = [];
    this._tiltThrottle    = 0;      // 0..1 — forward tilt fraction
    this._tiltBrake       = 0;      // 0..1 — back tilt fraction
    this._tiltOnOrient = (e) => {
      const angle = (screen.orientation?.angle ?? window.orientation ?? 0);
      const landscape = (angle === 90 || angle === -90 || angle === 270);
      let tilt, pitchRaw;
      if (landscape) {
        const sign = (angle === 90 || angle === -270) ? 1 : -1;
        tilt     = (e.beta  ?? 0) * sign;
        // In landscape, gamma is the device's "long-axis roll" — i.e.,
        // forward/back pitch from the user's POV.  Positive gamma in
        // landscape-left = top of screen away from face = accelerate.
        // (Sign verified empirically; flip if the user reports it
        // inverted on their phone.)
        pitchRaw = (e.gamma ?? 0) * sign;
      } else {
        tilt     = (e.gamma ?? 0);
        // Portrait orientation isn't really a supported play stance,
        // but if it happens, positive beta = top of screen away from
        // face = forward.
        pitchRaw = (e.beta  ?? 0);
      }
      this._tiltGamma = tilt;
      // Lower threshold = more responsive to small wrist tilts.  DEAD is
      // a tiny no-input zone to ignore hand jitter at rest.  Proportional
      // value is also computed below for analog steering.
      const DEAD = 2, THRESH = 3;
      this._tiltLeftActive  = tilt < -THRESH;
      this._tiltRightActive = tilt >  THRESH;
      if (Math.abs(tilt) < DEAD) {
        this._tiltLeftActive = this._tiltRightActive = false;
      }
      // Proportional steer value in [-1, 1].  Reaches ±1 around ±20°,
      // so a relaxed wrist tilt gives precise feathering and a harder
      // tilt gives full lock.
      const FULL = 20;
      let frac = 0;
      if (Math.abs(tilt) > DEAD) {
        frac = Math.max(-1, Math.min(1, tilt / FULL));
      }
      this._tiltSteerAmt = frac;

      // ── Pitch → throttle / brake ────────────────────────────────────
      // Auto-calibration: average the first ~30 readings (≈0.5 s) so
      // jitter / a single weird sample doesn't poison the zero.
      // Throttle/brake stay 0 during calibration so the player can't
      // accelerate before the zero settles.  Re-cal is triggered on
      // scene start (constructor sets _tiltCalibrating=true), intro-end
      // (_onIntroEnded), and RE-ZERO button tap.
      if (this._tiltCalibrating) {
        this._tiltCalSamples = this._tiltCalSamples ?? [];
        this._tiltCalSamples.push(pitchRaw);
        if (this._tiltCalSamples.length >= 30) {
          const sum = this._tiltCalSamples.reduce((a, b) => a + b, 0);
          this._tiltPitchZero = sum / this._tiltCalSamples.length;
          this._tiltCalibrating = false;
          this._tiltCalSamples  = null;
        }
        this._tiltThrottle = 0;
        this._tiltBrake    = 0;
        return;
      }
      const pitchDelta = pitchRaw - this._tiltPitchZero;

      // Accel zones: 8°-15° = linear ramp 0→1, 15°+ = full.
      // Brake zones: 10°-15° back = linear ramp 0→1, 15°+ back = full.
      // The slightly wider brake deadzone (10° vs 8°) makes "coast" the
      // natural state and prevents accidental brake taps from posture.
      const ACC_START = 8,  ACC_FULL = 15;
      const BRK_START = 10, BRK_FULL = 15;
      let throttle = 0, brake = 0;
      if (pitchDelta >= ACC_FULL) {
        throttle = 1;
      } else if (pitchDelta > ACC_START) {
        throttle = (pitchDelta - ACC_START) / (ACC_FULL - ACC_START);
      } else if (-pitchDelta >= BRK_FULL) {
        brake = 1;
      } else if (-pitchDelta > BRK_START) {
        brake = (-pitchDelta - BRK_START) / (BRK_FULL - BRK_START);
      }
      this._tiltThrottle = throttle;
      this._tiltBrake    = brake;
    };
    // Pre-arm a native-DOM gesture listener that fires iOS's
    // requestPermission() INSIDE the same touch frame as the next user
    // tap — preserving the user-gesture context that Phaser's queued
    // dispatch otherwise loses.  Active on every load (title screen,
    // cold load with tilt remembered, mid-run mode swap) and self-
    // cleans once permission is granted.
    this._armTiltPrefetch();
    // If the persisted steering mode is already 'tilt' (e.g., the player
    // selected it last session, or the phone-menu setter persisted it
    // and restarted the scene), wire the deviceorientation listener
    // now.  _enableTiltSteer handles both desktop (attach directly) and
    // iOS (queue for the prefetch).  Without this, a cold-load run with
    // mode='tilt' would have NO listener attached and tilt would silently
    // do nothing.
    // Attach tilt EARLY so the snow zone can auto-engage it with zero mid-
    // drive setup (seamless): for the player's chosen tilt mode OR ANY
    // weather run (Normal+, which reaches the Cascades snow).  Android /
    // desktop attach directly (no permission gate); iOS attaches now if a
    // grant is already remembered, else the start-gesture prefetch (relaxed
    // gate below) requests permission on the first tap.  Skipped on Easy
    // (no weather) for non-tilt players, and after a remembered denial.
    const persistedMode = this.registry?.get?.('steeringMode');
    const _tiltWanted = persistedMode === 'tilt' || (Difficulty.weather?.() ?? false);
    if (_tiltWanted && !this._tiltAttached) {
      // Fast-path: if we've already grabbed orientation permission
      // earlier in this session, just attach the listener directly.
      // Without this, every scene restart (crash → retry, mode swap)
      // would otherwise drop tilt until the player tapped the screen
      // once more to re-trigger the prefetch gesture path.
      const permGranted = !!this.registry?.get?.('tiltPermissionGranted');
      if (permGranted) {
        this._tiltAttached = true;
        window.addEventListener('deviceorientation', this._tiltOnOrient, true);
      } else if (!this.registry?.get?.('tiltPermissionDenied')) {
        this._enableTiltSteer?.();
      }
    }
    // Clean up on scene shutdown — without this, the deviceorientation
    // listener stays attached to window across scene transitions, and
    // the dead scene's _tiltOnOrient keeps writing to stale properties
    // on every device tilt.  Hooking SHUTDOWN (not DESTROY) catches the
    // scene.start('GameOver') path too.
    if (!this._tiltShutdownHooked) {
      this._tiltShutdownHooked = true;
      this.events?.once?.(Phaser.Scenes.Events.SHUTDOWN, () => {
        try { this._disableTiltSteer?.(); } catch (e) {}
        try { this._tiltPrefetchCleanup?.(); } catch (e) {}
      });
    }
  }

  /** Install a one-time native-DOM gesture listener that calls iOS's
   *  DeviceOrientationEvent.requestPermission() directly from the
   *  user-gesture frame, BEFORE Phaser dispatches the same event to
   *  its input queue.  This is what lets the tilt prompt accept on
   *  first try — going through Phaser used to break the gesture
   *  context, forcing a second "TAP ANYWHERE TO ENABLE TILT" tap.
   *
   *  No-op on browsers without DeviceOrientationEvent.requestPermission
   *  (Android, desktop) — those don't need the gesture handoff.  Only
   *  fires when the player currently has TILT selected; other steering
   *  modes don't trigger a permission prompt. */
  _armTiltPrefetch() {
    if (this._tiltPrefetchInstalled) return;
    const W = window.DeviceOrientationEvent;
    if (!W) return;
    const P = (typeof W.requestPermission === 'function')
      ? W
      : ((typeof window.DeviceMotionEvent?.requestPermission === 'function')
        ? window.DeviceMotionEvent
        : null);
    if (!P) return;
    this._tiltPrefetchInstalled = true;

    const onGesture = (e) => {
      if (this._tiltAttached || this._tiltRequestInFlight) return;
      const confirm = e?.target?.closest?.('#phone-confirm');
      if (confirm && !e?.target?.closest?.('#phone-confirm-ok')) return;
      // Request at the START of the run for the chosen tilt mode OR any run
      // that can hit snow (Normal+ → Weather), so tilt is ready before the
      // snow zone auto-engages it — no mid-drive permission interruption.
      // Don't re-prompt once the player has denied.
      const picked = this.registry?.get?.('titleThumbsPick')
                  ?? this.registry?.get?.('steeringMode');
      const wantTilt = picked === 'tilt' || (Difficulty.weather?.() ?? false);
      if (!wantTilt) return;
      if (this.registry?.get?.('tiltPermissionDenied')) return;

      this._tiltRequestInFlight = true;
      P.requestPermission()
        .then((res) => {
          this._tiltRequestInFlight = false;
          if (res === 'granted' && !this._tiltAttached) {
            this._tiltAttached = true;
            window.addEventListener('deviceorientation', this._tiltOnOrient, true);
            // Remember the grant so future scene starts (after a crash
            // restart, mode swap, etc.) can attach the listener
            // directly without waiting for another user gesture.
            this.registry?.set?.('tiltPermissionGranted', true);
            if (this._tiltPrefetchCleanup) this._tiltPrefetchCleanup();
          } else if (res !== 'granted') {
            // Remember the denial so the prefetch stops re-prompting on
            // every tap (iOS returns the remembered 'denied' silently, but
            // skipping the call entirely is cleaner).
            this.registry?.set?.('tiltPermissionDenied', true);
            if (this._tiltPrefetchCleanup) this._tiltPrefetchCleanup();
          }
          const cbs = this._tiltPendingCbs ?? [];
          this._tiltPendingCbs = [];
          for (const cb of cbs) cb?.(res === 'granted' ? 'granted' : 'denied');
        })
        .catch(() => {
          this._tiltRequestInFlight = false;
          const cbs = this._tiltPendingCbs ?? [];
          this._tiltPendingCbs = [];
          for (const cb of cbs) cb?.('denied');
        });
    };

    const targets = Array.from(new Set([this.game?.canvas, document].filter(Boolean)));
    targets.forEach(target => {
      target.addEventListener('touchstart', onGesture, { capture: true, passive: true });
      target.addEventListener('pointerdown', onGesture, { capture: true });
      target.addEventListener('pointerup',   onGesture, { capture: true });
      target.addEventListener('mousedown',  onGesture, { capture: true });
    });
    this._tiltPrefetchCleanup = () => {
      targets.forEach(target => {
        target.removeEventListener('touchstart', onGesture, true);
        target.removeEventListener('pointerdown', onGesture, true);
        target.removeEventListener('pointerup',   onGesture, true);
        target.removeEventListener('mousedown',  onGesture, true);
      });
      this._tiltPrefetchCleanup = null;
      this._tiltPrefetchInstalled = false;
    };
  }

  /** Request OS permission (iOS) and attach the orientation listener.
   *  Calls back with 'granted' | 'denied' | 'unsupported'.
   *
   *  On iOS, the actual requestPermission() call goes through the
   *  native-DOM prefetch listener installed by _armTiltPrefetch, NOT
   *  through this function — Phaser's queued dispatch breaks the user-
   *  gesture context iOS needs.  This function just queues the
   *  caller's onResult callback until the prefetch resolves (or fires
   *  it immediately if permission is already attached). */
  _enableTiltSteer(onResult) {
    if (this._tiltAttached) { onResult?.('granted'); return; }
    const W = window.DeviceOrientationEvent;
    if (!W) { onResult?.('unsupported'); return; }
    const P = (typeof W.requestPermission === 'function')
      ? W
      : ((typeof window.DeviceMotionEvent?.requestPermission === 'function')
        ? window.DeviceMotionEvent
        : null);
    const needsPerm = !!P;
    if (!needsPerm) {
      // Android / desktop — no permission gate, attach directly.
      this._tiltAttached = true;
      window.addEventListener('deviceorientation', this._tiltOnOrient, true);
      onResult?.('granted');
      return;
    }
    // iOS: defer to the native-DOM prefetch listener.  If a request is
    // already in flight (the user just tapped), queue our callback.
    // Otherwise arm the prefetch so the very next tap drives it.
    this._armTiltPrefetch();
    this._tiltPendingCbs = this._tiltPendingCbs ?? [];
    this._tiltPendingCbs.push(onResult);
  }

  _disableTiltSteer() {
    if (!this._tiltAttached) return;
    window.removeEventListener('deviceorientation', this._tiltOnOrient, true);
    this._tiltAttached = false;
    this._tiltLeftActive = this._tiltRightActive = false;
    this._tiltGamma = 0;
    this._tiltSteerAmt = 0;
  }

  _isLeftRaw()  {
    const mode = this._activeSteeringMode?.();
    const touch = mode === 'tilt' ? false : this._touchLeft;
    // Tilt flags only steer when tilt is the ACTIVE mode (e.g. the snow
    // auto-engage).  Tilt now attaches at game start for weather runs, so
    // an idle gyro must NOT bleed phone-angle into classic/tap steering.
    const tiltL = mode === 'tilt' ? this._tiltLeftActive : false;
    return touch || tiltL || !!this.cursors?.left.isDown  || !!this.wasd?.left.isDown;
  }
  _isRightRaw() {
    const mode = this._activeSteeringMode?.();
    const touch = mode === 'tilt' ? false : this._touchRight;
    const tiltR = mode === 'tilt' ? this._tiltRightActive : false;
    return touch || tiltR || !!this.cursors?.right.isDown || !!this.wasd?.right.isDown;
  }

  /** Steering mode — 'classic' (default), 'tilt', or 'flappy'.
   *  Persists in the registry.  Migrates the legacy `tiltSteerEnabled`
   *  boolean so existing saves still have tilt steering if they had it. */
  _steeringMode() {
    let m = this.registry?.get?.('steeringMode');
    if (m === 'lr') m = 'classic';
    if (m === 'tap') m = 'flappy';
    if (!m) {
      // Default: 'flappy' (tap-to-steer) — the headline control scheme.
      // Existing players with legacy `tiltSteerEnabled` keep tilt.
      m = this.registry?.get?.('tiltSteerEnabled') ? 'tilt' : 'flappy';
    }
    this.registry?.set?.('steeringMode', m);
    return m;
  }

  /** Player's current route mile (0..TOTAL_ROUTE_MILES). */
  _playerMile() {
    return ((this.player?.position ?? 0) / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
  }

  /** Vantage crosswind envelope: mile -> strength 0..1.  Ramps up over
   *  131-137, holds full to 177, ramps down to 183.  Drives the tap-steering
   *  switch, the leftward "wind pull" on the car, and (Phase 4) the tree
   *  sway + tumbleweed spawns.  Geographically the Columbia Basin desert. */
  _windStrength(mile = this._playerMile()) {
    if (mile < 131 || mile >= 183) return 0;
    if (mile < 137) return (mile - 131) / 6;          // ramp up
    if (mile <= 177) return 1;                         // full
    return Math.max(0, 1 - (mile - 177) / 6);          // ramp down
  }

  /** Snow-zone steering-disturbance envelope: mile -> 0..1.  Ramps IN over
   *  3 mi (40→43) so the wander + tilt auto-engage build gradually as the
   *  player enters the Cascades snow, holds full, then eases out with the
   *  snow lift (86→88).  Gated on Weather.isSnow so it's silent on Easy
   *  (no weather) and outside the zone.  Drives the snow wander in
   *  _updatePhysics and the tilt auto-engage in _activeSteeringMode.  The
   *  snow VISUAL is full from mile 40; only this STEERING feel eases in —
   *  that gentle build is the "coast into tilt" the design calls for. */
  _snowSteerRamp(mile = this._playerMile()) {
    if (!Weather.isSnow(mile)) return 0;               // Easy / outside zone
    if (mile < 43) return (mile - 40) / 3;             // ramp in over 3 mi
    if (mile > 86) return (88 - mile) / 2;             // ease out with the lift
    return 1;
  }

  /** Per-tree wind-sway rotation (radians).  Origin (0.5,1) pivots at the
   *  trunk base so the canopy swings.  A gentle baseline oscillation plays
   *  everywhere; `wind` (0..1, the Vantage envelope) adds gust amplitude,
   *  speeds it up, and adds a steady downwind (leftward = negative) lean.
   *  Each tree gets a stable random phase so they don't sway in lockstep. */
  _treeSwayRot(sp, wind) {
    const phase   = (sp._swayPhase ??= Math.random() * 6.2832);
    const t       = (this.time?.now ?? 0) * 0.001;
    const baseAmp = 0.018;            // ~1° idle sway
    const gustAmp = 0.16 * wind;      // up to ~9° in a full Vantage gust
    const lean    = -0.13 * wind;     // steady lean downwind (leftward)
    const freq    = 1.7 + wind * 1.5; // sways faster as the wind builds
    return lean + (baseAmp + gustAmp) * Math.sin(t * freq + phase);
  }

  /** Effective steering mode for INPUT this frame.  Base is classic L/R
   *  (the title picker is now inert; a Custom menu will let players override
   *  later).  Zones temporarily override it: the Vantage crosswind switches
   *  to tap ('flappy'); the snow zone will switch to tilt / mouse-follow
   *  (added in a later phase, gated on the pre-snow permission prompt).
   *  NOTE: distinct from _steeringMode() (the persisted save-profile mode). */
  _activeSteeringMode() {
    // Vantage stays CLASSIC — the crosswind is applied as a leftward
    // steering pull (see _updatePhysics), not a mode switch: the full pull
    // already maxes the left, so only right input does anything.
    //
    // SNOW zone → TILT (analog) so the player coasts into smooth lean-steering
    // that handles the wander + slide.  Gated on _tiltAttached: it only
    // engages where tilt is actually available (permission already granted);
    // otherwise we keep CLASSIC so steering still works and the player still
    // feels the snow wander in their current mode.  (Pre-snow permission
    // prompt + desktop pointer-follow fallback are the follow-ups for a full
    // no-setup coast-in.)
    if (this._tiltAttached && this._snowSteerRamp() > 0) return 'tilt';
    return 'classic';
  }

  /** Tumbleweeds rolling across the road through the Vantage crosswind.
   *  A small pool of spinning, bouncing props that spawn on the upwind
   *  (right) shoulder and roll downwind (left) across the pavement while
   *  drifting toward the player.  Spawn cadence speeds up with wind
   *  strength; nothing spawns outside the wind zone.  Projected through
   *  sampleSurface so they sit on the road plane in perspective. */
  _renderTumbleweeds() {
    const wind = this._windStrength();
    if (!this._tumbleweeds) {
      this._tumbleweeds = [];
      for (let i = 0; i < 7; i++) {
        this._tumbleweeds.push({
          active: false,
          s: this.add.image(0, 0, 'tumbleweed_1')
               .setOrigin(0.5, 0.5).setDepth(7.58).setVisible(false),
        });
      }
      this._tumbleSpawnAt = 0;
      this._tumbleLastNow = 0;
    }
    const now = this.time?.now ?? 0;
    const dt  = Math.min(0.05, ((now - (this._tumbleLastNow || now)) * 0.001));
    this._tumbleLastNow = now;

    // No wind → make sure everything is parked, then bail.
    if (wind <= 0.05) {
      for (const t of this._tumbleweeds) { if (t.active) { t.active = false; t.s.setVisible(false); } }
      return;
    }

    const camPos  = this._renderCamPos();
    const segs    = this.road.segments;
    const carX    = this.playerSprite?.x ?? (SCREEN_W / 2);
    const carHalf = (this.playerSprite?.displayWidth ?? 90) * 0.4;

    // Kill / finish plane: the PLAYER CAR's Z plane, not the camera eye.  In
    // chase cam the car sits PLAYER_VIRTUAL_Z ahead of the render eye, so a
    // weed that lives past it reads as passing BEHIND the car.  Floored at 100
    // so cockpit (eye ≈ car) still works.  Weeds also FINISH their road-cross
    // right at this plane (see the distance-mapped motion below).
    const killZ = Math.max(100, PLAYER_VIRTUAL_Z - (CAM.eyeForwardZ ?? 0));

    // Spawn — cadence eases from ~1 every 5-7s as the wind starts, to
    // ~1 every 1.5-3s at full strength (and back out as it dies down).
    if (now >= (this._tumbleSpawnAt || 0)) {
      const free = this._tumbleweeds.find(t => !t.active);
      if (free) {
        free.active = true;
        // Each weed lives on a ~3-SECOND timer (u: 0→1).  Over that life it
        // both APPROACHES (relZ from its spawn distance down to the car plane)
        // and CROSSES the road (offset right shoulder → left shoulder), so the
        // cross always takes ~3 s at ANY player speed.  A fixed time-based roll
        // depended on speed (it flew by / never crossed); a pure distance-
        // mapped roll did too.  Because the weed closes SLOWER than the player
        // advances, its world-Z rises with the car — so it also drifts DOWNROAD
        // in the player's direction, giving the DIAGONAL cross the user wanted
        // rather than a straight perpendicular dart.
        const span     = 6000 + Math.random() * 4000;       // depth closed during the cross
        free.relZEnd   = killZ;                              // finishes at the car plane (never behind)
        free.relZSpawn = killZ + span;
        free.crossSec  = 2.7 + Math.random() * 0.8;          // ~3 s to cross the road
        free.u         = 0;
        free.startOff  =  2.6 + Math.random() * 1.4;         // enters from the right shoulder
        free.endOff    = -(2.6 + Math.random() * 1.4);       // exits across the left shoulder
        free.offset    = free.startOff;
        free.worldZ    = camPos + free.relZSpawn;
        free.spin      = (Math.random() < 0.5 ? -1 : 1) * (3 + wind * 7 + Math.random() * 3);
        free.rot       = Math.random() * 6.2832;
        free.phase     = Math.random() * 6.2832;
        free.size      = 0.8 + Math.random() * 0.6;
        free.hit       = false;
        // Cycle the 3 frames in 1→3→2 order (reads as a smoother tumble than
        // 1→2→3) so every one shows and the weeds don't repeat as one ball.
        const TUMBLE_SEQ = [1, 3, 2];
        this._tumbleTexIdx = ((this._tumbleTexIdx ?? -1) + 1) % TUMBLE_SEQ.length;
        free.s.setTexture('tumbleweed_' + TUMBLE_SEQ[this._tumbleTexIdx]);
      }
      // sqrt curve front-loads the slowdown: ~5-7s at wind 0, ~3.6-5.4s a
      // mile in, ~1.5-3s once fully built.
      const k  = Math.sqrt(wind);
      const lo = 5 - 3.5 * k;
      const hi = 7 - 4.0 * k;
      this._tumbleSpawnAt = now + (lo + Math.random() * (hi - lo)) * 1000;
    }

    // Update + project each active tumbleweed.  u (0→1 over crossSec) drives
    // BOTH the depth-approach and the lateral cross, so it always takes ~3 s.
    for (const t of this._tumbleweeds) {
      if (!t.active) continue;
      t.u   += dt / t.crossSec;
      t.rot += t.spin * dt;
      if (t.u >= 1) { t.active = false; t.s.setVisible(false); continue; }
      const relZ = t.relZSpawn + (t.relZEnd - t.relZSpawn) * t.u;   // gentle, speed-independent approach
      t.offset   = t.startOff  + (t.endOff  - t.startOff)  * t.u;   // right → left across the road
      t.worldZ   = camPos + relZ;                                   // world-Z rises with the car ⇒ diagonal downroad
      const proj = this.road.sampleSurface?.(relZ, t.offset);
      if (!proj || proj.sw < 2) { t.s.setVisible(false); continue; }
      // No tumbleweeds over the Vantage bridge / river — they'd blow off it.
      const seg = segs[((Math.floor(t.worldZ / SEG_LENGTH) % segs.length) + segs.length) % segs.length];
      if (seg?.bridge || seg?.water) { t.s.setVisible(false); continue; }
      const sz     = Math.max(6, proj.sw * t.size);
      const bounce = Math.abs(Math.sin(now * 0.006 + t.phase)) * proj.sw * 0.35;
      t.s.setPosition(proj.sx, proj.sy - sz * 0.5 - bounce)
         .setDisplaySize(sz, sz)
         .setRotation(t.rot)
         .setVisible(true);
      // Run-over: a tiny 0.25 HP sting the first time a weed sweeps across the
      // car as it finishes its cross near the car plane (just a bush).
      if (!t.hit && t.u > 0.8 && Math.abs(proj.sx - carX) < sz * 0.45 + carHalf) {
        t.hit = true;
        this._applyDamage?.(0.25, 'tumbleweed');
      }
    }
  }

  /** Reset all wanted-level state (stars, active cops, bump counters,
   *  helicopter).  Called when the player starts/restarts/changes mode
   *  so a chase doesn't carry over into a fresh control scheme.
   *  Scene-init paths already zero this state via fresh CopSystem
   *  construction; this helper is for mid-run resets that don't restart
   *  the scene (e.g. steering picker). */
  _wipeWantedState() {
    if (!this.cops) return;
    this.cops.stars         = 0;
    this.cops.starTimer     = 0;
    this.cops.cops          = [];
    this.cops.bumpCount     = 0;
    this.cops.rearBumpCount = 0;
    this.cops.headOnCount   = 0;
    this.cops.pitCount      = 0;
    this.cops.arrestPending = false;
    this.cops.helicopterActive = false;
    // Drop any in-flight speed-trap civil stop so its timer can't fire a
    // phantom +1★ after the warp/reset.
    this._trapPursuitActive = false;
    this._trapComplyTimer   = 0;
    this._trapStopping      = false;
    this._trapStopHeld      = false;
    this._trapStopHoldTimer = 0;
    this._trapTicket        = null;   // drop any unresolved ticket snapshot
  }

  _setSteeringMode(mode, onDone) {
    mode = mode === 'lr' ? 'classic' : mode;
    const prev = this._steeringMode();
    if (prev === mode && (mode !== 'tilt' || this._tiltAttached)) {
      onDone?.('unchanged');
      return;
    }
    // Push the new mode into SaveSystem so subsequent get/set hit the
    // right per-mode profile (wallet, restStopSaves, etc).  Achievements
    // stay cross-mode since SaveSystem flags them as global.
    const save = this.registry?.get?.('save');
    if (mode === 'tilt') {
      // Synchronous — preserves iOS user-gesture context.  Falls back to
      // classic if permission is denied / unsupported.
      this._enableTiltSteer?.((res) => {
        if (res === 'granted') {
          this.registry?.set?.('steeringMode', 'tilt');
          this.registry?.set?.('titleThumbsPick', 'tilt');
          this.registry?.set?.('tiltSteerEnabled', true);
          save?.setMode?.('tilt');
        } else {
          this.registry?.set?.('steeringMode', 'classic');
          this.registry?.set?.('titleThumbsPick', 'classic');
          this.registry?.set?.('tiltSteerEnabled', false);
          save?.setMode?.('classic');
          this._showPopup?.(res === 'denied'
            ? 'TILT PERMISSION DENIED'
            : 'TILT NOT SUPPORTED', '#FF4444');
        }
        this._refreshSteeringBtn?.();
        this._wipeWantedState?.();
        onDone?.(res);
      });
      return;
    }
    if (prev === 'tilt') {
      this._disableTiltSteer?.();
      this.registry?.set?.('tiltSteerEnabled', false);
    }
    this.registry?.set?.('steeringMode', mode);
    this.registry?.set?.('titleThumbsPick', mode);
    save?.setMode?.(mode);
    // Switching control schemes resets wanted level — you can't use a
    // steering swap to skip out of a chase / under a 5★ helicopter.
    this._wipeWantedState?.();
    onDone?.('granted');
  }

  /** Steering input with optional drunk-delay buffer.  When alcohol is
   *  above 75 %, the player gets occasional "lurches" — random windows
   *  (every 5-10 s) lasting 0.6-1.2 s during which their steering input
   *  is read from a stale frame (350-600 ms ago).  Outside a lurch the
   *  input passes through unchanged.  Below 75 % alcohol there's no
   *  effect at all.
   *
   */
  _isLeft()  { return this._delayedSteer().left; }
  _isRight() { return this._delayedSteer().right; }

  _delayedSteer() {
    const alc = this.drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
    const raw = { left: this._isLeftRaw(), right: this._isRightRaw() };
    if (alc <= 0.75) {
      // Below threshold — reset scheduling so a brief sober dip doesn't
      // carry over a queued lurch.
      this._drunkLurchUntil = 0;
      this._drunkLurchNext  = 0;
      return raw;
    }

    const now = this.gameTime ?? 0;

    // First frame above threshold — arm the next lurch 5-10 s out.
    if (!this._drunkLurchNext) {
      this._drunkLurchNext = now + 5 + Math.random() * 5;
    }

    // Always feed the history ring while drunk so a lurch can sample
    // from past input the moment it kicks in.
    if (!this._steerHistory) this._steerHistory = [];
    this._steerHistory.push({ t: now, ...raw });
    while (this._steerHistory.length > 0 && now - this._steerHistory[0].t > 1.0) {
      this._steerHistory.shift();
    }

    const inLurch = now < (this._drunkLurchUntil ?? 0);

    // No active lurch but cooldown elapsed → start a new one.
    if (!inLurch && now >= this._drunkLurchNext) {
      const lurchDur = 0.6 + Math.random() * 0.6;            // 0.6-1.2 s
      this._drunkLurchUntil = now + lurchDur;
      this._drunkLurchNext  = this._drunkLurchUntil + 5 + Math.random() * 5; // 5-10 s gap
    }

    // Outside the lurch window → input passes through cleanly.
    if (now >= (this._drunkLurchUntil ?? 0)) return raw;

    // Inside a lurch — pull from a stale frame.  Stronger than before:
    // 350 ms at exactly 75 %, scaling to 600 ms at a full bar.
    const delaySec = 0.35 + Math.min(1, (alc - 0.75) / 0.25) * 0.25;
    const target   = now - delaySec;
    let chosen = this._steerHistory[0];
    for (const e of this._steerHistory) {
      if (e.t <= target) chosen = e; else break;
    }
    return { left: !!chosen?.left, right: !!chosen?.right };
  }
  _isBrake() { return this._touchBrake || !!this.cursors?.down.isDown || !!this.wasd?.down.isDown; }
  _isBoost() {
    // No boost while the accel pedal's charge is empty — the pedal's
    // own update auto-toggles _touchBoost off, but a keyboard hold
    // would otherwise still ramp up the speed.
    if ((this._accelCharge ?? 100) <= 0) return false;
    return this._touchBoost || !!this.cursors?.up.isDown || !!this.wasd?.up.isDown;
  }

  // ─── Intro cinematic ─────────────────────────────────────────────────
  // Camera starts looking straight up (full sky) and tilts down to road.
  // Duration: ~3.2 seconds total.
  _updateIntro(dt) {
    const CX  = SCREEN_W / 2;
    const DUR = 3.2;
    this._introT       += dt / DUR;
    this._introCloudT  += dt;

    if (this._introT >= 1.0) {
      this._introT = 1.0;
      // Pre-render the first game frame onto roadGfx BEFORE removing the intro overlay.
      // This ensures the road is already drawn the instant the overlay disappears.
      this._renderFrame();
      // Now remove the intro overlay — road is underneath, already painted.
      if (this._introGfx) { this._introGfx.destroy(); this._introGfx = null; }
      this.playerSprite.setVisible(true);
      this.hudGfx.setVisible(true);
      this._setHudVisible(true);
      this._introDone = true;
      // Re-calibrate tilt pitch zero now that the player is past the
      // intro and settled into their actual playing posture.  The
      // earlier (scene-start) calibration may have averaged title-
      // screen / pre-game readings that don't match the player's
      // game-time hold angle.
      if (this._steeringMode?.() === 'tilt') {
        this._tiltCalibrating = true;
        this._tiltCalSamples  = [];
      }
      return;
    }

    const g  = this._introGfx;
    const t  = this._introT;
    g.clear();

    // Ease: sky fills full screen at t=0, shrinks to HORIZON_Y by t=1
    // easeOutCubic so the pan slows as it reaches driving position
    const ease = 1 - Math.pow(1 - Math.min(1, t * 1.1), 3);

    // horizon starts at SCREEN_H (off bottom = all sky) → HORIZON_Y
    const HORIZON_Y = 210;
    const hz = SCREEN_H - (SCREEN_H - HORIZON_Y) * ease;

    // ── Sky gradient ───────────────────────────────────────────────
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const bt   = i / bands;
      const y    = Math.round(bt * hz);
      const bh   = Math.ceil(hz / bands) + 1;
      const r    = Math.round(18  + bt * (95  - 18));
      const gv   = Math.round(58  + bt * (175 - 58));
      const b    = Math.round(115 + bt * (228 - 115));
      g.fillStyle((r << 16) | (gv << 8) | b, 1);
      g.fillRect(0, y, SCREEN_W, bh);
    }

    // ── Clouds (only visible in sky area) ─────────────────────────
    this._introDrawClouds(g, hz);

    // ── Sun ────────────────────────────────────────────────────────
    const sunY = hz * 0.55;
    g.fillStyle(0xFFEE88, 0.15); g.fillCircle(CX + 200, sunY, 55);
    g.fillStyle(0xFFEE99, 0.30); g.fillCircle(CX + 200, sunY, 30);
    g.fillStyle(0xFFFFCC, 0.85); g.fillCircle(CX + 200, sunY, 13);

    // ── Ground / road (only appears once horizon has moved partway) ─
    if (hz < SCREEN_H - 10) {
      this._introDrawGround(g, hz);
    }

    // ── Fade-in from black at the very start ───────────────────────
    if (t < 0.12) {
      g.fillStyle(0x000000, 1 - t / 0.12);
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  _introDrawClouds(g, skyH) {
    const ct = this._introCloudT;
    const clouds = [
      { x: ((ct * 14      ) % 900) - 60, y: 0.18, s: 1.00 },
      { x: ((ct *  9 + 350) % 900) - 60, y: 0.42, s: 0.72 },
      { x: ((ct * 17 + 180) % 900) - 60, y: 0.10, s: 0.55 },
      { x: ((ct * 11 + 620) % 900) - 60, y: 0.60, s: 0.80 },
    ];
    for (const c of clouds) {
      const cy = c.y * skyH;
      if (cy > skyH - 20) continue; // clip to sky
      this._introPuffCloud(g, c.x, cy, c.s);
    }
  }

  _introPuffCloud(g, x, y, s) {
    g.fillStyle(0xFFFFFF, 0.80);
    g.fillEllipse(x,           y,       100 * s, 36 * s);
    g.fillEllipse(x + 38 * s,  y - 14 * s, 72 * s, 30 * s);
    g.fillEllipse(x - 28 * s,  y - 8  * s, 58 * s, 24 * s);
    g.fillEllipse(x + 70 * s,  y + 4  * s, 48 * s, 26 * s);
    g.fillStyle(0xCCDDEE, 0.30);
    g.fillEllipse(x + 10 * s,  y + 12 * s, 88 * s, 20 * s);
  }

  _introDrawGround(g, hz) {
    const CX = SCREEN_W / 2;
    // Hills
    g.fillStyle(0x2A5E22, 1);
    g.fillEllipse(80,  hz + 10, 240, 60);
    g.fillEllipse(310, hz + 6,  200, 44);
    g.fillEllipse(530, hz + 12, 280, 58);
    g.fillEllipse(730, hz + 8,  180, 42);
    g.fillStyle(0x3A7030, 1);
    g.fillRect(0, hz + 14, SCREEN_W, SCREEN_H - hz);

    // Grass shoulders
    g.fillStyle(0x4A8A38, 1);
    g.fillPoints([{ x:0, y:hz+2 }, { x:CX-24, y:hz+2 }, { x:CX-195, y:SCREEN_H }, { x:0, y:SCREEN_H }], true);
    g.fillPoints([{ x:SCREEN_W, y:hz+2 }, { x:CX+24, y:hz+2 }, { x:CX+195, y:SCREEN_H }, { x:SCREEN_W, y:SCREEN_H }], true);

    // Rumble strips
    g.fillStyle(0xFFCC00, 1);
    g.fillPoints([{ x:CX-24, y:hz+2 }, { x:CX-18, y:hz+2 }, { x:CX-178, y:SCREEN_H }, { x:CX-210, y:SCREEN_H }], true);
    g.fillPoints([{ x:CX+18, y:hz+2 }, { x:CX+24, y:hz+2 }, { x:CX+210, y:SCREEN_H }, { x:CX+178, y:SCREEN_H }], true);

    // Road surface
    g.fillStyle(0x555548, 1);
    g.fillPoints([{ x:CX-18, y:hz+2 }, { x:CX+18, y:hz+2 }, { x:CX+178, y:SCREEN_H }, { x:CX-178, y:SCREEN_H }], true);

    // Lane dashes
    const dashes = 7;
    for (let i = 0; i < dashes; i++) {
      const t1 = (i + 0.05) / dashes;
      const t2 = (i + 0.48) / dashes;
      const y1 = hz + 2 + t1 * (SCREEN_H - hz - 2);
      const y2 = hz + 2 + t2 * (SCREEN_H - hz - 2);
      const hw1 = Math.max(0.5, t1 * 5.5), hw2 = Math.max(0.5, t2 * 5.5);
      g.fillStyle(0xEEEECC, 0.88);
      g.fillPoints([{ x:CX-hw1, y:y1 }, { x:CX+hw1, y:y1 }, { x:CX+hw2, y:y2 }, { x:CX-hw2, y:y2 }], true);
    }

    // Roadside trees
    const treeScale = (SCREEN_H - hz) / (SCREEN_H - 210);
    this._introTree(g, CX + 155, hz + 8,  0.22 * treeScale);
    this._introTree(g, CX + 240, hz + 16, 0.34 * treeScale);
    this._introTree(g, CX - 148, hz + 8,  0.22 * treeScale);
    this._introTree(g, CX - 235, hz + 16, 0.34 * treeScale);
  }

  _introTree(g, x, y, s) {
    const h = 90 * s, tw = 50 * s;
    g.fillStyle(0x3A5E28, 1);
    g.fillTriangle(x, y - h, x - tw, y, x + tw, y);
    g.fillStyle(0x2E4E20, 1);
    g.fillTriangle(x, y - h * 0.55, x - tw * 0.85, y + 2, x + tw * 0.85, y + 2);
    g.fillStyle(0x5A3A1A, 1);
    g.fillRect(x - 4 * s, y, 8 * s, h * 0.35);
  }

  _setHudVisible(v) {
    // "Hide HUD" Settings toggle overrides gameplay-driven visibility.
    if (this._hudHidden) v = false;
    this.hudScore?.setVisible(v);
    this.hudMult?.setVisible(v);
    this.hudDist?.setVisible(v);
    this.hudSpeed?.setVisible(v);
    this.hudRegion?.setVisible(v);
    this.hudStars?.setVisible(v);
    this.hudRadio?.setVisible(v);
    this.hudF12hint?.setVisible(v);
    // Title screen also hides HP / gas / party clock / damage popup so
    // the player car + title buttons own the screen.
    this.hudHP?.setVisible(v);
    this.hudGas?.setVisible(v);
    this.hudGasIcon?.setVisible(v);
    this.hudAccelBar?.setVisible(v);
    this.hudHPDamage?.setVisible(v);
    this.hudPartyClock?.setVisible(v);
    // Touch pedals — hidden on the title screen so they don't compete with
    // the "TAP TO START" prompt; shown only once gameplay actually begins.
    this._gasBtn?.setVisible(v);
    this._gasLbl?.setVisible(v);
    this._brakeBtn?.setVisible(v);
    this._brakeLbl?.setVisible(v);
    // Re-apply tilt-mode pedal UI after the uniform toggle above — in
    // tilt mode the ACCEL slot stays hidden even when the rest of the
    // HUD is shown.
    if (v) this._applyPedalModeUI?.(true);
    // Hide drug bar labels + weapon icons when on title.  Bars + icon
    // graphics are skipped by their drawers below when _awaitingStart.
    if (this._drugLabels) {
      for (const id of Object.keys(this._drugLabels)) {
        this._drugLabels[id]?.setVisible(v);
      }
    }
    if (this._f12Texts) {
      for (const id of Object.keys(this._f12Texts)) {
        const t = this._f12Texts[id];
        t?.icon?.setVisible(v);
        t?.count?.setVisible(v);
      }
    }
  }

  // ─── Update loop ──────────────────────────────────────────────────────
  update(time, delta) {
    const rawDt = delta / 1000;
    // Reset the per-frame F12-fire gate (see _useTopF12 for the why).
    this._f12FiredThisFrame = false;

    // DUI bust-to-start screen is showing — freeze the world (the full-screen
    // overlay covers it) until the 5s delayedCall restarts the scene.
    if (this._bustingToStart) return;

    // Title-screen state: render the gameplay road and the player car at
    // idle, but freeze score/odometer/spawning. Tap or Enter/Space starts
    // the actual game.
    if (this._awaitingStart) {
      // Slow drift so the road isn't completely static.
      this.player.position += this.player.speed * rawDt;
      this._renderFrame();
      this._renderHUD();
      // Title now requires an explicit difficulty-button tap to start —
      // no more "any-key / any-tap" auto-start.  Keyboard players can
      // still hit Enter to confirm whatever difficulty is currently
      // active (defaulting to Normal on first run).
      if (!this._anyKeyAttached) {
        this._anyKeyAttached = true;
        // Both the START button on the right and these handlers route
        // through the same dispatcher (`this._fireTitleCursor`), set
        // up when the title HUD is built.
        const fireCursor = () => this._fireTitleCursor?.();
        this.input.keyboard?.once('keydown-ENTER', fireCursor);
        this.input.keyboard?.once('keydown-SPACE', fireCursor);
        this.input.keyboard?.once('keydown-RIGHT', fireCursor);
        // Tap anywhere off-menu fires the cursor's action.
        this.input.once('pointerdown', (ptr) => {
          if (!this._awaitingStart) return;
          // Skip when the player is in the iPhone portrait menu —
          // taps on song rows, modal buttons, etc. shouldn't also
          // launch the run.  The orientation check is the cleanest
          // gate: any touch while in portrait is a phone-menu touch.
          if (window.innerHeight > window.innerWidth) {
            this._anyKeyAttached = false;
            return;
          }
          // Also skip when an HTML phone-menu modal is open (which can
          // happen in landscape if the lock chip is engaged) so taps
          // on those don't auto-fire the cursor either.
          // HTML phone-menu modals can keep their `.open` class after
          // rotating back to landscape while the whole #phone-menu is
          // CSS-hidden.  Treat only *visible* modals as blockers; a
          // stale hidden music modal should not swallow gameplay taps.
          const phoneModalVisible = (id) => {
            const el = document.getElementById(id);
            if (!el?.classList?.contains('open')) return false;
            const menu = document.getElementById('phone-menu');
            const menuVisible = !!menu && getComputedStyle(menu).display !== 'none';
            const modalVisible = getComputedStyle(el).display !== 'none';
            return menuVisible && modalVisible;
          };
          const phoneMusicOpen = phoneModalVisible('phone-music');
          const phoneAchOpen   = phoneModalVisible('phone-achievements');
          const phoneMapOpen   = phoneModalVisible('phone-map');
          const phoneGarOpen   = phoneModalVisible('phone-garage');
          if (phoneMusicOpen || phoneAchOpen || phoneMapOpen || phoneGarOpen) {
            this._anyKeyAttached = false;
            return;
          }
          // Any modal (map / garage / achievements) swallows the tap.
          // If a modal is open, OR was just closed by this same
          // pointerdown (close button handler runs FIRST and destroys
          // the modal before hitTestPointer can see it), bail and
          // re-arm — the player is dismissing a modal, not asking to
          // start a race.
          if (this._mapModalOpen          || this._mapModalJustClosed
           || this._garageModalOpen       || this._garageModalJustClosed
           || this._achievementsModalOpen || this._achievementsModalJustClosed) {
            this._anyKeyAttached = false;
            return;
          }
          // Tap-anywhere-to-start REMOVED — taps off the buttons are
          // now no-ops.  Game starts ONLY when the painted START panel
          // is tapped (or ENTER / SPACE on keyboard).  Re-arm so the
          // keyboard once-handlers above can still fire.
          this._anyKeyAttached = false;
        });
      }
      return;
    }

    if (!this._introDone) {
      this._updateIntro(rawDt);
      return;
    }

    // Overdose exit: leave the last road frame frozen behind the blackout
    // while the tween finishes, then move into the dedicated ending scene.
    if (this._odEnding) {
      this._renderFrame();
      this._renderHUD();
      return;
    }

    // ── Pause toggle ──────────────────────────────────────────────────
    if (this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this._togglePause();
    }
    if (this._paused) return;

    const phys  = this.effects.getPhysics(this.drugs);
    const dt    = rawDt * phys.dtMultiplier;
    // Cocaine accelerates wanted-level gain — stamp the multiplier on
    // CopSystem so addStar(amount) reads it without touching call sites.
    if (this.cops) this.cops._starGainMul = phys.cocaineStarMul ?? 1;
    // Cocaine high-freq tremor: fire a micro-shake every ~3 frames while
    // coke is active.  cameraTremor maxes at 1.5 (full bar) → 0.0012 amp.
    this._tremorTick = (this._tremorTick ?? 0) + 1;
    if ((phys.cameraTremor ?? 0) > 0.05 && this._tremorTick % 3 === 0) {
      this.effects.triggerShake(60, phys.cameraTremor * 0.0008);
    }

    // Game time + party clock tick from the moment the car starts
    // moving forward.  Fresh runs sit in a frozen "ready" state until
    // the first tap (_awaitingFirstGameTap); skip the tick there so
    // the clock genuinely pauses pre-input — matches the documented
    // ready-state behavior and keeps the run timer honest.
    if (!this._awaitingFirstGameTap) {
      this.gameTime += rawDt;
      this.stats?.addDriveTime(rawDt);   // lifetime / per-vehicle road time
      if (this._partyClockSec > 0) this._partyClockSec = Math.max(0, this._partyClockSec - rawDt);
    }
    // Checkpoint-resume steer-lock: any raw input (key or touch)
    // clears the lock so the player regains control.  The lock is set
    // in the _resumeFromStop / _resumeFromPosition init branches.
    if (this._steerLockUntilTap && (this._isLeftRaw() || this._isRightRaw())) {
      this._steerLockUntilTap = false;
    }

    // ── Low-HP smoke ───────────────────────────────────────────────
    // <=15 HP: light, infrequent puffs (every ~500 ms).
    // <=5 HP: heavier, larger puffs (every ~200 ms). In cockpit the
    // engine is below the windshield rather than at the hidden chase car.
    if (this.damage && this.playerSprite) {
      const hp = this.damage.getDurability?.() ?? 100;
      if (hp <= 15 && hp > 0) {
        const interval = hp <= 5 ? 0.20 : 0.50;
        this._lowHpSmokeT = (this._lowHpSmokeT ?? 0) + rawDt;
        if (this._lowHpSmokeT >= interval) {
          this._lowHpSmokeT = 0;
          const inCockpit = !!this._cockpitActive;
          const px = inCockpit ? SCREEN_W * 0.56 : this.playerSprite.x;
          const py = inCockpit ? SCREEN_H * 0.80 : this.playerSprite.y;
          const sizeMul = hp <= 5 ? 1.5 : 1.0;
          const wobble = (Math.random() - 0.5) * 12;
          this.explosions.push({
            sx: px + wobble,
            sy: py - (inCockpit ? 12 : 4),
            sw: (18 + Math.random() * 14) * sizeMul,
            timer: 0,
            maxTimer: hp <= 5 ? 1.1 : 0.85,
            smoke: true,
          });
        }
      } else if (this._lowHpSmokeT) {
        this._lowHpSmokeT = 0;
      }
    }

    // ── One-shot key actions ──────────────────────────────────────────
    if ((this.keyF?.isDown && !this._f12KeyPressed) || this._touchF12) {
      this._useTopF12();
      this._f12KeyPressed = true;
      this._touchF12 = false;
    }
    if (!this.keyF?.isDown) this._f12KeyPressed = false;

    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) this.audio.nextStation();
    if (this.keyM && Phaser.Input.Keyboard.JustDown(this.keyM)) this.audio.toggleMute();
    if (this.keyQ && Phaser.Input.Keyboard.JustDown(this.keyQ)) this._cycleWeapon();
    if (this._touchCycleArmed) {
      this._touchCycleArmed = false;
      this._cycleWeapon();
    }

    // ── Physics ───────────────────────────────────────────────────────
    this._updatePlayer(dt, phys);
    this._updateTraffic(dt);

    // ── Systems ───────────────────────────────────────────────────────
    this.drugs.update(rawDt);
    this.drugs.routeProgress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    // Weed Permastoned tracker — bar at 100% for 10 in-game miles fires
    // the Permastoned achievement, force-resets the weed bar to 0, and
    // suppresses any future weed pickups for the rest of the run.
    {
      const posPerMile = (ROUTE_SEGS * SEG_LENGTH) / TOTAL_ROUTE_MILES;
      const r = this.drugs.notePermastonedTick?.(this.player.position, posPerMile);
      if (r?.permastoned) {
        this._showPopup('🌿 PERMASTONED!\nWeed bar locked.', '#88FF88');
        AchievementSystem.award('permastoned', this.registry);
      }
    }

    // ── Achievement run-state trackers ────────────────────────────────
    // Untouchable timer — counts seconds since the last damage event.
    // Fires 1m / 2m / 3m / 5m milestones once each per run.
    this._noDamageTimer += rawDt;
    const milestones = [
      ['1m',  60,  'untouchable_1m'],
      ['2m', 120,  'untouchable_2m'],
      ['3m', 180,  'untouchable_3m'],
      ['5m', 300,  'untouchable_5m'],
    ];
    for (const [key, sec, id] of milestones) {
      if (!this._noDamageFlags[key] && this._noDamageTimer >= sec) {
        this._noDamageFlags[key] = true;
        AchievementSystem.award(id, this.registry);
      }
    }

    // Wanted-level tracking — peak stars + the "5★ Survivor" reset trick.
    const stars = this.cops.starDisplay ?? this.cops.stars ?? 0;
    if (stars > 0) this._everHitStars = true;
    this._peakStars = Math.max(this._peakStars, stars);
    if (this._peakStars >= 5 && stars <= 0 && !this._fiveStarSurvived) {
      this._fiveStarSurvived = true;
      AchievementSystem.award('five_star_survivor', this.registry);
    }

    // Snowblind tracking — entered the snow zone (mile 40+) with full
    // HP, took zero damage all the way through (~mile 88).  Strict per
    // user request: any HP loss disqualifies the run for this badge.
    {
      const _mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const inSnow = Weather.isSnow(_mile);
      const hp = this.damage?.getDurability?.() ?? 100;
      if (inSnow && this._snowblindHpEntry == null) {
        // First frame entering the snow zone — capture HP and a flag.
        this._snowblindHpEntry = hp;
        this._snowblindOk      = true;
      }
      if (this._snowblindOk && hp < (this._snowblindHpEntry ?? 100)) {
        this._snowblindOk = false;     // any HP loss disqualifies
      }
      if (this._snowblindOk && this._snowblindHpEntry != null && !inSnow && _mile > 88) {
        // Cleared the entire snow window without HP loss.
        this._snowblindOk = false;     // suppress double-fire
        AchievementSystem.award('snowblind', this.registry);
      }
    }
    // ── Issaquah valley fog: timed lift to mask the Preston pop-in ──────
    // Weather.intensity() now holds the fog FULL through the basin (no
    // mile-22 lift); the lift-out is driven here over 5 s of REAL time once
    // the player crosses mile 23.6.  Result: the cluster homes are already
    // drawn while it's socked-in, then emerge as the fog dissipates instead
    // of appearing in clear air.  Sets Weather._fogLiftMul (fog branch only;
    // read by Road distance-fog + EffectsSystem haze).
    {
      const fogMile = this._playerMile();
      if (Weather.isFog?.(fogMile) && fogMile >= 23.6) {
        if (this._fogLiftT0 == null) this._fogLiftT0 = time;
        Weather._fogLiftMul = Math.max(0, Math.min(1, 1 - (time - this._fogLiftT0) / 5000));
      } else if (fogMile < 23.6) {
        this._fogLiftT0 = null;        // reset before the trigger (covers restart / checkpoint)
        Weather._fogLiftMul = 1;
      }
    }
    {
      const mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      // The control only exists during precipitation. If the player drove
      // out of rain/snow while it was on, park it immediately rather than
      // leaving active blades with no visible way to switch them off.
      const wState = Weather.state?.(mile);
      const showWeatherBtn = (wState === 'rain' || wState === 'snow');
      if (!showWeatherBtn) {
        this._wiperMode = 0;
        this._wiperPhase = 0;
        this._cockpitWiperPhase = 0;
        this._wiperSweepPulse = false;
      }
      // Mode > 0 = wipers actively sweeping.
      const wiperActive = (this._wiperMode ?? 0) > 0;
      // Sweep pulse — true for exactly ONE frame each time a wiper
      // frame transitions (set in _renderCockpit / _renderWipers).
      // EffectsSystem reads this to incrementally clear windshield
      // droplets — multi-sweep clean rather than instant wipe.
      const wiperSweepPulse = !!this._wiperSweepPulse;
      this._wiperSweepPulse = false;   // one-shot
      if (!this._perf?.noEffects) {
        this.effects.update(rawDt, this.drugs, this.cameras.main, { mile, wiperActive, wiperSweepPulse });
      }
      // Weather / wiper indicator — visible during BOTH rain AND snow.
      // Icon is the custom wiper-blade drawing in drawWiper() above;
      // the text label here shows the current mode (OFF / ON).
      if (this.hudWiperBtn) this.hudWiperBtn.setVisible(showWeatherBtn);
      if (this.hudWiperLbl) {
        this.hudWiperLbl.setVisible(showWeatherBtn);
        if (showWeatherBtn) {
          const modeLbl = this._wiperMode ? 'ON' : 'OFF';
          if (this.hudWiperLbl.text !== modeLbl) this.hudWiperLbl.setText(modeLbl);
        }
      }
    }
    // Custom-mode "No police" — keep stars + cops fully suppressed.
    // `starDisplay` is a getter on CopSystem (= Math.floor(stars)), so
    // setting `stars = 0` is enough; we never write to starDisplay.
    if (this._customFlags?.noPolice) {
      this.cops.stars         = 0;
      this.cops.cops          = [];
      this.cops.bumpCount     = 0;
      this.cops.rearBumpCount = 0;
      this.cops.headOnCount   = 0;
      this.cops.pitCount      = 0;
      this.cops.arrestPending = false;
    } else {
      this.cops.update(rawDt, this.player.position, this.player.speed, this.player.x);
    }
    // Sex-worker dirt buff: enforce the star cap and expire it once
    // the player passes the buff's end position.
    this.cops.tickStarCap?.(this.player.position);
    if (this.cops.starCapMax != null && this.cops.stars > this.cops.starCapMax) {
      this.cops.stars = this.cops.starCapMax;
    }
    // Real-time drug → music coupling.  Cheap call (just sets filter
    // targets), runs every frame so the mix continuously breathes with
    // bar levels.  See AudioSystem.setDrugInfluence for the mapping.
    this.audio?.setDrugInfluence?.(this.drugs.levels);

    // ── Collisions ────────────────────────────────────────────────────
    this._assignPendingDrugTypes();
    this._checkCollisions();

    // ── OD / Arrested ─────────────────────────────────────────────────
    // Custom mode never ODs, so skip the frame-level safety check too.
    if (Difficulty.mode?.() !== 'custom') {
      const odDrug = this.drugs.checkOD();
      if (odDrug) { this._onOverdose(odDrug); return; }
    }
    if (this.cops.arrestPending) { this._onArrested(); return; }

    // ── Probation timer ───────────────────────────────────────────────
    if (this._probationTimer > 0) this._probationTimer -= rawDt;

    // ── Friend's advance speed-trap warning (15-20 mi out) ────────────
    // A buddy texts the city + mile of a trap they spotted, well before you
    // reach it, so you can ease off in time.  Fires once per trap per run, at
    // a per-trap 15-20 mi lead (the trap miles are exposed by RouteData).
    const _trapMiles = this.road?.segments?.trapMiles;
    if (_trapMiles?.length && !this._awaitingFirstGameTap) {
      const curMile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      for (const tm of _trapMiles) {
        const ahead = tm - curMile;
        if (ahead <= 0 || this._trapWarnSent.has(tm)) continue;
        const lead = 15 + (Math.floor(tm * 7) % 6);   // per-trap 15-20 mi lead
        if (ahead > lead) continue;
        this._trapWarnSent.add(tm);
        const city = getLocationName(tm / TOTAL_ROUTE_MILES) || 'up ahead';
        this._logBuddyText('friend', 'The Friend',
          'Speed trap in ' + city + ' around mile ' + Math.round(tm) + ' — slow down before you hit it!');
      }
    }

    // ── Flavor contacts texting you on the road ───────────────────────
    // The Ex / Mom / The Boss / The Unknown drop characterful texts on a
    // cadence — pure tone, no gameplay effect (readable in the Messages app).
    if (!this._awaitingFirstGameTap && !this._trapStopHeld) {
      this._buddyTextTimer = (this._buddyTextTimer ?? 60) - rawDt;
      if (this._buddyTextTimer <= 0) {
        this._buddyTextTimer = 50 + Math.random() * 45;   // next in ~50-95s
        this._fireBuddyText();
      }
    }

    // ── Wanted-level activation ──────────────────────────────────────
    //
    // FIRST STAR is gated.  Two separate paths can trigger it; whichever
    // fires first awards the star.  Both paths reach exactly 1.0 stars.
    //
    //   Path A:  (alcohol ≥ ⅓  OR  weed ≥ ½)
    //            AND   3 NPC crashes since first drink
    //
    //   Path B:  20 NPC-car bumps while at least one drug bar ≥ 30%
    //            (one-shot gate — `_drugBumpFired` flag prevents re-trigger)
    //
    // ── Speed traps ───────────────────────────────────────────────────
    // Roadside troopers (copEncounter sprites) are SPEED TRAPS.  The only
    // heads-up is the friend's named text 15-20 mi out (see above); there is
    // no close-range nudge.  Blow past a trap SPEEDING (> COP_TRAP_SPEED_MPH)
    // or recklessly (over
    // the double-yellow / in oncoming) and the trooper clocks you → +1★
    // (driving heat caps at 3★; 4-5★ is weapons-only).  Brake under the
    // threshold and stay in your lane to slip by clean.  Works at 0★ — a
    // trap is how you EARN your first star from reckless driving.
    if (!this._awaitingFirstGameTap) {
      const segs = this.road?.segments;
      if (segs?.length) {
        const SEGN     = segs.length;
        const startSeg = Math.floor(this.player.position / SEG_LENGTH);
        // (Old close-range "speed trap ahead" buddy nudge removed — the named
        //  friend text 15-20 mi out is the only warning now.)
        // Trap witnessing — scan BEHIND for a just-passed trap.
        const mph      = this._displayMPH?.() ?? 0;
        const oncoming = this.player.x < -0.10;            // crossed the double-yellow
        const speeding = mph > COP_TRAP_SPEED_MPH;
        for (let n = 1; n <= 60; n++) {
          const seg = segs[(startSeg - n + SEGN) % SEGN];
          if (!seg?.sprites) continue;
          for (const sp of seg.sprites) {
            if (!sp.copEncounter || sp.triggered) continue;
            sp.triggered = true;
            // Two cop kinds share copEncounter (for render/collision); behavior
            // splits on type.  PARKED = a speed trap (0★ civil stop).  DRIVING =
            // ambient highway presence: NO 0★ stop — it only joins an active
            // pursuit when you're already wanted.
            const isParkedTrap = sp.type === 'cop_random_parked';
            if (speeding || oncoming) {
              if (this.cops.stars >= 1) {
                // Already wanted = an active warrant.  Either cop kind that
                // clocks you JOINS the pursuit; no civil stop is offered.
                // (Pulling over with a warrant → busted; that's Stage 3.)
                this.cops._spawnRearFromEncounter?.(this.player.position);
                this._showPopup('SPOTTED!\nYou\'ve got a warrant — they\'re on you!', '#FF4444');
              } else if (isParkedTrap && !this._trapPursuitActive) {
                // 0★ civil stop — PARKED TRAPS ONLY.  A pursuer peels out and
                // a comply window opens.  No star yet — pull to the right
                // shoulder in time to avoid it.
                this._trapPursuitActive = true;
                this._trapComplyTimer   = COP_TRAP_COMPLY_SEC;
                this.cops._spawnTrapPursuit?.(this.player.position);
                // The below-mirror trap sign (see the _trapSign block in
                // update) shows the alternating SLOW DOWN / PULL OVER prompt
                // while the comply window is open — no one-shot popup needed.
              }
              // Driving cop at 0★ → ambient, no reaction.
            } else if (isParkedTrap) {
              this._showPopup('Slipped past the trap.', '#88FF88');
            }
          }
        }
      }
    }

    // ── Speed-trap comply window (0★ civil stop) ───────────────────────
    // The pursuer is on you and the 30s clock is ticking.  Committing to the
    // stop (right shoulder + braking) engages the auto-stop assist in
    // _updatePlayer (`_trapStopping`); once the car is essentially halted
    // (< COP_TRAP_PULLOVER_MPH) you've "pulled over" → the car is HELD at a
    // full stop for the COP_TRAP_HOLD_SEC traffic stop (handled below) while
    // the trooper parks behind you.  Let the clock run out — or never commit —
    // → +1★ and the trap cop promotes into the 1-3★ wanted system.
    if (this._trapPursuitActive && !this._awaitingFirstGameTap) {
      this._trapComplyTimer -= rawDt;
      const mphNow = this._displayMPH?.() ?? 0;
      if (this._trapStopping && mphNow < COP_TRAP_PULLOVER_MPH) {
        // Stopped on the shoulder → begin the held traffic stop.  Comply
        // window is satisfied (no escalation); the car stays put for 30s.
        this._trapPursuitActive = false;
        this._trapStopping      = false;
        this._trapComplyTimer   = 0;
        this._trapStopHeld      = true;
        this._trapStopHoldTimer = COP_TRAP_HOLD_SEC;
        this._trapStopHeldX     = this.player.x;             // freeze steering here for the stop
        this._trapCopArrive     = 0;                         // cruiser pull-up animation 0→1
        // Snapshot the offense NOW (drug bars at the moment of the stop) so the
        // 30s of metabolizing can't change the charge.  Resolved at hold-end.
        this._trapTicket        = this._assessTrafficStop();
        this.cops.parkTrapPursuit?.(this.player.position);   // trooper pulls up behind you
        // "TRAFFIC STOP" + the countdown are shown by the below-mirror trap sign.
      } else if (this._trapComplyTimer <= 0) {
        this._trapPursuitActive = false;
        this._trapStopping      = false;
        this._trapComplyTimer   = 0;
        this.cops.promoteTrapPursuit?.();
        this.cops.addStar(1, 3);   // ignored the stop → into the wanted system
        this._showPopup('Failed to pull over!  +1★', '#FF4444');
      }
    }

    // ── Speed-trap HELD traffic stop ───────────────────────────────────
    // You pulled over; the car is pinned at a full stop (forced in
    // _updatePlayer) while the trooper writes you up.  The party clock keeps
    // ticking the whole time.  When the hold ends the trooper pulls off and
    // you're free to go.  (The actual ticket $ + DUI/bust math is Stage 3.)
    if (this._trapStopHeld && !this._awaitingFirstGameTap) {
      this._trapStopHoldTimer -= rawDt;
      // "TRAFFIC STOP" + the countdown are drawn by the below-mirror trap sign
      // (see the _trapSign block after this), not a popup banner.
      // Cruiser pulls up from behind into view over ~1.3s, then holds just
      // ahead-left.  It starts behind (mirror-only); as it slides forward it
      // crosses into the camera's view (relativePos>0) from the bottom — so it
      // reads as the trooper rolling up.  parkTrapPursuit marked it `parked`,
      // so CopSystem won't move it — GameScene owns its position during the
      // stop.  endTrapPursuit removes it when the stop clears (before the
      // player drives off), so they never collide with it.
      this._trapCopArrive = Math.min(1, (this._trapCopArrive ?? 0) + rawDt / 1.3);
      const _e  = this._trapCopArrive * this._trapCopArrive * (3 - 2 * this._trapCopArrive); // smoothstep
      const _tc = this.cops.cops.find(c => c.trapPursuit);
      if (_tc) {
        // Slide from behind (mirror-only) up to a CLOSE spot just ahead-left so
        // it's big and unmistakably on screen for the stop.  +600 is close
        // enough to render large at the 2.2× cop scale.
        _tc.position   = this.player.position + (-1800 + 2400 * _e);   // -1800 → +600 (close, ahead-left)
        _tc.laneOffset = 0.5;
      }
      // Flashing red/blue cruiser lights across the top + sides of the screen.
      this._drawTrapStopLights();
      if (this._trapStopHoldTimer <= 0) {
        this._trapStopHeld      = false;
        this._trapStopHoldTimer = 0;
        this._trapLightGfx?.clear();
        this._trapLightWasOn    = false;
        this.cops.endTrapPursuit?.();   // trooper pulls off
        this._issueTrafficTicket();     // Stage 3 — charge the fine / DUI / bust
      }
    } else if (this._trapLightWasOn) {
      // Stop ended some other way (warp/OD/reset) — kill the flash.
      this._trapLightGfx?.clear();
      this._trapLightWasOn = false;
    }

    // ── Speed-trap sign (just below the rear-view mirror) ──────────────
    // Comply window open  → alternate SLOW DOWN (red) / PULL OVER (blue).
    // Pulled over (held)  → "TRAFFIC STOP" + the seconds remaining.
    // Hidden any other time.  No emojis.
    if (this._trapSign) {
      if (this._trapStopHeld) {
        const secs = Math.max(0, Math.ceil(this._trapStopHoldTimer));
        this._trapSign.setText('TRAFFIC STOP\n' + secs + 's')
          .setColor('#FFFFFF').setVisible(true);
      } else if (this._trapPursuitActive) {
        const slow = Math.floor((this.time?.now ?? 0) / 500) % 2 === 0;
        this._trapSign.setText(slow ? 'SLOW DOWN' : 'PULL OVER')
          .setColor(slow ? '#FF3B30' : '#2E9BFF').setVisible(true);
      } else if (this._trapSign.visible) {
        this._trapSign.setText('').setVisible(false);
      }
    }

    // ── Finish cinematic — park in front of the Pullman Party House ─────
    // Crossing mile 289 set _finishCinematic; _updatePlayer eases the car to
    // a stop while drifting it left toward the house (input locked).  After
    // FINISH_PARK_SEC the run hands off to the Game Over panel.
    if (this._finishCinematic && !this._finishCineEnded) {
      this._finishCineT = Math.min(1, (this._finishCineT ?? 0) + rawDt / FINISH_PARK_SEC);
      if (this._finishCineT >= 1) {
        this._finishCineEnded = true;
        this._finishCinematic = false;
        this._endGame(this._finishCause || 'finish_late');
        return;
      }
    }

    // After the first star, all further star changes are STATIC additions
    // from collision events (see _onCopCollision and friends).  No heat trickle.
    if (this.cops.stars < 1) {
      const drunk    = (this.drugs.get?.(DRUGS.ALCOHOL) ?? 0) >= (1 / 3);
      const stoned   = (this.drugs.get?.(DRUGS.WEED)    ?? 0) >= 0.5;
      const everDrunk = (this.drugs.maxReached?.[DRUGS.ALCOHOL] ?? 0) > 0.05;
      this._npcCrashesPostDrink ??= 0;
      this._drugBumpCount       ??= 0;

      const pathA = everDrunk && (drunk || stoned) && this._npcCrashesPostDrink >= 3;
      const pathB = !this._drugBumpFired && this._drugBumpCount >= 20;
      if (pathA || pathB) {
        this.cops.addStar(1, 3);
        this._showPopup('★ WANTED LEVEL ACTIVATED!\nCops dispatched.', '#FF4444');
        this._npcCrashesPostDrink = 0;
        this._drugBumpFired        = true;     // path B is one-shot
      }
    }

    // ── Drug-line drops ───────────────────────────────────────────────
    // Every ~90 sec a 4-pickup line appears.  Drug type is picked from the
    // player's unlocked pool so they get variety as more drugs come online
    // (Beer Run, Chain Smoking, Rail Run, Mushroom Hunting, Tab Run, …).
    this._beerLineTimer = (this._beerLineTimer ?? 90) - rawDt;
    if (this._beerLineTimer <= 0) {
      this._beerLineTimer = 80 + Math.random() * 20;       // 80–100 sec
      const pool = ['beer', 'weed'];
      if (this.drugs.isUnlocked(DRUGS.COCAINE))  pool.push('cocaine');
      if (this.drugs.isUnlocked(DRUGS.SHROOMS))  pool.push('shrooms');
      if (this.drugs.isUnlocked(DRUGS.LSD))      pool.push('lsd');
      if (this.drugs.isUnlocked(DRUGS.HEROIN))   pool.push('heroin');
      if (this.drugs.isUnlocked(DRUGS.RX))       pool.push('rx');
      if (this.drugs.isUnlocked(DRUGS.FENTANYL)) pool.push('fentanyl');
      if (this.drugs.isUnlocked(DRUGS.KETAMINE)) pool.push('ketamine');
      if (this.drugs.isUnlocked(DRUGS.METH))     pool.push('meth');
      // Bias toward beer so it stays the dominant line type.
      pool.push('beer', 'beer');
      const drugType = pool[(Math.random() * pool.length) | 0];
      this._injectDrugLine({
        types:  [drugType, drugType, drugType, drugType],
        spread: 14,
        label:  this._drugLineLabel(drugType),
      });
    }
    // Every ~100 in-game miles a longer mixed-drug line spawns. Tracked
    // by integer odometer mile so it triggers exactly once per crossing.
    const milesNow = Math.floor(this._odometer ?? 0);
    if (milesNow > 0 && milesNow % 100 === 0
        && milesNow !== this._lastMixedLineMile) {
      this._lastMixedLineMile = milesNow;
      // Mix is biased to drugs the player has unlocked.
      const pool = ['beer', 'weed'];
      if (this.drugs.isUnlocked(DRUGS.COCAINE)) pool.push('cocaine');
      if (this.drugs.isUnlocked(DRUGS.SHROOMS)) pool.push('shrooms');
      if (this.drugs.isUnlocked(DRUGS.LSD))     pool.push('lsd');
      if (this.drugs.isUnlocked(DRUGS.RX))      pool.push('rx');
      const mixed = [];
      for (let i = 0; i < 7; i++) mixed.push(pool[(Math.random() * pool.length) | 0]);
      this._injectDrugLine({
        types:  mixed,
        spread: 16,
        label:  `🎉 MIXED DRUG LINE — MILE ${milesNow}!`,
      });
    }

    // ── 4★+ extra weapon drops ───────────────────────────────────────
    // Pre-baked F12 spawns are 1 every 1200 segments (~7s @ 120 mph).  At
    // 4★+ inject a bonus weapon onto a near-future segment every ~3.5s so
    // the player has tools to fight back against the heavier heat.
    if (this.cops.starDisplay >= 4) {
      this._bonusWeaponTimer = (this._bonusWeaponTimer ?? 0) - rawDt;
      if (this._bonusWeaponTimer <= 0) {
        this._bonusWeaponTimer = 3.0 + Math.random() * 1.5;
        this._injectBonusWeapon();
      }
    }

    // ── Odometer (4× time-compression: 120 mph → 120 mi per 15 min) ──
    // Odometer is derived from route progress × real-world Seattle→Miami
    // mileage (4,390 mi) so checkpoints land at their actual driving
    // distances (Portland at 630 mi, Boise at 1,115 mi, …, Miami at 4,390).
    const _odoPrev = this._odometer ?? 0;
    this._odometer = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;

    // ── Gas decrement (in odometer miles per frame) ──────────────────
    // Custom mode is sandbox — no gas burn, no tow-truck stranding,
    // no fuel-management to worry about.  Score-eligible modes still
    // bleed gas + strand on empty.
    const _isCustom = Difficulty.mode?.() === 'custom';
    const _odoDelta = Math.max(0, this._odometer - _odoPrev);
    // Lifetime / per-vehicle odometer.  Clamp absurd single-frame jumps
    // (checkpoint-resume warp, dev mile-warp) so they can't pollute totals —
    // a legit frame covers ~0.005 mi, so anything ≥ 1 mi is a teleport.
    if (_odoDelta > 0 && _odoDelta < 1) this.stats?.addMiles(_odoDelta);
    if (!_isCustom && _odoDelta > 0 && this.player.gasMi > 0) {
      this.player.gasMi = Math.max(0, this.player.gasMi - _odoDelta);
      if (this.player.gasMi <= 0 && !this._strandedShown) {
        this._strandedShown = true;
        this._showPopup?.('⛽ OUT OF GAS — calling tow…', '#FF4444');
        // After a brief beat, run the tow logic.
        this.time.delayedCall(2200, () => this._runTow());
      }
    }

    // ── Score ─────────────────────────────────────────────────────────
    const currentSeg = Math.floor(this.player.position / SEG_LENGTH);
    const passed     = currentSeg - this.lastSegIdx;
    if (passed > 0) {
      const _distBase = passed * PTS_DIST;
      const _distEarn = _distBase * this._scoreMult();
      this.score    += _distEarn;
      this.stats?.recordEarn(_distEarn, 'distance', _distBase);
      this.lastSegIdx = currentSeg;
    }
    // Penalties: slowing below 120 mph and driving off-road both bleed score.
    // Scale with drug multiplier so highs don't trivially cancel them.
    {
      const dispMph = this._displayMPH();
      const mult    = this._scoreMult();
      // Fentanyl: while in your system the car is hard-capped at 30%
      // speed.  Penalising the player for that drop is double-jeopardy,
      // so suppress the slowness penalty entirely until it clears.
      const fentActive = (this.drugs?.get?.(DRUGS.FENTANYL) ?? 0) > 0.05;
      // Weed ≥ 60% — "hot-boxed" mode: no slow-driving penalty at all,
      // and off-road penalty cut in half (per user spec).
      const weedHigh  = (this.drugs?.get?.(DRUGS.WEED) ?? 0) >= 0.60;
      // Any drug dragging max speed below baseline (heroin, fent, weed-
      // alone, ketamine, rx) suppresses the slowness penalty — getting
      // docked $ for a slowdown the drug is forcing on you is double-
      // jeopardy.  speedMult < 1 means SOMETHING is slowing the car;
      // the player can't help it, so don't drain their wallet for it.
      const drugSlowing = (phys?.speedMult ?? 1) < 0.99;
      // Speed-trap traffic stop: the game is FORCING you to slow down and pull
      // to the right shoulder (off-road), so charging the slow-driving AND the
      // off-road penalty during the stop is double-jeopardy — suppress both for
      // the whole sequence (comply window → auto-stop → held stop).
      const trafficStop = this._trapPursuitActive || this._trapStopping || this._trapStopHeld;
      let penalty   = 0;

      if (dispMph < 120 && !fentActive && !weedHigh && !drugSlowing && !trafficStop) {
        // -$5/sec floor at 60 mph, linear up to 0 at 120 mph.
        const slowness = Math.min(1, (120 - dispMph) / 60);
        penalty += 5 * slowness * mult;
      }
      if (Math.abs(this.player.x) > 1 && !trafficStop) {
        // -$10/sec when off the road; scales by how deep into the dirt.
        // Weed ≥ 60 % halves the penalty (the player is in chill mode).
        const depth = Math.min(1, (Math.abs(this.player.x) - 1) / 1.0);
        let offroad = 10 * (0.5 + 0.5 * depth) * mult;
        if (weedHigh) offroad *= 0.5;
        penalty += offroad;
      }
      // Haptic feedback — light buzz on the rumble strip, heavy buzz off-road.
      // The painted asphalt half-width is ±1.0; the rumble band sits in
      // (1.0, ~1.06]; everything past that is dirt/grass.
      const ax = Math.abs(this.player.x);
      let hapticTier = 0;
      if (ax > 1.06)      hapticTier = 2;          // off-road
      else if (ax > 1.00) hapticTier = 1;          // rumble strip
      this.haptics?.pulse?.(hapticTier);
      if (penalty > 0) {
        this.score = Math.max(0, this.score - penalty * rawDt);
      }
    }
    // ── Checkpoint detection ──────────────────────────────────────────
    // HARD mode: passing a checkpoint marker no longer auto-registers
    // a save point.  The player must actually pull off at a rest stop
    // for LOAD SAVE to have anywhere to resume from.  Map progress
    // (_passedCheckpoints) still updates so the route map / progress
    // bar advance — only _lastCheckpoint is gated.
    const _isHard = (Difficulty.mode?.() === 'hard');
    const progress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    for (const cp of CHECKPOINTS) {
      if (cp.isStart || this._passedCheckpoints.has(cp.name)) continue;
      if (progress >= cp.t) {
        this._passedCheckpoints.add(cp.name);
        if (!_isHard) {
          this._lastCheckpoint = { name: cp.name, position: this.player.position, scoreAtCP: this.score };
        }
        if (cp.isFinish && !this._gameFinished) {
          this._gameFinished = true;
          // ── Party-clock evaluation ────────────────────────────────
          // ON TIME (clock > 0): apply Difficulty.onTimeBonusMul × cash.
          // TOO LATE (clock == 0): no bonus.  TOO LATE + 5★: technical
          // loss — game ends with cash penalty + Restart-Checkpoint UI.
          const onTime = (this._partyClockSec ?? 0) > 0;
          const stars  = this.cops.starDisplay ?? this.cops.stars ?? 0;
          if (onTime) {
            const mul   = Difficulty.onTimeBonusMul();
            const bonus = Math.round(this.score * (mul - 1));
            if (bonus > 0) { this.score += bonus; this.stats?.recordEarn(bonus, 'completionBonus'); }
            this._showPopup(`🎉 YOU MADE IT!\n+$${bonus.toLocaleString()} bonus`, '#FFEE00');
            AchievementSystem.award('on_time', this.registry);
          } else if (stars >= 5) {
            // Technical loss path — _endGame branches on cause==='busted_late'.
            this._showPopup('🚓 TOO LATE — BUSTED!\nTechnical loss.', '#FF3344');
            this._endGame('busted_late');
            return;
          } else {
            this._showPopup('😞 TOO LATE\nNo bonus.', '#FF6622');
          }
          // ── Pullman-finish achievements ───────────────────────────
          const sober      = !Object.values(this.drugs.pickupCounts ?? {}).some(c => (c ?? 0) > 0);
          const cleanRun   = !this._everHitStars;
          const noStops    = !this._everUsedRestStop;
          const noDamage   = (this.damage?.getDurability?.() ?? 0) >= 100
                             && this._noDamageTimer >= (this.gameTime ?? 0) - 0.5;
          if (sober)    AchievementSystem.award('stone_cold_sober', this.registry);
          if (cleanRun) AchievementSystem.award('crystal_clean', this.registry);
          if (noStops)  AchievementSystem.award('iron_bladder', this.registry);
          if (noDamage) AchievementSystem.award('untouchable_run', this.registry);
          if (sober && cleanRun && noStops) {
            AchievementSystem.award('trifecta', this.registry);
          }
          // ── The Crush — party payoff ──────────────────────────────
          // No per-text cash; THIS is her reward.  Arrive still together
          // (not gone, and you texted at least once) → she's waiting at the
          // party.  Otherwise she found someone else.
          {
            const _gs = this.registry.get('save');
            const _gGone  = _gs?.get?.('girlGone', false) === true;
            const _gTexts = _gs?.get?.('girlTexts', 0) ?? 0;
            if (!_gGone && _gTexts > 0) {
              this.score += GIRL_PARTY_BONUS;
              this.stats?.recordEarn(GIRL_PARTY_BONUS, 'girlParty');
              this._showPopup(`💕 They're waiting at the party!\n+$${GIRL_PARTY_BONUS.toLocaleString()}`, '#FF88CC');
            } else if (_gGone) {
              this._showPopup('💔 They found someone else.', '#FF6688');
            }
          }
          // Play the park-in-front-of-the-house cinematic, THEN Game Over.
          // (The bonus/achievements above are already applied; _finishCause
          // is the cause the cinematic hands to _endGame once parked.)
          this._finishCinematic = true;
          this._finishCineT     = 0;
          this._finishCineEnded = false;
          this._finishCause     = onTime ? 'finish_on_time' : 'finish_late';
          return;
        }
        // Entering a new town — the Crush expects a text each town.
        this._girlOnNewTown();
        this._showPopup(`CHECKPOINT!\n${cp.name}`, '#00FF88');
      }
    }

    // ── Rest stop window detection ────────────────────────────────────
    // Player is "in the rest-stop approach window" from −0.5 mi to +0.3 mi
    // around each stop — i.e. they can only take the exit once they're at
    // least HALFWAY down the 1-mile off-ramp (which tapers from −1 mi to
    // the exit point).  Earlier than that the ramp is barely a shoulder
    // and the take-exit prompt is misleading.  While in the window, we
    // show a tappable EXIT prompt; if the player swerves onto the right
    // shoulder (player.x > 1.5) OR taps the prompt, we take the exit and
    // switch to RestStopScene.
    if (!this._passedRestStops) this._passedRestStops = new Set();
    const winBefore = 0.5 / TOTAL_ROUTE_MILES;
    const winAfter  = 0.3 / TOTAL_ROUTE_MILES;
    let activeStop = null;
    for (const rs of REST_STOPS) {
      if (this._passedRestStops.has(rs.id)) continue;
      if (progress > rs.t + winAfter) {
        // Drove past without stopping — mark missed so we don't re-prompt.
        this._passedRestStops.add(rs.id);
        continue;
      }
      if (progress >= rs.t - winBefore && progress <= rs.t + winAfter) {
        activeStop = rs;
        break;
      }
    }
    this._activeRestStop = activeStop;
    if (activeStop) {
      // Pull-over fires when the player makes a clear right swerve onto
      // the off-ramp (x > 1.5) OR taps the on-screen TAKE EXIT chip.
      // Restored from the wide-open 1.0 threshold which was letting the
      // player "exit" mid-bridge into Lake Washington before Bellevue.
      // Water/bridge segments suppress the trigger entirely so guardrails
      // can do their job.
      const seg = this.road.getSegment(this.player.position);
      if (!seg?.water) {
        const wantExit = this._touchExitArmed || this.player.x > 1.5;
        if (wantExit) {
          this._touchExitArmed = false;
          this._takeRestStopExit(activeStop);
          return;
        }
      }
    }

    // ── Region crossing ───────────────────────────────────────────────
    const region = this._regionIndex(progress);
    if (region !== this._prevRegion) {
      this._prevRegion = region;
      this.cops.clearStarsAtStateLine();
      const dropped  = this.cops._lastStateLineReduction ?? 1;
      const key      = REGION_ORDER[region]?.key ?? '';
      const display  = REGION_PALETTES[key]?.name ?? key.replace(/_/g, ' ');
      const subtitle = dropped > 0
        ? `Stars −${dropped}`
        : '🚁 Chopper still on you — buy a paint job!';
      this._showPopup(`NOW ENTERING\n${display.toUpperCase()}!\n${subtitle}`, '#44FF88');
    }

    // ── Explosions / wrecks / gunshot stars timer ─────────────────────
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const fx = this.explosions[i];
      fx.timer += rawDt;
      // Wrecks drift laterally and spin while alive.
      if (fx.kind === 'wreck') {
        fx.sx        += (fx.lateralV ?? 0) * rawDt;
        fx.rotation   = (fx.rotation ?? 0) + (fx.spinV ?? 0) * rawDt;
      }
      if (fx.timer >= fx.maxTimer) {
        // Destroy any Phaser Image attached to a wreck so it doesn't
        // leak into the scene's display list.
        if (fx.img?.destroy) fx.img.destroy();
        this.explosions.splice(i, 1);
      }
    }

    // ── Popup timer ───────────────────────────────────────────────────
    if (this.popupTimer > 0) this.popupTimer -= rawDt;

    // ── Drug unlock announcements ─────────────────────────────────────
    let newUnlock = false;
    for (const id of Object.values(DRUGS)) {
      if (this.drugs.isUnlocked(id) && !DRUG_CONFIG[id].unlocked && !this._announcedUnlocks[id]) {
        this._announcedUnlocks[id] = true;
        newUnlock = true;
        this._showPopup(`UNLOCKED:\n${DRUG_CONFIG[id].label}!`, '#FF44FF');
      }
    }
    // Persist unlock state across arrests/respawns within this play session
    // (Phaser registry survives scene restarts).  Cleared by a fresh "new
    // game" from the menu — see MenuScene.
    if (newUnlock) this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks?.());
    // Persist partial-unlock progress every frame — cheap, and ensures
    // meth Phase 1 survives a rest stop / arrest mid-gate.
    if (this.drugs.snapshotProgress) {
      this.registry.set('drugProgress', this.drugs.snapshotProgress());
    }

    // ── Accel pedal charge ────────────────────────────────────────────
    // 5 min full → 0 when held, 20 min 0 → full when released.  Hits
    // 0 → boost auto-toggles off so the pedal visual matches state.
    {
      const ACCEL_DRAIN_PER_SEC  = 100 / (5 * 60);
      const ACCEL_REFILL_PER_SEC = 100 / (20 * 60);
      if (this._isBoost()) {
        this._accelCharge = Math.max(0, (this._accelCharge ?? 100) - ACCEL_DRAIN_PER_SEC * rawDt);
        if (this._accelCharge <= 0 && this._touchBoost) {
          this._touchBoost = false;
          this._refreshPedals?.();
        }
      } else if ((this._accelCharge ?? 100) < 100) {
        this._accelCharge = Math.min(100, (this._accelCharge ?? 0) + ACCEL_REFILL_PER_SEC * rawDt);
      }
    }

    // Handedness live-mirror — when the iPhone-menu hand button flips
    // _leftHanded mid-run, the mirror-adjacent readout clusters need
    // their x + origin re-applied so they swap sides with the rest of
    // the HUD.  Only fires when the flag actually changes so we don't
    // touch Phaser display state every frame.
    if (this._appliedLeftHanded !== this._leftHanded) {
      const lh  = !!this._leftHanded;
      const mx_  = (x) => lh ? (SCREEN_W - x) : x;
      const mox_ = (o) => lh ? (1 - o) : o;
      const READOUT_LEFT_X_  = SCREEN_W / 2 - 130 - 6;
      const READOUT_RIGHT_X_ = SCREEN_W / 2 + 130 + 6;
      const READOUT_LEFT_MULT_X_ = READOUT_LEFT_X_ - 60;
      // LEFT cluster: Timer, Mult, Cash, HP, HPDamage (right-aligned in base coords).
      if (this.hudPartyClock) { this.hudPartyClock.x = mx_(READOUT_LEFT_X_);      this.hudPartyClock.setOrigin(mox_(1), 0); }
      if (this.hudMult)       { this.hudMult.x       = mx_(READOUT_LEFT_MULT_X_); this.hudMult.setOrigin(mox_(1), 0); }
      if (this.hudScore)      { this.hudScore.x      = mx_(READOUT_LEFT_X_);      this.hudScore.setOrigin(mox_(1), 0); }
      if (this.hudHP)         { this.hudHP.x         = mx_(READOUT_LEFT_X_);      this.hudHP.setOrigin(mox_(1), 0); }
      if (this.hudHPDamage)   { this.hudHPDamage.setOrigin(mox_(1), 0); }
      // RIGHT cluster: Speed, MPH, Gas (left-aligned in base coords).
      if (this.hudSpeed)      { this.hudSpeed.x      = mx_(READOUT_RIGHT_X_);     this.hudSpeed.setOrigin(mox_(0), 0); }
      if (this.hudGas)        { this.hudGas.x        = mx_(READOUT_RIGHT_X_);     this.hudGas.setOrigin(mox_(0), 0); }
      this._applyTopRowHandedness?.();
      this._applyPedalHandedness?.();
      this._appliedLeftHanded = this._leftHanded;
    }

    // ── Sink animation (water dunk) ───────────────────────────────────
    // Runs AFTER _renderFrame() resets the player sprite each frame, so
    // setCrop sticks.  Handled below in _updateSinkAnim().
    this._updateSinkAnim?.();

    // ── Render ────────────────────────────────────────────────────────
    this._renderFrame();
    this._renderHUD();
    // Apply sink crop AFTER render — the renderer rewrites playerSprite
    // size/position each frame, so the crop has to land last.
    this._applySinkCrop?.();
  }

  /** Sinking-into-water animation.  Phase progresses:
   *    0.0 – 0.33  tires submerge (bottom 25 % of car hidden)
   *    0.33 – 0.66 lower half submerges (bottom 50 % hidden)
   *    0.66 – 1.0  top submerges (everything hidden)
   *  When complete, applies -10 HP, warps the car back to road center,
   *  and starts the 1.5 s splash cooldown. */
  _updateSinkAnim() {
    if (!this._sinkState) return;
    const now = this.time.now;
    const progress = Math.min(1, (now - this._sinkState.t0) / this._sinkState.dur);
    this._sinkProgress = progress;
    if (progress >= 1) {
      // Complete the dunk — apply damage + warp + reset crop.
      const _ivu = this._invincibleUntil;
      this._invincibleUntil = 0;
      this._applyDamage(10, 'water_dunk');
      this._invincibleUntil = _ivu;
      const p = this.player;
      p.x             = 0;
      p.steerVelocity = 0;
      p.xImpulse      = 0;
      p.speed         = MAX_SPEED * 0.20;
      this._waterDunkCooldown = 1.5;
      this._sinkState    = null;
      this._sinkProgress = 0;
      // Clear the crop next frame.
      if (this.playerSprite) {
        this.playerSprite.setCrop();
        this.playerSprite.isCropped = false;
      }
    }
  }

  /** Apply the per-frame sink crop to the player sprite.  Run AFTER the
   *  scene renderer resets sprite size/position so the crop sticks.
   *
   *  Crop the BOTTOM (1 - prog) of the texture out — the submerged
   *  part — and shift the sprite DOWN by prog × displayHeight so the
   *  remaining visible portion keeps its BOTTOM at the original water
   *  line.  Result: tires submerge first, then lower body, then top. */
  _applySinkCrop() {
    if (!this.playerSprite) return;
    const prog = this._sinkProgress ?? 0;
    if (prog <= 0) return;
    const tex = this.textures.get(this.playerSprite.texture.key)?.source?.[0];
    if (!tex) return;
    const texW = tex.width;
    const texH = tex.height;
    const visibleH = Math.max(0, texH * (1 - prog));
    this.playerSprite.setCrop(0, 0, texW, visibleH);
    // Shift sprite down so the visible portion's bottom stays at the
    // original road/water plane.  Without this, the cropped sprite
    // would appear to "fly up" instead of sinking.
    this.playerSprite.y += this.playerSprite.displayHeight * prog;
  }

  // ─── Player movement ──────────────────────────────────────────────────
  _updatePlayer(dt, phys) {
    const p = this.player;

    // Speed: cruise at the vehicle's topMph; boost adds vehicle.boostMph
    // on top.  Cocaine + meth pickups raise both cruise + boost by 4 mph
    // each.  NOS tier (per-vehicle accessory) adds +5 mph per tier.
    // Pass-3 change: cruise / boost are now PER-VEHICLE instead of
    // hardcoded 120 / 140 — sports cars cruise faster, trucks slower.
    const _vehSpec  = VEHICLES[this.player.vehicleId] ?? VEHICLES.beater;
    const cokeBonus = this.drugs.getCocaineSpeedBonusMPH?.() ?? 0;
    const methBonus = this.drugs.getMethSpeedBonusMPH?.() ?? 0;
    const nosTier   = this._vehicleAccessories?.().nos ?? 0;
    const nosBonus  = nosTier * 5;
    const cruiseMph = _vehSpec.topMph + cokeBonus + methBonus + nosBonus;
    const boostMph  = _vehSpec.topMph + (_vehSpec.boostMph ?? 20) + cokeBonus + methBonus + nosBonus;
    const slowMph   = 60;
    const mphToUnits = (mph) => MAX_SPEED * (mph / 120);

    let targetSpeed;
    // Brake wins over accel when both are held — the safer behavior
    // when the player is panic-mashing.  (Touch pedals are mutually
    // exclusive at the toggle layer, so this priority only matters for
    // keyboard up+down held together.)
    // Tilt mode = analog: throttle (forward tilt) lerps cruise→boost,
    // brake (back tilt) lerps cruise→slow.  Brake still wins.  Falls
    // back to the discrete keyboard/button path when tilt isn't
    // attached (permission denied, desktop without orientation, etc.)
    // so the player still has controls.
    const _tiltOn   = (this._steeringMode?.() === 'tilt') && this._tiltAttached;
    const _tiltThr  = _tiltOn ? (this._tiltThrottle ?? 0) : 0;
    const _tiltBrk  = _tiltOn ? (this._tiltBrake    ?? 0) : 0;
    if (_tiltOn && (_tiltThr > 0 || _tiltBrk > 0)) {
      if (_tiltBrk > 0) {
        targetSpeed = mphToUnits(cruiseMph * (1 - _tiltBrk) + slowMph * _tiltBrk);
      } else {
        targetSpeed = mphToUnits(cruiseMph * (1 - _tiltThr) + boostMph * _tiltThr);
      }
    } else if (this._isBrake()) targetSpeed = mphToUnits(slowMph);
    else if (this._isBoost())   targetSpeed = mphToUnits(boostMph);
    else                        targetSpeed = mphToUnits(cruiseMph);

    targetSpeed *= phys.speedMult;
    // Heroin nod-cycle throttle sag — driver eases off the pedal during
    // each nod peak, then back on as they lift.  Subtle (max 25%).
    targetSpeed *= 1 - (phys.nodAmount ?? 0) * 0.25;
    // Microsleep — bigger throttle drop (foot off) at peak + high dose.
    if (phys.microsleep) targetSpeed *= 0.60;

    // Out of gas — coast to 0.  Multiplies targetSpeed by 0 so the
    // BRAKE/ACCEL ramp brings the car down at its normal deceleration.
    // Empty-tank stall — skipped in custom mode (no gas requirement).
    if (Difficulty.mode?.() !== 'custom' && this.player.gasMi <= 0) targetSpeed = 0;

    // Grade physics — subtle climb/descent effect on top speed.  Uphill
    // shaves a few mph off the cruise; downhill adds a few.  Uses the
    // real-world gradePct (e.g., 0.06 = 6 % grade) so the I-90 climb up
    // Snoqualmie and the Ryegrass→Vantage drop both feel right.
    const curSegIdx = Math.floor(p.position / SEG_LENGTH) % this.road.segments.length;
    const curGrade  = this.road.segments[curSegIdx]?.gradePct ?? 0;
    // Gain 2.0 → 6% climb costs 12 % top speed (≈ 14 mph drop at 120
    // cruise); 5% descent gives +10 %.  Clamp so micro-noise can't
    // swing speed by more than ±15 %.
    const gradeMult = Math.max(0.85, Math.min(1.15, 1 - curGrade * 2.0));
    targetSpeed *= gradeMult;

    // ── Speed-trap auto-stop assist (0★ civil stop) ───────────────────────
    // Cruise braking floors at 60 mph, so the player can't reach a stop on
    // their own — without this, "pull over" is impossible.  During a trap
    // pursuit, steering onto the right shoulder (x > SHOULDER_X) while braking
    // COMMITS to the stop; the car then eases to 0.  Once stopped the comply
    // logic flips to `_trapStopHeld`, which PINS the car at 0 for the whole
    // 30s traffic stop (so it doesn't "almost stop then drive off").  Steer
    // back inside ABORT_X (or hit a bridge/tunnel/water seg) before you've
    // stopped and it releases — you can still flee, but the timer keeps
    // ticking toward +1★.  A held stop cannot be aborted (you're pulled over).
    if (this._trapPursuitActive) {
      const _seg     = this.road.segments[curSegIdx];
      const _safeSeg = !_seg?.bridge && !_seg?.tunnel && !_seg?.water;
      if (!this._trapStopping && _safeSeg && this._isBrake() && p.x > COP_TRAP_SHOULDER_X) {
        this._trapStopping = true;
      }
      if (this._trapStopping && (!_safeSeg || p.x < COP_TRAP_ABORT_X)) {
        this._trapStopping = false;     // left the shoulder / unsafe ground → abort
      }
      if (this._trapStopping) targetSpeed = 0;   // ease to a halt
    } else if (this._trapStopping) {
      this._trapStopping = false;
    }
    if (this._trapStopHeld) targetSpeed = 0;      // pinned for the held traffic stop
    if (this._finishCinematic) targetSpeed = 0;   // finish cinematic — ease to a stop at the house

    // Flat tire from roadblock — hard-cap top speed to 45 mph until timer ends.
    if (this._flatTireTimer > 0) {
      this._flatTireTimer = Math.max(0, this._flatTireTimer - dt);
      const flatCap = mphToUnits(45);
      if (targetSpeed > flatCap) targetSpeed = flatCap;
    }

    // Bush stuck-on-car — when the player sideswipes a shrub, the bush
    // catches on the chassis and slows the car to 40 mph for 3 s before
    // tumbling off.  Same shape as the flat-tire cap.  Triggered in
    // _sceneryGlance for shrub-type scenery.
    if ((this._bushStuckUntil ?? 0) > (this.time?.now ?? 0)) {
      const bushCap = mphToUnits(40);
      if (targetSpeed > bushCap) targetSpeed = bushCap;
    }

    // Crash-recovery auto-pilot — during the i-frame blink that follows
    // a scenery or head-on crash, the first ~1 s keeps the car frozen
    // at 0 mph (handled below), then this branch drives the car toward
    // a 60 mph rolling re-entry regardless of input for the rest of
    // the blink.  Steering re-enables once the ramp starts (see
    // `_rollPhase` near the steering input block).
    {
      const _nowAP = this.time?.now ?? 0;
      const _crUntil = this._crashRecoveryUntil ?? 0;
      const _crRoll  = this._crashRollStartAt ?? 0;
      if (_nowAP < _crUntil && _nowAP >= _crRoll) {
        targetSpeed = mphToUnits(60);
      }
    }

    if (p.speed < targetSpeed) {
      // Weed (when alone) reduces ACCEL — slower throttle response.
      p.speed = Math.min(targetSpeed, p.speed + ACCEL * (phys.accelMul ?? 1) * dt * 60);
    } else if (p.speed > targetSpeed) {
      // Brake decel scales with weather grip — wet/snowy roads lengthen
      // the stopping distance.  Quick local peek at Weather so the
      // braking math doesn't depend on the grip block farther down.
      const _mileNow = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const _wState  = Weather.state?.(_mileNow);
      const _wInten  = Weather.intensity?.(_mileNow) ?? 0;
      // Brake decel also scales with severity — wet/icy roads at peak
      // storm need significantly more stopping distance.
      const _wSev = Weather.severity?.(_mileNow) ?? 1;
      let brakeGrip = 1;
      if (_wState === 'rain') brakeGrip = 1 - 0.25 * _wInten * _wSev;
      if (_wState === 'snow') brakeGrip = 1 - 0.45 * _wInten * _wSev;
      brakeGrip = Math.max(0.20, brakeGrip);   // floor so brake never fully fails
      p.speed = Math.max(targetSpeed, p.speed - BRAKE * brakeGrip * dt * 60);
    }

    // Steering with momentum — ramps to full turn speed in ~0.12s, bleeds off in ~0.45s
    // Flappy mode: car always pulls FULL LEFT unless the action input
    // (right key / tap / space) is held — in which case it swings full
    // right.  Left input is ignored.  Same magnitude both ways, same
    // activeTau ramp as classic, so the swing feels equally fast.
    //
    // Three cases zero out the steering input (steerIn = 0):
    //   • Crash i-frame window — sprite blinks, road frozen, no input.
    //   • Pre-first-tap "ready" state — fresh-game intro, car drives
    //     STRAIGHT and the timer is paused until the player taps.
    //   • Steer-lock-until-tap — checkpoint resumes, car drives
    //     straight but the timer runs from scene load.
    const _now          = this.time?.now ?? 0;
    const _iframeActive = _now < this._invincibleUntil;
    // Once the rolling-start ramp begins (1 s into crash recovery),
    // the player gets steering back even though the blink is still
    // running.  Lets them aim the car as it accelerates back to 60 mph.
    const _rollPhase    = _iframeActive
                       && (this._crashRollStartAt ?? 0) > 0
                       && _now >= (this._crashRollStartAt ?? 0);
    const _readyState   = !!this._awaitingFirstGameTap;
    const _steerLocked  = !!this._steerLockUntilTap;
    const _mode = this._activeSteeringMode();
    let steerIn;
    if ((_iframeActive && !_rollPhase) || _readyState || _steerLocked || this._trapStopHeld) {
      // Steering fully disabled while held for a traffic stop — no input.
      steerIn = 0;
    } else if (_mode === 'flappy') {
      steerIn = (this._isRight() ? 1 : -1);
    } else if (_mode === 'tilt') {
      // Analog: proportional to tilt angle.  Keyboard arrows still
      // hard-override to ±1 so desktop testing keeps working.
      const k = (!!this.cursors?.left.isDown || !!this.wasd?.left.isDown)  ? -1
              : (!!this.cursors?.right.isDown|| !!this.wasd?.right.isDown) ?  1
              : 0;
      steerIn = k !== 0 ? k : (this._tiltSteerAmt ?? 0);
    } else {
      steerIn = (this._isLeft() ? -1 : this._isRight() ? 1 : 0);
    }
    const steerDir = phys.invertSteering ? -steerIn : steerIn;

    // Pass-1 snow-lockout removed in pass 2.  Steering input is never
    // overridden by weather anymore — grip handles the "slippery" feel
    // via slower lateralVelocity settling.  The only weather-driven
    // input event left is a rare ICE PATCH slip (initialised below in
    // the grip block) which briefly drops grip without disabling input.
    const _mileForSnow = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const _inSnow = Weather.isSnow(_mileForSnow);
    let effectiveSteerDir = steerDir;

    // ── Alcohol overcorrection holdover ──────────────────────────
    // Layered AFTER snow slip (snow takes priority — if snow already
    // overrode effectiveSteerDir we won't do it again).  When the
    // player releases input and alcoholHoldover > 0, keep steering in
    // the last committed direction for 0.3-0.5s scaled by hold level
    // before the bleed-off resumes.  Drunk drivers overshoot — this is
    // the input layer of that feel.
    const alcHold = phys.alcoholHoldover ?? 0;
    if (!_inSnow && alcHold > 0.05) {
      // Hold-direction duration in seconds.  Halved vs the original
      // (0.30 + 0.40*hold) so 4-beer drift doesn't span multiple lanes.
      const alcMaxBase = 0.12 + alcHold * 0.25;
      if (steerDir !== 0) {
        this._alcHoldDir   = steerDir;
        this._alcHoldTimer = 0;
        this._alcHoldMax   = alcMaxBase;
      } else if (this._alcHoldDir
              && (this._alcHoldTimer ?? 0) < (this._alcHoldMax ?? 0)) {
        effectiveSteerDir  = this._alcHoldDir;
        this._alcHoldTimer = (this._alcHoldTimer ?? 0) + dt;
      } else {
        this._alcHoldDir   = 0;
        this._alcHoldTimer = 0;
      }
    } else {
      this._alcHoldDir   = 0;
      this._alcHoldTimer = 0;
    }

    // ── Vantage crosswind ───────────────────────────────────────────
    // A LEFTWARD pull that ramps with wind strength (mile 131->137 up,
    // full to 177, down by 183) — it feels like the left arrow is stuck.
    // Steering RIGHT completely overtakes it (full right turning power,
    // same as before the wind); the pull only applies when the player
    // ISN'T actively steering right (so doing nothing drifts left, and
    // holding left just makes it worse).  Applied AFTER player input +
    // alcohol, and NOT flipped by drunk invertSteering — the wind blows
    // the same way no matter how scrambled the controls are.
    const _windPull = this._windStrength(_mileForSnow) * 0.9;
    if (_windPull > 0) {
      this._windActive = true;     // for tree sway / tumbleweeds
      if (effectiveSteerDir <= 0.01) {
        effectiveSteerDir = Math.max(-1, effectiveSteerDir - _windPull);
      }
      // else: right input wins outright — leave it at full right power.
    } else {
      this._windActive = false;
    }

    // ── Snow wander — coast the player into smooth analog / tilt steering ──
    // The snow analog of the Vantage wind.  Instead of a constant one-way
    // pull (which rewards rhythmic TAPS), snow adds a slow side-to-side DRIFT
    // the player must continuously counter-steer.  Paired with snow's low
    // grip (slow lateral settle, computed below), digital taps overshoot and
    // fishtail while a smooth analog LEAN (tilt) holds the line — the snow
    // analog of wind→tap is snow→tilt.  Ramps in over 3 mi (40→43) so it
    // builds as the player enters the Cascades, eases out with the snow
    // (86→88).  Applied after player input + wind, and NOT flipped by drunk
    // invertSteering — the road is icy the same way no matter how scrambled
    // the controls are.  SNOW_DRIFT_MAX is the tuning knob for how strong the
    // wander feels (steer-units, 1 = full lock).
    const _snowRamp = this._snowSteerRamp(_mileForSnow);
    if (_snowRamp > 0) {
      const _t = (this.time?.now ?? 0) * 0.001;
      // Two detuned sines → a slow, non-repeating wander (not a metronome).
      const wander = (Math.sin(_t * 0.62) + 0.5 * Math.sin(_t * 0.27 + 1.3)) / 1.5;
      const SNOW_DRIFT_MAX = 0.40;
      effectiveSteerDir = Math.max(-1, Math.min(1,
        effectiveSteerDir + wander * SNOW_DRIFT_MAX * _snowRamp));
    }

    // ── Grip-based lateral-velocity model (pass-1 driving overhaul) ──
    // Replaces the old "lerp steerVelocity toward target then add it to
    // x" snap with a tire-grip simulation:
    //
    //   1. Steering input + drugs produce a DESIRED lateral velocity
    //      (where the driver wants the car to go).
    //   2. Tire grip pulls the car's ACTUAL lateral velocity toward
    //      the desired, at a rate proportional to grip.
    //   3. Curve push, drug drift, microsleep all add to lateral
    //      velocity directly (impulses) — grip then drags those back.
    //   4. Position integrates from lateral velocity.
    //
    // The field is still called `steerVelocity` so the ~15 wall-bounce
    // and reset callers don't need migration; semantically it's now
    // the car's lateral velocity in lane-units / sec.
    //
    // Pass 1 deliberately uses ONLY the Used Sedan's baseline grip
    // (1.0 across the board).  Per-vehicle handling, weather-tuned
    // grip changes, and skid FX all come in passes 2-4.

    // ── Pass-2 weather + terrain grip ─────────────────────────────────
    //
    // Two stacked grip sources, both reduce traction in the same way
    // (slower lateral-velocity settle, more pronounced curve push):
    //
    //   WEATHER  → rain trims 15 %, snow chops 35 % at full intensity;
    //              4x4 + traction tires reduce these slide penalties.
    //   TERRAIN  → fog-line (|x|>1.0) starts costing grip the moment
    //              the player crosses the white stripe.  Rumble strip,
    //              grass, deep off-road each get harder to recover from.
    //
    // Plus an occasional ICE PATCH event on snow zones: ~6 %/sec roll
    // drops grip to 0.30 for ~0.35 s and gives the player a small,
    // recoverable slip.  Does NOT lock steering input (that was the
    // pass-1 mechanic the user wanted gone).
    const _mileForGrip = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;

    // WEATHER grip — rain -25 / snow -45 base, multiplied by Weather
    // .severity() which ramps 1.0 → 2.4 across each window per user spec
    // ("140 % worse at the end").  Storms build progressively so the
    // back half of each weather zone is genuinely punishing.
    const wState = Weather.state?.(_mileForGrip);
    const wInten = Weather.intensity?.(_mileForGrip) ?? 0;
    const wSev   = Weather.severity?.(_mileForGrip) ?? 1;
    let weatherSlide = 0;
    if (wState === 'rain') weatherSlide = 0.25 * wInten * wSev;
    if (wState === 'snow') weatherSlide = 0.45 * wInten * wSev;
    // Clamp so severity ramp can't push slide past total grip loss.
    weatherSlide = Math.min(0.92, weatherSlide);
    // ── Snow steering FEEL by input mode (per user 2026-06-06) ──────────
    // TILT tames the ice: cancel most of the snow slide so smooth analog
    // lean holds an almost-perfect line.  A small residual remains (so it's
    // "almost", not "perfect") — the 4x4 + snow-tire (traction) penReduction
    // below then closes that gap toward perfect, which is the intended
    // upgrade headroom.  Digital modes get NO grip relief here AND an
    // oversensitivity boost at desiredLateral, so L/R + tap feel twitchy and
    // jarring on snow → players coast to tilt.
    if (wState === 'snow' && _mode === 'tilt') {
      const TILT_SNOW_TAME = 0.70;   // tilt cancels up to 70% of the snow slide
      weatherSlide *= (1 - TILT_SNOW_TAME * _snowRamp);
    }
    const _is4x4   = VEHICLES[this.player.vehicleId]?.drive === '4x4';
    const _hasTrac = !!(this._vehicleAccessories?.().traction);
    const penReduction = Math.min(1, (_is4x4 ? 0.60 : 0) + (_hasTrac ? 0.40 : 0));
    const weatherGrip = 1 - weatherSlide * (1 - penReduction);

    // TERRAIN grip — based on how far off the painted road the car is.
    // Bands: ≤1.0 on road, 1.0–1.06 rumble strip, 1.06–1.5 grass / dirt,
    // >1.5 deep off-road.  Off-road bleed damage is separate (see the
    // _applyDamage('offroad_bleed') call elsewhere).
    // Pass-3: scale OFF-ROAD bands by vehicle.offroadGrip so an SUV
    // (1.25) handles grass much better than a Sports Car (0.65).
    // On-road (≤1.0) is unaffected — vehicle.grip handles dry-pavement.
    const _ax = Math.abs(this.player.x);
    const _orGrip = _vehSpec.offroadGrip ?? 1.0;
    let terrainGrip;
    if      (_ax <= 1.00) terrainGrip = 1.00;
    else if (_ax <= 1.06) terrainGrip = 0.92 * _orGrip;   // rumble strip
    else if (_ax <= 1.50) terrainGrip = 0.65 * _orGrip;   // grass / shoulder
    else                  terrainGrip = 0.45 * _orGrip;   // deep off-road
    // Clamp so a sports car can't have NEGATIVE grip in deep mud.
    terrainGrip = Math.max(0.20, Math.min(1.0, terrainGrip));

    // ICE PATCH slip — only fires in snow zones.  Random ~6 %/sec roll
    // arms a timer; while the timer is positive, grip is crushed (0.30)
    // so the next steering input feels late and the car drifts a bit.
    // Replaces the old _slipDir input-lockout mechanic.
    if (_inSnow && wInten > 0.2 && (this._iceSlipTimer ?? 0) <= 0) {
      if (Math.random() < 0.06 * dt * 60) {
        this._iceSlipTimer = 0.25 + Math.random() * 0.20;   // 0.25–0.45 s
      }
    }
    if ((this._iceSlipTimer ?? 0) > 0) this._iceSlipTimer -= dt;
    const iceSlipFactor = (this._iceSlipTimer ?? 0) > 0 ? 0.30 : 1.00;

    const surfaceGrip = weatherGrip * terrainGrip * iceSlipFactor;
    const slipMul     = 1 + (1 - surfaceGrip) * 1.5;

    // Speed-grip falloff: tires get nervous near top speed.  At cruise
    // (speedRatio ~0.86 vs boost top) penalty is ~15 %; at full boost
    // it's ~18 %.  Forgiving at low speed, twitchy when flying.
    const _boostTopUnits = mphToUnits(boostMph);
    const speedRatio     = Math.max(0, Math.min(1.05, p.speed / Math.max(1, _boostTopUnits)));
    const speedGripPen   = 1 - speedRatio * 0.18;

    // Brake-in-turn → controlled skid: holding brake while steering
    // costs ~30 % of grip, so the rear breaks loose a bit and the
    // turn over-rotates briefly before settling.
    const _brakingHard = !!this._isBrake?.();
    const brakeInTurnPen = (_brakingHard && Math.abs(effectiveSteerDir) > 0.1) ? 0.70 : 1;

    // Per-vehicle handling stats (pass-3).  Sedan baseline = 1.0 for
    // every field.  Sports cars have high grip + sharp turnRate but
    // poor stability and terrible offroad.  Trucks lower grip + slow
    // turnRate but high stability + great offroad.  See VEHICLES table.
    const vehicleGrip      = _vehSpec.grip      ?? 1.0;
    const vehicleTurnRate  = _vehSpec.turnRate  ?? 1.0;
    const vehicleStability = _vehSpec.stability ?? 1.0;

    const grip = vehicleGrip * surfaceGrip * speedGripPen * brakeInTurnPen;

    // Desired lateral velocity from the driver's intent.  Snow slip +
    // alcoholHoldover already baked into effectiveSteerDir above.
    // DIGITAL snow oversensitivity (per user): on snow, L/R + tap throw the
    // car harder so a press overcorrects on the low-grip ice — jarring, to
    // push players toward smooth analog tilt.  It's a SENSITIVITY (not grip),
    // so car / snow-tire upgrades do NOT rescue digital — it stays jarring on
    // snow by design.  Tilt gets no boost (1×) and is tamed via grip above.
    const DIGITAL_SNOW_SENS = 1.2;   // up to +120% sensitivity at full snow
    const _snowSensMul = (wState === 'snow' && _mode !== 'tilt')
      ? 1 + DIGITAL_SNOW_SENS * _snowRamp
      : 1;
    const desiredLateral = effectiveSteerDir * TURN_SPEED
                         * (phys.steerSensitivity ?? 1)
                         * vehicleTurnRate
                         * _snowSensMul;

    // Heroin "input lag" — slows the settle in both directions.
    // steerReturnSlow further slows the release (when the driver isn't
    // holding any input).  Sober: both are 0, scaling = 1.
    const lagScale     = 1 / (1 + (phys.inputLag ?? 0));
    const releaseScale = effectiveSteerDir === 0
                         ? 1 / (1 + (phys.steerReturnSlow ?? 0))
                         : 1;
    // Base settle rate 8 (per the user's pseudocode) → ~63 % toward
    // target in 0.12 s at full grip.  Slower than the old lerp's
    // snap-y ~48 %/frame, which is the point.  Stability boosts the
    // settle rate (a planted truck snaps to its target lateral faster
    // even though it turns slowly overall — high stability = "doesn't
    // wander").  Sports cars sit < 1 here → nervous.
    const settleRate = 8 * lagScale * releaseScale * vehicleStability;

    // Tire grip pulls lateral velocity toward desired.
    // Capture the gap BEFORE updating — used below to detect a skid
    // (driver wants more lateral than the tires can deliver).
    const _slipGap = Math.abs(desiredLateral - p.steerVelocity);
    p.steerVelocity += (desiredLateral - p.steerVelocity) * grip * dt * settleRate;

    // Skid detection — the car is sliding when grip is poor AND the
    // wanted lateral exceeds what the tires are achieving by a wide
    // margin.  Used to drive a continuous haptic buzz (handhelds
    // vibrate during the slide) plus a flag any future skid-SFX
    // listener can read.
    const _skidding = (grip < 0.65 && _slipGap > 1.5)
                   || ((this._iceSlipTimer ?? 0) > 0 && Math.abs(p.steerVelocity) > 0.8);
    this._isSkidding = _skidding;
    if (_skidding) {
      this._skidHapticT = (this._skidHapticT ?? 0) + dt;
      if (this._skidHapticT > 0.15) {
        this._skidHapticT = 0;
        this.haptics?.pulse?.(2);
      }
    } else {
      this._skidHapticT = 0;
    }

    // Curve push — speed² so 60 mph is forgiving and 140 mph is
    // threatening.  Old code was linear in speed.  Stability divides
    // the curve push so heavy / planted vehicles (trucks, SUV) resist
    // being thrown wide; nervous vehicles (sports / roadster) get
    // thrown more.
    const seg         = this.road.getSegment(p.position);
    const curveAmount = (seg?.curve ?? 0)
                      * (0.35 + speedRatio * speedRatio * 1.25);
    const curvePush   = curveAmount * p.speed * CENTRIFUGAL * 0.001 / vehicleStability;
    p.steerVelocity += curvePush * dt * slipMul;

    // Drug drift (alcohol) + drug-induced extra curve flow through
    // lateral velocity as impulses — grip drags them back toward zero
    // over time, so a steady drunk drift becomes a fight against the
    // wheel rather than an instant lane jump.
    p.steerVelocity += (phys.steerDrift ?? 0) * dt;
    p.steerVelocity += (phys.extraCurve ?? 0) * p.speed * 0.001 * dt;

    // Microsleep — hands-off the wheel briefly: bleed lateral velocity
    // a little extra so the car drifts unsteered.
    if (phys.microsleep) p.steerVelocity *= 0.75;

    // Position at the END of last frame, BEFORE any movement this frame.
    // The water rail uses it to tell "on the road, steering into the rail"
    // (block it — a true hard wall, no matter how fast) apart from "already
    // deep in the lake, arrived off a non-railed land approach" (let it
    // sink, don't rescue).  This is what keeps the guardrail solid.
    const _preMoveX = p.x;

    // Integrate position from lateral velocity.
    p.x += p.steerVelocity * dt;

    // Finish cinematic — override steering: input is locked and the car eases
    // laterally toward the house (left, FINISH_PARK_X) while it rolls to a
    // stop.  Zeroing steerVelocity neutralizes any input the player feeds in.
    if (this._finishCinematic) {
      p.steerVelocity = 0;
      p.x += (FINISH_PARK_X - p.x) * Math.min(1, dt * FINISH_PARK_LERP);
    }

    // Lateral collision impulse (bounce from crash)
    if (p.xImpulse) {
      p.x        += p.xImpulse * dt;
      p.xImpulse *= Math.max(0, 1 - dt * 7);
      if (Math.abs(p.xImpulse) < 0.02) p.xImpulse = 0;
    }

    // ── Bridge guardrail clamp ──────────────────────────────────────
    // Plain `water` segments (bridge aprons, lake banks without a
    // physical railing) — no clamp.  The car is free to drift into the
    // water; the dunk safety net below catches it just past the shoulder
    // line, costs 10 HP, and warps the car back to road center.

    // waterLeft / waterRight banks have no physical rail — drifting
    // past the shoulder line into the water triggers the dunk
    // (handled by the safety net below).  The opposite-side shoulder
    // stays normal off-road grass.

    // ── Tunnel wall clamp ──────────────────────────────────────────
    // Inside the tunnel, concrete walls flank the road — the player
    // can't drive THROUGH them.  The visual tunnel now leaves a narrow
    // shoulder between fog line and wall, so the scrape rail sits just
    // beyond the lane edge instead of directly on top of the fog line.
    // Bridge / water clamp — same hard-rail behaviour as the tunnel.
    // The West Seattle Bridge has tall concrete railings on both sides;
    // you shouldn't be able to drive over them into the Duwamish.  Also
    // applies to bridge-APPROACH segments flagged `water: true` (no
    // land on the sides yet — the road is on a causeway over water),
    // otherwise the normal ±2.8 off-road clamp lets the player drift
    // off the causeway and float on the water surface.
    // Rail clamps on ANY water-adjacent segment — bridges, bridge
    // aprons, and one-sided waterLeft / waterRight banks all get a
    // real guardrail with 3 HP/sec scrape.  Sinking only triggers
    // if a violent impulse pushes the car PAST the rail (safety net
    // threshold below at DUNK_THRESH = 1.5).
    {
      const BRIDGE_RAIL = 0.95;
      // Only BRIDGES with an authored physical rail still snap-clamp
      // the car at ±0.95.  Plain water and one-sided water/lake
      // segments take damage but DO NOT snap — the car has to be
      // able to keep drifting outward so the dunk safety net below
      // can catch it.  The old snap pinned p.x at exactly 0.95, which
      // is below the 1.5 dunk threshold, so the sink could never fire
      // by drifting alone.
      // RAIL every water-adjacent segment so you can't just drive off into
      // the water — the bridge DECK, the causeway APPROACHES (water on both
      // sides), AND shoreline roads (waterLeft / waterRight, e.g. the West
      // Seattle start along Elliott Bay).  Casual drifting just scrapes the
      // rail and holds at ±0.95.  The dunk/sink below still fires if a
      // VIOLENT impulse (a crash / head-on) punches the car clean past the
      // rail into the water in a single frame — so you don't fall off by
      // drifting, but a crash can still knock you in and you sink.
      const onBridge         = !!seg?.bridge;
      const railsLeftSide    = onBridge || !!seg?.water || !!seg?.waterLeft;
      const railsRightSide   = onBridge || !!seg?.water || !!seg?.waterRight;
      const scrapeLeft       = railsLeftSide;
      const scrapeRight      = railsRightSide;
      // ── Guardrail = a SOLID hard wall ───────────────────────────────
      // If the car was on the road last frame (|_preMoveX| <= SINK_EDGE)
      // and tries to cross the rail this frame, it is BLOCKED — snapped
      // back to ±0.95 no matter how fast it was steering or how hard it was
      // hit.  There is no gap to slip through.  You cannot drive (or get
      // knocked) off a railed bridge.  This is the barrier, fully intact.
      //
      // The ONLY exception is a car that was ALREADY deep in the water last
      // frame (|_preMoveX| > SINK_EDGE) — that only happens by arriving off
      // a NON-railed land approach (e.g. driving off Mercer Island onto the
      // lake apron).  Such a car is genuinely in the lake, so the rail does
      // NOT yank it back ("replaced on the bridge"); it falls through to the
      // dunk below and SINKS.  The rail is never opened — it just doesn't
      // rescue a car that is already in the water.
      const SINK_EDGE = 1.15;   // keep equal to DUNK_THRESH below
      // Skip the rail entirely while mid-sink so it can't yank the sinking car.
      if (!this._sinkState) {
        if (railsRightSide && p.x > BRIDGE_RAIL && _preMoveX <= SINK_EDGE) {
          this._applyDamage(3 * dt, 'bridge_rail');
          p.x = BRIDGE_RAIL;
          p.steerVelocity = Math.min(0, p.steerVelocity) * 0.4;
          p.xImpulse = (p.xImpulse > 0 ? -p.xImpulse * 0.5 : p.xImpulse);
          p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
        } else if (railsLeftSide && p.x < -BRIDGE_RAIL && _preMoveX >= -SINK_EDGE) {
          this._applyDamage(3 * dt, 'bridge_rail');
          p.x = -BRIDGE_RAIL;
          p.steerVelocity = Math.max(0, p.steerVelocity) * 0.4;
          p.xImpulse = (p.xImpulse < 0 ? -p.xImpulse * 0.5 : p.xImpulse);
          p.speed    = Math.max(p.speed * 0.92, MAX_SPEED * 0.45);
        } else if (scrapeRight && p.x > BRIDGE_RAIL) {
          // Already deep in the water (arrived off a non-railed approach) —
          // not rescued; damage only, the dunk below sinks it.
          this._applyDamage(3 * dt, 'water_shoulder');
        } else if (scrapeLeft && p.x < -BRIDGE_RAIL) {
          this._applyDamage(3 * dt, 'water_shoulder');
        }
      }
    }

    // ── Roadside barriers (poles → fences → outer treeline) ───────────
    // Past mile 14 the road has long stretches where only trees border
    // the shoulder.  Without a hard outer wall a drug-blinking or
    // i-framed player could drift far off-road and stay there safely
    // (no NPCs / no cops out there).  Three concentric barriers, in
    // order of inner-to-outer:
    //
    //   ±2.35  utility pole — one-shot −10 HP + crash-recovery reset.
    //          1.5 s cooldown so the same pole only fires once.
    //   ±2.00  fence rail   — sustained −3 HP/sec while in contact.
    //          Bounces back toward road.
    //   ±5.50  treeline     — no damage; just a hard wall that kicks
    //          the car back toward the road, even mid-i-frame.
    //
    // _applyDamage already silently absorbs damage during the i-frame,
    // so the HP costs naturally stop while invincible — but the clamps
    // / bounces still apply, which is the whole point (the cheat was
    // walking through the tree line during the post-crash blink).
    {
      const _nowB    = this.time?.now ?? 0;
      const _mileNow = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      // Only FULL water/bridge segments (water on both sides) get the
      // dedicated bridge-rail treatment exclusively.  Segments with
      // waterLeft or waterRight only have one side covered by the rail
      // (at ±0.95); the OPPOSITE side has to keep the tree wall active
      // or the player can drift off freely there.  Vantage descent
      // showed this: waterRight tagged segments left the left/grass
      // side completely unprotected.
      const _isWaterSeg = !!(seg?.bridge || seg?.water);

      // 1) Utility pole — one-shot collision.
      const POLE_WALL = 2.35;
      const poleSide  = seg?.utilityLineSide ?? 0;
      if (poleSide && !_isWaterSeg && _nowB > (this._poleHitUntil ?? 0)) {
        const hit = (poleSide > 0 && p.x >  POLE_WALL)
                 || (poleSide < 0 && p.x < -POLE_WALL);
        if (hit) {
          this._applyDamage(10, 'utility_pole');
          this._showPopup?.('💥 UTILITY POLE', '#FF8800');
          this._poleHitUntil = _nowB + 1500;
          // Same crash-recovery handshake as scenery/head-on hits:
          // 2-second i-frame, 1-second hold at 0 mph, then rolling
          // start ramps back to 60 mph during the blink.
          this._invincibleUntil    = Math.max(this._invincibleUntil ?? 0, _nowB + 2000);
          this._crashRecoveryUntil = this._invincibleUntil;
          this._crashRollStartAt   = _nowB + 1000;
          this.player.speed        = 0;
          this.player.steerVelocity = 0;
          this.player.xImpulse     = 0;
          this.player.x            = poleSide * (POLE_WALL * 0.50);  // kick inward
        }
      }

      // 1b) Wind-sign pole — one-shot collision, identical model to the
      // utility pole but tagged separately so the popup reads correctly
      // and a future placement can use a different HP cost.  Currently
      // mirrors utility_pole (−10 HP, 1.5 s cooldown, crash recovery).
      const windPoleSide = seg?.windSignPoleSide ?? 0;
      if (windPoleSide && !_isWaterSeg && _nowB > (this._windPoleHitUntil ?? 0)) {
        const hit = (windPoleSide > 0 && p.x >  POLE_WALL)
                 || (windPoleSide < 0 && p.x < -POLE_WALL);
        if (hit) {
          this._applyDamage(10, 'wind_sign_pole');
          this._showPopup?.('💥 WIND SIGN POLE', '#FF8800');
          this._windPoleHitUntil   = _nowB + 1500;
          this._invincibleUntil    = Math.max(this._invincibleUntil ?? 0, _nowB + 2000);
          this._crashRecoveryUntil = this._invincibleUntil;
          this._crashRollStartAt   = _nowB + 1000;
          this.player.speed        = 0;
          this.player.steerVelocity = 0;
          this.player.xImpulse     = 0;
          this.player.x            = windPoleSide * (POLE_WALL * 0.50);
        }
      }

      // 2) Fence rail — sustained damage + bounce.
      const FENCE_WALL = 2.0;
      if (seg?.ruralFence && !_isWaterSeg) {
        if (p.x > FENCE_WALL) {
          this._applyDamage(3 * dt, 'fence_rail');
          p.x = FENCE_WALL;
          p.steerVelocity = Math.min(0, p.steerVelocity) * -0.5;
          p.xImpulse      = (p.xImpulse > 0 ? -p.xImpulse * 0.6 : p.xImpulse);
        } else if (p.x < -FENCE_WALL) {
          this._applyDamage(3 * dt, 'fence_rail');
          p.x = -FENCE_WALL;
          p.steerVelocity = Math.max(0, p.steerVelocity) * -0.5;
          p.xImpulse      = (p.xImpulse < 0 ? -p.xImpulse * 0.6 : p.xImpulse);
        }
      }

      // 3) Outer treeline wall — full crash: −10 HP, blink + roll
      // recovery, kicked back to the difficulty-appropriate lane.
      // Past mile 14 covers Issaquah through the finish.  Fires
      // regardless of segment type: bridge rail at ±0.95 fires first
      // on properly-tagged water segments and the tree wall at ±5.5
      // will simply never be reached.  Removing the water gate here
      // is a belt-and-suspenders catch for segments whose water flags
      // weren't set up correctly (e.g. Vantage descent where the user
      // could drive on grass past the road edge despite water on both
      // sides).  1.5 s cooldown via _treeHitUntil so the same drift
      // only fires once even if i-frame wears off while still next
      // to the line.
      const TREE_WALL = 5.5;
      if (_mileNow >= 14 && _nowB > (this._treeHitUntil ?? 0)) {
        const treeHit = p.x > TREE_WALL || p.x < -TREE_WALL;
        if (treeHit) {
          this._applyDamage(10, 'tree_wall');
          this._showPopup?.('🌲 OFF-ROAD CRASH', '#FF8800');
          this._treeHitUntil = _nowB + 1500;
          // Same crash-recovery handshake as pole / head-on: 2-second
          // i-frame, 1-second hold at 0 mph, then rolling start back to
          // 60 mph during the blink.  Lane reset uses the difficulty-
          // appropriate _postCrashLaneX so easy / hard recover into
          // their usual recovery lanes.
          this._invincibleUntil    = Math.max(this._invincibleUntil ?? 0, _nowB + 2000);
          this._crashRecoveryUntil = this._invincibleUntil;
          this._crashRollStartAt   = _nowB + 1000;
          p.speed         = 0;
          p.steerVelocity = 0;
          p.xImpulse      = 0;
          p.x             = this._postCrashLaneX();
        }
      }

      // ── Raised median (wildlife crossing — a divided highway) ────────
      // Keep the player OFF the central median / out from under the center
      // pier: a SOFT side-barrier that nudges you to whichever side you're
      // already leaning toward.  You still choose left or right — you just
      // can't drive on the divider or straight through the pillar.  Scales
      // with seg.medianW so it eases in/out (no abrupt wall), and never
      // crashes you — just holds you at the median edge.
      if (seg?.medianZone && !_isWaterSeg) {
        const medHalf = 0.42 * (seg.medianW ?? 0);
        if (medHalf > 0.03 && Math.abs(p.x) < medHalf) {
          const side = (p.x > 0.001) ? 1
                     : (p.x < -0.001) ? -1
                     : (p.steerVelocity >= 0 ? 1 : -1);
          p.x = side * medHalf;
          p.steerVelocity = (side > 0 ? Math.max(0, p.steerVelocity)
                                      : Math.min(0, p.steerVelocity)) * 0.35;
          p.xImpulse = (side > 0 ? Math.abs(p.xImpulse) : -Math.abs(p.xImpulse)) * 0.4;
        }
      }
    }

    // ── Water dunk safety net ─────────────────────────────────────────
    // The rails above clamp |p.x| to 0.95–1.05 on water/bridge segments,
    // so the car SHOULDN'T be able to reach this point — but a high-
    // severity head-on impulse, a glitched i-frame, or future content
    // could push it deep past the rail in a single frame.  If that ever
    // happens, treat it as "went in the water": -10 HP, splash popup,
    // warp back to road center, hard speed cut.  Cool-down so a single
    // dunk only costs 10 HP, even if the impulse keeps the car past
    // the threshold across several frames.
    // Trigger conditions:
    //   • `seg.water`  — water on both sides (bridge apron): dunk on either side
    //   • `seg.waterLeft`  — water on left only: dunk when p.x < -1.05
    //   • `seg.waterRight` — water on right only: dunk when p.x >  1.05
    //   • bridges are EXCLUDED (rail clamp above keeps the car on deck)
    // Threshold lowered to 1.15 — just past the 0.95 rail/shoulder.
    // On bridges with the rail snap, the rail still pins the car at
    // ±0.95 so normal scrape behavior is preserved.  On plain water /
    // unrailed lake banks (no snap, damage only), the car can drift
    // past 1.15 and immediately trigger the sink.  Previously this
    // was 1.5, which was reachable only via a violent impulse — so
    // the typical "drove off into the lake" scenario silently rail-
    // scraped instead of sinking.
    const DUNK_THRESH = 1.15;
    let _waterDunkTriggered = false;
    // `bridgeWaterChannel` marks the sub-spans of the West Seattle bridge
    // that actually cross the Duwamish (the rest of that bridge is over
    // land).  Treat those channel spans as both-sided water so a punch-
    // through off the WS bridge sinks — the over-land bridge spans (no
    // water flag) just rail-hold, since there's no water under them.
    const _bothSidedWater = !!seg?.water || !!seg?.bridgeWaterChannel;
    if (_bothSidedWater   && Math.abs(p.x) > DUNK_THRESH) _waterDunkTriggered = true;
    else if (seg?.waterLeft  && p.x < -DUNK_THRESH) _waterDunkTriggered = true;
    else if (seg?.waterRight && p.x >  DUNK_THRESH) _waterDunkTriggered = true;
    if (_waterDunkTriggered
        && (this._waterDunkCooldown ?? 0) <= 0
        && !this._sinkState) {
      // Kick off a multi-stage sink animation: tires submerge first,
      // then lower half, then top.  Damage / warp / cooldown all defer
      // to the end of the animation (handled in _updateSinkAnim).
      this._sinkState = { t0: this.time.now, dur: 1500 };
      this._showPopup('💦 SPLASH!\n−10 HP', '#44AAFF');
      this.effects?.triggerShake?.(600, 0.018);
      // Lock the car in place for the duration of the sink.
      p.steerVelocity = 0;
      p.xImpulse      = 0;
      p.speed         = 0;
    }
    if ((this._waterDunkCooldown ?? 0) > 0) this._waterDunkCooldown -= dt;
    // While sinking, freeze the player's lateral motion every frame so
    // a stray impulse can't slide them sideways through the water.
    if (this._sinkState) {
      p.steerVelocity = 0;
      p.xImpulse      = 0;
      p.speed         = 0;
    }
    if (seg?.tunnel) {
      // Tunnel-wall scrape — same model as the bridge rail now.
      // 3 HP/SECOND continuous (dt-scaled) instead of the old
      // 3 HP per 350ms i-frame (which was effectively ~8.5 HP/sec).
      // No explosion, no center-respawn, no speed halving — just
      // bleed HP while pressed against the wall.
      const TUNNEL_RAIL = 1.18;
      const hitting = Math.abs(p.x) > TUNNEL_RAIL;
      if (hitting) {
        this._applyDamage(3 * dt, 'tunnel_wall');
        // Throttle the popup so it doesn't flicker every frame.
        const _nowTun = this.time?.now ?? 0;
        if (_nowTun >= (this._tunnelScrapeUntil ?? 0)) {
          this._showPopup?.('🧱 WALL!', '#FFAA22');
          this._tunnelScrapeUntil = _nowTun + 800;
        }
      }
      if (p.x > TUNNEL_RAIL) {
        p.x = TUNNEL_RAIL;
        p.steerVelocity = Math.min(0, p.steerVelocity) * 0.4;
        p.xImpulse      = Math.min(0, p.xImpulse ?? 0);
      } else if (p.x < -TUNNEL_RAIL) {
        p.x = -TUNNEL_RAIL;
        p.steerVelocity = Math.max(0, p.steerVelocity) * 0.4;
        p.xImpulse      = Math.max(0, p.xImpulse ?? 0);
      }
    }
    // Off-road: gradually cap speed rather than multiplying each frame.
    // EXCEPT — if the player is on the painted exit ramp asphalt, it
    // counts as paved road and the slowdown is suppressed.  Range goes
    // out to x=4.9 so the widened, farther-diverging ramp stays drivable
    // still qualify and don't grind the car to a halt.
    const onRamp = (seg?.rampStrength ?? 0) > 0 && p.x > 1 && p.x < 4.9;
    if (Math.abs(p.x) > 1 && !onRamp) {
      const depth     = clamp((Math.abs(p.x) - 1) / 1.5, 0, 1);
      const maxSpeed  = MAX_SPEED * lerp(OFFROAD_SLOW, 0.15, depth);
      if (p.speed > maxSpeed) p.speed = lerp(p.speed, maxSpeed, 0.06);
      // Off-road HP bleed — 0.5 HP per second of dirt-driving.  Ramp
      // segments are exempt (they're paved) so pulling over doesn't tax
      // the player.
      this._applyDamage(0.5 * dt, 'offroad_bleed');
    }

    // ── Beer gravity (alcohol ≥ 80%) ────────────────────────────────
    // At very drunk the car gets pulled toward the nearest beer ahead —
    // a "beer-seeking missile" effect.  Pull is strong enough to drift
    // the car a full lane width before reaching the beer, but stays
    // beatable: a player holding the opposite steer (TURN_SPEED 2.8) can
    // overpower the pull when sober-leaning hard.  Scans ~80 segments
    // forward so the pull engages early enough to feel.
    const alcLvl = this.drugs?.levels?.[DRUGS.ALCOHOL] ?? 0;
    if (alcLvl >= 0.80) {
      const segs     = this.road.segments;
      const segCount = segs.length;
      const startSeg = Math.floor(p.position / SEG_LENGTH);
      let beerOffset = null;
      for (let look = 1; look < 80 && beerOffset === null; look++) {
        const seg = segs[(startSeg + look) % segCount];
        if (!seg?.sprites) continue;
        for (const sp of seg.sprites) {
          if (sp.collected || !sp.isCollectible) continue;
          if (sp.type === 'beer') { beerOffset = sp.offset; break; }
        }
      }
      if (beerOffset !== null) {
        // 0.80 alc → 2 lane-units/sec (below TURN_SPEED 2.8 so the player
        // can fully overpower the pull when leaning hard on the wheel),
        // 1.00 alc → 6 lane-units/sec (steering resists but loses).
        const pullStr = 2 + (alcLvl - 0.80) * 20;
        p.x += clamp(beerOffset - p.x, -1, 1) * pullStr * dt;
      }
    }

    // Lateral clamp — ASYMMETRIC.
    //
    // RIGHT side: ±2.8 normally, extended on exit ramps so the player can
    // reach all the way past the ramp's outer edge (4.30) and into the city
    // skyline buildings sitting at CITY_BUILDING_SETBACK (5.9).  Building
    // collision band starts just beyond the ramp, so the player needs to
    // reach at least p.x = 4.5 to start triggering crashes.  Lerps with
    // rampStrength: 2.8 normal → 6.5 at full ramp.
    //
    // LEFT side: pinned at 2.8 ALWAYS — it never opens on ramps.  All
    // off-ramps in the route are right-side only, so there is nothing to
    // reach for out past the left shoulder; opening the left clamp on ramp
    // segments just exposed an empty off-road dead-zone the player could
    // drift into (the old "±5.5 tree wall in a space nobody should drive"
    // problem).  Keeping it at 2.8 turns the left edge into a soft invisible
    // guardrail — the car simply can't steer further out, no crash penalty.
    const _segsForClamp  = this.road?.segments;
    const _segIdxClamp   = _segsForClamp
      ? Math.floor(p.position / SEG_LENGTH) % _segsForClamp.length
      : 0;
    const _rampStrength  = _segsForClamp?.[_segIdxClamp]?.rampStrength ?? 0;
    const _maxXRight = 2.8 + _rampStrength * 3.7;   // 2.8 → 6.5 across full ramp
    const _maxXLeft  = 2.3;                          // never opens — no left exits

    // Left-side off-road deterrent.  The painted fog line (pavement edge)
    // sits at ±1.0, so once the car is past x = -1.5 it's half a lane into
    // the grass with nothing to reach for (no left exits).  Bleed a steady
    // 1 HP/sec until it returns toward the road, up to the hard 2.3 wall.
    // No crash / recovery-warp — just a "get back on the road" cost.  The
    // i-frame absorbs this automatically, so it won't stack onto a crash
    // recovery.  Right side is exit territory and gets no such penalty.
    if (p.x < -1.5) this._applyDamage(1 * dt, 'offroad_left');

    p.x = clamp(p.x, -_maxXLeft, _maxXRight);
    // Locked laterally during a held traffic stop — you're pulled over, so
    // steering is frozen.  Zero steerVelocity too (curve/drift can still nudge
    // it with no input, which showed as the car "rocking in place") so the car
    // is dead still — no translation, no lean.
    if (this._trapStopHeld) { p.x = this._trapStopHeldX ?? p.x; p.steerVelocity = 0; }

    // Advance
    // World-units position: full speed so the road scrolls fast and the game
    // feels arcade-y. Mileage display below (in `_odometer`) compresses so the
    // displayed odometer reaches ~200 mi by Oregon and ~2,000 mi by Miami.
    // LSD ≥ 90% — distance multiplier ×1.25.  The world rolls past 25%
    // faster than your actual speed, on top of the LSD-60% display cap.
    // Combined effect: read 60 mph, cover ground as if at 150 mph.
    const lsdLvl = this.drugs?.get?.(DRUGS.LSD) ?? 0;
    const distMul = lsdLvl >= 0.90 ? 1.25 : 1.0;
    // Crash i-frame handling.  Three cases:
    //  (a) Short-blink hits (e.g. the 200 ms bush nudge) freeze the
    //      world entirely — speed pinned to zero, sprite blinks in
    //      place.  No crash-recovery flag is set for those.
    //  (b) Major-crash hold phase — first ~1 s of the i-frame after a
    //      scenery / head-on hit.  Car stays frozen at 0 mph so the
    //      impact reads as a real stop before the rolling start kicks in.
    //  (c) Major-crash roll phase — remainder of the i-frame.  The
    //      auto-pilot upstream forces a 60 mph target; let position
    //      advance and the speed ramp run.  Steering also re-enables
    //      via `_rollPhase` so the player can aim the recovery.
    const _nowFr = this.time?.now ?? 0;
    const _inCrashRecovery = _nowFr < (this._crashRecoveryUntil ?? 0);
    const _inRollPhase     = _inCrashRecovery
                          && _nowFr >= (this._crashRollStartAt ?? 0);
    if (_iframeActive && !_inRollPhase) {
      p.speed = 0;
    } else {
      // CLAMP at the route end — do NOT modulo-wrap.  Wrapping looped the run
      // back to mile 0 (car still rolling, HP intact) if the mile-289 finish
      // trigger was ever missed (e.g. a lag spike near the end jumping position
      // past the finish).  Clamping pins the car at the end so the finish
      // detection (progress ≥ finish t) fires instead of the world restarting.
      p.position = Math.min(ROUTE_SEGS * SEG_LENGTH, p.position + p.speed * distMul * dt);
    }

    // Visual lean — follows the car's actual lateral velocity (post
    // Pass 1, steerVelocity IS the lateral velocity).  Clamp at ±1.4
    // so a huge slide leans the car expressively without throwing it
    // off-screen.  Slight smoothing on the angle so fast lateral-vel
    // oscillations (snow ice patches, drug drift) don't jitter the
    // sprite frame-to-frame.
    const rawLean = p.steerVelocity / (TURN_SPEED || 1);
    const leanDir = Math.max(-1.4, Math.min(1.4, rawLean));
    let targetX = SCREEN_W / 2 - leanDir * 22;
    if (this.road?._cameraTracksPlayer === false) {
      const proj = this.road?.sampleSurface?.(PLAYER_VIRTUAL_Z, 0, { allowClipped: true });
      const roadHalfW = proj?.roadHalfW ?? (SCREEN_W * 0.25);
      targetX += p.x * roadHalfW;
    }
    p.screenX     = lerp(p.screenX ?? SCREEN_W / 2, targetX, 0.12);
    if (this.playerSprite) {
      // ── Player sprite — X + angle only ────────────────────────────
      // Y assignment moved to _renderVehicles, which runs AFTER
      // road.render() in _renderFrame.  Sampling the road here would
      // read from the PREVIOUS frame's _drawn (one-frame stale), so the
      // car bounced on slopes when the road shifted between frames.
      // Keeping X here because p.screenX is input/physics-driven, not
      // road-derived.
      const DEFAULT_W = 78, DEFAULT_H = 49;
      this._applyPlayerSpriteDisplaySize(DEFAULT_W, DEFAULT_H);
      this.playerSprite.x = p.screenX;
      // Lerp the angle for smoothness (raw leanDir can twitch on snow
      // ice patches / impulses).  0.18 reaches 85 % of target in
      // ~150 ms — fast enough to look responsive, slow enough to damp.
      const targetAng = leanDir * 6;
      this.playerSprite.angle = lerp(this.playerSprite.angle ?? 0, targetAng, 0.18);
      // Held traffic stop — pin the body flat so it can't lean/rock (steering
      // is already disabled and screen-X is frozen via the locked p.x).
      if (this._trapStopHeld) this.playerSprite.angle = 0;
      // Crash i-frame blink — 7 Hz alpha toggle so the player can see
      // they're temporarily invulnerable.  Outside the window keep the
      // sprite fully opaque (other systems don't touch alpha).
      const _now = this.time?.now ?? 0;
      if (_now < this._invincibleUntil) {
        this.playerSprite.alpha = (Math.floor(_now / 140) & 1) ? 0.25 : 1.0;
      } else if (this.playerSprite.alpha !== 1) {
        this.playerSprite.alpha = 1;
      }
    }
  }

  // ─── Traffic ─────────────────────────────────────────────────────────
  _isUrbanZone(progress) {
    // West Seattle / Downtown Seattle (start) and Spokane area (end).
    return progress < 0.043 || progress > 0.95;
  }

  _updateTraffic(dt) {
    this._trafficTimer -= dt;
    if (this._trafficTimer <= 0) {
      const p       = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
      const urban   = this._isUrbanZone(p);
      // Denser traffic across the board: cities cap at 22 cars; highway
      // spawns ~every 0.6–1.6 s (was 2.8–5.8 s) so the road feels populated.
      // Cap scales with Difficulty.trafficMul (Hard +10%) AND Weather
      // (snow zone −30%).  Both stack — Hard in snow ≈ −23% vs base.
      const _mileForSpawn = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const tMul = Difficulty.trafficMul() * Weather.trafficMul(_mileForSpawn);
      const cap  = Math.round((urban ? 22 : 18) * tMul);
      if (this.traffic.length < cap) {
        this._trafficTimer = urban ? (0.4 + Math.random() * 0.6) : (0.6 + Math.random() * 1.0);
        this._spawnTraffic();
      } else {
        this._trafficTimer = 0.4;
      }
    }
    // Same-lane follow distance: faster cars slow to match a slower car
    // ahead in the same lane, instead of driving through it.
    // Bumped 1800 → 4250 (2026-05-31) per user spec: every NPC keeps a
    // 70 ft (≈ 4253 world units at 60.76 units/ft) gap front + back from
    // other NPCs in the same lane.  The follow-velocity rule below
    // (faster car drops to match slower car ahead when inside FOLLOW_DIST)
    // is the same code path; only the threshold changed.
    const FOLLOW_DIST = 4250;

    // ── Lane-change / passing tunables ───────────────────────────────
    // LANE_CHANGE_SEC: a full 0.5-lane shift takes this long — slow and
    // deliberate, not a teleport.  PASS_MARGIN: a car only bothers pulling
    // out if it's ≥ 8 mph faster than the slowpoke ahead.  CUT_IN_GAP: how
    // close (world units, ~50 ft) a car will merge in FRONT of the player —
    // assertive but never on top of you.  passChance scales how eagerly cars
    // pass by difficulty (Hard always, Normal/Custom usually, Easy seldom).
    const LANE_CHANGE_SEC = 1.3;
    const LANE_GLIDE  = 0.5 / LANE_CHANGE_SEC;
    const PASS_MARGIN = MAX_SPEED * 8 / 120;
    const CUT_IN_GAP  = 3000;
    const _laneMode   = Difficulty.mode?.() ?? 'normal';
    const passChance  = _laneMode === 'hard' ? 1.0 : _laneMode === 'easy' ? 0.45 : 0.78;

    // ── Shroom synchronised pulse (≥ 45% shrooms) ────────────────────
    // ALL NPC cars slow / speed up in unison — no lateral swerve, no per-
    // car random phase.  The road "breathes" as one.  Reads as the
    // player's depth perception playing tricks rather than chaotic
    // traffic.  Period 0.75 s, ±10 mph at full ramp.
    const shroomLvl = this.drugs?.get?.(DRUGS.SHROOMS) ?? 0;
    const shroomActive = shroomLvl >= 0.45;
    this._shroomTime = (this._shroomTime ?? 0) + (shroomActive ? dt : 0);
    let shroomPulseUnits = 0;
    if (shroomActive) {
      const ramp = Math.min(1, (shroomLvl - 0.45) / 0.20);   // 0 at 45%, 1 at 65%
      const pulseAmpUnits = MAX_SPEED * 10 / 120;            // 10 mph in world units
      shroomPulseUnits = Math.sin(this._shroomTime * 2 * Math.PI / 0.75) * pulseAmpUnits * ramp;
    }
    // ── Rx NPC speed shift — cumulative per pickup ──────────────────
    // +7 mph per Rx pickup, applied sign-aware so oncoming traffic
    // slows in magnitude (shift TOWARD zero) and same-direction speeds
    // up, without ever flipping a car's direction.  Without the sign
    // clamp, ≥ 15 Rx pickups (~+105 mph shift) would push slow oncoming
    // cars past zero into positive (reverse-direction) territory.
    const rxShiftUnits = MAX_SPEED * (this.drugs?.getRxNpcSpeedShiftMPH?.() ?? 0) / 120;

    for (const t of this.traffic) {
      if (t.crashed) {
        // Wreck is animating: spin, drift sideways, leave smoke. Forward
        // momentum continues at the slowed `speed` set on impact.
        t.crashTimer  -= dt;
        t.crashAng    += t.crashSpin * dt;
        t.laneOffset  += t.crashVx * dt;
        t.position    += t.speed * dt;
        // Spawn smoke puffs every ~0.08s along the wreck's path
        t.crashSmokeT = (t.crashSmokeT ?? 0) + dt;
        if (t.crashSmokeT > 0.08) {
          t.crashSmokeT = 0;
          this._spawnSmokePuff(t);
        }
        continue;
      }
      // ── Tractor drift ────────────────────────────────────────────────
      // Tractors hug the right fog line (laneOffset 0.95) but drift back
      // toward the right travel lane every 15-ish seconds.  Slow sine
      // wander between 0.95 (fog line) and 0.75 (right lane center) so
      // the player has to slow and pass wide — sometimes the tractor is
      // tucked over, sometimes it's eating their lane.
      if (t.vClass === 'tractor') {
        t.driftPhase = (t.driftPhase ?? Math.random() * Math.PI * 2) + dt * 0.40;
        t.laneOffset = 0.95 - Math.abs(Math.sin(t.driftPhase)) * 0.20;
      } else if (t.targetLaneOffset != null) {
        // Smooth lane-change glide toward the car's target lane (~0.6s/lane).
        const dLane = t.targetLaneOffset - t.laneOffset;
        if (Math.abs(dLane) > 0.001) {
          t.laneOffset += Math.sign(dLane) * Math.min(Math.abs(dLane), LANE_GLIDE * dt);
        }
      }
      // Same-lane follow: keep a hard ~70 ft floor (followDist) from the car
      // ahead.  A car already AT/ABOVE the floor simply matches a slower
      // leader's speed (won't close in).  A car that's gotten too close — a
      // merge cut-in, a same-lane spawn, two cars gliding together — actively
      // eases BELOW the leader, proportional to how far inside the floor it is,
      // so the gap GROWS BACK toward followDist instead of locking in lockstep
      // at the short distance (the old rule only matched speed, which froze
      // any sub-floor pair forever).  Detection runs a little past the floor
      // (×1.4) so speed-matching begins before the floor, not after crowding
      // in.  Lane match 0.18 catches a car mid-glide into this lane.
      let effSpeed = t.speed;
      const followDist = t.followDist ?? FOLLOW_DIST;
      const detectDist = followDist * 1.4;
      let leadGap = Infinity, leadSpeed = null;
      for (const other of this.traffic) {
        if (other === t || other.crashed) continue;
        if (Math.abs(other.laneOffset - t.laneOffset) > 0.18) continue;
        const gap = other.position - t.position;
        if (gap > 0 && gap < detectDist && gap < leadGap) { leadGap = gap; leadSpeed = other.speed; }
      }
      // Same-direction cars also yield to the PLAYER ahead in their lane
      // (tuck in / set up a pass instead of rear-ending you).
      if (t.speed > 0 && Math.abs((this.player.x ?? 0) - t.laneOffset) < 0.18) {
        const pg = this.player.position - t.position;
        if (pg > 0 && pg < detectDist && pg < leadGap) { leadGap = pg; leadSpeed = this.player.speed ?? 0; }
      }
      if (leadSpeed != null) {
        if (t.speed > 0 && leadGap < followDist) {
          // Inside the floor — slow below the leader (up to 60% under) in
          // proportion to the intrusion, so the gap re-opens to followDist.
          const deficit = Math.min(1, (followDist - leadGap) / followDist);
          const target  = leadSpeed - Math.max(0, leadSpeed) * 0.6 * deficit;
          if (target < effSpeed) effSpeed = Math.max(0, target);
        } else if (leadSpeed < effSpeed) {
          // At/above the floor — just match the slower leader, don't close in.
          effSpeed = Math.max(0, leadSpeed);
        }
      }
      // Shroom pulse — small ±10 mph oscillation, safe to add raw.
      effSpeed += shroomPulseUnits;
      // Rx shift — apply IN the direction of travel so oncoming cars
      // slow toward zero (don't reverse) and forward cars accelerate.
      // Clamp at 0 in the original direction so the car never crosses.
      if (rxShiftUnits !== 0 && t.speed !== 0) {
        const sgn = t.speed > 0 ? 1 : -1;
        const shifted = effSpeed + sgn * rxShiftUnits;
        // If the sign flipped (oncoming slowed past zero), pin at 0.
        if ((sgn > 0 && shifted < 0) || (sgn < 0 && shifted > 0)) {
          effSpeed = 0;
        } else {
          effSpeed = shifted;
        }
      }
      t.position += effSpeed * dt;
    }

    // ── Same-direction passing (all difficulties, scaled) ──────────────
    // A car held up by a slower leader pulls into its OTHER same-direction
    // lane to overtake — right-lane cars pass on the LEFT, left-lane cars
    // pass on the RIGHT (so a left-lane car is never passed on its left,
    // out onto the yellow centerline).  Cars do NOT return to their old
    // lane afterward: if the road ahead is clear they just stay put, which
    // keeps traffic spread across both lanes instead of funneling right.
    // They merge in front of the player only when there's a real gap.  The
    // smooth glide itself runs in the movement loop above via targetLaneOffset.
    if (this.traffic?.length) {
      const nowMs = this.time?.now ?? 0;
      const LEFT = 0.25, RIGHT = 0.75;
      for (const t of this.traffic) {
        if (!t.alive || t.crashed || t.isCop) continue;
        if (t.speed <= 0 || t.vClass === 'tractor') continue;   // same-direction cars only
        if (t.targetLaneOffset == null) t.targetLaneOffset = t.laneOffset;
        // Let an in-progress glide finish, and respect the decision cooldown.
        if (Math.abs(t.laneOffset - t.targetLaneOffset) > 0.02) continue;
        if (nowMs < (t.passUntil ?? 0)) continue;
        // Must be settled in one of the two same-direction travel lanes.
        const inLeft  = t.laneOffset < 0.5;
        const curLane = inLeft ? LEFT : RIGHT;
        if (Math.abs(t.laneOffset - curLane) > 0.18) continue;
        const otherLane = inLeft ? RIGHT : LEFT;   // the only lane it may move to

        // Nearest leader (NPC or player) ahead in this lane.
        const followDist = t.followDist ?? FOLLOW_DIST;
        let lGap = Infinity, lSpeed = Infinity;
        for (const o of this.traffic) {
          if (o === t || !o.alive || o.crashed) continue;
          if (Math.abs(o.laneOffset - t.laneOffset) > 0.18) continue;
          const g = o.position - t.position;
          if (g > 0 && g < lGap) { lGap = g; lSpeed = o.speed; }
        }
        if (Math.abs((this.player.x ?? 0) - t.laneOffset) < 0.18) {
          const pg = this.player.position - t.position;
          if (pg > 0 && pg < lGap) { lGap = pg; lSpeed = this.player.speed ?? 0; }
        }
        const heldUp = lGap < followDist * 1.4 && t.speed > lSpeed + PASS_MARGIN;

        if (heldUp && Math.random() < passChance &&
            this._laneClearFor(t, otherLane, followDist, followDist, CUT_IN_GAP)) {
          // Overtake via the other lane, then STAY there — no forced return.
          // (behindGap below is the FULL floor — a pass never cuts in tighter
          //  than ~70 ft ahead of the car that ends up behind it.)
          t.targetLaneOffset = otherLane;
          t.passUntil = nowMs + 2500;
        } else {
          // Clear road, or can't pass yet — hold this lane; re-check shortly.
          t.passUntil = nowMs + (heldUp ? 700  + Math.random() * 1200
                                        : 1200 + Math.random() * 1600);
        }
      }
    }

    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      const dist = t.position - this.player.position;
      const crashedDone = t.crashed && t.crashTimer <= 0;
      // Despawn forward past visible horizon (DRAW_DIST × SEG_LENGTH).
      // Backward despawn used to be -2000 — but the rear-view mirror
      // looks back ~36 000 units (MIRROR_FAR_Z) so we need to keep cars
      // alive until they're actually past the mirror's vanishing point.
      // dist = t.position - player.position; vz = (player+3000) - t.position;
      // vz = 36000 → dist = -33000.  Use -35000 with a small buffer.
      if (crashedDone || dist < -35000 || dist > 80000) {
        this.traffic.splice(i, 1);
      }
    }
  }

  /** True if `t` can move into `targetLane` right now: no NPC within
   *  `aheadGap` ahead or `behindGap` behind in that lane, and — for the
   *  player — never closer than a safe gap (`cutInGap` when merging in
   *  front of the player; `aheadGap` when the player is ahead).  Cars
   *  mid-glide count as occupying the lane they're entering. */
  _laneClearFor(t, targetLane, aheadGap, behindGap, cutInGap) {
    for (const o of this.traffic) {
      if (o === t || !o.alive || o.crashed) continue;
      const occupies = Math.abs(o.laneOffset - targetLane) < 0.20
        || (o.targetLaneOffset != null && Math.abs(o.targetLaneOffset - targetLane) < 0.20);
      if (!occupies) continue;
      const gap = o.position - t.position;            // >0 = o ahead of t
      if (gap >= 0 ? gap < aheadGap : -gap < behindGap) return false;
    }
    // Player (same-direction lanes only).
    if (Math.abs((this.player.x ?? 0) - targetLane) < 0.20) {
      const pg = this.player.position - t.position;   // >0 = player ahead of t
      if (pg >= 0) { if (pg < aheadGap) return false; }   // don't merge right behind a close player
      else         { if (-pg < cutInGap) return false; }  // cut in front of player only with a real gap
    }
    return true;
  }

  // Smoke puff trailing a crashed vehicle — uses the same explosion list so
  // the existing render loop draws it.
  _spawnSmokePuff(car) {
    const relZ = Math.max(50, car.position - this.player.position);
    const proj = this.road.getVehicleProjection(relZ, car.laneOffset);
    if (!proj) return;
    this.explosions.push({
      sx:       proj.sx + (Math.random() - 0.5) * proj.sw * 0.5,
      sy:       proj.sy - proj.sw * 0.3,
      sw:       proj.sw * 0.5,
      timer:    0,
      maxTimer: 0.85,
      smoke:    true,
    });
  }

  _spawnTraffic() {
    const p         = this.player;
    const isCop     = this.cops.stars >= 1 && Math.random() < this.cops.stars * 0.18;
    const colors    = [0xFF4444, 0x44AAFF, 0x44CC44, 0xFFCC44, 0xCC44CC, 0xFFFFFF, 0xFF8800];

    // ── Pick the vehicle CLASS first.  Class then drives lane, speed,
    //    asset set, and whether a paired oncoming spawn fires.
    //
    //    Geographic gating (player mile), ramped 2026-05-31 so semis
    //    start appearing past the Cascade crest (mile 53) and dominate
    //    by mile 70+ rather than being mile-150 surprises:
    //      < 17           : car only — no heavy freight, no farm equipment.
    //      17–52          : car 90 / white_truck 6 / work_truck 3 / semi 1.
    //                        Light truck traffic on the I-90 climb.
    //      53–69          : car 82 / white_truck 8 / work_truck 6 / semi 4.
    //                        Coming off the pass, freight ramps up.
    //      70–136         : car 70 / white_truck 10 / work_truck 8 / semi 12.
    //                        Easton → Vantage backbone — real semi country.
    //      137+ (E. WA)   : car 50 / semi 22 / white_truck 10 / work_truck 9 / tractor 9.
    //                        Plus farm equipment.  Tractor is throttled by
    //                        a 10-mile cooldown below.
    const mileNow = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    let vClass = 'car';
    if (!isCop) {
      const r = Math.random();
      if (mileNow < 17) {
        vClass = 'car';
      } else if (mileNow < 53) {
        if      (r < 0.90) vClass = 'car';
        else if (r < 0.96) vClass = 'white_truck';
        else if (r < 0.99) vClass = 'work_truck';
        else               vClass = 'semi';
      } else if (mileNow < 70) {
        if      (r < 0.82) vClass = 'car';
        else if (r < 0.90) vClass = 'white_truck';
        else if (r < 0.96) vClass = 'work_truck';
        else               vClass = 'semi';
      } else if (mileNow < 137) {
        if      (r < 0.70) vClass = 'car';
        else if (r < 0.82) vClass = 'semi';
        else if (r < 0.92) vClass = 'white_truck';
        else               vClass = 'work_truck';
      } else {
        if      (r < 0.50) vClass = 'car';
        else if (r < 0.72) vClass = 'semi';
        else if (r < 0.82) vClass = 'white_truck';
        else if (r < 0.91) vClass = 'work_truck';
        else               vClass = 'tractor';
      }
      // ── Tractor cooldown ─────────────────────────────────────────────
      // Per-spawn 9 % is plenty often without a gate.  User wants
      // tractors sparse — ~1 every 10 miles.  Track the last tractor's
      // spawn mile; if a tractor roll comes up but we're within 10 mi
      // of the previous one, downgrade it to the next-most-common east
      // class (semi) instead.
      if (vClass === 'tractor') {
        const lastMi = this._lastTractorMile ?? -Infinity;
        if (mileNow - lastMi < 10) {
          vClass = 'semi';
        } else {
          this._lastTractorMile = mileNow;
        }
      }
    }

    // Same-direction traffic only — 2 right-side lanes (player's direction).
    // Lane centers ±0.25 and ±0.75 are in painted-road normalized units, the
    // same units as `p.x` and the drawn-segment lookup, so we don't scale
    // them — getVehicleProjection() handles the world-vs-painted conversion.
    // 60% of spawns same-direction (right 2 lanes), 40% oncoming (left 2).
    // Tractors: same-direction only (we only have a Back PNG — player always
    // overtakes farm equipment, no head-on tractors).
    let oncoming;
    if (vClass === 'tractor') {
      oncoming = false;
    } else {
      oncoming = !isCop && Math.random() < 0.4;
    }
    const sameDirLanes = [0.25, 0.75];
    const oppDirLanes  = [-0.25, -0.75];
    const lanePool = oncoming ? oppDirLanes : sameDirLanes;
    let laneOffset = lanePool[(Math.random() * lanePool.length) | 0];
    // Tractor lane: sits on the RIGHT fog line (offset 0.95) and drifts
    // into the right travel lane via _updateTraffic's drift block.
    if (vClass === 'tractor') laneOffset = 0.95;

    // Per-class speeds (mph).  trafficSpeed is in world units;
    // MAX_SPEED * mph / 120 converts.  Oncoming flips sign.
    //   car          : 80 ± 25 (same-dir) / 60 ± 15 (oncoming)
    //   semi         : 70 ± 10              / 60 ± 8
    //   white_truck  : 75 ± 15              / 60 ± 12
    //   work_truck   : 45 ± 5  — slow contractor truck, stays slow even oncoming
    //   tractor      : 30 ± 3  — farm equipment, same-dir only
    let baseMph, spreadMph;
    switch (vClass) {
      case 'semi':        baseMph = oncoming ? 60 : 70; spreadMph = oncoming ? 8  : 10; break;
      case 'white_truck': baseMph = oncoming ? 60 : 75; spreadMph = oncoming ? 12 : 15; break;
      case 'work_truck':  baseMph = 45;                 spreadMph = 5;                  break;
      case 'tractor':     baseMph = 30;                 spreadMph = 3;                  break;
      case 'car':
      default:            baseMph = oncoming ? 60 : 80; spreadMph = oncoming ? 15 : 25; break;
    }
    const baseUnits = MAX_SPEED * baseMph / 120;
    const spread    = MAX_SPEED * spreadMph / 120;
    let trafficSpeed = isCop
      ? 500
      : baseUnits + (Math.random() - 0.5) * 2 * spread;
    if (oncoming) trafficSpeed = -trafficSpeed;

    // Spawn at the horizon so cars appear from the distance and gradually
    // grow as they approach. DRAW_DIST × SEG_LENGTH = 76,000 units is the
    // far edge of what the road renders. We pick 50,000–72,000 so cars
    // appear small/distant on first frame and roll toward the player.
    let position = p.position + 50000 + Math.random() * 22000;
    for (let tries = 0; tries < 6; tries++) {
      // 4250 units ≈ 70 ft minimum spawn spacing (matches FOLLOW_DIST so
      // a newly-spawned car never appears closer than the in-traffic
      // gap rule allows).
      const conflict = this.traffic.some(t =>
        Math.abs(t.laneOffset - laneOffset) < 0.18 &&
        Math.abs(t.position - position) < 4250);
      if (!conflict) break;
      position = p.position + 50000 + Math.random() * 22000;
    }

    // Pick a paired-direction color set.  At render time we look up
    // `car_back_<set>` for same-direction traffic (player sees the rear)
    // and `car_front_<set>` for oncoming traffic (player sees the nose).
    // colorSet === 'police' is reserved for cops.
    const CAR_COLOR_SETS = [
      'codex_beater',
      'codex_suv4x4',
      'codex_used_truck',
      'codex_new_truck',
      'codex_ev_truck',
      'codex_sports_car',
      'codex_bestla_roadster',
      'npc_hatchback',
      'npc_minivan',
      'npc_wagon',
    ];
    let colorSet;
    if (isCop) colorSet = 'police';
    else if (vClass === 'semi')        colorSet = Math.random() < 0.5 ? 'codex_semi_red' : 'codex_semi_green';
    else if (vClass === 'white_truck') colorSet = 'codex_white_truck';
    else if (vClass === 'work_truck')  colorSet = 'codex_work_truck';
    else if (vClass === 'tractor')     colorSet = 'codex_tractor';
    else                                colorSet = CAR_COLOR_SETS[(Math.random() * CAR_COLOR_SETS.length) | 0];

    // Width hint for rendering: most NPCs render at proj.sw * 1.  Semis
    // bump to ~1.35 so they read as ~lane-wide (the user's "almost a full
    // lane" call — makes squeezing between paired semis genuinely tight).
    // Tractor uses 1.10 (wider than a car, narrower than a semi).
    let visualScale = 1;
    if (vClass === 'semi')    visualScale = 1.35;
    if (vClass === 'tractor') visualScale = 1.10;

    this.traffic.push({
      id:         Math.random(),
      position,
      laneOffset,
      speed:      trafficSpeed,
      color:      isCop ? 0x2244BB : colors[Math.floor(Math.random() * colors.length)],
      isCop,
      colorSet,
      vClass,                       // 'car' | 'semi' | 'white_truck' | 'work_truck' | 'tractor'
      visualScale,
      alive:      true,
      // Lane-change state (passing / keep-right).  targetLaneOffset is the
      // lane the car is gliding toward (== laneOffset when settled).
      // followDist: ~15% are tailgaters that intentionally ride ~31 ft (1900 u)
      // off the car ahead (real-traffic flavor); the rest keep a ≥70 ft floor
      // with a 4250–6500 u spread for natural variety.  The active gap-restore
      // in the follow loop holds each car at ITS OWN followDist — so tailgaters
      // stay tight, but everyone else re-opens to ~70 ft instead of locking in
      // lockstep after a merge/spawn.
      // passUntil throttles how often the car re-evaluates a lane change.
      targetLaneOffset: laneOffset,
      followDist: Math.random() < 0.15 ? 1900 : (4250 + Math.random() * 2250),
      passUntil:  (this.time?.now ?? 0) + Math.random() * 1500,
    });

    // ── Eastern-WA semi PAIR spawn ─────────────────────────────────────
    // If we just spawned a semi east of Vantage AND that semi is going
    // the SAME direction as the player, 35 % of the time also spawn an
    // ONCOMING semi at roughly the same Z so the player has a same-dir
    // semi in their lane AND an oncoming semi in the opposing lane —
    // the "almost impossible to drive between" scenario.
    if (vClass === 'semi' && !oncoming && mileNow >= 137 && Math.random() < 0.35) {
      const partnerLane = oppDirLanes[(Math.random() * oppDirLanes.length) | 0];
      const partnerMph  = 60 + (Math.random() - 0.5) * 16;
      const partnerSpeed = -MAX_SPEED * partnerMph / 120;
      // Place the partner ±1500 units of the original semi's Z so they
      // overlap roughly at the same player distance.  Keeps the squeeze
      // tight without spawning ON TOP of each other.
      const partnerPos  = position + (Math.random() - 0.5) * 3000;
      this.traffic.push({
        id:           Math.random(),
        position:     partnerPos,
        laneOffset:   partnerLane,
        speed:        partnerSpeed,
        color:        colors[Math.floor(Math.random() * colors.length)],
        isCop:        false,
        colorSet:     Math.random() < 0.5 ? 'codex_semi_red' : 'codex_semi_green',
        vClass:       'semi',
        visualScale:  1.35,
        alive:        true,
        // Oncoming partner — no passing (speed < 0), but keep the fields
        // consistent so the movement/glide loop treats it like any car.
        targetLaneOffset: partnerLane,
        followDist:   4250,
        passUntil:    0,
      });
    }
  }

  // ─── Collisions ───────────────────────────────────────────────────────
  /** Sweep upcoming visible segments and replace any 'drug-pending' sprite
   *  with an addiction-weighted real drug type so the on-screen sprite
   *  matches what you'd pick up.
   *
   *  Range covers the full draw distance (DRAW_DIST = 380 segments) so drugs
   *  appear at the horizon, not pop into existence mid-distance. */
  _assignPendingDrugTypes() {
    const segs = this.road.segments;
    if (!segs?.length) return;
    const segIdx = Math.floor(this.player.position / SEG_LENGTH) % segs.length;
    const routeT = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    for (let di = -2; di < 400; di++) {
      const seg = segs[(segIdx + di + segs.length) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.type !== 'drug-pending') continue;
        sp.type = this.drugs.chooseAddictedDrug(routeT);
      }
    }
  }

  _checkCollisions() {
    const p      = this.player;
    // Pulled over and held for a traffic stop — the car is pinned and steering
    // is locked, so nothing should be able to hit it (and a crash here used to
    // jolt it forward out of the stop).  Skip all collision processing.
    if (this._trapStopHeld) return;
    const segIdx = Math.floor(p.position / SEG_LENGTH) % this.road.segments.length;

    // Road sprite collectibles — collect ONLY when the pickup is visually
    // touching the player car.  The visible car sprite sits ~6–8 segments
    // ahead of player.position because of camera-projection offset, so a
    // pickup at segIdx+0 is still rendered well above the car on screen.
    // Iterate a wide segment range and gate on screen-Y overlap with the
    // live player sprite rect — that way the pickup vanishes the frame
    // its image meets the bumper, not the moment its world Z passes the
    // camera.
    const customMode = Difficulty.mode() === 'custom';
    const carY    = this.playerSprite?.y ?? (SCREEN_H - 130);
    const carH    = this.playerSprite?.displayHeight ?? 56;
    const carTop  = carY - carH * 0.55;
    const carBot  = carY + carH * 0.55;
    for (let di = 0; di <= 14; di++) {
      const idx = (segIdx + di) % this.road.segments.length;
      const seg = this.road.segments[idx];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected || !sp.isCollectible) continue;
        if (customMode && sp.collectibleType === 'drug') continue;
        // Lateral overlap (~half a lane) — required for visual touch.
        const dX = Math.abs(sp.offset * ROAD_WIDTH - p.x * ROAD_WIDTH);
        if (dX >= 700) continue;
        // Project the pickup to screen and check the vertical band against
        // the player sprite's bounding box.  Collect when the pickup's
        // base sits inside the car rect (give or take a small margin so
        // 60-fps motion doesn't skip past the overlap window).
        const relZ = di * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj) continue;
        if (proj.sy < carTop - 6) continue;   // pickup still ABOVE the car
        if (proj.sy > carBot + 24) continue;  // pickup already past below
        sp.collected = true;
        this._onCollect(sp);
      }
    }

    // ── Scenery collisions (trees, buildings, houses) ────────────────
    // When the player drifts off-road and bumps into a roadside fixture,
    // it counts as a "structural" crash: explosion, big damage, reset to
    // the road centre with 4-second i-frames so the player can recover.
    // Only fires if NOT already in the invincibility window — so each
    // crash spawns one explosion, not a chain reaction.
    const _now = this.time?.now ?? 0;
    if (_now >= this._invincibleUntil && Math.abs(p.x) > 0.95) {
      const SCENERY_TYPES = new Set([
        'tree', 'building', 'house', 'shrub', 'landmark',
        'livestock',           // cattle herds — collidable per spec
        'cop_random_parked',   // parked roadside cops count as structures
      ]);
      let _scenicHit = false;
      // PIXEL-BOUNDS COLLISION — replaces the older world-offset band.
      // We compute the SAME screen rectangle the renderer would draw for
      // each nearby sprite, then AABB-check against the player car's
      // rendered rectangle.  If the boxes overlap on screen, it's a
      // collision — exactly matching what the player sees.
      // Player hitbox = TRAPEZOID matching the rear 3/4 view.  Wider at
      // the bottom (bumper, closest to camera), narrower at the top
      // (hood, recedes into screen).  Vertical range = lower half of
      // the chassis (where the road plane meets the car).  Road-plane
      // scenery sits with its BASE on the road surface near the
      // bumper — the car's ROOF never crashes into a house, only the
      // chassis does.  Origin is (0.5, 1), so sprite.y = bottom edge.
      const playerDisplayW = this.playerSprite?.displayWidth  ?? 78;
      const playerDisplayH = this.playerSprite?.displayHeight ?? 49;
      const playerCx       = this.playerSprite?.x ?? SCREEN_W / 2;
      const playerSpriteY  = this.playerSprite?.y ?? (SCREEN_H - 130);
      const playerBotY     = playerSpriteY;                      // back bumper
      const playerTopY     = playerSpriteY - playerDisplayH * 0.5;  // mid-chassis
      const playerBotHalfW = playerDisplayW * 0.45;               // bumper width
      const playerTopHalfW = playerDisplayW * 0.30;               // hood width (narrower)
      // Trapezoid-vs-rect overlap.  The trapezoid widens linearly from
      // playerTopY to playerBotY; the widest extent within the
      // overlap-Y-range is at the LARGEST overlapping Y.  Test X
      // overlap at that Y.
      const trapHitsRect = (spL, spR, spT, spB) => {
        const yT = Math.max(spT, playerTopY);
        const yB = Math.min(spB, playerBotY);
        if (yB < yT) return false;
        const t = (yB - playerTopY) / Math.max(1, playerBotY - playerTopY);
        const halfW = playerTopHalfW + (playerBotHalfW - playerTopHalfW) * t;
        return !(spR < playerCx - halfW || spL > playerCx + halfW);
      };
      // Bounding AABB for legacy code paths that still need a rect.
      const playerL = playerCx - playerBotHalfW;
      const playerR = playerCx + playerBotHalfW;
      const playerT = playerTopY;
      const playerB = playerBotY;
      const sceneryLookahead = Math.ceil(PLAYER_VIRTUAL_Z / SEG_LENGTH) + 18;
      for (let di = 0; di <= sceneryLookahead && !_scenicHit; di++) {
        const idx = (segIdx + di) % this.road.segments.length;
        const seg = this.road.segments[idx];
        if (!seg?.sprites) continue;
        for (const sp of seg.sprites) {
          if (!SCENERY_TYPES.has(sp.type)) continue;
          if (sp.collected) continue;
          if (sp.collidable === false) continue;
          // Use the sprite's RENDERED offset (matches what the renderer
          // shows on screen).  Mirror the renderer's MAX(profile.minOffset,
          // sp.visualMinOffset) logic — earlier these were out of sync,
          // making the collision check the building at a different
          // offset than where it actually rendered.
          let visualOffset = sp.offset ?? 0;
          const profileForOff = SCENERY_IMAGE_PROFILES[sp.texKey];
          if (sp.type === 'building' || sp.type === 'house') {
            // Floors are now safety nets, not positioning.  Real
            // placement is spawn-time (fogLineOffset in RouteData.js).
            // 1.05 = just past the white fog line; ensures no spawn bug
            // can ever put a building's center inside the road.
            const profileMin = profileForOff?.minOffset ?? 0;
            const spriteMin  = sp.visualMinOffset ?? 1.05;
            const minOffset  = Math.max(profileMin, spriteMin);
            const sign = visualOffset >= 0 ? 1 : -1;
            visualOffset = sign * Math.max(Math.abs(visualOffset), minOffset);
          }
          const isCitySkyline = (sp.visualMinOffset ?? 0) >= 4.5;
          const relZ = di * SEG_LENGTH + SEG_LENGTH / 2;
          let proj = this.road.sampleSurface?.(
            relZ,
            visualOffset,
            (sp.type === 'building' || sp.type === 'house') ? { allowClipped: true } : undefined,
          );
          if (!proj) continue;
          // Approximate the sprite's screen size using the renderer's
          // formulas.  For buildings/houses, the renderer uses
          //   targetH = proj.sw * heightMult  (heightMult ≈ 6.0 for skyline,
          //                                    falls back to sizeMult * baseH/baseW)
          //   targetW = targetH * baseW/baseH
          //   both × heightBoost (3.0 for skyline)
          // For trees/landmarks/cops/shrubs, sizeMult-based.
          const profile = SCENERY_IMAGE_PROFILES[sp.texKey];
          const tex = sp.texKey ? this.textures.get(sp.texKey)?.source?.[0] : null;
          const baseW = tex?.width  ?? sp.baseW ?? 800;
          const baseH = tex?.height ?? sp.baseH ?? 800;
          const heightBoost = sp.heightBoost ?? 1;
          let targetW, targetH;
          if (profile?.heightMult) {
            targetH = proj.sw * profile.heightMult;
            targetW = targetH * (baseW / baseH);
          } else if (profile?.widthMult) {
            targetW = proj.sw * profile.widthMult;
            targetH = targetW * (baseH / baseW);
          } else {
            // Generic sizeMult fallback — mirrors _renderSceneSprites
            const sizeMult = sp.type === 'landmark' ? 5.5
                          : (sp.type === 'tree' || sp.type === 'shrub') ? 2.0
                          : 2.6;
            targetW = proj.sw * sizeMult;
            targetH = targetW * (baseH / baseW);
          }
          targetW *= heightBoost;
          targetH *= heightBoost;
          // CRITICAL: apply the same maxW/maxH shrink cap the renderer
          // uses (see _renderSceneSprites).  Without this the collision
          // bbox was the uncapped target size — for close West Seattle
          // homes with heightMult 6 + baseW 5400, that produced
          // collision rectangles ~4× wider than the visible sprite, so
          // the player crashed before reaching the white line at the
          // road edge.  Mirroring the exact renderer math here keeps
          // the hitbox in lockstep with what's actually drawn.
          const isCopRand = sp.copEncounter === true;
          const isTree    = sp.type === 'tree' || sp.type === 'cactus' || sp.type === 'palm' || sp.type === 'shrub';
          const maxW = profile?.maxW
            ?? (isCopRand ? SCREEN_W * 0.18 : isTree ? SCREEN_W * 0.20 : SCREEN_W * 0.42);
          const maxH = profile?.maxH
            ?? (isCopRand ? SCREEN_H * 0.18
              : isTree ? SCREEN_H * 0.44
              : sp.type === 'house' ? SCREEN_H * 0.36
              : SCREEN_H * 0.68);
          // A fixed frontage offset only stays visually fixed when its
          // image grows with the same perspective as the road. Capping its
          // width while the projected offset keeps expanding makes it look
          // like the house moves away from the shoulder.
          const shrink = Number.isFinite(sp.roadEdgeGapCars) ? 1 : Math.min(
            1,
            (maxW * heightBoost) / Math.max(1, targetW),
            (maxH * heightBoost) / Math.max(1, targetH),
          );
          targetW *= shrink;
          targetH *= shrink;
          if (sp.rampClearance && proj.roadHalfW > 1) {
            // Mirror renderer (2026-05-30): push past FULL ramp extent
            // regardless of this segment's rampStrength so the hitbox
            // tracks the rendered sprite all the way through the
            // approach — not just the segments past rs > 0.30.
            const sign = visualOffset >= 0 ? 1 : -1;
            const rampOuterEdge = 1 + 3.30;   // Road.js full divergence
            const visibleHalfWidth = (targetW * 0.5) / proj.roadHalfW;
            const neededOffset = rampOuterEdge + 0.30 + visibleHalfWidth;
            if (Math.abs(visualOffset) < neededOffset) {
              visualOffset = sign * neededOffset;
              const shifted = this.road.sampleSurface?.(
                relZ,
                visualOffset,
                (sp.type === 'building' || sp.type === 'house') ? { allowClipped: true } : undefined,
              );
              if (!shifted) continue;
              proj = shifted;
            }
            // Mirror renderer's screen-space adjust so the hitbox
            // tracks the visibly-shifted home.
            const screenSign = visualOffset >= 0 ? 1 : -1;
            proj.sx += 80 * screenSign;
            targetW *= 0.88;
            targetH *= 0.88;
          }
          // Mirror renderer's SCENERY_ROAD_CLEARANCE push: if the
          // projected sprite half-width + 2-car-length buffer would
          // intrude into the road, shove it outward so the bbox lands
          // exactly where the player sees it.  Skipped for cops (random
          // shoulder spawns), West Seattle homes (authored setbacks),
          // city skyline (authored 4.5+ setbacks), and rampClearance
          // sprites (already pushed + screen-shifted above).
          const isWsHome = typeof sp.texKey === 'string'
            && sp.texKey.startsWith('west_seattle_');
          // Structures bypass the dynamic clearance push — see the
          // matching block in _renderSceneSprites() at ~line 9753.
          // Keeping the two checks symmetric ensures the collision
          // rect tracks the rendered sprite at its authored offset
          // instead of drifting laterally as the player approaches.
          if (!isCopRand && !isWsHome && !isCitySkyline
              && !Number.isFinite(sp.roadEdgeGapCars)
              && !sp.rampClearance
              && sp.type !== 'building' && sp.type !== 'house'
              && proj.roadHalfW > 1) {
            const sign = visualOffset >= 0 ? 1 : -1;
            const clearPx = proj.sw * SCENERY_ROAD_CLEARANCE_CAR_LENGTHS;
            const neededOffset = 1 + (targetW * 0.5 + clearPx) / proj.roadHalfW;
            if (Math.abs(visualOffset) < neededOffset) {
              visualOffset = sign * neededOffset;
              const shifted = this.road.sampleSurface?.(
                relZ,
                visualOffset,
                (sp.type === 'building' || sp.type === 'house') ? { allowClipped: true } : undefined,
              );
              if (!shifted) continue;
              proj = shifted;
            }
          }
          // Per-type collisionWidthFraction.  A flat 0.65 was too wide
          // for residential houses (West Seattle / Mercer Island use
          // the same wide home PNGs at offset ~2.05 right next to the
          // road) — that caused the "crashes before the white line"
          // bug.  Tall narrow Bellevue towers genuinely fill most of
          // their PNG, so they get a wider band and remain reachable.
          // House PNGs have ~30% transparent padding on each side around
          // the actual building art, so a 0.30 fraction overshoots into
          // empty pixels.  0.22 lines the red collision rect up with
          // the visible building edges (verified via debug overlay).
          // West Seattle / Mercer Island photo homes: these PNGs actually
          // fill most of their frame (unlike the type='house' Mercer
          // PNGs which have ~30 % transparent padding per side).  0.70
          // (bumped from 0.55 per "about a car width bigger" feedback)
          // covers the bulk of the home + adjacent fence/yard so a car
          // brushing the porch corner registers.
          const isPhotoHome = typeof sp.texKey === 'string'
            && sp.texKey.startsWith('west_seattle_');
          const collisionWidthFraction = sp.type === 'house' ? 0.22
                                       : isPhotoHome         ? 0.70
                                       : sp.type === 'shrub' ? 0.50
                                       : sp.type === 'tree'  ? 0.40
                                       : isCitySkyline       ? 0.90
                                       : 0.65;
          // For building / house structures WITH an authored
          // roadEdgeGapCars, derive the collision rect from the SAME
          // painted-edge invariant the renderer uses.  Sprites without
          // an authored gap (cranes, etc.) use the legacy path so
          // their hand-tuned positioning isn't disturbed.
          const _isStructHit = (sp.type === 'building' || sp.type === 'house')
                            && Number.isFinite(sp.roadEdgeGapCars)
                            && !sp.rampClearance;
          let spL, spR;
          if (_isStructHit) {
            const sign = (visualOffset >= 0) ? 1 : -1;
            const centerX = proj.sx - proj.roadHalfW * visualOffset;
            const roadEdgeX = centerX + sign * proj.roadHalfW;
            const gapPx = proj.sw * sp.roadEdgeGapCars;
            const desiredInnerEdgeX = roadEdgeX + sign * gapPx;
            const bbox = STRUCTURE_BBOX[sp.texKey] ?? STRUCTURE_BBOX_DEFAULT;
            const paintedWidth = (bbox.rightFrac - bbox.leftFrac) * targetW;
            // Inner edge faces the road; outer edge is away from the road.
            if (sign >= 0) {
              spL = desiredInnerEdgeX;
              spR = desiredInnerEdgeX + paintedWidth;
            } else {
              spR = desiredInnerEdgeX;
              spL = desiredInnerEdgeX - paintedWidth;
            }
          } else {
            // Sprite anchor is bottom-center (origin 0.5, 1.0) — see pool
            // init.  Legacy collision rect = collisionWidthFraction band.
            spL = proj.sx - targetW * 0.5 * collisionWidthFraction;
            spR = proj.sx + targetW * 0.5 * collisionWidthFraction;
          }
          // Collision rect HEIGHT — only the bottom band for structures.
          // A real building can only be hit at its base (road plane),
          // not its roof.  Using the full sprite height meant the
          // collision column extended all the way to the top of a
          // 200-px tower, and any X-overlap with the player anywhere
          // along that column counted as a hit — even when the
          // building's base was nowhere near the player's screen Y.
          // That was the "moves out of the way" / phantom-hit bug.
          // Clamping to a bottom band lets the trapOverlap test
          // require actual base-of-building / chassis proximity.
          const isStructureColl = (sp.type === 'building' || sp.type === 'house');
          const collisionBandH = isStructureColl ? Math.max(18, Math.min(targetH, targetH * 0.22, 110)) : targetH;
          // Anchor the band to the RENDERED base, not the bare road plane.
          // The sprite draws its bottom at proj.sy + targetH*groundDrop (see
          // .setY in _renderSceneSprites), so a structure with groundDrop
          // (e.g. the West Seattle homes) sits its visible base below
          // proj.sy.  Track it so the collision box covers the visible base
          // instead of stopping short at the road plane.
          const _bandBaseY = proj.sy + (isStructureColl ? targetH * (profile?.groundDrop ?? 0) : 0);
          const spT = _bandBaseY - collisionBandH;
          const spB = _bandBaseY;
          // (Debug viz now lives in _renderDebugOverlay — toggle F3.)
          // Trapezoid-vs-rect test.  Replaces the old horizontal-only
          // check + house Y gate — the trapezoid math naturally
          // requires vertical proximity (the building's base must
          // project into the chassis Y range to overlap), without the
          // false-positive band the AABB caused for tall sprites.
          if (!trapHitsRect(spL, spR, spT, spB)) continue;
          _scenicHit = true;
          // Shrubs are a glancing sideswipe — small damage + tiny
          // nudge away from the bush, NO warp-to-center.  Everything
          // else (trees, buildings, cows, landmarks) keeps the full
          // crash → respawn-to-recovery-lane behavior.
          if (sp.type === 'shrub') {
            this._sceneryGlance(proj, sp.damage ?? 1, sp);
          } else {
            this._triggerSceneryRespawn(proj, sp.damage ?? 10);
          }
          break;
        }
      }

      // ── Roadside SIGN collisions (exit + amenities) ─────────────────
      // Signs render via getVehicleProjection + a sign-specific scale (NOT
      // the generic scenery path above, which uses sampleSurface + the
      // clearance push), so they need a hit test that MIRRORS the sign
      // renderer's projection — otherwise the visible sign and its hitbox
      // don't line up and the car drives clean through.  Drive into the
      // sign's lower posts off-road and take its damage (10) once per sign.
      if (!_scenicHit) {
        const _signStart = Math.floor(this._renderCamPos() / SEG_LENGTH);
        for (let n = 0; n <= 40 && !_scenicHit; n++) {
          const _seg = this.road.segments[(_signStart + n) % this.road.segments.length];
          if (!_seg?.sprites) continue;
          for (const sp of _seg.sprites) {
            if (sp.type !== 'exit_sign_green' && sp.type !== 'amenities_sign') continue;
            if (sp._signHit || sp.collected) continue;
            const _relZ  = n * SEG_LENGTH + SEG_LENGTH / 2;
            // Same projection + scale the renderer uses (see _renderSignText).
            const _sproj = this.road.getVehicleProjection?.(_relZ, sp.offset);
            if (!_sproj || _sproj.sw < 4) continue;
            const _signW = _sproj.sw * ((sp.baseW ?? 6400) / 825) * 0.5;
            const _signH = _sproj.sw * ((sp.baseH ?? 8800) / 825) * 0.5;
            const _halfW = _signW * 0.42;
            // Lower band = the posts at road level the car can actually clip.
            if (trapHitsRect(_sproj.sx - _halfW, _sproj.sx + _halfW,
                             _sproj.sy - _signH * 0.5, _sproj.sy)) {
              sp._signHit = true;
              _scenicHit  = true;
              this._sceneryGlance(_sproj, sp.damage ?? 10, sp);
            }
          }
        }
      }
    }

    // Traffic vehicle collisions use BOTH a world-space near gate and a
    // screen-space overlap test. The near gate matters on steep downhill
    // bridge stretches: perspective can visually compress a far car near
    // the player sprite, but it is still thousands of world units ahead.
    // Strict screen-space collision + impact-type classification.
    // The NPC sprite's CENTRE must fall inside the player sprite's
    // bounding rectangle for ANY hit. From the geometry of the overlap we
    // then classify the crash so it behaves differently:
    //
    //   • REAR-END   — player slammed straight into NPC's back at speed
    //   • SIDE-SWIPE — sideways brush, NPC pushed off, player keeps going
    //   • CORNER     — corner-of-bumper clip, both nudged but no explosion
    // Player hitbox = the on-screen TRAPEZOID drawn by the F3 debug overlay
    // (sprite chassis: wider at the bumper, narrower at the hood).  An NPC
    // hit fires when this trapezoid crosses the NPC's projected rect — i.e.
    // exactly when the green + orange F3 boxes overlap (per user).  Pulled
    // from the LIVE sprite so it tracks scaling; the 0.45 / 0.30 half-widths
    // and the sprite-anchored Y match the debug overlay's trapezoid 1:1.
    const _pDispW    = this.playerSprite.displayWidth  || 90;
    const _pDispH    = this.playerSprite.displayHeight || 56;
    const playerCX   = this.playerSprite.x;
    const _pBotY     = this.playerSprite.y;                 // bumper (nearest)
    const _pTopY     = this.playerSprite.y - _pDispH * 0.5; // hood (recedes)
    const _pBotHalfW = _pDispW * 0.45;
    const _pTopHalfW = _pDispW * 0.30;
    // Trapezoid (widening hood→bumper) vs a screen rect → px of horizontal
    // overlap at the lowest shared Y row (where the trapezoid is widest
    // within the band).  Returns 0 when the boxes don't cross.
    const trapVsRect = (rL, rR, rT, rB) => {
      const yT = Math.max(rT, _pTopY);
      const yB = Math.min(rB, _pBotY);
      if (yB < yT) return 0;                       // no vertical overlap
      const f     = (yB - _pTopY) / Math.max(1, _pBotY - _pTopY);
      const halfW = _pTopHalfW + (_pBotHalfW - _pTopHalfW) * f;
      return Math.max(0, Math.min(rR, playerCX + halfW) - Math.max(rL, playerCX - halfW));
    };

    // Returns null if no hit, else { type, dxRel, dyRel, side }.
    const classifyHit = (proj) => {
      if (!proj || proj.sw < 6) return null;
      const halfX = proj.sw * 0.42;
      const npcH  = proj.sw * (40 / 64) * 0.85;
      // NPC sprite origin (0.5, 1): bottom = proj.sy, top = proj.sy - npcH.
      const npcBot = proj.sy;
      const npcTop = proj.sy - npcH;
      // Hit ⇔ the player trapezoid crosses the NPC rect (green ∩ orange box).
      const overlapPx = trapVsRect(proj.sx - halfX, proj.sx + halfX, npcTop, npcBot);
      if (overlapPx <= 0) return null;
      // How much of the player's bumper the NPC covers drives the crash type.
      const overlapRatio = overlapPx / Math.max(1, 2 * _pBotHalfW);
      const dx    = proj.sx - playerCX;
      const side  = dx >= 0 ? 'right' : 'left';
      const dxRel = 1 - Math.min(1, overlapRatio);

      let type;
      // High overlap ⇒ head-on / rear-end; a sliver ⇒ glancing side-swipe.
      if (overlapRatio >= 0.35)      type = 'rear-end';   // bumper-to-bumper
      else if (overlapRatio >= 0.10) type = 'corner';     // diagonal corner clip
      else                           type = 'side-swipe'; // grazing the flank
      return { type, dxRel, dyRel: 0, side, overlapRatio };
    };

    // On bridge segments, the carriageways are physically separated by a
    // median + railing — oncoming cars in the opposite carriageway can
    // visually overlap the player's screen rect during curves, so we
    // gate oncoming-collisions by lateral world-space distance.  If the
    // player has swerved across the median INTO oncoming (gap small),
    // we still register the hit; only the "across the divider" phantom
    // overlap gets skipped.
    const playerSeg = this.road.segments[segIdx];
    const onBridge  = !!(playerSeg?.bridge || playerSeg?.water);
    // ~half a lane width — anything bigger is a different carriageway.
    const BRIDGE_OPPDIR_GAP = 0.55;
    // ── World-space AABB collision ─────────────────────────────────
    // The previous screen-space test missed real crashes whenever the
    // NPC's projection fell outside the narrow vertical window where
    // the player's screen rect lived.  Use a 3D box test on the road
    // plane instead: a hit fires when |Δposition| < CAR_LEN_Z AND
    // |Δlane| < CAR_WIDTH_LANES.  Screen-space classifyHit() is kept
    // only to LABEL the hit (rear-end / corner / side-swipe).
    const playerLane = p.x ?? 0;
    // The player's VISUAL position on screen is PLAYER_VIRTUAL_Z units
    // ahead of the camera, so collisions need to fire when an NPC is
    // near THAT z, not the camera's z.  Same offset used by the
    // forward-cull and the rear-view, keeps everything consistent.
    const playerPos  = p.position + PLAYER_VIRTUAL_Z;
    // Motion-aware swept threshold — closing speeds can exceed
    // 2×CAR_LEN_Z in a single frame once the player picks up Rx
    // (+7 mph each), so a naïve |dz| < 500 check tunnels straight
    // through oncoming traffic.  Expand the z-window by 60 % of this
    // frame's relative motion so the check fires whenever the pair's
    // swept paths overlap, not just their snapshot positions.
    const _frameDtSec = Math.min(1 / 20, (this.game?.loop?.delta ?? 16.67) / 1000);
    const aabbHit = (entityPos, entityLane, entitySpeed = 0) => {
      const relSpeed = Math.abs((p.speed ?? 0) - (entitySpeed ?? 0));
      const sweep    = relSpeed * _frameDtSec * 0.60;
      const dz       = Math.abs(entityPos - playerPos);
      if (dz >= CAR_LEN_Z + sweep) return false;
      const dl = Math.abs(playerLane - (entityLane ?? 0));
      if (dl >= CAR_WIDTH_LANES * 2) return false;
      return true;
    };
    // Defensive label fallback — derive a hit type from the world-space
    // overlap when classifyHit() can't (NPC just behind the player /
    // off-screen so screen projection is unhelpful).
    const labelFromAABB = (entityPos, entityLane) => {
      const dl = Math.abs(playerLane - (entityLane ?? 0));
      const lateralOverlap = Math.max(0, 1 - dl / (CAR_WIDTH_LANES * 2));
      let type;
      if (lateralOverlap >= 0.65)      type = 'rear-end';
      else if (lateralOverlap >= 0.30) type = 'corner';
      else                              type = 'side-swipe';
      const side = (entityLane ?? 0) >= playerLane ? 'right' : 'left';
      return { type, dxRel: 1 - lateralOverlap, dyRel: 0, side, overlapRatio: lateralOverlap };
    };

    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const car = this.traffic[i];
      if (!car.alive) continue;
      // Bridge median guard — opposite carriageway oncoming traffic
      // doesn't physically share the deck.
      if (onBridge && (car.speed ?? 0) < 0
          && Math.abs(playerLane - (car.laneOffset ?? 0)) > BRIDGE_OPPDIR_GAP) continue;
      // Dual gate: world-AABB OR screen-rect overlap fires the hit.
      // The world AABB catches normal lane-aligned collisions; the
      // screen-space check (same one classifyHit() uses) picks up any
      // visual overlap that the AABB misses — e.g. NPCs that render
      // between lanes due to road curvature / sampling, or sprites
      // whose projected screen position drifts from their world lane
      // centre.  Was the "drive through cars sitting on the white
      // hash marks" bug — visually the player was on top of the NPC,
      // but the lane-offset gap was wide enough that aabbHit rejected.
      const relZcam = car.position - p.position;
      const proj    = relZcam > 0
        ? this.road.getVehicleProjection(relZcam, car.laneOffset)
        : null;
      const screenHit = proj ? classifyHit(proj) : null;
      const worldHit  = aabbHit(car.position, car.laneOffset, car.speed);
      if (!worldHit && !screenHit) continue;
      const hit = screenHit || labelFromAABB(car.position, car.laneOffset);
      this._onVehicleCollision(car, i, hit);
    }

    for (let i = this.cops.cops.length - 1; i >= 0; i--) {
      const cop = this.cops.cops[i];
      // NOTE: do NOT skip rear cops here.  Rear-pursuit cops (and SWAT, which
      // is also side:'rear') ARE the 2-3★ chase — _onCopCollision has a
      // dedicated rear-ram branch (registerRearBump → BUSTED at 5) and the
      // PIT branch (armed side-swipe → instant BUSTED).  A stale
      // `if (cop.side === 'rear') continue;` here made all of that dead code,
      // so pursuit cops would close, arm the PIT, and then phase right through
      // the player — "lots of cops going nowhere, never PITing or busting."
      // Parked civil-stop cops are inert via cop.parked in CopSystem.update,
      // not here, so they won't false-collide while you sit at the stop.
      if (cop.parked) continue;
      if (onBridge && (cop.speed ?? 0) < 0
          && Math.abs(playerLane - (cop.laneOffset ?? 0)) > BRIDGE_OPPDIR_GAP) continue;
      // Same dual gate as the traffic loop above.
      const relZcam = cop.position - p.position;
      const proj    = relZcam > 0
        ? this.road.getVehicleProjection(relZcam, cop.laneOffset)
        : null;
      const screenHit = proj ? classifyHit(proj) : null;
      const worldHit  = aabbHit(cop.position, cop.laneOffset, cop.speed);
      if (!worldHit && !screenHit) continue;
      const hit = screenHit || labelFromAABB(cop.position, cop.laneOffset);
      this._onCopCollision(cop, i, hit);
    }
  }

  /** Wrapper around DamageModel.takeDamage that bakes in every drug-driven
   *  damage modifier plus the difficulty multiplier:
   *    • Fentanyl ≥ 25%  → phase: collision deals zero damage.
   *    • Beer    ≥ 100% → 50% chance to no-op on glancing hits (sideswipes,
   *                        corner clips) — head-on / rear / PIT / ram still bite.
   *    • Difficulty.damageMul scales every hit (Easy 0.7, Normal 1.0, Hard 1.5).
   *    • Meth active     → +1 hp damage on every collision.
   *    • Heroin ≥ 15%    → discrete crash hits drop by 2 hp (replaces the
   *                        older 50%/85% numbness rules per user spec).
   *  Continuous offroad bleed (source 'offroad_bleed', amount < 1) skips
   *  the collision-only rules so it still trickles through normally. */
  /** Reusable drug-slider modal.  10 horizontal sliders (one per drug),
   *  click+drag to set 0..1.  Modes:
   *    'custom'  — title-screen Custom Mode start.  Includes the neon
   *                route, driving-type, police and damage controls.
   *    'live'    — in-game adjustment.  Pre-fills sliders with current
   *                bar levels; on confirm, writes them back without
   *                restarting the scene.
   *    'restart' — technical-loss flow.  Adds checkpoint picker row.
   *  `initialLevels` (optional) — object keyed by drug id, values 0..1.
   *  `onConfirm({ drugLevels, checkpointPos, noNpcDamage, noPolice })`
   *  fires when the player taps START. */
  _buildDrugSliderModal({ mode = 'custom', onConfirm, onClose, initialLevels = null } = {}) {
    if (mode === 'custom') {
      this._buildCustomModeModal({ onConfirm, onClose, initialLevels });
      return;
    }
    if (this._sliderModalOpen) return;
    this._sliderModalOpen = true;
    const D = 280;
    const objs = [];

    const scrim = this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2,
      SCREEN_W, SCREEN_H, 0x000000, 0.85)
      .setDepth(D).setInteractive();
    // Eat clicks on the empty scrim — without this, clicks pass through
    // to whatever's underneath (title difficulty buttons, HUD, etc.)
    // because Phaser only stops propagation when a handler explicitly
    // calls it.
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    scrim.on('pointerup',   (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 40;
    const panelH = SCREEN_H - 30;
    const panelX = (SCREEN_W - panelW) / 2;
    const panelY = (SCREEN_H - panelH) / 2;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x0E1320, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 14);
    panel.lineStyle(3, 0x44AAFF, 1);
    panel.strokeRoundedRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 14);
    objs.push(panel);

    const titleStr = mode === 'restart' ? 'RESTART AT CHECKPOINT'
                   : mode === 'live'    ? 'ADJUST DRUG LEVELS'
                   :                       'CUSTOM MODE';
    const title = this.add.text(SCREEN_W / 2, panelY + 8, titleStr, {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#44CCFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Selected state — drug levels (pre-filled from initialLevels if
    // provided, else 0) + chosen checkpoint pos + custom-start flags.
    const drugLevels = {};
    for (const id of Object.values(DRUGS)) {
      drugLevels[id] = initialLevels?.[id] ?? 0;
    }
    let checkpointPos = this.player?.position ?? 0;
    let checkpointLabel = 'Current';
    let noNpcDamage = false;
    let noPolice    = false;
    // Sub-difficulty picked WITHIN Custom mode — Custom keeps its
    // no-score / no-clock vibe but inherits damage / cop / traffic
    // multipliers from whichever of E/N/H the player picks.  Default
    // to whatever was last saved.
    let customSub = Difficulty.customSub?.() ?? 'normal';

    let yCursor = panelY + 32;

    // ── Sub-difficulty picker (custom mode only) ──────────────────
    // Three small buttons "EASY / NORMAL / HARD" tucked between the
    // title and the drug sliders.  Picking one updates the modal's
    // local `customSub` state; the choice is committed on START.
    if (mode === 'custom') {
      const subBtnW = 86, subBtnH = 22, subGap = 8;
      const subRowW = subBtnW * 3 + subGap * 2;
      const subRowX = SCREEN_W / 2 - subRowW / 2;
      const subBtnY = yCursor;   // FROZEN — used by subRefresh closure
      const subLabel = this.add.text(panelX + 12, subBtnY + subBtnH / 2,
        'GAMEPLAY:', {
          fontSize: '11px', fontFamily: 'Impact, "Arial Black", sans-serif',
          color: '#AAA', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(D + 2);
      objs.push(subLabel);
      const subBtns = [];
      const subRefresh = () => {
        subBtns.forEach(({ id, bg, lbl, x }) => {
          const on = id === customSub;
          // Use the frozen subBtnY — yCursor will have advanced past
          // this row by the time the player taps a button, so the
          // redraw must reference its original Y, not whatever the
          // outer cursor has reached.
          bg.clear();
          bg.fillStyle(on ? 0x44CCFF : 0x222222, 1);
          bg.fillRoundedRect(x, subBtnY, subBtnW, subBtnH, 6);
          bg.lineStyle(2, on ? 0xFFFFFF : 0x888888, 1);
          bg.strokeRoundedRect(x + 0.5, subBtnY + 0.5, subBtnW - 1, subBtnH - 1, 6);
          lbl.setColor(on ? '#000' : '#DDD');
          // Drop the black text stroke on the selected button — the
          // black-on-cyan reads cleanly without it, and the outline
          // muddies the highlight against the bright fill.
          lbl.setStroke('#000', on ? 0 : 2);
        });
      };
      ['easy', 'normal', 'hard'].forEach((id, i) => {
        const bx = subRowX + i * (subBtnW + subGap);
        const bg = this.add.graphics().setDepth(D + 2);
        bg.setInteractive(new Phaser.Geom.Rectangle(bx, subBtnY, subBtnW, subBtnH),
          Phaser.Geom.Rectangle.Contains);
        bg.input.cursor = 'pointer';
        const lbl = this.add.text(bx + subBtnW / 2, subBtnY + subBtnH / 2,
          id.toUpperCase(), {
          fontSize: '13px', fontFamily: 'Impact, "Arial Black", sans-serif',
          color: '#DDD', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(D + 3);
        bg.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          customSub = id;
          subRefresh();
        });
        subBtns.push({ id, bg, lbl, x: bx });
        objs.push(bg, lbl);
      });
      subRefresh();
      yCursor += subBtnH + 8;
    }

    // ── Checkpoint picker (restart mode only) ────────────────────
    if (mode === 'restart') {
      const cpLabel = this.add.text(panelX + 12, yCursor,
        'Resume from:', {
          fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#AAAAAA',
        }).setOrigin(0, 0).setDepth(D + 2);
      objs.push(cpLabel);
      yCursor += 14;
      const cpStops = [
        { label: 'Seattle (start)', pos: 0 },
        ...REST_STOPS.map(rs => ({ label: rs.name, pos: rs.t * (ROUTE_SEGS * SEG_LENGTH) })),
      ];
      const cpRowW = panelW - 24;
      const cpBtnW = Math.floor((cpRowW - 4 * (cpStops.length - 1)) / cpStops.length);
      const cpBtnH = 22;
      const cpBgs = [];
      cpStops.forEach((cp, i) => {
        const bx = panelX + 12 + i * (cpBtnW + 4);
        const bg = this.add.graphics().setDepth(D + 2);
        const drawCp = (active) => {
          bg.clear();
          bg.fillStyle(active ? 0x4488FF : 0x222222, 1);
          bg.fillRoundedRect(bx, yCursor, cpBtnW, cpBtnH, 6);
          bg.lineStyle(1, 0x88AACC, 1);
          bg.strokeRoundedRect(bx + 0.5, yCursor + 0.5, cpBtnW - 1, cpBtnH - 1, 6);
        };
        drawCp(i === 0);
        bg.setInteractive(new Phaser.Geom.Rectangle(bx, yCursor, cpBtnW, cpBtnH), Phaser.Geom.Rectangle.Contains);
        bg.input.cursor = 'pointer';
        cpBgs.push({ bg, drawCp });
        const lbl = this.add.text(bx + cpBtnW / 2, yCursor + cpBtnH / 2,
          cp.label.split(',')[0], {
            fontSize: '8px', fontFamily: 'Impact, "Arial Black", sans-serif',
            color: '#FFFFFF',
          }).setOrigin(0.5).setDepth(D + 3);
        bg.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          checkpointPos   = cp.pos;
          checkpointLabel = cp.label;
          cpBgs.forEach((entry, j) => entry.drawCp(j === i));
        });
        objs.push(bg, lbl);
      });
      yCursor += cpBtnH + 12;
      // Default: first option (Seattle start)
      checkpointPos   = cpStops[0].pos;
      checkpointLabel = cpStops[0].label;
    }

    // ── Drug-level sliders ───────────────────────────────────────
    const drugList = Object.values(DRUGS);
    const drugCfgList = drugList.map(id => ({ id, cfg: DRUG_CONFIG[id] }));
    const sliderRowH  = 22;
    const trackX      = panelX + 110;
    const trackW      = panelW - 110 - 60;
    const trackH      = 12;
    const sliderRefs = [];

    for (let i = 0; i < drugCfgList.length; i++) {
      const { id, cfg } = drugCfgList[i];
      const y = yCursor + i * sliderRowH;
      const lbl = this.add.text(panelX + 12, y, cfg.label ?? id, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif',
        color: '#' + (cfg.color ?? 0xFFFFFF).toString(16).padStart(6, '0'),
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 2);
      objs.push(lbl);

      // Slider track + fill
      const track = this.add.graphics().setDepth(D + 2);
      track.fillStyle(0x222222, 1);
      track.fillRoundedRect(trackX, y + 1, trackW, trackH, 6);
      track.lineStyle(1, 0x666666, 1);
      track.strokeRoundedRect(trackX + 0.5, y + 1.5, trackW - 1, trackH - 1, 6);
      track.setInteractive(new Phaser.Geom.Rectangle(trackX, y, trackW, sliderRowH),
        Phaser.Geom.Rectangle.Contains);
      track.input.cursor = 'pointer';
      objs.push(track);

      const fill = this.add.graphics().setDepth(D + 3);
      const valTxt = this.add.text(trackX + trackW + 6, y + 1, '0%', {
        fontSize: '10px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#FFFFFF',
      }).setOrigin(0, 0).setDepth(D + 3);
      objs.push(fill, valTxt);

      const drawFill = (level) => {
        fill.clear();
        fill.fillStyle(cfg.color ?? 0x44AAFF, 0.85);
        fill.fillRoundedRect(trackX + 1, y + 2, Math.max(0, (trackW - 2) * level), trackH - 2, 5);
        valTxt.setText(`${Math.round(level * 100)}%`);
      };
      drawFill(drugLevels[id] ?? 0);   // pre-fill from initialLevels (if any)

      let dragging = false;
      const updateFromPointer = (ptr) => {
        const lx = ptr.x - trackX;
        const lvl = Math.max(0, Math.min(1, lx / trackW));
        drugLevels[id] = lvl;
        drawFill(lvl);
      };
      track.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        dragging = true;
        updateFromPointer(ptr);
      });
      track.on('pointermove', (ptr) => {
        if (!dragging) return;
        updateFromPointer(ptr);
      });
      // Bind release globally so dragging off the track still releases.
      const onUp = () => { dragging = false; };
      this.input.on('pointerup', onUp);
      sliderRefs.push({ id, drawFill, onUp });
    }

    // ── Custom-mode WANTED-LEVEL picker (0★ – 5★) ────────────────
    // Sits just above the No-NPC-damage / No-police checkboxes.  Six
    // buttons in a row, active one tinted yellow.  Resolved star count
    // is passed through to onConfirm so _startGameplay can seed it.
    // Reverse-couples with the No-police checkbox below: picking a
    // non-zero star count auto-unchecks "No police" (the two settings
    // are mutually exclusive).
    let startStars = 0;
    let refreshStarBtns = null;          // hoisted so checkboxes can repaint it
    let uncheckNoPolice = null;          // hoisted so stars can uncheck No-Police
    if (mode === 'custom') {
      const starRowY  = panelY + panelH - 116;
      const starBtnW  = 38;
      const starBtnH  = 30;
      const starGap   = 6;
      this.add.text(panelX + 22, starRowY + starBtnH / 2, 'STARS', {
        fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0, 0.5).setDepth(D + 3);
      const starButtons = [];
      refreshStarBtns = () => {
        starButtons.forEach((entry, i) => {
          const isOn = i === startStars;
          entry.bg.clear();
          entry.bg.fillStyle(isOn ? 0xFFCC22 : 0x222222, 1);
          entry.bg.fillRoundedRect(entry.x, starRowY, starBtnW, starBtnH, 5);
          entry.bg.lineStyle(2, isOn ? 0xFFFFFF : 0x888888, 1);
          entry.bg.strokeRoundedRect(entry.x + 0.5, starRowY + 0.5, starBtnW - 1, starBtnH - 1, 5);
          entry.lbl.setColor(isOn ? '#000' : '#DDD');
        });
      };
      const starXStart = panelX + 96;
      for (let i = 0; i <= 5; i++) {
        const sx = starXStart + i * (starBtnW + starGap);
        const bg = this.add.graphics().setDepth(D + 2);
        bg.setInteractive(new Phaser.Geom.Rectangle(sx, starRowY, starBtnW, starBtnH), Phaser.Geom.Rectangle.Contains);
        bg.input.cursor = 'pointer';
        const lbl = this.add.text(sx + starBtnW / 2, starRowY + starBtnH / 2,
          i === 0 ? '0' : i + '★', {
          fontSize: '16px', fontFamily: 'Impact, "Arial Black", sans-serif',
          color: '#DDD', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(D + 3);
        starButtons.push({ x: sx, bg, lbl });
        objs.push(bg, lbl);
        bg.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          startStars = i;
          refreshStarBtns();
          // Picking a real wanted level forces "No police" OFF — the
          // two settings can't coexist.
          if (i > 0) uncheckNoPolice?.();
        });
      }
      refreshStarBtns();
    }

    // ── Custom-mode checkboxes (No NPC damage / No police) ───────
    if (mode === 'custom') {
      const cbY = panelY + panelH - 80;
      const cbSize = 22;
      const checkboxes = [
        { x: panelX + 22,        label: 'No NPC damage', key: 'noNpcDamage' },
        { x: panelX + 22 + 220,  label: 'No police',     key: 'noPolice' },
      ];
      const cbState = { noNpcDamage: false, noPolice: false };
      const cbRefreshers = {};
      checkboxes.forEach(({ x, label, key }) => {
        const box = this.add.graphics().setDepth(D + 2);
        const drawBox = (checked) => {
          box.clear();
          box.fillStyle(checked ? 0x44CCFF : 0x222222, 1);
          box.fillRoundedRect(x, cbY, cbSize, cbSize, 4);
          box.lineStyle(2, 0xFFFFFF, 1);
          box.strokeRoundedRect(x + 0.5, cbY + 0.5, cbSize - 1, cbSize - 1, 4);
          if (checked) {
            box.lineStyle(3, 0xFFFFFF, 1);
            box.beginPath();
            box.moveTo(x + 4, cbY + cbSize * 0.55);
            box.lineTo(x + cbSize * 0.45, cbY + cbSize - 4);
            box.lineTo(x + cbSize - 3, cbY + 4);
            box.strokePath();
          }
        };
        drawBox(false);
        cbRefreshers[key] = drawBox;
        box.setInteractive(new Phaser.Geom.Rectangle(x, cbY, cbSize, cbSize), Phaser.Geom.Rectangle.Contains);
        box.input.cursor = 'pointer';
        const lbl = this.add.text(x + cbSize + 8, cbY + cbSize / 2, label, {
          fontSize: '15px', fontFamily: 'Arial, sans-serif',
          color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setDepth(D + 3);
        const toggle = () => {
          cbState[key] = !cbState[key];
          drawBox(cbState[key]);
          if (key === 'noNpcDamage') noNpcDamage = cbState[key];
          if (key === 'noPolice') {
            noPolice = cbState[key];
            // Checking "No police" implicitly zeros wanted level.
            if (cbState[key]) {
              startStars = 0;
              refreshStarBtns?.();
            }
          }
        };
        box.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          toggle();
        });
        const lblHit = this.add.rectangle(x + cbSize + 8, cbY, 180, cbSize, 0x000000, 0)
          .setOrigin(0, 0).setDepth(D + 3).setInteractive({ useHandCursor: true });
        lblHit.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          toggle();
        });
        objs.push(box, lbl, lblHit);
      });
      // Hoisted handle for the star picker to force No-Police OFF.
      uncheckNoPolice = () => {
        if (cbState.noPolice) {
          cbState.noPolice = false;
          noPolice = false;
          cbRefreshers.noPolice?.(false);
        }
      };
    }

    // ── Confirm / Cancel buttons ─────────────────────────────────
    const btnY = panelY + panelH - 38;
    const btnW = 140, btnH = 30, btnGap = 16;
    const startX = SCREEN_W / 2 - btnW - btnGap / 2;
    const cancelX = SCREEN_W / 2 + btnGap / 2;

    const startBg = this.add.graphics().setDepth(D + 2);
    startBg.fillStyle(0x227755, 1);
    startBg.fillRoundedRect(startX, btnY, btnW, btnH, 8);
    startBg.lineStyle(2, 0xFFFFFF, 1);
    startBg.strokeRoundedRect(startX + 0.5, btnY + 0.5, btnW - 1, btnH - 1, 8);
    startBg.setInteractive(new Phaser.Geom.Rectangle(startX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    startBg.input.cursor = 'pointer';
    const startLbl = this.add.text(startX + btnW / 2, btnY + btnH / 2, 'START', {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(startBg, startLbl);

    const cancelBg = this.add.graphics().setDepth(D + 2);
    cancelBg.fillStyle(0x442222, 1);
    cancelBg.fillRoundedRect(cancelX, btnY, btnW, btnH, 8);
    cancelBg.lineStyle(2, 0xFFFFFF, 1);
    cancelBg.strokeRoundedRect(cancelX + 0.5, btnY + 0.5, btnW - 1, btnH - 1, 8);
    cancelBg.setInteractive(new Phaser.Geom.Rectangle(cancelX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    cancelBg.input.cursor = 'pointer';
    const cancelLbl = this.add.text(cancelX + btnW / 2, btnY + btnH / 2, 'CANCEL', {
      fontSize: '15px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(cancelBg, cancelLbl);

    const close = () => {
      this._sliderModalOpen = false;
      sliderRefs.forEach(r => this.input.off('pointerup', r.onUp));
      objs.forEach(o => o?.destroy?.());
      onClose?.();          // always fires — restore pause state, etc.
    };
    cancelBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });
    startBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
      onConfirm?.({
        drugLevels: { ...drugLevels },
        checkpointPos, checkpointLabel,
        noNpcDamage, noPolice,
        startStars,
        customSub,
      });
    });

    this._addHudObjs?.(...objs);
  }

  _buildCustomModeModal({ onConfirm, onClose, initialLevels = null } = {}) {
    if (this._sliderModalOpen) return;
    this._sliderModalOpen = true;
    const D = 280;
    const objs = [];
    const releaseHandlers = [];
    const add = (...nodes) => { objs.push(...nodes); return nodes; };

    const backdrop = this.textures.exists('ui_loading_screen')
      ? this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'ui_loading_screen')
        .setDisplaySize(SCREEN_W, SCREEN_H).setDepth(D)
      : this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x03050D).setDepth(D);
    const dim = this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x02040B, 0.36)
      .setDepth(D + 1).setInteractive();
    dim.on('pointerdown', ptr => ptr.event?.stopPropagation?.());
    dim.on('pointerup', ptr => ptr.event?.stopPropagation?.());
    add(backdrop, dim);

    const panelX = 18, panelY = 12, panelW = SCREEN_W - 36, panelH = SCREEN_H - 24;
    const panel = this.add.graphics().setDepth(D + 2);
    panel.fillStyle(0x050812, 0.73);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(4, 0x163550, 0.6);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(2, 0x39A8FF, 1);
    panel.strokeRoundedRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4, 10);
    panel.lineStyle(1, 0xFF39AF, 0.74);
    panel.strokeRoundedRect(panelX + 7, panelY + 7, panelW - 14, panelH - 14, 8);
    add(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 8, 'CUSTOM MODE', {
      fontSize: '25px', fontFamily: IMPACT, color: '#F4F7FF',
      stroke: '#39A8FF', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 4).setShadow(0, 0, '#39A8FF', 8, true, true);
    add(title);

    const leftX = panelX + 18;
    const dividerX = 380;
    const rightX = dividerX + 18;
    const division = this.add.graphics().setDepth(D + 3);
    division.lineStyle(1, 0x39A8FF, 0.42);
    division.lineBetween(dividerX, panelY + 45, dividerX, panelY + panelH - 18);
    add(division);
    add(this.add.text(leftX, panelY + 48, 'CHEMICAL LEVELS', {
      fontSize: '15px', fontFamily: IMPACT, color: '#39D9FF',
    }).setDepth(D + 4));

    const drugLevels = {};
    const drugKeys = {
      alcohol: 'drug_beer', weed: 'drug_weed', cocaine: 'drug_cocaine',
      shrooms: 'drug_shrooms', lsd: 'drug_lsd', heroin: 'drug_heroin',
      rx: 'drug_rx', fentanyl: 'drug_fentanyl', ketamine: 'drug_ketamine', meth: 'drug_meth',
    };
    const shortLabels = {
      alcohol: 'BEER', weed: 'WEED', cocaine: 'COKE', shrooms: 'SHROOMS', lsd: 'ACID',
      heroin: 'HEROIN', rx: 'RX', fentanyl: 'FENT', ketamine: 'KET', meth: 'METH',
    };
    const trackX = leftX + 111, trackW = 171, trackH = 10;
    const rowTop = panelY + 70, rowH = 34;
    Object.values(DRUGS).forEach((id, i) => {
      drugLevels[id] = initialLevels?.[id] ?? 0;
      const cfg = DRUG_CONFIG[id];
      const y = rowTop + i * rowH;
      const textureKey = drugKeys[id];
      if (this.textures.exists(textureKey)) {
        add(this.add.image(leftX + 13, y + 12, textureKey).setDisplaySize(27, 27).setDepth(D + 5));
      }
      add(this.add.text(leftX + 32, y + 5, shortLabels[id], {
        fontSize: '12px', fontFamily: IMPACT, color: cfg.hexCss ?? '#FFFFFF',
        stroke: '#02040B', strokeThickness: 2,
      }).setDepth(D + 5));
      const track = this.add.graphics().setDepth(D + 4);
      track.fillStyle(0x030712, 0.94);
      track.fillRoundedRect(trackX, y + 8, trackW, trackH, 5);
      track.lineStyle(1, 0x315173, 1);
      track.strokeRoundedRect(trackX, y + 8, trackW, trackH, 5);
      track.setInteractive(new Phaser.Geom.Rectangle(trackX, y + 3, trackW, 22), Phaser.Geom.Rectangle.Contains);
      track.input.cursor = 'pointer';
      const fill = this.add.graphics().setDepth(D + 5);
      const pct = this.add.text(trackX + trackW + 7, y + 5, '0%', {
        fontSize: '12px', fontFamily: IMPACT, color: '#F4F7FF',
      }).setDepth(D + 5);
      add(track, fill, pct);
      const drawFill = value => {
        fill.clear();
        const width = Math.max(0, (trackW - 2) * value);
        fill.fillStyle(cfg.color ?? 0x39D9FF, 0.94);
        fill.fillRoundedRect(trackX + 1, y + 9, width, trackH - 2, 4);
        pct.setText(`${Math.round(value * 100)}%`);
      };
      drawFill(drugLevels[id]);
      let dragging = false;
      const update = ptr => {
        drugLevels[id] = Math.max(0, Math.min(1, (ptr.x - trackX) / trackW));
        drawFill(drugLevels[id]);
      };
      track.on('pointerdown', ptr => { ptr.event?.stopPropagation?.(); dragging = true; update(ptr); });
      track.on('pointermove', ptr => { if (dragging) update(ptr); });
      const release = () => { dragging = false; };
      this.input.on('pointerup', release);
      releaseHandlers.push(release);
    });

    let customSub = Difficulty.customSub?.() ?? 'normal';
    let noPolice = false;
    let noNpcDamage = false;
    let startStars = 0;
    let checkpointPos = 0;
    let checkpointLabel = CHECKPOINTS[0]?.name ?? 'West Seattle';
    const driveOptions = [
      { id: 'classic', label: 'THUMBS' },
      { id: 'flappy', label: 'TAP' },
      { id: 'tilt', label: 'TILT' },
    ];
    let drivingType = this.registry?.get?.('titleThumbsPick')
                   ?? this.registry?.get?.('steeringMode')
                   ?? 'classic';

    const drawNeonButton = (g, x, y, w, h, color, selected) => {
      g.clear();
      const pts = [
        new Phaser.Geom.Point(x + 7, y),
        new Phaser.Geom.Point(x + w, y),
        new Phaser.Geom.Point(x + w - 7, y + h),
        new Phaser.Geom.Point(x, y + h),
      ];
      g.fillStyle(selected ? color : 0x060A14, selected ? 0.22 : 0.76);
      g.fillPoints(pts, true);
      g.lineStyle(selected ? 2 : 1, color, selected ? 1 : 0.7);
      g.strokePoints(pts, true);
    };
    const makeToggleButton = (x, y, w, h, text, color, selected, action) => {
      const bg = this.add.graphics().setDepth(D + 4);
      const lbl = this.add.text(x + w / 2, y + h / 2, text, {
        fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
        stroke: '#050812', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 5);
      const refresh = on => {
        drawNeonButton(bg, x, y, w, h, color, on);
        lbl.setColor(on ? '#F4F7FF' : '#9EACC2');
      };
      refresh(selected);
      bg.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
      bg.input.cursor = 'pointer';
      bg.on('pointerdown', ptr => { ptr.event?.stopPropagation?.(); action?.(); });
      add(bg, lbl);
      return { bg, lbl, refresh };
    };

    add(this.add.text(rightX, panelY + 50, 'GAMEPLAY', {
      fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setDepth(D + 4));
    const subBtns = [];
    ['easy', 'normal', 'hard'].forEach((id, i) => {
      const btn = makeToggleButton(rightX + 82 + i * 90, panelY + 45, 83, 28,
        id.toUpperCase(), id === 'normal' ? 0x39A8FF : (id === 'hard' ? 0xFF39AF : 0x39D9FF),
        id === customSub, () => {
          customSub = id;
          subBtns.forEach(b => b.refresh(b.id === customSub));
        });
      subBtns.push({ id, ...btn });
    });

    const mapY = panelY + 345;
    const mapLine = this.add.graphics().setDepth(D + 4);
    const mapLeft = rightX + 7, mapRight = panelX + panelW - 26;
    mapLine.lineStyle(2, 0x39A8FF, 0.72);
    mapLine.lineBetween(mapLeft, mapY, mapRight, mapY);
    mapLine.lineStyle(1, 0xFF39AF, 0.45);
    mapLine.lineBetween(mapLeft, mapY + 3, mapRight, mapY + 3);
    add(mapLine);
    // "Location:" label sits just LEFT of the dynamic city name so the
    // pair reads as "Location: SEATTLE" centred on the map track.  The
    // city readout is shifted a few px right of centre to leave room
    // for the label.
    const cityReadout = this.add.text((mapLeft + mapRight) / 2 + 8, mapY - 23, 'SEATTLE', {
      fontSize: '17px', fontFamily: IMPACT, color: '#FF39AF',
      stroke: '#050812', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(D + 5);
    add(cityReadout);
    add(this.add.text((mapLeft + mapRight) / 2 + 2, mapY - 22, 'Location:', {
      fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
      stroke: '#050812', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(D + 5));
    add(this.add.text(mapLeft, mapY - 23, 'SEATTLE', {
      fontSize: '14px', fontFamily: IMPACT, color: '#39D9FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    add(this.add.text(mapRight, mapY - 23, 'PULLMAN', {
      fontSize: '14px', fontFamily: IMPACT, color: '#39D9FF',
    }).setOrigin(1, 0.5).setDepth(D + 5));
    const cityNodes = [];
    const refreshCities = () => {
      cityNodes.forEach(({ bg, active }) => {
        const selected = active();
        bg.clear();
        bg.fillStyle(selected ? 0xFF39AF : 0x050812, 1);
        bg.fillCircle(0, 0, selected ? 5 : 3);
        bg.lineStyle(selected ? 2 : 1, selected ? 0xFFFFFF : 0x39A8FF, 1);
        bg.strokeCircle(0, 0, selected ? 6 : 4);
      });
    };
    const customStartCities = CHECKPOINTS.filter(cp => !cp.isFinish);
    customStartCities.forEach((cp, i) => {
      // Space nodes uniformly for finger selection; the selected label and
      // stored route mileage still identify the true start location.
      // Divisor uses customStartCities.length (not CHECKPOINTS.length)
      // so the LAST selectable dot lands exactly at mapRight under the
      // PULLMAN label — otherwise the finish-filtered entry left a
      // dangling line tail past the last dot suggesting more stops.
      const cx = mapLeft + ((mapRight - mapLeft) * i) / (customStartCities.length - 1);
      const bg = this.add.graphics().setPosition(cx, mapY).setDepth(D + 5);
      bg.setInteractive(new Phaser.Geom.Circle(0, 0, 8), Phaser.Geom.Circle.Contains);
      bg.input.cursor = 'pointer';
      bg.on('pointerdown', ptr => {
        ptr.event?.stopPropagation?.();
        checkpointPos = cp.t * (ROUTE_SEGS * SEG_LENGTH);
        checkpointLabel = cp.name;
        cityReadout.setText((cp.isStart ? 'Seattle' : cp.name).toUpperCase());
        refreshCities();
      });
      cityNodes.push({ bg, active: () => checkpointLabel === cp.name });
      add(bg);
    });
    refreshCities();

    const policeY = panelY + 94;
    add(this.add.text(rightX, policeY + 11, 'POLICE', {
      fontSize: '15px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    let policeBtn;
    let refreshStars;
    policeBtn = makeToggleButton(rightX + 66, policeY - 2, 80, 27, 'ON', 0x39A8FF, true, () => {
      noPolice = !noPolice;
      if (noPolice) startStars = 0;
      policeBtn.lbl.setText(noPolice ? 'OFF' : 'ON');
      policeBtn.refresh(!noPolice);
      refreshStars?.();
    });
    add(this.add.text(rightX + 156, policeY + 11, 'WANTED', {
      fontSize: '12px', fontFamily: IMPACT, color: '#A8C7E9',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    const starButtons = [];
    for (let i = 1; i <= 5; i++) {
      const sx = rightX + 217 + (i - 1) * 28;
      const star = this.add.text(sx, policeY + 11, '☆', {
        fontSize: '23px', fontFamily: 'Arial, sans-serif', color: '#67738C',
      }).setOrigin(0.5).setDepth(D + 5).setInteractive({ useHandCursor: true });
      star.on('pointerdown', ptr => {
        ptr.event?.stopPropagation?.();
        noPolice = false;
        policeBtn.lbl.setText('ON');
        policeBtn.refresh(true);
        startStars = startStars === i ? 0 : i;
        refreshStars();
      });
      starButtons.push(star);
      add(star);
    }
    refreshStars = () => {
      starButtons.forEach((star, i) => {
        const on = !noPolice && i < startStars;
        star.setText(on ? '★' : '☆').setColor(on ? '#FFD34D' : '#67738C');
        star.setStroke(on ? '#FF8A24' : '#0A1020', on ? 2 : 1);
      });
    };
    refreshStars();

    const damageY = panelY + 132;
    add(this.add.text(rightX, damageY + 11, 'DAMAGE', {
      fontSize: '15px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    let damageBtn;
    damageBtn = makeToggleButton(rightX + 66, damageY - 2, 80, 27, 'ON', 0xFF39AF, true, () => {
      noNpcDamage = !noNpcDamage;
      damageBtn.lbl.setText(noNpcDamage ? 'OFF' : 'ON');
      damageBtn.refresh(!noNpcDamage);
    });
    add(this.add.text(rightX + 156, damageY + 11, 'PLAYER CAR TAKES NO DAMAGE', {
      fontSize: '12px', fontFamily: IMPACT, color: '#A8C7E9',
    }).setOrigin(0, 0.5).setDepth(D + 5));

    const driveY = panelY + 171;
    add(this.add.text(rightX, driveY + 14, 'DRIVING TYPE', {
      fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    const driveBtns = [];
    driveOptions.forEach((opt, i) => {
      const btn = makeToggleButton(rightX + 103 + i * 86, driveY, 80, 28,
        opt.label, 0xCE67FF, opt.id === drivingType, () => {
          drivingType = opt.id;
          // Persist immediately so _armTiltPrefetch's next-tap listener
          // sees the pick and can request iOS tilt permission inside
          // the same gesture frame.
          this.registry?.set?.('titleThumbsPick', drivingType);
          driveBtns.forEach(b => b.refresh(b.id === drivingType));
        });
      driveBtns.push({ id: opt.id, ...btn });
    });

    // ── VEHICLE picker (custom-mode sandbox: every vehicle unlocked) ──
    const allVehIds = Object.keys(VEHICLES);
    let vehicleId = this.player?.vehicleId
                 ?? this.registry?.get?.('vehicleId')
                 ?? 'beater';
    if (!VEHICLES[vehicleId]) vehicleId = 'beater';
    const vehY = panelY + 210;
    add(this.add.text(rightX, vehY + 14, 'VEHICLE', {
      fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    let vehBtn;
    vehBtn = makeToggleButton(rightX + 103, vehY, 246, 28,
      VEHICLES[vehicleId]?.label ?? vehicleId, 0x39D9FF, true, () => {
        const i = allVehIds.indexOf(vehicleId);
        vehicleId = allVehIds[(i + 1) % allVehIds.length];
        vehBtn.lbl.setText(VEHICLES[vehicleId]?.label ?? vehicleId);
      });

    // ── ACCESSORIES toggles — sandbox override applied for this
    // custom run only; the persisted save's accessories stay intact.
    let bumper = false, traction = false, nos = 0;
    const accY = panelY + 250;
    add(this.add.text(rightX, accY + 14, 'ACCESSORIES', {
      fontSize: '14px', fontFamily: IMPACT, color: '#F4F7FF',
    }).setOrigin(0, 0.5).setDepth(D + 5));
    const accBtnW = 76, accBtnH = 26, accGap = 4;
    let bumperBtn, winterBtn;
    const nosBtns = [];
    const refreshNosBtns = () => {
      nosBtns.forEach(btn => btn.refresh(btn.tier === nos));
    };
    bumperBtn = makeToggleButton(rightX + 103, accY, accBtnW, accBtnH,
      'BUMPER', 0xFFC107, bumper, () => {
        bumper = !bumper;
        bumperBtn.refresh(bumper);
      });
    winterBtn = makeToggleButton(rightX + 103 + (accBtnW + accGap), accY, accBtnW, accBtnH,
      'WINTER', 0x88DDFF, traction, () => {
        traction = !traction;
        winterBtn.refresh(traction);
      });
    [1, 2, 3].forEach((tier, i) => {
      const btn = makeToggleButton(rightX + 103 + i * (accBtnW + accGap), accY + 29, accBtnW, accBtnH,
        `NOS ${tier}`, 0xFF39AF, nos === tier, () => {
          nos = nos === tier ? 0 : tier;
          refreshNosBtns();
        });
      nosBtns.push({ tier, ...btn });
    });

    // Old "PICK A CITY. SET YOUR CHAOS. THEN DRIVE." prompt removed —
    // the "Location:" label next to the city readout above the map
    // line now serves that role.

    const close = () => {
      this._sliderModalOpen = false;
      releaseHandlers.forEach(handler => this.input.off('pointerup', handler));
      objs.forEach(obj => obj?.destroy?.());
      onClose?.();
    };
    const actionY = panelY + panelH - 49;
    add(this.add.text((rightX + panelX + panelW) / 2, actionY - 24, 'CUSTOM RUNS DO NOT SCORE', {
      fontSize: '14px', fontFamily: IMPACT, color: '#39D9FF',
      stroke: '#050812', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(D + 5));
    const start = makeToggleButton(rightX + 20, actionY, 144, 34, 'START', 0xFF39AF, true, () => {
      close();
      onConfirm?.({
        drugLevels: { ...drugLevels }, checkpointPos, checkpointLabel,
        noNpcDamage, noPolice, startStars, customSub, drivingType,
        vehicleId, accessories: { bumper, traction, nos },
      });
    });
    const cancel = makeToggleButton(rightX + 182, actionY, 144, 34, 'CANCEL', 0x39A8FF, false, () => close());
    start.lbl.setFontSize(17);
    cancel.lbl.setFontSize(17);

    this._addHudObjs?.(...objs);
  }

  /** Garage modal — pick which OWNED car the player will drive on the
   *  next run.  Title-screen only.  Active selection persists to the
   *  registry so the next scene.start picks up the new vehicleId. */
  _buildGarageModal() {
    if (this._garageModalOpen) return;
    this._garageModalOpen = true;
    // Freeze gameplay while the modal is up — same pause pattern as
    // the ad-screen flow.  Remember the prior state so closing the
    // modal restores it (don't auto-unpause if the player had paused
    // before opening the garage).
    this._garagePrevPaused = !!this._paused;
    this._paused = true;
    this.audio?.setPaused?.(true);
    // Custom mode treats the garage as a sandbox — every vehicle is
    // selectable regardless of what the persistent save lists as
    // owned.  Other modes still respect ownership.
    const owned = (Difficulty.mode?.() === 'custom')
      ? Object.keys(VEHICLES)
      : (this.registry.get('ownedVehicles') ?? ['beater']);
    const currentId = this.registry.get('vehicleId') ?? this.player?.vehicleId ?? 'beater';
    const D = 240;
    const objs = [];

    const scrim = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.78)
      .setOrigin(0).setDepth(D).setInteractive();
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 80;
    const panelH = SCREEN_H - 100;
    const panelX = 40;
    const panelY = 50;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x020611, 0.96);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 7);
    panel.lineStyle(3, 0x39A8FF, 0.96);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 7);
    panel.lineStyle(1, 0xFF39AF, 0.78);
    panel.strokeRoundedRect(panelX + 7, panelY + 7, panelW - 14, panelH - 14, 5);
    panel.lineStyle(1, 0xF4F7FF, 0.24);
    panel.strokeRoundedRect(panelX + 13, panelY + 13, panelW - 26, panelH - 26, 4);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 18, 'GARAGE', {
      fontSize: '26px', fontFamily: IMPACT,
      color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    const sub = this.add.text(SCREEN_W / 2, panelY + 48,
      `${owned.length} car${owned.length === 1 ? '' : 's'} owned · tap to drive`, {
      fontSize: '14px', fontFamily: 'Arial', color: '#A9DFFF',
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(sub);

    // Vehicle list — 2-column grid so all eight vehicles fit inside
    // the modal without scrolling (Custom mode unlocks the full set).
    // Compact rows: 50 px tall × 4 rows = 216 px, fitting between the
    // list start (y=128) and the close-button area (top ~y=347).
    // Stats consolidated into the label row; accessory glyphs trail it.
    const rowH = 50, rowGap = 4, colGap = 8;
    const listX = panelX + 16;
    const listY = panelY + 78;
    const listW = panelW - 32;
    const colW  = (listW - colGap) / 2;
    owned.forEach((vid, i) => {
      const v = VEHICLES[vid];
      if (!v) return;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const rx = listX + col * (colW + colGap);
      const ry = listY + row * (rowH + rowGap);
      const isCurrent = vid === currentId;
      const bg = this.add.graphics().setDepth(D + 2);
      const drawRow = (hover = false) => {
        bg.clear();
        bg.fillStyle(isCurrent ? 0x071A30 : 0x050812, hover ? 1 : 0.92);
        bg.fillRoundedRect(rx, ry, colW, rowH, 5);
        bg.lineStyle(isCurrent || hover ? 3 : 2, isCurrent ? 0x39A8FF : (hover ? 0xFF39AF : 0x39A8FF), isCurrent ? 1 : 0.82);
        bg.strokeRoundedRect(rx, ry, colW, rowH, 5);
        bg.lineStyle(1, 0xF4F7FF, isCurrent ? 0.38 : 0.18);
        bg.strokeRoundedRect(rx + 5, ry + 5, colW - 10, rowH - 10, 4);
      };
      drawRow(false);
      bg.setInteractive(
        new Phaser.Geom.Rectangle(rx, ry, colW, rowH),
        Phaser.Geom.Rectangle.Contains,
      );
      bg.input.cursor = 'pointer';
      // Color swatch — uses the vehicle's tint as a paint-chip square.
      const swatch = this.add.rectangle(rx + 20, ry + rowH / 2, 26, 26, v.tint ?? 0xCCCCCC, 1)
        .setOrigin(0.5).setDepth(D + 3).setStrokeStyle(2, isCurrent ? 0xF4F7FF : 0x39A8FF);
      // Accessory glyphs trail the label.  In Custom mode, show only
      // the explicit sandbox override picked in the Custom menu; do
      // not auto-grant every accessory to every car.
      const isCustomMode = Difficulty.mode?.() === 'custom';
      const save = this.registry?.get?.('save');
      const accAll = save?.get?.('accessories') ?? {};
      const vAcc   = isCustomMode
        ? (this._customStartAccessories ?? {})
        : (accAll[vid] ?? {});
      const accGlyphs = [];
      if (vAcc.bumper)   accGlyphs.push('🛡');
      if (vAcc.nos > 0)  accGlyphs.push(`⚡${vAcc.nos}`);
      if (vAcc.traction) accGlyphs.push('❄️');
      const labelTxt = accGlyphs.length
        ? `${v.label}  ${accGlyphs.join(' ')}`
        : v.label;
      const lbl = this.add.text(rx + 40, ry + 5, labelTxt, {
        fontSize: '15px', fontFamily: IMPACT,
        color: '#F4F7FF',
        stroke: isCurrent ? '#39A8FF' : '#071224', strokeThickness: isCurrent ? 2 : 3,
      }).setOrigin(0, 0).setDepth(D + 3);
      const stats = this.add.text(rx + 40, ry + 24,
        `${v.hp} HP · ${v.rangeMi} mi · ${v.topMph} mph`, {
        fontSize: '12px', fontFamily: 'Arial', color: '#A9DFFF',
      }).setOrigin(0, 0).setDepth(D + 3);
      const tag = this.add.text(rx + colW - 6, ry + rowH - 5,
        isCurrent ? '✓ DRIVING' : 'TAP TO DRIVE', {
        fontSize: '11px', fontFamily: IMPACT,
        color: isCurrent ? '#FFCC44' : '#FF39AF',
        stroke: '#071224', strokeThickness: 2,
      }).setOrigin(1, 1).setDepth(D + 3);

      bg.on('pointerover', () => { if (!isCurrent) drawRow(true); });
      bg.on('pointerout',  () => { if (!isCurrent) drawRow(false); });
      bg.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        if (isCurrent) return;
        // Custom mode keeps whatever explicit accessory override the
        // player chose in the Custom menu; swapping vehicles here must
        // not silently add/remove accessories.
        // Persist + apply: set registry + swap player + sprite + reset
        // tank to full of the new vehicle's range.
        this.registry.set('vehicleId', vid);
        if (this.player) {
          this.player.vehicleId = vid;
          if (vid !== 'beater') this._leaveCockpitView?.();
          this.player.gasMaxMi  = v.rangeMi;
          this.player.gasMi     = v.rangeMi;       // full tank on title swap
          if (this.damage?.setMax)        this.damage.setMax(v.hp);
          if (this.damage?.setDurability) this.damage.setDurability(v.hp);
        }
        if (this.playerSprite) {
          this.playerSprite.clearTint();
          const backTex = v.spriteBack;
          if (backTex && this.textures.exists(backTex)) {
            this.playerSprite.setTexture(backTex);
          } else {
            this.playerSprite.setTexture('car_player');
            if (vid !== 'beater' && v.tint) this.playerSprite.setTint(v.tint);
          }
          this._applyPlayerSpriteDisplaySize();
        }
        // Close + re-open so the new "✓ DRIVING" mark renders.
        this._closeGarageModal(objs);
        this._buildGarageModal();
      });
      objs.push(bg, swatch, lbl, stats, tag);
    });

    // Close button.
    const closeY = panelY + panelH - 38;
    const closeBg = this.add.graphics().setDepth(D + 2);
    const drawClose = (hover = false) => {
      closeBg.clear();
      closeBg.fillStyle(0x050812, hover ? 1 : 0.92);
      closeBg.fillRoundedRect(SCREEN_W / 2 - 80, closeY - 15, 160, 30, 5);
      closeBg.lineStyle(hover ? 3 : 2, 0x39A8FF, 1);
      closeBg.strokeRoundedRect(SCREEN_W / 2 - 80, closeY - 15, 160, 30, 5);
    };
    drawClose(false);
    closeBg.setInteractive(
      new Phaser.Geom.Rectangle(SCREEN_W / 2 - 80, closeY - 15, 160, 30),
      Phaser.Geom.Rectangle.Contains,
    );
    closeBg.input.cursor = 'pointer';
    const closeLbl = this.add.text(SCREEN_W / 2, closeY, 'CLOSE', {
      fontSize: '16px', fontFamily: IMPACT,
      color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    closeBg.on('pointerover', () => drawClose(true));
    closeBg.on('pointerout',  () => drawClose(false));
    closeBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._closeGarageModal(objs);
    });
    objs.push(closeBg, closeLbl);

    // Make UI camera ignore (so HUD camera doesn't double-render).
    this.cameras.main?.ignore?.(objs);
    this._garageModalObjs = objs;
  }

  _closeGarageModal(objs) {
    const list = objs ?? this._garageModalObjs ?? [];
    for (const o of list) o.destroy?.();
    this._garageModalObjs = null;
    this._garageModalOpen = false;
    // Restore the pre-modal pause state.  If the player had already
    // hit pause before opening the garage, stay paused on close.
    if (this._garagePrevPaused === false) {
      this._paused = false;
      this.audio?.setPaused?.(false);
    }
    this._garagePrevPaused = null;
    // Mirror of the map-modal fix: the title's scene-level pointerdown
    // handler runs AFTER this close destroys the close button, so it
    // sees "no UI hit" and would otherwise fire the cursor.  Flag the
    // just-closed state for a frame so the handler bails instead.
    this._garageModalJustClosed = true;
    this.time?.delayedCall?.(50, () => { this._garageModalJustClosed = false; });
  }

  /** Build a scrollable Achievements page modal — full grid showing
   *  every drug-info + run-state achievement with the highest tier
   *  earned (or greyed-out lock).  Description text shown here only. */
  _buildAchievementsModal() {
    if (this._achievementsModalOpen) return;
    this._achievementsModalOpen = true;
    const D = 240;
    const objs = [];

    // Backdrop scrim — dismiss on click outside the panel.
    const scrim = this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2,
      SCREEN_W, SCREEN_H, 0x000000, 0.78)
      .setDepth(D).setInteractive();
    objs.push(scrim);

    const panelW = SCREEN_W - 60;
    const panelH = SCREEN_H - 50;
    const panelX = (SCREEN_W - panelW) / 2;
    const panelY = (SCREEN_H - panelH) / 2;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x0E1320, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 14);
    panel.lineStyle(3, 0xFFD700, 1);
    panel.strokeRoundedRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 14);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 12, '🏆  ACHIEVEMENTS', {
      fontSize: '18px', fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#FFD700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Close button (top-right)
    const closeBtn = this.add.text(panelX + panelW - 14, panelY + 10, '✕', {
      fontSize: '18px', fontFamily: 'Arial Black, Arial, sans-serif',
      color: '#FFFFFF', stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(D + 3).setInteractive({ useHandCursor: true });
    objs.push(closeBtn);

    // Build the row list.  Drug achievements first (10) then run-state.
    const earned   = AchievementSystem.earned(this.registry);
    const drugDefs = AchievementSystem.drugDefs();
    const runDefs  = AchievementSystem.runDefs();
    const rows = [
      ...Object.entries(drugDefs).map(([_, def]) => def),
      ...Object.entries(runDefs).map(([id, def]) => ({ ...def, id })),
    ];

    // Strip the "X% per <unit>" prefix (plus its trailing punctuation /
    // em-dash / comma) from drug descriptions — user wants players to
    // discover pickup percentages on their own; only the in-game
    // effects belong on this page.
    const stripPickupPct = (s) => {
      if (!s) return '';
      return s.replace(/^[\d.]+%\s+per\s+[a-z]+\s*[.\-—,;:]?\s*/i, '').trim();
    };

    // ── Scrollable content area ─────────────────────────────────────
    // Phaser doesn't have a native scroll view — implement it manually
    // by tracking scrollY, applying it to each row's y, and clipping
    // overflow with a geometry mask.
    const rowH        = 30;
    const headerY     = panelY + 42;
    const contentTop  = headerY;
    const contentBot  = panelY + panelH - 26;          // leave room for indicator
    const contentH    = contentBot - contentTop;
    const colX        = panelX + 16;
    const totalH      = rows.length * rowH;
    const maxScroll   = Math.max(0, totalH - contentH);

    // Mask: a Graphics rectangle the size of the content area.  Each
    // row text/dot sets this as its mask so it visually clips when it
    // scrolls outside the content band.
    const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xFFFFFF, 1);
    maskShape.fillRect(panelX + 4, contentTop, panelW - 8, contentH);
    const mask = maskShape.createGeometryMask();
    objs.push(maskShape);    // destroy with the modal

    // Track per-row objects + their relative y offset so scrollY moves
    // every element in lock-step.
    const rowObjs = [];
    rows.forEach((def, i) => {
      const yRel = i * rowH;          // y offset within content area
      const tier = earned[def.id];
      const tierColor = tier ? AchievementSystem.tierColor(tier) : 0x555555;
      const tierLabel = tier ? tier.toUpperCase() : 'LOCKED';
      const iconCol   = tier ? '#FFFFFF' : '#666666';
      const lblCol    = tier ? '#FFFFFF' : '#777777';
      const descCol   = tier ? '#AAAAAA' : '#888888';

      // Pre-earn we surface `unlockHint` (how to find/unlock) — the
      // actual drug-effect text in `desc` is hidden so the player has
      // to discover those mechanics by playing.  Run-state achievements
      // (no drug to "find") just fall through to `desc` for both states
      // since their criteria ARE the description.
      const rawBody = tier
        ? (def.desc ?? '')
        : (def.unlockHint ?? def.desc ?? '???');
      const bodyText = tier ? stripPickupPct(rawBody) : rawBody;

      const initialY = contentTop + yRel;

      const dot = this.add.graphics().setDepth(D + 2);
      dot.fillStyle(tierColor, 1);
      dot.fillCircle(colX + 6, initialY + 8, 5);
      dot.setMask(mask);

      const icon = this.add.text(colX + 18, initialY, def.icon ?? '🏆', {
        fontSize: '13px',
      }).setOrigin(0, 0).setDepth(D + 2).setColor(iconCol).setMask(mask);
      const name = this.add.text(colX + 38, initialY, def.label, {
        fontSize: '12px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: lblCol, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);
      const tierTxt = this.add.text(colX + 178, initialY + 1, tierLabel, {
        fontSize: '9px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: tier ? '#' + tierColor.toString(16).padStart(6, '0') : '#666666',
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);
      const desc = this.add.text(colX + 230, initialY + 1, bodyText, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif',
        color: descCol, wordWrap: { width: panelW - 250 },
      }).setOrigin(0, 0).setDepth(D + 2).setMask(mask);

      rowObjs.push({ dot, icon, name, tierTxt, desc, baseY: initialY });
      objs.push(dot, icon, name, tierTxt, desc);
    });

    // Scrollbar indicator (right side, semi-transparent).
    const scrollbarBg = this.add.graphics().setDepth(D + 2);
    const scrollbarFg = this.add.graphics().setDepth(D + 3);
    objs.push(scrollbarBg, scrollbarFg);
    const drawScrollbar = (scrollY) => {
      scrollbarBg.clear();
      scrollbarFg.clear();
      if (maxScroll <= 0) return;
      const barX = panelX + panelW - 10;
      const barW = 4;
      scrollbarBg.fillStyle(0x222222, 0.55);
      scrollbarBg.fillRoundedRect(barX, contentTop, barW, contentH, 2);
      const thumbH = Math.max(20, contentH * (contentH / totalH));
      const thumbY = contentTop + (scrollY / maxScroll) * (contentH - thumbH);
      scrollbarFg.fillStyle(0xFFD700, 0.85);
      scrollbarFg.fillRoundedRect(barX, thumbY, barW, thumbH, 2);
    };

    // Scroll state + input wiring.
    let scrollY = 0;
    const applyScroll = () => {
      for (const r of rowObjs) {
        const y = r.baseY - scrollY;
        r.dot.y     = y - r.baseY;        // graphics: shift via .y prop
        r.icon.y    = y;
        r.name.y    = y;
        r.tierTxt.y = y + 1;
        r.desc.y    = y + 1;
      }
      drawScrollbar(scrollY);
    };
    drawScrollbar(0);

    const onWheel = (_pointer, _gameObjects, _dx, dy) => {
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy * 0.6));
      applyScroll();
    };
    this.input.on('wheel', onWheel);

    // Touch / drag scroll (mobile).
    let dragStartY = null;
    let dragStartScroll = 0;
    const dragHit = this.add.rectangle(panelX + 4, contentTop, panelW - 8, contentH, 0x000000, 0)
      .setOrigin(0, 0).setDepth(D + 4).setInteractive();
    dragHit.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      dragStartY = ptr.y;
      dragStartScroll = scrollY;
    });
    dragHit.on('pointermove', (ptr) => {
      if (dragStartY == null) return;
      const dy = dragStartY - ptr.y;
      scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll + dy));
      applyScroll();
    });
    const endDrag = () => { dragStartY = null; };
    dragHit.on('pointerup',     endDrag);
    dragHit.on('pointerupoutside', endDrag);
    objs.push(dragHit);

    const close = () => {
      this._achievementsModalOpen = false;
      this.input.off('wheel', onWheel);
      objs.forEach(o => o?.destroy?.());
      // Same "just closed" flag as the map/garage close — keeps the
      // title's scene-level pointerdown handler from interpreting the
      // dismissal tap as a START.
      this._achievementsModalJustClosed = true;
      this.time?.delayedCall?.(50, () => { this._achievementsModalJustClosed = false; });
    };
    scrim.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });
    closeBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      close();
    });

    // Camera registration for the new objects (UI camera only).
    this._addHudObjs?.(...objs);
  }

  /** Achievement toast — small, semi-transparent badge with tier label
   *  + achievement name only.  Full description text lives on the
   *  Achievements page on the title screen.  Sized so it never covers
   *  meaningful gameplay; alpha low so it reads as a notification, not
   *  a dialogue. */
  _showAchievementToast(evt) {
    if (!evt?.def) return;
    const { tier, def } = evt;
    const tierColor = AchievementSystem.tierColor(tier);
    const tierLabel = tier?.toUpperCase() ?? '';
    const cx = SCREEN_W / 2;
    const cy = SCREEN_H - 50;
    const w  = 240, h = 36;
    const D  = 80;
    // Top-level alpha applied to every element so animation tweens
    // lerp toward this max (instead of fully opaque).
    const TOAST_ALPHA = 0.62;

    const g = this.add.graphics().setDepth(D);
    g.fillStyle(0x0A0F18, 0.55);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(2, tierColor, 0.85);
    g.strokeRoundedRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2, 8);

    const tierTxt = this.add.text(cx - w / 2 + 9, cy - 12,
      `${tierLabel}`, {
        fontSize: '8px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#' + tierColor.toString(16).padStart(6, '0'),
        stroke: '#000', strokeThickness: 1,
      }).setOrigin(0, 0).setDepth(D + 1);

    const titleTxt = this.add.text(cx - w / 2 + 9, cy - 1,
      `${def.icon ?? '🏆'}  ${def.label}`, {
        fontSize: '12px', fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#FFFFFF', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(D + 1);

    const objs = [g, tierTxt, titleTxt];
    this._addHudObjs?.(...objs);

    objs.forEach(o => o.setAlpha(0));
    this.tweens.add({
      targets: objs, alpha: TOAST_ALPHA, y: '-=12', duration: 240, ease: 'Cubic.Out',
    });
    this.time.delayedCall(2200, () => {
      this.tweens.add({
        targets: objs, alpha: 0, duration: 280,
        onComplete: () => objs.forEach(o => o?.destroy?.()),
      });
    });
  }

  _applyDamage(amount, source) {
    if (!this.damage) return 0;
    // Crash i-frames — silently absorb any incoming damage (collision or
    // offroad bleed alike) until the invincibility window expires.
    if ((this.time?.now ?? 0) < this._invincibleUntil) return 0;
    const drugs = this.drugs;
    const isCollision = source && source !== 'offroad_bleed';


    // Custom-mode DAMAGE: OFF suppresses every damage source, including
    // traffic, police, scenery and off-road bleed.
    if (this._customFlags?.noNpcDamage) return 0;

    // (Beater-on-impact headlight knock-out reverted per user — they
    // want the headlight visuals to stay static.  The beater still
    // gets its asymmetric-bulb tint from the vehicle profile.)

    if (isCollision) {
      const fent = drugs?.get?.(DRUGS.FENTANYL) ?? 0;
      if (fent >= 0.25) return 0;
      const alc = drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
      if (alc >= 1.0 && /sideswipe|corner/i.test(source) && Math.random() < 0.5) return 0;
    }

    let adj = amount * (Difficulty.damageMul() ?? 1);

    if (isCollision) {
      const meth = drugs?.get?.(DRUGS.METH) ?? 0;
      if (meth > 0.05) adj += 1;
      const hero = drugs?.get?.(DRUGS.HEROIN) ?? 0;
      if (hero >= 0.15 && adj >= 1) adj = Math.max(0, adj - 2);
    }

    // Reinforced bumper — -20 % to ANY damage on the current vehicle.
    // Bumper-on-this-vehicle is stored in the per-mode profile under
    // accessories[vehicleId].bumper.  Damage rounded to one decimal so
    // the HP readout stays clean (no "lost 0.43 HP" oddities).
    const acc = this._vehicleAccessories?.();
    if (acc?.bumper) adj *= 0.80;
    adj = Math.round(adj * 10) / 10;

    if (adj > 0) {
      this.damage.takeDamage(adj, source);
      // Untouchable streak broken — reset the per-run no-damage timer.
      this._noDamageTimer = 0;
      this._noDamageFlags = { '1m': false, '2m': false, '3m': false, '5m': false };
    }
    // Return the effective damage (after difficulty / drug / bumper
    // modifiers) so crash sites can score `$5 × damage received`.
    return adj;
  }

  /** Read the accessory map for the currently-driven vehicle.  Returns
   *  `{ bumper, traction, nos }` with safe defaults so call sites can
   *  read fields directly without optional-chain noise.  In Custom
   *  mode, a transient `_customStartAccessories` override wins over
   *  the persisted save so sandbox runs don't clobber real progress. */
  _vehicleAccessories() {
    if (this._customStartAccessories) {
      const cur = this._customStartAccessories;
      return {
        bumper:   !!cur.bumper,
        traction: !!cur.traction,
        nos:      Math.max(0, Math.min(3, cur.nos ?? 0)),
      };
    }
    const save = this.registry?.get?.('save');
    const all  = save?.get?.('accessories') ?? {};
    const cur  = all[this.player?.vehicleId] ?? {};
    return {
      bumper:   !!cur.bumper,
      traction: !!cur.traction,
      nos:      Math.max(0, Math.min(3, cur.nos ?? 0)),
    };
  }

  /** Swap the player's currently-driven vehicle live, the same way
   *  the Garage modal does.  Used by Custom mode so the player can
   *  pick any vehicle without owning it.  Updates registry, player
   *  fields, gas tank, damage model, and sprite. */
  _applyVehicleSwap(vid) {
    const v = VEHICLES[vid];
    if (!v) return;
    this.registry?.set?.('vehicleId', vid);
    if (this.player) {
      this.player.vehicleId = vid;
      if (vid !== 'beater') this._leaveCockpitView?.();
      this.player.gasMaxMi = v.rangeMi;
      this.player.gasMi    = v.rangeMi;
      this.damage?.setMax?.(v.hp);
      this.damage?.setDurability?.(v.hp);
    }
    if (this.playerSprite) {
      this.playerSprite.clearTint();
      const backTex = v.spriteBack;
      if (backTex && this.textures.exists(backTex)) {
        this.playerSprite.setTexture(backTex);
      } else {
        this.playerSprite.setTexture('car_player');
        if (vid !== 'beater' && v.tint) this.playerSprite.setTint(v.tint);
      }
      this._applyPlayerSpriteDisplaySize?.();
    }
    // Re-skin the phone menu to the new car (covers custom-mode picks and
    // mid-run unlocks — the garage path re-skins via its own HTML handler).
    try { window.__syncMenuBg?.(); } catch (_) {}
  }

  /** Set / merge accessory state for the currently-driven vehicle. */
  _setVehicleAccessories(patch) {
    const save = this.registry?.get?.('save');
    if (!save) return;
    const vid  = this.player?.vehicleId;
    if (!vid) return;
    const all  = save.get('accessories') ?? {};
    all[vid]   = { ...(all[vid] ?? {}), ...patch };
    save.set('accessories', all);
  }

  _impactModel(otherSpeed = 0, hit = {}, opts = {}) {
    const p = this.player;
    const closingMph = Math.abs((p.speed ?? 0) - (otherSpeed ?? 0)) / MAX_SPEED * 120;
    const overlap = clamp(hit?.overlapRatio ?? 0.5, 0, 1);
    const type = hit?.type ?? 'rear-end';
    const isHeadOn = opts.headOn ?? otherSpeed < 0;

    let severity;
    if (type === 'side-swipe') {
      severity = clamp((closingMph / 95) * (0.75 - overlap * 0.25), 0.12, 0.85);
    } else if (type === 'corner') {
      severity = clamp((closingMph / 85) * (0.45 + overlap * 0.65), 0.18, 1.05);
    } else {
      severity = clamp((closingMph / (isHeadOn ? 105 : 70)) * (0.55 + overlap * 0.75), 0.22, isHeadOn ? 1.55 : 1.25);
    }

    return { closingMph, overlap, severity };
  }

  _onVehicleCollision(car, _idx, hit) {
    // Player is phasing through traffic during i-frame — skip the
    // entire collision (no popup, no damage, no score, no NPC spin
    // either, since they didn't actually hit anything).
    if ((this.time?.now ?? 0) < this._invincibleUntil) return;
    const p    = this.player;
    const relZ = Math.max(50, car.position - p.position);
    const proj = this.road.getVehicleProjection(relZ, car.laneOffset);
    const sx   = proj?.sx ?? SCREEN_W / 2;
    const sy   = proj?.sy ?? SCREEN_H / 2;
    const sw   = proj?.sw ?? 32;
    // Per-class damage multiplier — heavy vehicles hurt more.  Tractors are
    // steel farm equipment (≈ slamming a small bulldozer) → 2×.  Semis are
    // 18-wheelers → 1.5×.  Applied across all crash types.
    const classDmgMul = car.vClass === 'tractor' ? 2 : (car.vClass === 'semi' ? 1.5 : 1);
    // Semis are immovable — a clip/sideswipe doesn't budge them; the player
    // bounces off and scrubs down to 60 mph (handled in those branches below).
    const isSemi = car.vClass === 'semi';
    const SEMI_BOUNCE_SPEED = MAX_SPEED * 0.5;   // 60 mph (MAX_SPEED reads 120)

    // Count NPC-car crashes that happen after the player has had their
    // first drink — feeds the first-star activation gate in update().
    if (!car.isCop) {
      // Lifetime NPC-crash tally — gates rx unlock at 50.
      if (this.drugs) this.drugs.npcCrashesTotal = (this.drugs.npcCrashesTotal ?? 0) + 1;
      this.stats?.recordNpcHit();          // lifetime + this-trip + per-vehicle
      const everDrunk = (this.drugs.maxReached?.[DRUGS.ALCOHOL] ?? 0) > 0.05;
      if (everDrunk) {
        this._npcCrashesPostDrink = (this._npcCrashesPostDrink ?? 0) + 1;
      }
      // Drug-influenced bump counter — separate one-shot gate.  If any
      // drug bar is ≥ 30% at the moment of impact, the bump counts.
      // Once it hits 20, the player is awarded their first star (one
      // time only — see _drugBumpFired flag in the gate logic).
      if (!this._drugBumpFired) {
        const anyHigh = Object.values(DRUGS).some(id =>
          (this.drugs.get?.(id) ?? 0) >= 0.30);
        if (anyHigh) {
          this._drugBumpCount = (this._drugBumpCount ?? 0) + 1;
        }
      }
    }

    const type    = hit?.type ?? 'rear-end';
    // Push direction comes from where the NPC sat relative to the player.
    // hit.side is 'right' if NPC was right of player, 'left' if left of.
    const sideDir = hit?.side === 'right' ? -1 : 1;     // player gets pushed AWAY from NPC
    const npcDir  = -sideDir;                            // NPC gets pushed AWAY from player

    if (type === 'rear-end') {
      // Differentiate same-direction "rear-end" (player overtakes slow car
      // ahead) from "head-on" (oncoming car at full closing speed).
      const isHeadOn = (car.speed ?? 0) < 0;
      const impact = this._impactModel(car.speed ?? 0, hit, { headOn: isHeadOn });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse  = sideDir * (isHeadOn ? 2.8 + impact.severity * 1.5 : 1.8 + impact.severity * 1.4);
      p.speed     = Math.max(600, p.speed * (isHeadOn
        ? clamp(0.24 - impact.severity * 0.10, 0.08, 0.18)
        : clamp(0.72 - impact.severity * 0.36, 0.24, 0.62)));
      this.effects.triggerShake(
        isHeadOn ? 420 + impact.severity * 360 : 260 + impact.severity * 280,
        isHeadOn ? 0.014 + impact.severity * 0.012 : 0.010 + impact.severity * 0.010,
      );
      const label = car.isCop ? 'COP CAR RAMMED!\n⭐+1'
                  : isHeadOn   ? 'HEAD-ON!'
                  :              'REAR-END!';
      this._showPopup(label, isHeadOn ? '#FF2222' : '#FF8800');
      // Score is $5 × damage received × _scoreMult().  Computed from the
      // _applyDamage return value so bumper / drug / difficulty mods are
      // reflected — protected cars get less score, but also take less.
      const dmg = this._applyDamage((isHeadOn ? 3 + impact.severity * 3 : 1 + impact.severity * 2) * classDmgMul, isHeadOn ? 'head_on' : 'traffic');
      const _earnRE = Math.round(5 * dmg * this._scoreMult());
      this.score += _earnRE;
      this.stats?.recordEarn(_earnRE, 'collision', Math.round(5 * dmg));
      if (isHeadOn) {
        // Spin / roll the player car to the difficulty-appropriate
        // recovery lane and grant 2-second i-frame.  All subsequent
        // damage is absorbed during the blink, so chaining a head-on
        // into a tree or another NPC costs only the first hit.
        // Drop to the cold-start rolling speed; the crash-recovery
        // auto-pilot then ramps back up to 60 mph during the blink.
        this.player.x             = this._postCrashLaneX();
        this.player.steerVelocity = 0;
        this.player.xImpulse      = 0;
        this.player.speed         = MAX_SPEED * 0.18;
        this._invincibleUntil = Math.max(this._invincibleUntil ?? 0,
          (this.time?.now ?? 0) + 2000);
        this._crashRecoveryUntil = this._invincibleUntil;
        this._crashRollStartAt   = (this.time?.now ?? 0) + 1000;
      }
      car.alive      = false;
      car.crashed    = true;
      car.crashTimer = 1.6;
      car.crashVx    = npcDir * (0.9 + impact.severity * 0.8) + (Math.random() - 0.5) * 0.4;
      car.crashAng   = 0;
      car.crashSpin  = (Math.random() < 0.5 ? -1 : 1) * (2.5 + impact.severity * 3.5 + Math.random() * 2);
      car.crashSmokeT = 0;
      car.speed      *= clamp(0.65 - impact.severity * 0.22, 0.28, 0.58);
      if (car.isCop) this.cops.addStar(0.25, 3);   // rear-end NPC traffic-cop
      return;
    }

    if (type === 'side-swipe') {
      const impact = this._impactModel(car.speed ?? 0, hit);
      if (isSemi) {
        // Sideswiping an 18-wheeler doesn't move it — the player ricochets
        // off the trailer, gets shoved away, and scrubs down to 60 mph.
        p.xImpulse = sideDir * (1.1 + impact.severity * 1.0);   // bounced off the rig
        p.speed    = Math.min(p.speed, SEMI_BOUNCE_SPEED);
        this.effects.triggerShake(150 + impact.severity * 150, 0.006 + impact.severity * 0.006);
        this._showPopup('SIDESWIPED A SEMI!', '#FFAA22');
        const dmg = this._applyDamage((0.4 + impact.severity * 0.9) * classDmgMul, 'sideswipe');
        const _earn = Math.round(5 * dmg * this._scoreMult());
        this.score += _earn;
        this.stats?.recordEarn(_earn, 'collision', Math.round(5 * dmg));
        return;   // the semi keeps rolling — NOT destroyed, NOT shoved off-road
      }
      // Sideways brush — NPC pushed off the road, player keeps full speed,
      // tiny lateral nudge but no explosion, no big screen shake.
      p.xImpulse  = sideDir * (0.35 + impact.severity * 0.75);
      p.speed     = Math.max(1000, p.speed * clamp(0.98 - impact.severity * 0.10, 0.88, 0.97));
      this.effects.triggerShake(80 + impact.severity * 120, 0.003 + impact.severity * 0.005);
      this._showPopup('SIDESWIPE!', '#FFEE44');
      // Score = $5 × damage received × _scoreMult().
      const dmg = this._applyDamage((0.4 + impact.severity * 0.9) * classDmgMul, 'sideswipe');
      const _earnSS = Math.round(5 * dmg * this._scoreMult());
      this.score += _earnSS;
      this.stats?.recordEarn(_earnSS, 'collision', Math.round(5 * dmg));
      car.alive      = false;
      car.crashed    = true;
      car.crashTimer = 1.4;
      // NPC gets shoved hard sideways off the road — bigger lateral velocity
      // than rear-end since that's the whole point of a sideswipe.
      car.crashVx    = npcDir * (1.4 + impact.severity * 1.6) + (Math.random() - 0.3) * 0.3;
      car.crashAng   = 0;
      car.crashSpin  = npcDir * (1.8 + impact.severity * 3 + Math.random() * 2);
      car.crashSmokeT = 0;
      // NPC keeps most of its speed — it's still moving forward as it leaves
      // the road.
      car.speed      *= clamp(0.94 - impact.severity * 0.16, 0.78, 0.92);
      return;
    }

    // type === 'corner' — diagonal corner clip. Mid-severity.
    const impact = this._impactModel(car.speed ?? 0, hit);
    if (isSemi) {
      // Corner-clipping a semi doesn't budge it — the player is shoved away
      // and scrubbed down to 60 mph, semi keeps rolling.
      p.xImpulse = sideDir * (1.3 + impact.severity * 1.2);
      p.speed    = Math.min(p.speed, SEMI_BOUNCE_SPEED);
      this.effects.triggerShake(160 + impact.severity * 200, 0.007 + impact.severity * 0.008);
      this._showPopup('CLIPPED A SEMI!', '#FFAA22');
      const dmgS = this._applyDamage((0.6 + impact.severity * 1.4) * classDmgMul, 'corner');
      const _earnS = Math.round(5 * dmgS * this._scoreMult());
      this.score += _earnS;
      this.stats?.recordEarn(_earnS, 'collision', Math.round(5 * dmgS));
      return;   // immovable — NOT destroyed, NOT shoved off-road
    }
    p.xImpulse  = sideDir * (0.9 + impact.severity * 1.2);
    p.speed     = Math.max(800, p.speed * clamp(0.91 - impact.severity * 0.22, 0.68, 0.87));
    this.effects.triggerShake(140 + impact.severity * 230, 0.006 + impact.severity * 0.010);
    this._showPopup('CORNER CLIP!', '#FFAA44');
    // Score = $5 × damage received × _scoreMult().
    const dmgC = this._applyDamage((0.6 + impact.severity * 1.4) * classDmgMul, 'corner');
    const _earnCC = Math.round(5 * dmgC * this._scoreMult());
    this.score += _earnCC;
    this.stats?.recordEarn(_earnCC, 'collision', Math.round(5 * dmgC));
    car.alive      = false;
    car.crashed    = true;
    car.crashTimer = 1.5;
    car.crashVx    = npcDir * (1.0 + impact.severity * 1.0) + (Math.random() - 0.4) * 0.3;
    car.crashAng   = 0;
    car.crashSpin  = npcDir * (2 + impact.severity * 2.4 + Math.random() * 1.5);
    car.crashSmokeT = 0;
    car.speed      *= clamp(0.82 - impact.severity * 0.25, 0.52, 0.76);
  }

  _onCopCollision(cop, idx, hit) {
    // i-frame phase-through — same as NPC traffic.  No bust counters
    // accrue, no popup, no damage.
    if ((this.time?.now ?? 0) < this._invincibleUntil) return;
    const p    = this.player;
    const relZ = Math.max(50, cop.position - p.position);
    const proj = this.road.getVehicleProjection(relZ, cop.laneOffset);
    const sx   = proj?.sx ?? SCREEN_W / 2;
    const sy   = proj?.sy ?? SCREEN_H / 2;
    const sw   = proj?.sw ?? 32;

    const type    = hit?.type ?? 'rear-end';
    const sideDir = hit?.side === 'right' ? -1 : 1;
    const kind    = cop.kind ?? 'pursuit-front';
    // SWAT vans hit 2× harder than regular police.  Multiplier baked
    // onto the cop at spawn (CopSystem._spawnCop); default 1 for any
    // legacy cop missing the field.
    const damageMul = cop.damageMul ?? 1;

    // Generic bump tally (legacy, still drives `BUMPS x/8` HUD).
    if (type !== 'side-swipe') this.cops.registerBump();

    // ── Head-on with oncoming cop — counts toward 3-strikes BUSTED ────
    if (kind === 'oncoming' && type !== 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? -p.speed, hit, { headOn: true });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (2.6 + impact.severity * 1.5);
      p.speed    = Math.max(400, p.speed * clamp(0.26 - impact.severity * 0.10, 0.10, 0.20));
      this.cops.addStar(0.5, 3);                  // head-on with oncoming cop
      this.effects.triggerShake(440 + impact.severity * 360, 0.015 + impact.severity * 0.012);
      this._applyDamage((3 + impact.severity * 3) * damageMul, 'cop_head_on');
      // Same spin-to-recovery-lane + 2-sec i-frame as NPC head-on —
      // chained damage during the blink is fully absorbed.  Drop to
      // the cold-start rolling speed; the crash-recovery auto-pilot
      // then ramps back up to 60 mph during the blink.
      this.player.x             = this._postCrashLaneX();
      this.player.steerVelocity = 0;
      this.player.xImpulse      = 0;
      this.player.speed         = MAX_SPEED * 0.18;
      this._invincibleUntil = Math.max(this._invincibleUntil ?? 0,
        (this.time?.now ?? 0) + 2000);
      this._crashRecoveryUntil = this._invincibleUntil;
      this._crashRollStartAt   = (this.time?.now ?? 0) + 1000;
      const headons = this.cops.registerHeadOn();
      const left = 3 - headons;
      this._showPopup(
        left > 0 ? `HEAD-ON COP! ${headons}/3\n${left} more = JAIL` : 'BUSTED!',
        '#FF2222',
      );
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Sideswipe of an oncoming cop — no bust counter, just chaos ────
    if (kind === 'oncoming' && type === 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? -p.speed, hit, { headOn: true });
      p.xImpulse = sideDir * (0.55 + impact.severity * 0.9);
      p.speed    = Math.max(800, p.speed * clamp(0.98 - impact.severity * 0.12, 0.86, 0.96));
      this.cops.addStar(0.2, 3);                  // side-swipe oncoming cop
      this.effects.triggerShake(100 + impact.severity * 160, 0.004 + impact.severity * 0.006);
      this._applyDamage((0.5 + impact.severity * 1.1) * damageMul, 'cop_sideswipe_oncoming');
      this._showPopup('SIDESWIPED ONCOMING COP!', '#FFCC44');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Rear cop ramming player — counts toward 5-strikes BUSTED ──────
    if (kind === 'rear' && type !== 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? p.speed, hit, { headOn: false });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (1.0 + impact.severity * 1.0);
      p.speed    = Math.max(400, p.speed * clamp(0.78 - impact.severity * 0.20, 0.50, 0.70));
      this.cops.addStar(0.2, 3);                  // player rear-ends a cop
      this.effects.triggerShake(180 + impact.severity * 220, 0.007 + impact.severity * 0.009);
      this._applyDamage((1 + impact.severity * 1.8) * damageMul, 'cop_ram_rear');
      const rearBumps = this.cops.registerRearBump();
      const left = 5 - rearBumps;
      this._showPopup(
        left > 0 ? `COP RAM! ${rearBumps}/5\n${left} more = JAIL` : 'BUSTED!',
        '#FF2222',
      );
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── PIT maneuver — only fires when the cop's PIT setup has been
    //    armed (sustained lateral lock at close range).  A side-swipe
    //    before that = the player smashing into the cop, which CRASHES
    //    the cop instead of busting the player. ────────────────────────
    if (type === 'side-swipe' && cop._pitArmed) {
      const impact = this._impactModel(cop.speed ?? p.speed, hit);
      p.xImpulse = sideDir * (1.0 + impact.severity * 1.1);
      p.speed    = Math.max(600, p.speed * clamp(0.86 - impact.severity * 0.18, 0.68, 0.82));
      this.effects.triggerShake(160 + impact.severity * 190, 0.007 + impact.severity * 0.008);
      this._applyDamage((1 + impact.severity * 1.5) * damageMul, 'cop_pit');
      this.cops.registerPit();
      this._showPopup('PIT MANEUVER!\nBUSTED!', '#FF2222');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Player smashed the cop's side — cop crashes off the road ─────
    if (type === 'side-swipe') {
      const impact = this._impactModel(cop.speed ?? p.speed, hit);
      p.xImpulse = sideDir * (0.35 + impact.severity * 0.75);
      p.speed    = Math.max(800, p.speed * clamp(0.98 - impact.severity * 0.10, 0.88, 0.96));
      this.cops.addStar(0.1, 3);                  // player smashes cop side
      this.effects.triggerShake(90 + impact.severity * 150, 0.004 + impact.severity * 0.006);
      this._applyDamage(0.5 + impact.severity * 1.0, 'cop_smash');
      // Mark cop visually crashed (spawns debris cloud) and remove.
      this._spawnExplosion(sx, sy, sw);
      this._showPopup('SMASHED A COP!', '#FFAA22');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Barricade cop — instant slow-to-45-mph for 5 seconds ─────────
    if (kind === 'barricade') {
      const impact = this._impactModel(cop.speed ?? 0, hit, { headOn: false });
      this._spawnExplosion(sx, sy, sw);
      p.xImpulse = sideDir * (1.4 + impact.severity * 1.3);
      p.speed    = Math.max(400, p.speed * clamp(0.48 - impact.severity * 0.18, 0.24, 0.42));
      this.effects.triggerShake(240 + impact.severity * 260, 0.010 + impact.severity * 0.011);
      this._applyDamage(2 + impact.severity * 3, 'cop_barricade');
      this._flatTireTimer = Math.max(this._flatTireTimer ?? 0, 5);
      this._showPopup('🚧 BARRICADE!\n45 MPH × 5 sec', '#FF8800');
      cop.alive = false;
      this.cops.cops.splice(idx, 1);
      this._tickPlayerCopCrash();
      return;
    }

    // ── Default catch-all (corner clip) ──────────────────────────────
    const impact = this._impactModel(cop.speed ?? p.speed, hit);
    p.xImpulse = sideDir * (0.8 + impact.severity * 1.0);
    p.speed    = Math.max(600, p.speed * clamp(0.90 - impact.severity * 0.20, 0.66, 0.86));
    this.cops.addStar(0.1, 3);                    // corner-clip a cop
    this.effects.triggerShake(110 + impact.severity * 180, 0.005 + impact.severity * 0.008);
    this._applyDamage(0.7 + impact.severity * 1.3, 'cop_corner');
    this._showPopup('CLIPPED A COP!', '#FF6644');
    cop.alive = false;
    this.cops.cops.splice(idx, 1);
    this._tickPlayerCopCrash();
  }

  /** Increment the player-vs-cop crash counter.  Every 3rd crash applies
   *  a 45-mph cap for 5 seconds (reuses the flat-tire timer mechanic).
   *  Resets to 0 after each penalty so the next 3rd crash triggers again. */
  _tickPlayerCopCrash() {
    this._playerCopCrashes = (this._playerCopCrashes ?? 0) + 1;
    if (this._playerCopCrashes >= 3) {
      this._playerCopCrashes = 0;
      this._flatTireTimer = Math.max(this._flatTireTimer ?? 0, 5);
      this._showPopup('🚓 3 COPS CRASHED!\n45 MPH × 5 sec', '#FF8800');
    }
  }

  _spawnExplosion(sx, sy, sw) {
    this.explosions.push({ sx, sy, sw: Math.max(sw, 18), timer: 0, maxTimer: 0.55 });
  }

  /** Scenery crash response: explosion at impact point, big HP hit,
   *  car snapped back to road centre, then 4-second i-frames so the
   *  player can recover.  During the i-frame window the playerSprite
   *  blinks (see _renderVehicles) and _applyDamage is no-op, so
   *  Tap-mode players who let the car drift into a tree can survive a
   *  few impacts before HP runs out instead of being instantly stuck
   *  in a collide-loop. */
  /** Lane the player respawns into after any crash (scenery hit, head-on
   *  with an NPC, head-on with a cop, checkpoint-warp-after-death).
   *  Difficulty picks the lane on a sliding "more dangerous = closer to
   *  oncoming" scale.  Custom mode reads its sub-difficulty.
   *    Easy   →  +0.75  (far-right lane, safest)
   *    Normal →  +0.25  (player-direction inner lane)
   *    Hard   →  -0.25  (oncoming inner lane — into traffic)            */
  _postCrashLaneX() {
    const m = Difficulty.mode?.();
    const sub = (m === 'custom') ? (Difficulty.customSub?.() ?? 'normal') : m;
    if (sub === 'easy') return  0.75;
    if (sub === 'hard') return -0.25;
    return 0.25;
  }

  /** Glancing brush against a shrub — the bush takes 1 HP, leans
   *  aside, and the car drives straight through.  No speed cap, no
   *  warp, no respawn: a real sage bush wouldn't stop a sedan, it
   *  would just thump the bumper and flatten.  The specific shrub is
   *  marked non-collidable for the rest of the run so the player
   *  can't be stuck inside the bush re-triggering damage every
   *  i-frame cycle (the long-standing "bush won't let me through"
   *  bug). */
  _sceneryGlance(proj, damage = 1, sp = null) {
    this._applyDamage(damage, 'shrub_glance');
    const p = this.player;
    const obstacleX = proj?.sx ?? SCREEN_W / 2;
    const playerX   = this.playerSprite?.x ?? SCREEN_W / 2;
    const pushDir   = obstacleX < playerX ? +1 : -1;   // push away from bush
    // Light lateral nudge so the car visibly thumps off the bush.
    // Killing any steer velocity heading INTO the bush prevents the
    // player's own input from re-pushing the chassis back inside its
    // bounding box.
    p.xImpulse = pushDir * 0.10;
    if (Math.sign(p.steerVelocity ?? 0) === -pushDir) p.steerVelocity = 0;
    // Bush sticks to the chassis — speed capped to 40 mph for 3 s
    // (handled by the bush cap in _updatePlayer).  After that the bush
    // tumbles off and the car returns to normal cruise.  Replaces the
    // earlier "no speed cap, car blows through" behavior.
    const _nowB = this.time?.now ?? 0;
    this._bushStuckUntil = _nowB + 3000;
    this._showPopup?.('🌿 BUSH STUCK!', '#88CC44');
    // Flatten the bush — no more damage from this same sprite.
    // The visual sprite stays in the world (still painted by the
    // renderer); only the collision is dropped.
    if (sp) {
      sp.collidable = false;
      sp.kickDir   = -pushDir;             // shrub leans AWAY from car
      sp.kickUntil = _nowB + 400;
    }
    // Tiny i-frame so an adjacent bush in the same cluster doesn't
    // pile a second hit on the same frame.
    this._invincibleUntil = _nowB + 120;
  }

  _triggerSceneryRespawn(proj, damage = 10) {
    // Spawn explosion at the PLAYER'S car position (the actual impact
    // point), not at the building's projected center.
    const sx = this.playerSprite?.x ?? SCREEN_W / 2;
    const sy = this.playerSprite?.y ?? SCREEN_H - 130;
    const sw = proj?.sw ?? 80;
    this._spawnExplosion(sx, sy, sw);
    // Speed-scaled crash damage: a 35 mph nudge into a wall shouldn't
    // cost the same as a full-speed crash.  Scale linearly with the
    // car's current speed: a stopped car takes ~30% of base damage
    // (so collision still hurts), a full-speed crash takes 100%.
    // 35 mph ≈ 0.29 of MAX_SPEED → scaled damage ≈ 0.3 + 0.7 * 0.29 = 0.5
    // → 5 HP on a 10 HP base, instead of the previous 10 HP flat.
    const speedRatio = Math.max(0, Math.min(1, this.player.speed / MAX_SPEED));
    const scaledDamage = damage * (0.30 + 0.70 * speedRatio);
    this._applyDamage(scaledDamage, 'scenery_crash');
    // Snap back to the difficulty-appropriate recovery lane + halve
    // speed so the player isn't immediately re-clipping the same tree
    // at full velocity.  Clearing xImpulse + steerVelocity is critical
    // when the crash happened far off-road; otherwise the leftover
    // lateral momentum would shove the freshly-respawned car back
    // outside the asphalt within a frame or two.
    this.player.x             = this._postCrashLaneX();
    // Drop to the cold-start rolling speed; the crash-recovery
    // auto-pilot then ramps back up to 60 mph during the blink.
    this.player.speed         = MAX_SPEED * 0.18;
    this.player.steerVelocity = 0;
    this.player.xImpulse      = 0;
    this._invincibleUntil = (this.time?.now ?? 0) + 2500;
    this._crashRecoveryUntil = this._invincibleUntil;
    this._crashRollStartAt   = (this.time?.now ?? 0) + 1000;
    this._showPopup?.('💥 CRASH — recover!', '#FF4444');
  }

  _onCollect(sprite) {
    const type = sprite.collectibleType;

    // Difficulty-tiered HP top-up on DRUG pickups only — Easy +1,
    // Normal +0.5, Hard/Custom 0.  Weapons (F12), hitchhikers, and
    // cop-roadblocks are excluded so the heal stays tied to the
    // "indulgence rewards" loop, not every roadside collectible.
    if (type === 'drug') {
      const mode = Difficulty.mode?.();
      const hpBonus = mode === 'easy' ? 1 : mode === 'normal' ? 0.5 : 0;
      if (hpBonus > 0) this.damage?.repair?.(hpBonus);
    }

    if (type === 'hitchhiker') {
      this._hitchhikerPickup();
      return;
    }

    if (type === 'f12') {
      const invType = { f12_gun: 'gun', f12_spike: 'spike_strip', f12_paint: 'paint_bomb', f12_rocket: 'rocket' }[sprite.type];
      if (invType && !this.cops.canCarryMore(invType)) {
        // Inventory full for this type — don't consume the pickup so it
        // remains visible (and harvestable) if user later uses one.
        sprite.collected = false;
        return;
      }
      this.cops.addF12Token(sprite.type);
      this.stats?.recordWeaponCollected(invType ?? sprite.type);
      const labels = {
        f12_gun:    '🔫 GUN ACQUIRED',
        f12_spike:  '📍 SPIKE STRIP',
        f12_paint:  '🎨 PAINT BOMB',
        f12_rocket: '🚀 ROCKET LAUNCHER',
      };
      this._showPopup(labels[sprite.type] ?? 'F12 TOKEN', '#AADDFF');
      this.effects.triggerShake(60, 0.002);
      return;
    }

    if (type === 'cop_roadblock') {
      // Roadblocks only exist once you're at 3+ stars — under that threshold
      // skip the collision entirely (matches the visual gate in Road.js).
      if (this.cops.starDisplay < 3) return;
      // Treat as a vehicle collision
      const p   = this.player;
      const seg = this.road.getSegment(p.position);
      this._spawnExplosion(SCREEN_W / 2, SCREEN_H * 0.55, 40);
      p.xImpulse = (Math.random() > 0.5 ? 1 : -1) * 2.0;
      p.speed    = Math.max(1000, p.speed * 0.45);
      this.cops.addStar(0.33, 3);                 // hit roadblock
      this.effects.triggerShake(350, 0.012);

      // Every 3rd roadblock hit blows a tire — top speed capped at 45 mph for
      // 30 seconds (drive carefully or pick up a hitchhiker for repair).
      this._roadblockHits = (this._roadblockHits ?? 0) + 1;
      if (this._roadblockHits % 3 === 0) {
        this._flatTireTimer = 30;
        this._showPopup('💥 HIT ROADBLOCK!\n🔧 FLAT TIRE — top 45 mph', '#FF2222');
      } else {
        this._showPopup('HIT ROADBLOCK!\n⭐+1', '#FF4444');
      }
      return;
    }

    if (type === 'drug') {
      // 4★+ drug pickup suppression — match the renderer; the sprite is
      // visually invisible and shouldn't grant pickup either.
      if (this.cops.starDisplay >= 4 && (sprite.lootSeed ?? 1) < 0.40) {
        sprite.collected = true;       // mark as gone but don't grant
        return;
      }
      // Probation: first 60s after arrest = any drug use adds 2 stars
      if (this._probationTimer > 0) {
        this.cops.addStar(1.0, 3);                // drug pickup during probation
        this._showPopup('PROBATION!\n+1 STAR!', '#FF4444');
      }
      const result = this.drugs.pickup(sprite.type);
      if (!result) return;
      this.stats?.recordDrugCollected(result.drug);   // road sprite collected
      // First-pickup achievement — fire on the very first hit of each
      // drug, with the toast text describing the mechanic.
      if (this.drugs.pickupCounts?.[result.drug] === 1) {
        AchievementSystem.firstPickup(result.drug, this.registry);
      }
      // Full Tank: bar this drug to 99% (without OD'ing — OD is checked
      // below).  Fires once per run on first crossing.
      if (this.drugs.get(result.drug) >= 0.99 && !this._fullTankFired?.[result.drug]) {
        this._fullTankFired = this._fullTankFired ?? {};
        this._fullTankFired[result.drug] = true;
        AchievementSystem.award('full_tank', this.registry);
      }
      // Maxed-out: per-drug achievement for canOD drugs reaching 99%+
      // without overdosing.  Threshold is 0.99 (not 1.0) because hitting
      // exactly 100% sits at the OD edge — 99% reads as "maxed out" in
      // the same dramatic sense without forcing the player to a brink
      // where they're one pickup from dying.
      const _drugCfg = DRUG_CONFIG[result.drug];
      if (_drugCfg?.canOD
          && this.drugs.get(result.drug) >= 0.99
          && !this._maxedFired?.[result.drug]) {
        this._maxedFired = this._maxedFired ?? {};
        this._maxedFired[result.drug] = true;
        AchievementSystem.award(`maxed_${result.drug}`, this.registry);
      }
      // Custom mode: never OD — the slider-driven HUD already lets the
      // player set bars wherever they want, and OD'ing yourself there
      // is just a frustrating restart.  Treat it as a no-op.
      const _customMode = Difficulty.mode?.() === 'custom';
      if (result.overdose && !_customMode) { this._onOverdose(result.drug); return; }
      // Per-drug { base, full } payout table (constants.js) — full-bar
      // bonus kicks in at FULL_BAR_THRESHOLD (0.80) instead of 0.95.
      const drugPay  = DRUG_PTS[result.drug] ?? { base: 10, full: 20 };
      const isFull   = this.drugs.get(result.drug) >= FULL_BAR_THRESHOLD;
      const basePts  = isFull ? drugPay.full : drugPay.base;
      const earned   = Math.round(basePts * this._scoreMult());
      this.score    += earned;
      this.stats?.recordEarn(earned, 'pickup', basePts);
      const label    = DRUG_CONFIG[result.drug]?.label ?? sprite.type;
      const suffix   = isFull ? `\n★ FULL BAR  +$${earned}!` : `  +$${earned}`;
      this._showPopup(`${label}${suffix}`, isFull ? '#FF8800' : '#FFFF44');
      this.effects.triggerShake(55, 0.002);
    }
  }

  /** On-road hitchhiker pickup — risk/reward.  70 % positive (drugs
   *  recovery / score bonus / free weapon), 30 % negative (robbed of
   *  score, drugs, or a weapon).  Be careful who you pick up. */
  _hitchhikerPickup() {
    this.effects.triggerShake(80, 0.002);
    const r = Math.random();
    // Stats: on-road hitchhiker is good below 0.70, bad at/above (no neutral).
    this.stats?.recordHitchhiker(r < 0.70 ? 'good' : 'bad');

    // ── 14% — friendly biker, free rocket ─────────────────────────────
    if (r < 0.14) {
      this.cops.addF12Token('rocket');
      this._showPopup('🤝 BIKER GAVE\nYOU A 🚀 ROCKET!', '#88FFCC');
      return;
    }
    // ── 14% — old hippie, free grenade ────────────────────────────────
    if (r < 0.28) {
      this.cops.addF12Token('grenade');
      this._showPopup('🤝 OLD HIPPIE\n💣 GRENADE!', '#88FFCC');
      return;
    }
    // ── 14% — disguise ───────────────────────────────────────────────
    if (r < 0.42) {
      this.cops.addF12Token('disguise');
      this._showPopup('🤝 GAVE YOU A\n🎭 DISGUISE!', '#88FFCC');
      return;
    }
    // ── 14% — sober up + bonus $ ─────────────────────────────────────
    if (r < 0.56) {
      this.drugs.applyRecovery(0.20);
      const bonus = Math.round(PTS_HITCH * this._scoreMult());
      this.score += bonus;
      this.stats?.recordEarn(bonus, 'hitchhiker', PTS_HITCH);
      this._showPopup(`🤝 NICE FOLKS!\n+$${bonus}, sobered up`, '#88FFCC');
      return;
    }
    // ── 14% — party favor: random non-OD drug bar filled to 90% + cash ──
    if (r < 0.70) {
      const safeDrugs = [DRUGS.ALCOHOL, DRUGS.WEED, DRUGS.SHROOMS, DRUGS.LSD]
        .filter(id => this.drugs.isUnlocked?.(id));
      // Cash bonus is mixed in regardless — the favor isn't just chemical.
      const bonus = Math.round(PTS_HITCH * this._scoreMult() * 0.5);
      this.score += bonus;
      this.stats?.recordEarn(bonus, 'hitchhiker', PTS_HITCH * 0.5);
      if (safeDrugs.length) {
        const drug = safeDrugs[(Math.random() * safeDrugs.length) | 0];
        // Set level directly (90 % skips the 12 %-per-hit ramp), but also
        // bump maxReached + pickupCounts so the unlock gates and addiction
        // tracking fire as if the player had pickup()'d up to it.  Without
        // these the favor was silently inert for downstream unlocks.
        this.drugs.levels[drug] = 0.90;
        if ((this.drugs.maxReached?.[drug] ?? 0) < 0.90) {
          this.drugs.maxReached[drug] = 0.90;
        }
        this.drugs.pickupCounts[drug] = (this.drugs.pickupCounts[drug] ?? 0) + 1;
        this.drugs._checkUnlocks?.(0);
        const label = DRUG_CONFIG?.[drug]?.label ?? drug.toUpperCase();
        this._showPopup(`🤝 PARTY FAVOR!\n${label} → 90%, +$${bonus}`, '#88FFCC');
      } else {
        // Nothing unlocked yet — cash-only fallback.
        this._showPopup(`🤝 GAVE YOU\n+$${bonus}`, '#88FFCC');
      }
      return;
    }
    // ── 15% — sketchy stranger robs score ─────────────────────────────
    if (r < 0.85) {
      const loss = Math.min(this.score, 500);
      this.score -= loss;
      this.stats?.recordRobbery(loss);
      this._showPopup(`💀 ROBBED!\n−$${loss}`, '#FF4444');
      return;
    }
    // ── 10% — armed robbery, takes a random F12 token ─────────────────
    if (r < 0.95) {
      const tokens = this.cops.f12Tokens;
      let stolen = null;
      // Custom mode → weapons are infinite, so robbers can't steal them.
      // Still apply the cash penalty so the event has stakes.
      if (tokens.length && Difficulty.mode?.() !== 'custom') {
        const idx = (Math.random() * tokens.length) | 0;
        stolen = tokens[idx];
        tokens.splice(idx, 1);
      }
      const loss = Math.min(this.score, 250);
      this.score -= loss;
      this.stats?.recordRobbery(loss);
      this._showPopup(
        stolen
          ? `💀 ARMED ROBBERY!\n−$${loss} + lost ${stolen}!`
          : `💀 ARMED ROBBERY!\n−$${loss}`,
        '#FF4444',
      );
      return;
    }
    // ── 5% — wipe a random drug bar (junkie nicked your stash) ────────
    const bars = Object.values(DRUGS).filter(id =>
      this.drugs.isUnlocked(id) && this.drugs.get(id) > 0.05,
    );
    if (bars.length) {
      const target = bars[(Math.random() * bars.length) | 0];
      this.drugs.levels[target] = 0;
      this._showPopup(`💀 JUNKIE STOLE\nYOUR ${target.toUpperCase()}!`, '#FF4444');
    } else {
      this._showPopup('💀 SKETCHY HITCH\n— close call', '#FFCC44');
    }
  }

  /** Order in which the weapon-cycle button steps through types. Rockets
   *  appear twice (forward + backward) so the player can pick a direction. */
  static get WEAPON_CYCLE() {
    // Every weapon (except spike strips, which are rear-only by design)
    // has fwd/bwd variants so the player can fire in either direction.
    return [
      'gun-fwd',     'gun-bwd',
      'rocket-fwd',  'rocket-bwd',
      'spike_strip',
      'paint-fwd',   'paint-bwd',
      'grenade-fwd', 'grenade-bwd',
      'disguise',
    ];
  }

  /** Resolve a cycle slot ('rocket-fwd' / 'paint-bwd' / etc.) back to the
   *  underlying inventory token type stored in CopSystem.f12Tokens. */
  _baseWeaponType(slot) {
    if (slot === 'rocket-fwd'  || slot === 'rocket-bwd')  return 'rocket';
    if (slot === 'gun-fwd'     || slot === 'gun-bwd')     return 'gun';
    if (slot === 'paint-fwd'   || slot === 'paint-bwd')   return 'paint_bomb';
    if (slot === 'grenade-fwd' || slot === 'grenade-bwd') return 'grenade';
    return slot;
  }

  _selectedFireDirection() {
    const slot = this._selectedWeapon;
    if (typeof slot === 'string' && slot.endsWith('-bwd')) return 'backward';
    return 'forward';
  }

  /** Default cycle-slot for a freshly-picked-up base weapon — points at the
   *  forward variant so legacy tap-to-fire keeps firing forward. */
  _defaultSlotFor(baseType) {
    const map = {
      rocket:     'rocket-fwd',
      gun:        'gun-fwd',
      paint_bomb: 'paint-fwd',
      grenade:    'grenade-fwd',
    };
    return map[baseType] ?? baseType;
  }

  /** Render-time camera Z.  In cockpit mode the camera is shifted
   *  forward by CAM.eyeForwardZ (3000) so the viewpoint sits at the
   *  driver seat.  In chase mode this returns the raw physics position.
   *  Sprite render functions (`_renderSceneSprites`, `_renderVehicles`,
   *  `_renderDrugSprites`, etc.) use this for `relZ = sprite.position -
   *  cameraZ` so the world projects relative to the right viewpoint. */
  _renderCamPos() {
    return this.player.position + (CAM.eyeForwardZ ?? 0);
  }

  /** Single source of truth for "is ANY modal up?" so scene-level
   *  pointer handlers can early-out without latching steering / F12
   *  state behind the modal.  Individual modals (popup, map, garage,
   *  slider, achievements) flip their own flags; the global pointerdown
   *  / pointermove paths read them through here. */
  _anyModalOpen() {
    return !!(this._modalOpen
           || this._mapModalOpen
           || this._garageModalOpen
           || this._sliderModalOpen
           || this._achievementsModalOpen);
  }

  /** Currently selected weapon slot, falling back to the last token in
   *  inventory if the player hasn't cycled yet (preserves legacy behavior). */
  _currentWeaponSlot() {
    if (this._selectedWeapon) {
      // Verify the player still has at least one of this base type.
      const base = this._baseWeaponType(this._selectedWeapon);
      if (this.cops.f12Tokens.includes(base)) return this._selectedWeapon;
      this._selectedWeapon = null;
    }
    const tokens = this.cops.f12Tokens;
    if (!tokens.length) return null;
    const last = tokens[tokens.length - 1];
    return this._defaultSlotFor(last);
  }

  /** Cycle to the next available weapon (only stops on types the player
   *  actually owns; rocket-fwd / rocket-bwd both require a 'rocket' token). */
  _cycleWeapon() {
    const tokens = this.cops.f12Tokens;
    if (!tokens.length) return;
    const ORDER = GameScene.WEAPON_CYCLE;
    const has = (slot) => tokens.includes(this._baseWeaponType(slot));
    const cur = this._currentWeaponSlot();
    const startIdx = cur ? ORDER.indexOf(cur) : -1;
    for (let i = 1; i <= ORDER.length; i++) {
      const next = ORDER[(startIdx + i + ORDER.length) % ORDER.length];
      if (has(next)) {
        this._selectedWeapon = next;
        const labels = this._weaponLabels();
        this._showPopup(`SELECTED:\n${labels[next] ?? next}`, '#88FFCC');
        return;
      }
    }
  }

  _weaponLabels() {
    return {
      'gun-fwd':     '🔫 GUN ▲ FWD',
      'gun-bwd':     '🔫 GUN ▼ REAR',
      'rocket-fwd':  '🚀 ROCKET ▲ FWD',
      'rocket-bwd':  '🚀 ROCKET ▼ REAR',
      'paint-fwd':   '🎨 PAINT ▲ FWD',
      'paint-bwd':   '🎨 PAINT ▼ REAR',
      'grenade-fwd': '💣 GRENADE ▲ FWD',
      'grenade-bwd': '💣 GRENADE ▼ REAR',
      spike_strip:   '📍 SPIKE STRIP',
      disguise:      '🎭 DISGUISE',
    };
  }

  /** Mirror every top-row button (Pause, FF, Genre, Mute, Map,
   *  Garage) around SCREEN_W/2 when handedness flips, so the
   *  whole row visually swaps sides along with the weapon column +
   *  HP/Mi readouts.  Called from update() when _leftHanded changes
   *  and from the end of _buildHUD for the initial state. */
  /** Move the GAS/BRAKE pedal stack to the edge opposite the weapon
   *  column for the current handedness setting. Called from update() when
   *  _leftHanded changes; the build-time placement in _buildHUD uses
   *  the same math so first paint is correct.  Pedals are Phaser
   *  rectangles with origin (0.5, 1) — setting .x repositions both
   *  the visible body and the input hit area. */
  _applyPedalHandedness() {
    if (!this._gasBtn || !this._brakeBtn) return;
    const PEDAL_W = this._pedalDim?.w ?? 70;
    // Pedals sit on the OPPOSITE side from weapons — same side as the
    // drug-icon column (which now uses a 2-col grid so it fits above
    // the pedals comfortably).
    const x = this._leftHanded
      ? (SCREEN_W - PEDAL_W / 2 - 4)
      : (PEDAL_W / 2 + 4);
    this._gasBtn.x   = x;
    this._brakeBtn.x = x;
    if (this._gasLbl)   this._gasLbl.x   = x;
    if (this._brakeLbl) this._brakeLbl.x = x;
    this._layoutWiperButton?.();
  }

  /** Angled neon glass cell used by the top toolbar and its redraw pass. */
  _drawTopRowButton(bg, x, y, size, lit = false) {
    const slant = 6;
    const r = 4;
    const pts = [
      { x: x + slant, y: y + 1 },
      { x: x + size, y: y + 1 },
      { x: x + size - slant, y: y + size - 1 },
      { x, y: y + size - 1 },
    ];
    const inset = (from, to, dist) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
    };
    const roundedCorner = (cur, from, to) => {
      const a = inset(cur, from, r);
      const b = inset(cur, to, r);
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const mt = 1 - t;
        bg.lineTo(
          mt * mt * a.x + 2 * mt * t * cur.x + t * t * b.x,
          mt * mt * a.y + 2 * mt * t * cur.y + t * t * b.y,
        );
      }
    };
    const drawRoundedSlant = () => {
      const first = inset(pts[0], pts[1], r);
      bg.beginPath();
      bg.moveTo(first.x, first.y);
      for (let i = 1; i <= pts.length; i++) {
        const cur = pts[i % pts.length];
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const next = pts[(i + 1) % pts.length];
        const a = inset(cur, prev, r);
        bg.lineTo(a.x, a.y);
        roundedCorner(cur, prev, next);
      }
      bg.closePath();
    };
    bg.clear();
    bg.fillStyle(lit ? 0x111827 : 0x03060D, lit ? 0.94 : 0.88);
    drawRoundedSlant();
    bg.fillPath();
    bg.lineStyle(lit ? 4 : 3, lit ? 0xFF39AF : 0x39D9FF, lit ? 0.20 : 0.13);
    drawRoundedSlant();
    bg.strokePath();
    bg.lineStyle(lit ? 2 : 1.5, lit ? 0xFF39AF : 0x39D9FF, 1);
    drawRoundedSlant();
    bg.strokePath();
  }

  _topRowButtonTexture(type, lit = false) {
    if (type === 'pause') return lit ? 'ui_top_btn_pause_active' : 'ui_top_btn_pause';
    if (type === 'ff') return lit ? 'ui_top_btn_ff_active' : 'ui_top_btn_ff';
    if (type === 'genre') return 'ui_top_btn_genre';
    if (type === 'mute') return lit ? 'ui_top_btn_mute' : 'ui_top_btn_unmute';
    if (type === 'map') return 'ui_top_btn_map';
    if (type === 'garage') return 'ui_top_btn_garage';
    return 'ui_top_btn_genre';
  }

  _setTopRowButtonTexture(img, type, lit = false, size = 56) {
    // Guard against destroyed GameObjects (scene-restart leaves dead
    // refs on `this` until _buildHUD reassigns).  Phaser nulls
    // `gameObject.scene` on destroy, so checking it is the cheapest
    // way to skip a stale call without exploding inside setTexture.
    if (!img || !img.scene) return;
    img.setTexture(this._topRowButtonTexture(type, lit));
    img.setDisplaySize(size, size);
  }

  /** Small, code-drawn neon symbols stay crisp in the 56 px toolbar cells. */
  _drawTopRowIcon(icon, type, accent = 0x39D9FF) {
    const cyan = accent;
    const pink = 0xFF39AF;
    const white = 0xF4F7FF;
    const glowLine = (width, color, alpha = 0.10) => icon.lineStyle(width, color, alpha);
    const hotLine = (width, color) => icon.lineStyle(width, color, 1);
    icon.clear();

    if (type === 'map') {
      const mapPts = [
        { x: -15, y: -10 }, { x: -5, y: -15 }, { x: 5, y: -10 }, { x: 15, y: -15 },
        { x: 15, y: 12 }, { x: 5, y: 16 }, { x: -5, y: 11 }, { x: -15, y: 16 },
      ];
      glowLine(3, cyan);
      icon.strokePoints(mapPts, true);
      hotLine(1.5, cyan);
      icon.strokePoints(mapPts, true);
      hotLine(1.5, cyan);
      icon.lineBetween(-5, -14, -5, 11);
      icon.lineBetween(5, -10, 5, 15);
      glowLine(3, pink, 0.12);
      icon.strokeCircle(7, -6, 5);
      hotLine(2, pink);
      icon.strokeCircle(7, -6, 5);
      icon.lineBetween(7, -1, 7, 5);
      icon.fillStyle(pink, 1);
      icon.fillCircle(7, -6, 1.8);
      return;
    }

    if (type === 'garage') {
      const garagePts = [
        { x: -16, y: 16 }, { x: -16, y: -6 }, { x: 0, y: -16 },
        { x: 16, y: -6 }, { x: 16, y: 16 },
      ];
      glowLine(3, cyan);
      icon.strokePoints(garagePts, false);
      hotLine(2, cyan);
      icon.strokePoints(garagePts, false);
      hotLine(1.5, cyan);
      icon.lineBetween(-10, 0, 10, 0);
      icon.lineBetween(-10, 5, 10, 5);
      icon.lineBetween(-10, 10, 10, 10);
      icon.strokeRect(-7, 8, 14, 8);
      const carPts = [
        { x: -14, y: 18 }, { x: -10, y: 12 }, { x: 10, y: 12 },
        { x: 14, y: 18 },
      ];
      icon.fillStyle(pink, 0.55);
      icon.fillPoints([{ x: -14, y: 18 }, { x: -10, y: 12 }, { x: 10, y: 12 }, { x: 14, y: 18 }], true);
      glowLine(3, pink, 0.12);
      icon.strokePoints(carPts, false);
      hotLine(2.5, pink);
      icon.strokePoints(carPts, false);
      icon.fillStyle(pink, 1);
      icon.fillCircle(-9, 18, 2.4);
      icon.fillCircle(9, 18, 2.4);
      return;
    }

    if (type === 'genre') {
      glowLine(3, cyan);
      icon.lineBetween(-14, 14, -14, 5);
      icon.lineBetween(-7, 14, -7, -1);
      icon.lineBetween(0, 14, 0, -8);
      hotLine(2, cyan);
      icon.lineBetween(-14, 14, -14, 5);
      icon.lineBetween(-7, 14, -7, -1);
      icon.lineBetween(0, 14, 0, -8);
      glowLine(3, pink, 0.12);
      icon.lineBetween(10, -14, 10, 8);
      icon.lineBetween(10, -14, 18, -10);
      icon.strokeCircle(5, 11, 5);
      hotLine(2, pink);
      icon.lineBetween(10, -14, 10, 8);
      icon.lineBetween(10, -14, 18, -10);
      icon.strokeCircle(5, 11, 5);
      return;
    }

    if (type === 'mute' || type === 'muted') {
      const speaker = [
        { x: -16, y: -5 }, { x: -9, y: -5 }, { x: 3, y: -14 },
        { x: 3, y: 14 }, { x: -9, y: 5 }, { x: -16, y: 5 },
      ];
      glowLine(3, cyan);
      icon.strokePoints(speaker, true);
      hotLine(2, cyan);
      icon.strokePoints(speaker, true);
      glowLine(3, pink, 0.12);
      icon.lineBetween(-14, 14, 16, -14);
      hotLine(2, pink);
      icon.lineBetween(-14, 14, 16, -14);
      hotLine(1.5, cyan);
      icon.strokePoints([{ x: 11, y: 2 }, { x: 14, y: 0 }, { x: 15, y: -3 }], false);
      return;
    }

    if (type === 'ff') {
      icon.fillStyle(cyan, 1);
      icon.fillPoints([{ x: -15, y: -13 }, { x: -1, y: 0 }, { x: -15, y: 13 }], true);
      icon.fillPoints([{ x: 1, y: -13 }, { x: 15, y: 0 }, { x: 1, y: 13 }], true);
      glowLine(3, cyan, 0.12);
      icon.strokePoints([{ x: -15, y: -13 }, { x: -1, y: 0 }, { x: -15, y: 13 }], true);
      icon.strokePoints([{ x: 1, y: -13 }, { x: 15, y: 0 }, { x: 1, y: 13 }], true);
      hotLine(1.5, cyan);
      icon.strokePoints([{ x: -15, y: -13 }, { x: -1, y: 0 }, { x: -15, y: 13 }], true);
      icon.strokePoints([{ x: 1, y: -13 }, { x: 15, y: 0 }, { x: 1, y: 13 }], true);
      return;
    }

    if (type === 'pause') {
      const isPaused = cyan === pink;
      icon.fillStyle(isPaused ? pink : 0x050812, 1);
      icon.fillRoundedRect(-12, -15, 8, 30, 2);
      icon.fillRoundedRect(4, -15, 8, 30, 2);
      glowLine(3, cyan, 0.12);
      icon.strokeRoundedRect(-12, -15, 8, 30, 2);
      icon.strokeRoundedRect(4, -15, 8, 30, 2);
      hotLine(1.5, cyan);
      icon.strokeRoundedRect(-12, -15, 8, 30, 2);
      icon.strokeRoundedRect(4, -15, 8, 30, 2);
    }
  }

  _applyTopRowHandedness() {
    if (!this._topRowButtons?.length) return;
    const lh  = !!this._leftHanded;
    const top = 2;
    for (const btn of this._topRowButtons) {
      const x = lh ? btn.baseLeft : (SCREEN_W - btn.baseLeft - btn.size);
      const isPause = btn.id === 'pause';
      const lit = isPause ? this._paused : (btn.id === 'mute' ? !!this.audio?.muted : false);
      if (btn.artType) {
        btn.bg.clear();
        this._setTopRowButtonTexture(btn.lbl, btn.artType, lit, btn.size);
      } else {
        // Legacy vector fallback for any toolbar entry not converted to art.
        this._drawTopRowButton(btn.bg, x, top, btn.size, lit);
      }
      if (btn.lbl) btn.lbl.x = x + btn.size / 2;
      if (btn.bg.input) {
        btn.bg.input.hitArea = new Phaser.Geom.Rectangle(x, top, btn.size, btn.size);
      }
    }
    // hudRadio (station name label) sits under the Genre button — keep
    // it anchored to whichever side Genre is now on.
    const g = this._topRowButtons.find(b => b.id === 'genre');
    if (g && this.hudRadio) {
      const x = lh ? g.baseLeft : (SCREEN_W - g.baseLeft - g.size);
      this.hudRadio.x = x + g.size / 2;
    }
  }

  /** Toggle paused state.  Used by both the SPACE key and the on-screen button. */
  _togglePause() {
    // Can't pause from the title / pre-start screen — the difficulty-select
    // overlay owns the screen there, so a PAUSED overlay is nonsensical (and
    // the pause BUTTON, unlike the SPACE key, otherwise reaches here while
    // _awaitingStart is still true).
    if (this._awaitingStart) return;
    this._paused = !this._paused;
    this._pauseGfx?.clear();
    if (this._paused) {
      this._pauseGfx?.fillStyle?.(0x000000, 0.6);
      this._pauseGfx?.fillRect?.(0, 0, SCREEN_W, SCREEN_H);
      // Trap-stop visuals (the flashing cop-light bands + the below-mirror
      // SLOW DOWN/PULL OVER / TRAFFIC STOP sign) are drawn from update(),
      // which is skipped while paused — so without this they FREEZE on top of
      // the PAUSED screen and make it look like pausing did nothing.  Clear
      // them here; the held-stop block redraws them on resume.
      this._trapLightGfx?.clear();
      this._trapSign?.setVisible(false);
    }
    if (this._pauseObjects) {
      for (const o of this._pauseObjects) o.setVisible?.(this._paused);
    } else {
      this._pauseText?.setVisible?.(this._paused);
    }
    // Pause button visual — a magenta neon glow signals the held state.
    if (this._redrawPauseBtn) this._redrawPauseBtn(0.85, this._paused);
    if (this._pauseBtnRef) this._pauseBtnRef.setAlpha(this._paused ? 0.95 : 0.85);
    if (this._pauseLblRef) {
      this._setTopRowButtonTexture(this._pauseLblRef, 'pause', this._paused, 56);
    }
    // Score-multiplier ("combination") is hidden while paused so the
    // pause controls sitting in its slot aren't crowded.
    this.hudMult?.setVisible?.(!this._paused);
    // When un-pausing, also tear down any open map modal so its rest-stop
    // text labels (which sit at depth 63 above the HUD) don't linger over
    // gameplay.
    if (!this._paused && this._mapModalOpen) this._closeMapModal();
    this.audio?.setPaused?.(this._paused);
  }

  /** Open the route-map modal — a centered panel showing the real WA
   *  geography (lat/lon waypoints for every checkpoint along
   *  I-90 → WA-26 → US-195 → WA-270) with rest-stop ticks + town labels
   *  and a player dot at the current mileage.  Mirrors the garage modal's
   *  lifecycle so its objects are owned by the modal and destroyed
   *  cleanly on close. */
  _buildMapModal() {
    if (this._mapModalOpen) return;
    this._mapModalOpen = true;
    // Freeze gameplay while the map is up — same pattern as the
    // garage modal.  Remember the prior pause state so closing the
    // map restores it.
    this._mapPrevPaused = !!this._paused;
    this._paused = true;
    this.audio?.setPaused?.(true);
    const D = 260;                 // higher than the garage modal (240)
    const objs = [];

    const scrim = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.75)
      .setOrigin(0).setDepth(D).setInteractive();
    scrim.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); });
    objs.push(scrim);

    const panelW = SCREEN_W - 40;
    const panelH = SCREEN_H - 60;
    const panelX = 20;
    const panelY = 30;
    const panel = this.add.graphics().setDepth(D + 1);
    panel.fillStyle(0x020611, 0.96);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 7);
    panel.lineStyle(3, 0x39A8FF, 0.96);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 7);
    panel.lineStyle(1, 0xFF39AF, 0.78);
    panel.strokeRoundedRect(panelX + 7, panelY + 7, panelW - 14, panelH - 14, 5);
    panel.lineStyle(1, 0xF4F7FF, 0.24);
    panel.strokeRoundedRect(panelX + 13, panelY + 13, panelW - 26, panelH - 26, 4);
    objs.push(panel);

    const title = this.add.text(SCREEN_W / 2, panelY + 14, 'ROUTE MAP', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(D + 2);
    objs.push(title);

    // Plot area inside the panel.
    const plotX = panelX + 16;
    const plotY = panelY + 50;
    const plotW = panelW - 32;
    const plotH = panelH - 100;        // leave room for title + close button

    const g = this.add.graphics().setDepth(D + 2);
    objs.push(g);

    // ── Build the road polyline from real-world lat/lon waypoints ──────
    // Hand-keyed (lat, lon) for every named checkpoint along the actual
    // I-90 → WA-26 → US-195 → WA-270 corridor.  Plotting these as
    // (lon, -lat) gives a top-down map matching what you'd see on Google
    // Maps — straight east shot to Vantage, east-southeast across the
    // Columbia Basin, then the south jog at Colfax → Pullman.
    const GEO_WAYPOINTS = [
      [   0, 47.580, -122.390],   // West Seattle
      [   5, 47.598, -122.330],   // Seattle
      [ 9.5, 47.570, -122.222],   // Mercer Island
      [12.5, 47.611, -122.180],   // Bellevue
      [  18, 47.530, -122.033],   // Issaquah
      [  25, 47.528, -121.825],   // Snoqualmie
      [  32, 47.493, -121.789],   // North Bend
      [  53, 47.424, -121.413],   // Snoqualmie Pass
      [  70, 47.243, -121.187],   // Easton
      [  84, 47.196, -120.937],   // Cle Elum
      [ 101, 47.071, -120.661],   // Thorp
      [ 109, 46.995, -120.547],   // Ellensburg
      [ 137, 46.948, -119.978],   // Vantage
      [ 158, 46.904, -119.629],   // Royal City
      [ 184, 46.826, -119.176],   // Othello
      [ 205, 46.759, -118.825],   // Hatton (real-world lat/lon — was previously interpolated on the straight Othello→Washtucna line)
      [ 228, 46.755, -118.310],   // Washtucna
      [ 253, 46.810, -117.873],   // La Crosse
      [ 274, 46.877, -117.364],   // Colfax
      [ 289, 46.731, -117.180],   // Pullman
    ];
    // Densify the polyline by linearly interpolating between waypoints
    // every ~0.5 mi so the line draws smoothly.
    const pathPts = [];
    const PATH_MILE_STEP = 0.5;
    for (let i = 0; i < GEO_WAYPOINTS.length - 1; i++) {
      const [m0, lat0, lon0] = GEO_WAYPOINTS[i];
      const [m1, lat1, lon1] = GEO_WAYPOINTS[i + 1];
      const span = m1 - m0;
      const steps = Math.max(1, Math.ceil(span / PATH_MILE_STEP));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const lat = lat0 + (lat1 - lat0) * t;
        const lon = lon0 + (lon1 - lon0) * t;
        pathPts.push([lon, -lat]);   // x = east, y = up (-lat → north on top)
      }
    }
    {
      const [, lat, lon] = GEO_WAYPOINTS[GEO_WAYPOINTS.length - 1];
      pathPts.push([lon, -lat]);
    }

    // Fit the path into the plot box.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pathPts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const PADDING = 24;                      // px inset around the route
    const fitW = plotW - PADDING * 2;
    const fitH = plotH - PADDING * 2;
    const s = Math.min(fitW / dx, fitH / dy);
    const cxData = (minX + maxX) / 2;
    const cyData = (minY + maxY) / 2;
    const ox = plotX + plotW / 2;
    const oy = plotY + plotH / 2;
    const project = (px, py) => [ox + (px - cxData) * s, oy + (py - cyData) * s];

    // Plot frame + subdued scan grid, matching the neon glass modals.
    g.fillStyle(0x030812, 0.62);
    g.fillRoundedRect(plotX, plotY, plotW, plotH, 5);
    g.lineStyle(1, 0x39A8FF, 0.30);
    g.strokeRoundedRect(plotX, plotY, plotW, plotH, 5);
    g.lineStyle(1, 0x39A8FF, 0.10);
    for (let gx = plotX + 24; gx < plotX + plotW; gx += 24) {
      g.beginPath();
      g.moveTo(gx, plotY + 4);
      g.lineTo(gx, plotY + plotH - 4);
      g.strokePath();
    }
    for (let gy = plotY + 24; gy < plotY + plotH; gy += 24) {
      g.beginPath();
      g.moveTo(plotX + 4, gy);
      g.lineTo(plotX + plotW - 4, gy);
      g.strokePath();
    }

    // Draw the road as a cyan neon polyline with a magenta inner trace.
    g.lineStyle(9, 0x39A8FF, 0.25);
    g.beginPath();
    {
      const [sx, sy] = project(pathPts[0][0], pathPts[0][1]);
      g.moveTo(sx, sy);
      for (let i = 1; i < pathPts.length; i++) {
        const [nx, ny] = project(pathPts[i][0], pathPts[i][1]);
        g.lineTo(nx, ny);
      }
    }
    g.strokePath();
    g.lineStyle(5, 0x39A8FF, 0.95);
    g.beginPath();
    {
      const [sx, sy] = project(pathPts[0][0], pathPts[0][1]);
      g.moveTo(sx, sy);
      for (let i = 1; i < pathPts.length; i++) {
        const [nx, ny] = project(pathPts[i][0], pathPts[i][1]);
        g.lineTo(nx, ny);
      }
    }
    g.strokePath();
    // Magenta center pulse — every 3rd sample so it dashes naturally.
    g.lineStyle(1.5, 0xFF39AF, 0.82);
    for (let i = 1; i < pathPts.length; i += 3) {
      const [ax, ay] = project(pathPts[i - 1][0], pathPts[i - 1][1]);
      const [bx, by] = project(pathPts[i    ][0], pathPts[i    ][1]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();
    }

    // Helper: project a mile onto an (x,y) point along the polyline.
    const ptAtMile = (mile) => {
      const f = Math.max(0, Math.min(1, mile / TOTAL_ROUTE_MILES));
      const idx = Math.min(pathPts.length - 1, Math.round(f * (pathPts.length - 1)));
      return project(pathPts[idx][0], pathPts[idx][1]);
    };

    // Rest-stop ticks + town labels.  Labels are bigger + tier-colored
    // (bronze/silver/gold) when the stop has been reached on Easy/
    // Normal/Hard.  Unreached stops render in a dim grey.  When a save
    // snapshot exists for the stop in the current mode, the label is
    // interactive — tap to warp to that checkpoint.
    const TIER_HEX = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700' };
    const save      = this.registry.get('save');
    const tiers     = save?.get?.('checkpointTiers') ?? {};
    const allSaves  = save?.get?.('restStopSaves') ?? {};
    // Custom mode is a sandbox — every checkpoint is tappable so the
    // player can warp anywhere without grinding through the route on
    // a scored difficulty first.
    const inCustom  = Difficulty.mode?.() === 'custom';
    // Pre-index saves by stopId — newest-first — so each label can find
    // its target snapshot in O(1).
    const savesByStop = {};
    for (const code of Object.keys(allSaves)) {
      const snap = allSaves[code];
      if (!snap?.id) continue;
      const cur = savesByStop[snap.id];
      if (!cur || (snap.ts ?? 0) > (cur.ts ?? 0)) savesByStop[snap.id] = snap;
    }
    const LANE_OFFSETS = [-32, -16, 16, 32];   // px, +y is downward
    REST_STOPS.forEach((rs, i) => {
      const [px, py] = ptAtMile(rs.mileage);
      g.fillStyle(0xF4F7FF, 1);
      g.fillCircle(px, py, 3);
      g.lineStyle(1, 0x39A8FF, 0.95);
      g.strokeCircle(px, py, 3);
      const dy = LANE_OFFSETS[i % LANE_OFFSETS.length];
      const ly = py + dy;
      // Leader line from dot to label.
      g.lineStyle(1, 0x39A8FF, 0.48);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px, ly);
      g.strokePath();
      const tier      = tiers[rs.id];
      const snapHere  = savesByStop[rs.id];
      const tappable  = !!snapHere || inCustom;
      const labelCol  = inCustom
        ? '#FFCC44'
        : (TIER_HEX[tier] ?? (tappable ? '#F4F7FF' : '#7894A8'));
      const lbl = this.add.text(px, ly,
        rs.name.split(',')[0], {
        fontSize: '14px', fontFamily: IMPACT,
        color: labelCol, stroke: tappable ? '#39A8FF' : '#071224', strokeThickness: tappable ? 2 : 3,
      }).setOrigin(0.5, dy < 0 ? 1 : 0).setDepth(D + 3);
      if (tappable) {
        lbl.setInteractive({ useHandCursor: true });
        lbl.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          this._closeMapModal?.();
          if (snapHere) {
            // Real save — restore its difficulty + state.
            if (snapHere.difficulty) Difficulty.set(snapHere.difficulty, this.registry);
            this._resumeFromSavedSnapshot?.(snapHere);
          } else if (inCustom) {
            // Custom-mode sandbox warp — fresh start at that stop.
            // Mark as a forward warp so the gas tank deducts the trip
            // distance (mile 0 → rs.mileage) on init.
            const curMile = (this.player?.position ?? 0)
              / (ROUTE_SEGS * SEG_LENGTH) * TOTAL_ROUTE_MILES;
            this.scene.start('Game', {
              resumeFromStop: rs.id, resumeScore: 0, resumeStars: 0,
              warpForward: rs.mileage > curMile,
            });
          }
        });
      }
      this.cameras.main?.ignore?.(lbl);
      objs.push(lbl);
    });

    // Player dot — pulsing red at current mile.
    const pMile = (this.player?.position ?? 0) / (ROUTE_SEGS * SEG_LENGTH) * TOTAL_ROUTE_MILES;
    const [pX, pY] = ptAtMile(pMile);
    g.fillStyle(0xFF39AF, 1);
    g.fillCircle(pX, pY, 6);
    g.lineStyle(2, 0xF4F7FF, 1);
    g.strokeCircle(pX, pY, 6);
    const youLbl = this.add.text(pX, pY - 12, `YOU · MILE ${Math.round(pMile)}`, {
      fontSize: '11px', fontFamily: IMPACT,
      color: '#FF39AF', stroke: '#071224', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(D + 4);
    this.cameras.main?.ignore?.(youLbl);
    objs.push(youLbl);

    // Close button.
    const closeY = panelY + panelH - 28;
    const closeBg = this.add.graphics().setDepth(D + 2);
    const drawClose = (hover = false) => {
      closeBg.clear();
      closeBg.fillStyle(0x050812, hover ? 1 : 0.92);
      closeBg.fillRoundedRect(SCREEN_W / 2 - 80, closeY - 15, 160, 30, 5);
      closeBg.lineStyle(hover ? 3 : 2, 0x39A8FF, 1);
      closeBg.strokeRoundedRect(SCREEN_W / 2 - 80, closeY - 15, 160, 30, 5);
    };
    drawClose(false);
    closeBg.setInteractive(
      new Phaser.Geom.Rectangle(SCREEN_W / 2 - 80, closeY - 15, 160, 30),
      Phaser.Geom.Rectangle.Contains,
    );
    closeBg.input.cursor = 'pointer';
    const closeLbl = this.add.text(SCREEN_W / 2, closeY, 'CLOSE', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3);
    closeBg.on('pointerover', () => drawClose(true));
    closeBg.on('pointerout',  () => drawClose(false));
    closeBg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._closeMapModal();
    });
    objs.push(closeBg, closeLbl);

    this.cameras.main?.ignore?.(objs);
    this._mapModalObjs = objs;
  }

  _closeMapModal() {
    const list = this._mapModalObjs ?? [];
    for (const o of list) o?.destroy?.();
    this._mapModalObjs = null;
    this._mapModalOpen = false;
    // Restore the pre-modal pause state.  If the player had already
    // paused before opening the map, stay paused on close.
    if (this._mapPrevPaused === false) {
      this._paused = false;
      this.audio?.setPaused?.(false);
    }
    this._mapPrevPaused = null;
    this._mapModalJustClosed = true;
    this.time?.delayedCall?.(50, () => { this._mapModalJustClosed = false; });
  }

  /** Dark glass + neon-outline pause control matching the ending screens. */
  _buildPauseButton(cx, cy, w, h, label, neonColor, onClick) {
    const bg = this.add.graphics().setDepth(62).setVisible(false);
    const draw = (hover = false) => {
      bg.clear();
      bg.fillStyle(0x050812, hover ? 0.97 : 0.88);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
      bg.lineStyle(hover ? 3 : 2, neonColor, 1);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
    };
    draw(false);
    bg.setInteractive(
      new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    bg.input.cursor = 'pointer';
    const css = `#${neonColor.toString(16).padStart(6, '0')}`;
    const txt = this.add.text(cx, cy, label, {
      fontSize: '20px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#F4F7FF', stroke: css, strokeThickness: 2, align: 'center',
    }).setOrigin(0.5).setDepth(63).setVisible(false);
    bg.on('pointerover', () => draw(true));
    bg.on('pointerout',  () => draw(false));
    let armed = false;
    bg.on('pointerdown', () => { armed = true; });
    bg.on('pointerup',   () => { if (armed) { armed = false; onClick?.(); } });
    bg.on('pointerout',  () => { armed = false; });
    return { bg, txt };
  }

  /** Fire a specific weapon type directly (used by tap-on-icon).  If the
   *  player owns at least one of `baseType`, sets the selected slot to it
   *  and fires.  Rocket defaults to forward (use Q / weapon-cycle for
   *  rear-fire). */
  _fireWeaponByType(baseType) {
    if (!this.cops.f12Tokens.includes(baseType)) return;
    this._selectedWeapon = this._defaultSlotFor(baseType);
    this._useTopF12();
  }

  _useTopF12() {
    // Per-frame double-fire gate.  Both the key/touch path AND the
    // inventory-icon `pointerdown` can call this same frame (e.g. tap
    // icon while holding F).  Without the gate the player burns two
    // tokens for one intent.  Reset to false at the top of each
    // update() pass so legitimate next-frame fires still work.
    if (this._f12FiredThisFrame) return;
    this._f12FiredThisFrame = true;
    const slot = this._currentWeaponSlot();
    if (!slot) return;
    const base = this._baseWeaponType(slot);
    const dir  = this._selectedFireDirection();
    // Pulling a weapon during a parked speed-trap stop (the comply window OR
    // the held traffic stop) instead of pulling over counts as a weapon on a
    // cop: the trooper voids the civil stop, becomes a live chaser, and you
    // escalate into the 4-5★ band.  Disguise / paint-bomb are non-aggressive
    // (hide / repaint) so they're exempt — same exclusion as the F12 cop-kill
    // escalation.
    const weaponOnTrooper = (this._trapPursuitActive || this._trapStopHeld)
                         && base !== 'disguise' && base !== 'paint_bomb';
    const result = this.cops.useF12Token(base, this.player.position, dir, this.traffic);
    if (result?.ok) {
      if (weaponOnTrooper) {
        this._trapPursuitActive = false;
        this._trapStopping      = false;
        this._trapComplyTimer   = 0;
        this._trapStopHeld      = false;
        this._trapStopHoldTimer = 0;
        this.cops.weaponPulledAtTrap(this.player.position);
      }
      // Weapons are infinite-use, but each fire has a 25% chance of
      // attracting a wanted star (witnesses, gunshot acoustic flags,
      // etc).  Custom mode bypasses since cops are typically off there.
      // Disguise + spike_strip don't make noise / aren't violent toward
      // a target, so they don't roll the heat — disguise especially
      // shouldn't re-add a star on the exact tap that zeroed them.  Skip the
      // roll entirely when we already escalated for pulling on the trooper.
      const isHeatlessWeapon = (base === 'disguise' || base === 'spike_strip');
      if (!weaponOnTrooper && !isHeatlessWeapon
          && Math.random() < 0.25
          && Difficulty.mode?.() !== 'custom') {
        this.cops.addStar?.(1, 3);
        this._showPopup?.('🚓 +1 STAR — heard the shot', '#FF6644');
      }
      const arrow = dir === 'backward' ? '▼ REAR' : '▲ FWD';
      const labels = {
        gun:          `🔫 SHOT FIRED ${arrow}!`,
        spike_strip:  '📍 SPIKES DEPLOYED!',
        paint_bomb:   `🎨 PAINT LAUNCHED ${arrow}!`,
        rocket:       `🚀 ROCKET ${arrow}!`,
        grenade:      `💣 GRENADE ${arrow}!`,
        disguise:     '🎭 GOING DARK!',
      };
      this._showPopup(labels[base] ?? 'F12 USED!', '#AADDFF');
      this.effects.triggerShake(180, 0.007);

      // Per-victim FX: project each car's last-known position to screen,
      // then drop the appropriate effect on top of it.
      const isBomb = (base === 'rocket' || base === 'grenade' || base === 'paint_bomb');
      for (const v of (result.victims ?? [])) {
        const relZ = v.position - this.player.position;
        if (Math.abs(relZ) > 80000) continue;
        const proj = this.road.getVehicleProjection(relZ, v.laneOffset);
        if (!proj || proj.sw < 4) continue;
        const sx = proj.sx;
        const sy = proj.sy - proj.sw * 0.25;   // mid-body height of the car
        const sw = proj.sw;
        // Wreck — drifts laterally, spins, fades out over 1.5s.  Pass
        // colorSet so the wreck renders the actual car sprite (not a
        // grey rectangle).  Cops fall back to a police car texture.
        const wreckTex = v.isCop
          ? (this.textures.exists('car_back_police') ? 'car_back_police' : 'cop_police')
          : this._carTexKey(v.colorSet, 'back');
        this._spawnWreck(sx, sy, sw, v.laneOffset, wreckTex);
        if (base === 'gun') {
          // Tiny star on the windshield (front half of the car).
          this._spawnGunStar(sx, sy - sw * 0.12, sw);
        } else if (isBomb) {
          // Full explosion at the car's centre.
          this._spawnExplosion(sx, sy, sw * 1.2);
        }
      }

      // Override the weapon label so the escalation is the message that lands.
      if (weaponOnTrooper) {
        this._showPopup('🚨 WEAPON ON AN OFFICER!\nThey won\'t forget that.', '#FF4444');
      }

      this._currentWeaponSlot();
    }
  }

  /** Tiny white star at gun-impact point — short-lived flash on the
   *  victim's windshield. */
  _spawnGunStar(sx, sy, sw) {
    if (!this.explosions) this.explosions = [];
    this.explosions.push({
      sx, sy, sw: Math.max(8, sw * 0.5),
      timer: 0, maxTimer: 0.18, kind: 'star',
    });
  }

  /** Wreck animation — the actual car sprite spinning and drifting
   *  laterally with a smoke trail.  texKey is the Phaser texture for
   *  the victim car (drawn as a real Image, not a grey rectangle). */
  _spawnWreck(sx, sy, sw, laneOffset, texKey) {
    if (!this.explosions) this.explosions = [];
    // Faster, more violent spin — like the car was just smashed.
    const lateralV = (laneOffset >= 0 ? 1 : -1) * (140 + Math.random() * 80);
    const spinV    = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
    // Spawn a Phaser Image of the actual car sprite — it's rotated /
    // moved / faded by _renderExplosions each frame and destroyed when
    // the wreck timer expires.
    let img = null;
    if (texKey && this.textures.exists(texKey)) {
      const targetW = Math.max(20, sw * 1.6);
      const tex     = this.textures.get(texKey).source[0];
      const baseW   = tex?.width  || 64;
      const baseH   = tex?.height || 64;
      const targetH = targetW * (baseH / baseW);
      img = this.add.image(sx, sy, texKey)
        .setOrigin(0.5)
        .setDisplaySize(targetW, targetH)
        .setDepth(9.6);   // below player (9.95), above scenery (≤9.5)
      // Mirror the camera-ignore pattern: world objects on main cam only.
      this._uiCam?.ignore?.(img);
    }
    this.explosions.push({
      sx, sy, sw: Math.max(14, sw),
      timer: 0, maxTimer: 1.5, kind: 'wreck',
      lateralV, spinV, rotation: 0,
      img,
    });
  }

  /**
   * Update the geometry-mask shape used to stencil tunnelGfx (the
   * interior walls/ceiling render).
   *
   *   • Approaching the tunnel from outside: mask = the mouth-opening
   *     rectangle published by Road._drawTunnelFacade.  The interior
   *     can only paint inside that rectangle — it physically cannot
   *     leak past the facade or houses around the mouth.
   *   • Inside the tunnel: mask = full screen.  Interior walls render
   *     normally everywhere.
   *   • Otherwise (no tunnel in sight): mask is empty → interior
   *     draws nothing.
   *
   * GeometryMask uses the mask Graphics' alpha shape as a stencil;
   * the Graphics itself is invisible (setVisible(false) in init).
   */
  _updateTunnelMask() {
    const mg = this._tunnelMaskGfx;
    if (!mg) return;
    mg.clear();
    const segs = this.road?.segments;
    if (!segs?.length) return;
    // Use the RENDER camera so the "are we visually inside a tunnel?"
    // check matches what the road actually projected this frame.  In
    // cockpit mode the eye sits CAM.eyeForwardZ ahead of the player;
    // keying off raw player.position would say "outside" while the
    // visible interior walls render — leaving the mask clipped to the
    // mouth rect that no longer corresponds to anything on screen.
    const camPos = this._renderCamPos();
    const segIdx = ((Math.floor(camPos / SEG_LENGTH)) % segs.length + segs.length) % segs.length;
    const inTunnel = !!segs[segIdx]?.tunnel;
    const firstTunnelN = this.road?._firstTunnelN ?? -1;
    // Full-screen mask cases — interior walls should render unrestricted:
    //   • Inside the tunnel (walls fill the view)
    //   • Very close to the mouth (firstTunnelN < EMB_MIN_DIST = 30):
    //     Road.js skips the facade entirely at that distance to avoid
    //     painting over the road in front of the player, which leaves
    //     the mouth rect null.  Without a fallback, the mask would be
    //     empty and the per-segment tunnel shell (walls/ceiling)
    //     wouldn't render at all — you'd see the road projecting past
    //     the tunnel position with nothing covering it.  Going
    //     full-screen here lets the per-segment walls draw normally
    //     and overlay the road as intended.
    const closeApproach = firstTunnelN >= 0 && firstTunnelN < 30;
    if (inTunnel || closeApproach) {
      mg.fillStyle(0xffffff, 1);
      mg.fillRect(-200, -200, SCREEN_W + 400, SCREEN_H + 400);
      return;
    }
    // Wildlife twin-arch: stencil the interior to the TWO arch openings
    // only, so the solid center pier between them stays opaque (the interior
    // can't paint over it).
    const shapes = this.road?._tunnelMouthShapes;
    if (shapes && shapes.length) {
      mg.fillStyle(0xffffff, 1);
      for (const poly of shapes) mg.fillPoints(poly, true);
      return;
    }
    const r = this.road?._tunnelMouthRect;
    if (!r) return;  // no tunnel in view → empty mask → no interior render
    // Approaching tunnel from a distance — clip interior to mouth only.
    mg.fillStyle(0xffffff, 1);
    mg.fillRect(r.x, r.y, r.w, r.h);
  }

  // ─── Render ───────────────────────────────────────────────────────────
  _renderFrame() {
    const progress = this.player.position / (ROUTE_SEGS * SEG_LENGTH);
    const palette  = getPaletteAtProgress(Math.min(progress, 0.999));

    // Cockpit forward-bias: in cockpit mode the rendered camera sits
    // PLAYER_VIRTUAL_Z (3000) units AHEAD of the player's physics
    // position, putting the viewpoint at the driver seat where the
    // rear-view sprite used to be.  Cached so every per-frame render
    // path uses the same value.  Read via `this._renderPos()` below.
    this._renderEyeOffset = CAM.eyeForwardZ ?? 0;
    const _renderPos = this.player.position + this._renderEyeOffset;

    // Debug mode suppresses drunk double-vision and shroom melt so the
    // overlay shows the world's TRUE state (positions, hitboxes, depth)
    // without alcohol/shroom visual filters layered on top.  The
    // underlying effect values are untouched — only the rendering pass
    // sees zeros.
    const _dbgClean = !!this._debugOn;
    this.road.render(
      this.roadGfx, this.ghostGfx,
      _renderPos, this.player.x,
      palette, {
        doubleVision: _dbgClean ? 0 : this.effects.doubleVision,
        currentStars: this.cops.starDisplay,
        shroomsBar:   this.drugs?.get?.(DRUGS.SHROOMS) ?? 0,
        shroomMelt:   _dbgClean ? 0 : (this.effects.shroomMelt ?? 0),
        shroomPhase:  this.effects.time ?? 0,
      },
      this.propsGfx,
      this.bridgeFrontGfx,
    );

    this._renderHorizonStrips();    // opaque Bellevue approach strip
    this._renderRuralFences();      // low-cost roadside pasture boundaries
    this._renderUtilityLines();     // sparse dry-side poles + projected wires
    if (!this._perf?.noSprites) {
      this._renderSceneSprites();   // buildings + trees from images
    }
    this._renderTumbleweeds();      // Vantage crosswind props (wind zone only)
    this._renderVehicles();
    this._renderDrugSprites();
    this.road.renderTunnelFacade(this.tunnelFacadeGfx);
    // Update the tunnel interior mask BEFORE rendering the interior.
    // The facade pass (above) publishes road._tunnelMouthRect.
    this._updateTunnelMask();
    this.road.renderTunnelOverlay(this.tunnelGfx);
    // Tunnel ambient dim — ease the layer's alpha toward its target so
    // entering / exiting a tunnel is a quick fade (~0.3 s) instead of an
    // instant lighting flip.  road._cameraInTunnel was set in road.render().
    {
      const TUNNEL_DIM_MAX = 0.40;     // 40% darker at full dim
      const FADE_SEC       = 0.30;     // time to fade fully in / out
      const target = this.road?._cameraInTunnel ? TUNNEL_DIM_MAX : 0;
      const dt   = Math.min(0.05, (this.game?.loop?.delta ?? 16.7) / 1000);
      const step = (TUNNEL_DIM_MAX / FADE_SEC) * dt;
      if (this._tunnelDim < target)      this._tunnelDim = Math.min(target, this._tunnelDim + step);
      else if (this._tunnelDim > target) this._tunnelDim = Math.max(target, this._tunnelDim - step);
      this.tunnelDimGfx?.setAlpha(this._tunnelDim).setVisible(this._tunnelDim > 0.002);
    }
    this.road.renderSignOverlay(this._signGfxPool);
    this._renderSignText();       // text labels on top of green/brown signs
    this._renderSignDecals();     // hwy-shield + brand-logo images on signs
    this._renderExplosions();
    this._renderHeadlights();
    this._renderWeatherFx();
    if (this._cockpitActive) {
      // Image-based wipers + dashboard cover the procedural wipers, so
      // skip the line-drawn ones to avoid double-rendering.
      this._renderCockpit();
    } else {
      this._renderWipers();
    }
    this._renderDamageGlass();
    this._renderDebugOverlay();

  }

  // ── First-person cockpit (BEATER ONLY) ────────────────────────────
  //
  // Layering: world → weather → pivoted wiper arms → cockpit_base → needles
  //           → low-fuel light → steering wheel → HUD/vignette.
  //
  // Needle / light positions calibrated against the dashboard art at
  // 800×450 viewport scale.  Constants live below — adjust if the art
  // changes (or to fine-tune dial alignment).  Angle math uses Phaser
  // image rotation (radians, 0 = pointing right, positive = clockwise
  // when y-axis points down).
  //
  // Speedometer dial sweep: needle rotates from MIN angle at 0 mph
  // through MAX angle at the dial's printed top (≈ 180 mph here).
  // Fuel gauge: needle rotates from MIN angle at empty through MAX
  // angle at full tank.
  static _BEATER_COCKPIT = {
    // Vertical SHIFT of the dashboard overlay (positive = down).
    // Bumped from 0 → 65 per user spec: lower the dashboard so the
    // lower tape player crops off the bottom of the viewport and a
    // larger windshield band opens up at the top.  Every gauge / wheel
    // / lamp Y below is already in its POST-shift screen position.
    shiftY:  65,
    // Speedometer needle.  Source PNG is 882×1783 (vertical needle
    // pointing UP).  Display at small absolute pixel size — NEVER use
    // a `scale` fraction; the source is huge and 0.30× still produces
    // a 265×535 bar across the windshield.  Pivot at origin (0.5, 1)
    // = bottom-center, so rotation pivots at the needle's base.
    // X/Y tuned via K-key calibration mode (press K in cockpit).
    speedo: {
      x:        146,                // centre of painted speedo dial
      y:        367 + 65,           // tracks dashboard shift
      displayW: 8,
      displayH: 32,
      originX:  0.50,
      originY:  1.00,
      minAng:   -2.36,
      maxAng:    2.36,
      mphAtMax: 160,
    },
    // Fuel needle.  Source PNG 1028×1530 (vertical needle, pointing UP).
    // E sits to the LEFT of UP, F to the RIGHT.  Needle pivots from
    // bottom-center and sweeps a ~90° arc across the top of the dial:
    //   minAng -0.78 (≈ -45°)  → needle points UP-LEFT  (E)
    //   maxAng +0.78 (≈ +45°)  → needle points UP-RIGHT (F)
    fuel: {
      x:        254,
      y:        367 + 65,
      displayW: 6,
      displayH: 22,
      originX:  0.50,
      originY:  1.00,
      minAng:   -0.78,
      maxAng:    0.78,
    },
    // Low-fuel warning lamp.  Square PNG 1254×1254.
    lowFuel: {
      x:               89,
      y:               386 + 65,
      displayW:        18,
      displayH:        18,
      thresholdFrac:   0.15,
    },
    // Separate foreground wheel — rotates with the player's actual
    // steering input.  Bumped maxTurnRad 35°→60° for visible feedback
    // when the player presses arrows / taps / tilts; smoothing 0.18→0.28
    // so the wheel snaps with input rather than lagging behind.
    wheel: {
      x:              146,
      y:              437 + 65,
      displayW:       275,
      displayH:       275,
      maxTurnRad:     Phaser.Math.DegToRad(60),
      smoothing:      0.28,
    },
    // Wiper arms — two copies of the single blade asset anchored at the
    // cowl line.  The source sprite points up, so a +90-degree Phaser
    // rotation is its user-facing 0-degree parked pose: flat and pointed
    // right. Both blades then sweep counter-clockwise through 100 degrees
    // together, like a tandem wiper assembly. `displayH * armAspect`
    // preserves the source PNG proportions.
    wipers: {
      armAspect: 384 / 768,
      left: {
        x: 125, y: 392, displayH: 340,
        parkAng:  Phaser.Math.DegToRad(90),
        sweepAng: Phaser.Math.DegToRad(-10),
      },
      center: {
        x: 410, y: 392, displayH: 340,
        parkAng:  Phaser.Math.DegToRad(90),
        sweepAng: Phaser.Math.DegToRad(-10),
      },
      cycleSec: { slow: 1.5, fast: 0.5 },
    },
  };

  /** Build the beater cockpit overlay objects.  Skipped for any other
   *  vehicle (those continue to use the third-person playerSprite).
   *  Image positions are tuned to fill the 800×450 viewport; native
   *  PNG dimensions are 1672×941. */
  _buildCockpit() {
    this._cockpitActive = this.player.vehicleId === 'beater';
    if (!this._cockpitActive) {
      setCameraMode('chase');
      return;
    }
    // First-person view → swap to the cockpit camera profile (lower
    // height + tighter FOV — see constants.js setCameraMode) and hide
    // the rear-view player car sprite.
    setCameraMode('cockpit');
    if (this.playerSprite) this.playerSprite.setVisible(false);
    // Always start with calibration OFF — prevents needles from
    // bouncing through their full sweep if the K-key handler picked
    // up a stray keystroke during a previous session.
    this._cockpitCalibrate = false;

    const C = GameScene._BEATER_COCKPIT;
    // Dashboard base — full-frame transparent overlay.  Sits above
    // weather (depth 9.7) and the procedural wipers (9.8), below the
    // HUD overlays (10+).  9.85 / 9.86 / 9.87 leaves headroom.
    this.cockpitBase = this.add.image(SCREEN_W / 2, SCREEN_H / 2 + C.shiftY, 'beater_cockpit_base')
      .setOrigin(0.5)
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setDepth(9.85);
    // Wipers live on the glass behind the dashboard and instruments.
    // Both rotate from a hidden cowl pivot using the same single asset.
    this.cockpitWipers = [C.wipers.left, C.wipers.center].map(w =>
      this.add.image(w.x, w.y, 'beater_wiper_arm')
        .setOrigin(0.5, 1)
        .setDisplaySize(w.displayH * C.wipers.armAspect, w.displayH)
        .setRotation(w.parkAng)
        .setDepth(9.84),
    );
    // Needles: setDisplaySize with EXPLICIT pixel sizes.  The source
    // PNGs are 882×1783 / 1028×1530 — setScale fractions would still
    // render hundreds of pixels of bar.  Origin (0.5, 1.0) puts the
    // pivot at the bottom-center of the needle so rotation revolves
    // around the dial's pin.
    this.cockpitSpeedNeedle = this.add.image(C.speedo.x, C.speedo.y, 'beater_speedometer_needle')
      .setOrigin(C.speedo.originX, C.speedo.originY)
      .setDisplaySize(C.speedo.displayW, C.speedo.displayH)
      .setDepth(9.86)
      .setRotation(C.speedo.minAng);
    this.cockpitFuelNeedle = this.add.image(C.fuel.x, C.fuel.y, 'beater_fuel_needle')
      .setOrigin(C.fuel.originX, C.fuel.originY)
      .setDisplaySize(C.fuel.displayW, C.fuel.displayH)
      .setDepth(9.86)
      .setRotation(C.fuel.minAng);
    this.cockpitLowFuel = this.add.image(C.lowFuel.x, C.lowFuel.y, 'beater_low_fuel_light')
      .setOrigin(0.5)
      .setDisplaySize(C.lowFuel.displayW, C.lowFuel.displayH)
      .setDepth(9.86)
      .setVisible(false);
    // Foreground wheel is separate so steering animation also occludes
    // portions of the gauge needles like a real driver-seat view.
    this.cockpitWheel = this.add.image(C.wheel.x, C.wheel.y, 'beater_steering_wheel')
      .setOrigin(0.5)
      .setDisplaySize(C.wheel.displayW, C.wheel.displayH)
      .setDepth(9.87);
    // Calibration markers — visible ONLY in K-mode.  Small filled
    // circles + text labels at each needle pivot so the painter can
    // see exactly where the anchors sit vs the painted dials.
    this.cockpitCalibGfx  = this.add.graphics().setDepth(9.88).setVisible(false);
    this.cockpitCalibText = [
      this.add.text(C.speedo.x  + 12, C.speedo.y  - 6, 'speedo', { fontSize: '10px', color: '#FF66FF', stroke: '#000', strokeThickness: 2 }).setDepth(9.88).setVisible(false),
      this.add.text(C.fuel.x    + 12, C.fuel.y    - 6, 'fuel',   { fontSize: '10px', color: '#66FFFF', stroke: '#000', strokeThickness: 2 }).setDepth(9.88).setVisible(false),
      this.add.text(C.lowFuel.x + 12, C.lowFuel.y - 6, 'lamp',   { fontSize: '10px', color: '#FFFF66', stroke: '#000', strokeThickness: 2 }).setDepth(9.88).setVisible(false),
    ];
    // Register all with _worldObjects so the UI camera ignores them
    // (otherwise they double-render on UI cam pass).
    const _wo = this._worldObjects;
    const _allCockpit = [...this.cockpitWipers, this.cockpitBase, this.cockpitSpeedNeedle,
      this.cockpitFuelNeedle, this.cockpitLowFuel, this.cockpitWheel,
      this.cockpitCalibGfx, ...this.cockpitCalibText];
    if (_wo) _wo.push(..._allCockpit);
    this._uiCam?.ignore?.(_allCockpit);
    this._cockpitWiperPhase = 0;
  }

  _leaveCockpitView() {
    if (!this._cockpitActive) return;
    setCameraMode('chase');
    this._cockpitActive = false;
    if (this.cockpitBase)        this.cockpitBase.setVisible(false);
    if (this.cockpitSpeedNeedle) this.cockpitSpeedNeedle.setVisible(false);
    if (this.cockpitFuelNeedle)  this.cockpitFuelNeedle.setVisible(false);
    if (this.cockpitLowFuel)     this.cockpitLowFuel.setVisible(false);
    this.cockpitWipers?.forEach(w => w.setVisible(false));
    if (this.cockpitWheel)       this.cockpitWheel.setVisible(false);
    if (this.playerSprite)       this.playerSprite.setVisible(true);
  }

  /** Flip between cockpit (first-person) and third-person rear-view.
   *  Only the beater currently has cockpit art — pressing V on any
   *  other vehicle shows a hint instead of silently doing nothing. */
  _toggleCockpit() {
    if (this.player?.vehicleId !== 'beater') {
      this._showPopup?.('Cockpit art only ships for the Used Sedan.', '#FFCC00');
      return;
    }
    if (this._cockpitActive) {
      this._leaveCockpitView();
      this._showPopup?.('View: 3RD-PERSON', '#FFCC00');
      return;
    }
    // Switch to first-person — apply cockpit camera profile.
    setCameraMode('cockpit');
    // Build the images lazily if this is the first toggle after a
    // session that started in third-person.
    if (!this.cockpitBase) {
      this._buildCockpit();
      if (!this.cockpitBase) return;          // build failed (missing tex)
    }
    this._cockpitActive = true;
    if (this.cockpitBase)        this.cockpitBase.setVisible(true);
    if (this.cockpitSpeedNeedle) this.cockpitSpeedNeedle.setVisible(true);
    if (this.cockpitFuelNeedle)  this.cockpitFuelNeedle.setVisible(true);
    if (this.cockpitLowFuel)     this.cockpitLowFuel.setVisible(false); // _renderCockpit re-decides
    this.cockpitWipers?.forEach(w => w.setVisible(true));
    if (this.cockpitWheel)       this.cockpitWheel.setVisible(true);
    if (this.playerSprite)       this.playerSprite.setVisible(false);
    this._showPopup?.('View: COCKPIT (1ST-PERSON)', '#FFCC00');
  }

  /** Per-frame update for the beater cockpit: rotate needles, toggle
   *  low-fuel lamp, step wiper-frame animation. */
  _renderCockpit() {
    if (!this._cockpitActive || !this.cockpitBase) return;
    const C = GameScene._BEATER_COCKPIT;

    // Calibration mode: sweep needles 0→1→0 on a 3-sec cycle so gauge
    // positioning can be eyeballed without driving / pause.
    let speedT, tankFrac;
    if (this._cockpitCalibrate) {
      const phase = ((this.time?.now ?? 0) % 3000) / 3000;   // 0..1
      const tri   = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      speedT   = tri;
      tankFrac = tri;
    } else {
      // Speedometer — use existing display-MPH so the dial matches
      // the HUD speedo (cocaine / meth boosts included).
      const mph = Math.max(0, Math.min(C.speedo.mphAtMax, this._displayMPH?.() ?? 0));
      speedT = mph / C.speedo.mphAtMax;
      tankFrac = Math.max(0, Math.min(1,
        (this.player.gasMi ?? 0) / Math.max(1, this.player.gasMaxMi ?? 1)));
    }
    this.cockpitSpeedNeedle.setRotation(
      C.speedo.minAng + (C.speedo.maxAng - C.speedo.minAng) * speedT,
    );
    this.cockpitFuelNeedle.setRotation(
      C.fuel.minAng + (C.fuel.maxAng - C.fuel.minAng) * tankFrac,
    );
    // Rotate the foreground wheel from the car's lateral steering motion
    // so keyboard, touch, tilt, drift and slippery-road settling all read
    // consistently in cockpit view.
    if (this.cockpitWheel) {
      const steerVisual = Phaser.Math.Clamp(
        (this.player.steerVelocity ?? 0) / (TURN_SPEED || 1), -1, 1,
      );
      const targetWheelRot = steerVisual * C.wheel.maxTurnRad;
      this.cockpitWheel.rotation = Phaser.Math.Linear(
        this.cockpitWheel.rotation ?? 0, targetWheelRot, C.wheel.smoothing,
      );
    }
    // Low-fuel warning — under threshold OR (in calibration) flashing
    // at low end of sweep so we can confirm placement.
    const showLowFuel = this._cockpitCalibrate
      ? tankFrac <= C.lowFuel.thresholdFrac
      : tankFrac <= C.lowFuel.thresholdFrac;
    this.cockpitLowFuel.setVisible(showLowFuel);
    // Calibration markers — visible only in K-mode.  Filled dots at
    // each pivot so we can SEE where the anchors land vs the painted
    // dials.  Labels are positioned just to the right.
    const calOn = !!this._cockpitCalibrate;
    if (this.cockpitCalibGfx) {
      this.cockpitCalibGfx.setVisible(calOn);
      this.cockpitCalibGfx.clear();
      if (calOn) {
        this.cockpitCalibGfx.fillStyle(0xFF66FF, 1);     // magenta — speedo
        this.cockpitCalibGfx.fillCircle(C.speedo.x,  C.speedo.y,  3);
        this.cockpitCalibGfx.fillStyle(0x66FFFF, 1);     // cyan    — fuel
        this.cockpitCalibGfx.fillCircle(C.fuel.x,    C.fuel.y,    3);
        this.cockpitCalibGfx.fillStyle(0xFFFF66, 1);     // yellow  — lamp
        this.cockpitCalibGfx.fillCircle(C.lowFuel.x, C.lowFuel.y, 3);
      }
    }
    if (this.cockpitCalibText) for (const t of this.cockpitCalibText) t.setVisible(calOn);

    // Wipers use one real arm sprite per side, rotating from hidden
    // cowl pivots.  Mode 0 parks the arms; active modes cycle smoothly.
    this.wipersGfx?.clear();
    this.chaseWipers?.forEach(w => w.setVisible(false));
    const mode = this._wiperMode ?? 0;
    let sweepT = 0;
    if (mode === 0) {
      this._cockpitWiperPhase = 0;
    } else {
      // Single-speed wiper (was OFF/SLOW/FAST → now OFF/ON).  Always
      // use the fast cycle so the windshield clears effectively on
      // a single tap.
      const cycleSec = C.wipers.cycleSec.fast;
      const dt = (this.game?.loop?.delta ?? 16) / 1000;
      const prevPhase = this._cockpitWiperPhase ?? 0;
      this._cockpitWiperPhase = (prevPhase + dt / cycleSec) % 1;
      // Sweep-pulse signal — fires once per complete wiper cycle (when
      // the phase wraps around).  EffectsSystem reads this to apply
      // an incremental droplet-clear instead of an instant full wipe.
      if (this._cockpitWiperPhase < prevPhase) this._wiperSweepPulse = true;
      sweepT = this._cockpitWiperPhase < 0.5
        ? this._cockpitWiperPhase * 2
        : (1 - this._cockpitWiperPhase) * 2;
    }
    [C.wipers.left, C.wipers.center].forEach((w, i) => {
      this.cockpitWipers?.[i]?.setRotation(
        Phaser.Math.Linear(w.parkAng, w.sweepAng, sweepT),
      );
    });
  }

  /** Third-person windshield overlay: two real wiper-arm image sprites
   *  sweep together through the same 0-to-100-degree path as cockpit view. */
  _renderWipers() {
    const g = this.wipersGfx;
    if (!g) return;
    g.clear();
    const mode = this._wiperMode ?? 0;
    if (mode === 0) {
      this._wiperPhase = 0;     // park
      this.chaseWipers?.forEach(w => w.setVisible(false));
      return;
    }
    // Single-speed wiper — always use the fast cycle (was slow/fast).
    const cycleSec = 0.5;
    const dt = (this.game?.loop?.delta ?? 16) / 1000;
    const prevPhase = this._wiperPhase ?? 0;
    this._wiperPhase = (prevPhase + dt / cycleSec) % 1;
    // Sweep-pulse — fires once per complete cycle so EffectsSystem
    // can incrementally clear droplets (multi-sweep clean).
    if (this._wiperPhase < prevPhase) this._wiperSweepPulse = true;
    // Phase: 0→0.5 = sweep up, 0.5→1 = sweep back.  Triangle-wave t.
    const t = this._wiperPhase < 0.5
      ? this._wiperPhase * 2
      : (1 - this._wiperPhase) * 2;
    // Source blade points upward; +90 degrees visually parks it flat to
    // the right. Both arms rotate 100 degrees upward/left together.
    const restAng = Phaser.Math.DegToRad(90);
    const peakAng = Phaser.Math.DegToRad(-10);
    const ang = restAng + (peakAng - restAng) * t;
    this.chaseWipers?.forEach(w => w.setVisible(true).setRotation(ang));
  }

  /** Rain + snow particle overlay — scales count, size, and speed with
   *  Weather.intensity() × Weather.severity() so the storm builds toward
   *  a 2.4× peak at the end of each window.  Rain droplets streak at a
   *  wind-angle that gusts slightly mile-by-mile ("multiple directions"
   *  per user spec); snowflakes drift left/right gently and fall slower.
   *
   *  Both particle pools are screen-space — they spawn at the top, fall
   *  off the bottom, and recycle.  Cheap: ~120 fillRect / fillCircle
   *  draws max per frame at peak severity. */
  /** Multi-layer warm headlights per spec.
   *
   *  Per beam:
   *    1. Outer halo — wide, soft, translucent yellow quad
   *    2. Inner core — narrower, brighter, warm-white quad
   *  Plus one shared road-tip splash (illuminated patch where the
   *  beams converge on the pavement) and two small fixture glows on
   *  the car body at headlight position (~1/3 down from the hood).
   *
   *  Beam BASES sit just above the car's top edge so the quads never
   *  overlap the car silhouette (transparent windshield pixels
   *  wouldn't reveal additive light through the body).  Tips land
   *  well below the horizon — on the pavement, not floating in sky.
   *
   *  All alphas scale with TimeOfDay.darkness() so the system fades
   *  smoothly from daylight (invisible) through dusk to full night. */
  /** Per-vehicle headlight profile.  Each entry defines color, alpha,
   *  and reach so different cars read distinctly at night:
   *    bright    — alpha multiplier on inner + outer + patch
   *    width     — tip-half multiplier (wider = visible spread)
   *    patchBoost— multiplier on the road-tip illumination ellipse
   *                (EVs push this higher for the "wide central pool"
   *                the user asked for)
   *    inner/outer — color hex (warmer for EVs, neutral for ICE)
   *    asymInner   — optional alternate inner color used on the LEFT
   *                  side only; the beater uses this for a subtle
   *                  "mismatched bulb" look
   */
  _vehicleHeadlightProfile(vehicleId) {
    // Brightness rebalanced per user: beater 0.30, top-of-the-line
    // playdoutS3X 0.70.  Other vehicles fall in between, preserving
    // the relative ordering but compressing the range so nothing
    // blows out at night.  Width + patchBoost still vary so each
    // car keeps its identity (EVs get the wider warm pool).
    const PROFILES = {
      beater: {
        bright: 0.30, width: 0.92, patchBoost: 0.85,
        // asymInner: left-headlight color, shifted slightly more blue
        // than the right (pale cool tint) so the beater's mismatched
        // bulb reads at a glance — bad-cheap-replacement vibe.
        inner: 0xFFE090, outer: 0xFFCC70, asymInner: 0xB8D0E8,
      },
      suv4x4: {
        bright: 0.40, width: 1.00, patchBoost: 1.00,
        inner: 0xFFE8A0, outer: 0xFFD680,
      },
      usedTruck: {
        bright: 0.36, width: 1.05, patchBoost: 1.00,
        inner: 0xFFE095, outer: 0xFFCB70,
      },
      newTruck: {
        bright: 0.50, width: 1.10, patchBoost: 1.05,
        inner: 0xFFF0C0, outer: 0xFFE090,
      },
      evTruck: {
        bright: 0.55, width: 1.18, patchBoost: 1.35,
        inner: 0xFFEEB0, outer: 0xFFE090,
      },
      sportsCar: {
        bright: 0.55, width: 1.08, patchBoost: 1.05,
        inner: 0xFFF4D0, outer: 0xFFE5A0,
      },
      bestlaRoadster: {
        bright: 0.62, width: 1.22, patchBoost: 1.40,
        inner: 0xFFEEB8, outer: 0xFFDC9C,
      },
      playdoutS3X: {
        bright: 0.70, width: 1.25, patchBoost: 1.55,
        inner: 0xFFEEC0, outer: 0xFFDEA0,
      },
    };
    return PROFILES[vehicleId] ?? PROFILES.suv4x4;
  }

  /** Draw a same-direction NPC's two forward beams into its slot-
   *  specific masked Graphics.  The mask is the NPC sprite (inverted),
   *  set up once at boot — so the beam quads draw mid-sprite but the
   *  body silhouette occludes the overlapping portion.  Result: the
   *  visible beam appears to emerge from in front of the car, just
   *  like the player's. */
  _drawNpcForwardBeams(slotIdx, t) {
    const hg = this._npcHeadlightGfxPool?.[slotIdx];
    if (!hg) return;
    const camPos = this._renderCamPos();
    const relZ   = t.position - camPos;
    if (relZ < 200 || relZ > 26000) return;
    const proj   = this.road?.sampleSurface?.(relZ, t.laneOffset, { allowClipped: true });
    if (!proj || proj.sw < 8) return;
    // Match the sprite's actual on-screen size (same math as place()).
    const facing  = (t.speed ?? 0) < 0 ? 'front' : 'back';
    const texKey  = this._carTexKey?.(t.colorSet, facing) ?? 'npc_car_white';
    const tex     = this.textures.get(texKey)?.source?.[0];
    const baseW   = tex?.width  || 64;
    const baseH   = tex?.height || 40;
    const targetW = proj.sw;
    const targetH = targetW * (baseH / baseW);
    const mile    = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const darkness = TimeOfDay.darkness?.(mile) ?? 0;
    if (darkness <= 0.05) return;
    // Beam geometry — pure proportional scale to the NPC's projected
    // size.  Mask handles body occlusion.
    //
    // Dynamic length: when the NPC is FAR (relZ > FAR_START), the
    // beam projects a long way up the road like a high-aimed
    // headlight.  As the player closes in (relZ < NEAR_END), the
    // beam SHORTENS — same direction, less reach — so visually it
    // reads as the beams shining at the pavement just ahead of the
    // NPC.  Tip never goes BELOW the base; the beam always points
    // forward, never backward toward the camera.
    const NEAR_END   = 1500;     // closer than this → minimum length
    const FAR_START  = 10500;    // farther than this → maximum length
    const tiltUpAmt  = Math.max(0, Math.min(1, (relZ - NEAR_END) / (FAR_START - NEAR_END)));
    const beamBaseY  = proj.sy - targetH * 0.50;
    // Back to closer-to-original lengths so beams stay readable at
    // any distance.  Far end matches the original baseLen (0.65);
    // near end is held at 0.35 so beams never shrink to a stub
    // when the player gets right up to an NPC.
    const farLen     = targetH * 0.65;
    const nearLen    = targetH * 0.35;
    const beamLen    = nearLen + (farLen - nearLen) * tiltUpAmt;
    const beamTipY   = beamBaseY - beamLen;
    const npcHub    = targetW * 0.22;
    const lHX       = proj.sx - npcHub;
    const rHX       = proj.sx + npcHub;
    const innerBH   = targetW * 0.025;
    const innerTH   = targetW * 0.26;
    const outerBH   = targetW * 0.050;
    const outerTH   = targetW * 0.50;
    const drawQuad = (hubX, side, baseHalf, tipHalf, color, alpha) => {
      hg.fillStyle(color, alpha);
      const innerEdge = side > 0 ? -tipHalf * 0.45 :  tipHalf * 0.45;
      const outerEdge = side > 0 ?  tipHalf        : -tipHalf;
      hg.beginPath();
      hg.moveTo(hubX - baseHalf, beamBaseY);
      hg.lineTo(hubX + baseHalf, beamBaseY);
      hg.lineTo(hubX + outerEdge, beamTipY);
      hg.lineTo(hubX + innerEdge, beamTipY);
      hg.closePath();
      hg.fillPath();
    };
    hg.blendMode = Phaser.BlendModes.ADD;
    // Peak NPC light alpha capped at 0.10 — has to stay below even
    // the dimmest player car (beater core ≈ 0.145) so the player's
    // own beams always read as the brightest light on the road.
    const NPC_PEAK = 0.10;
    const haloA = darkness * NPC_PEAK * 0.6;
    drawQuad(lHX, -1, outerBH, outerTH, 0xFFE8A0, haloA);
    drawQuad(rHX, +1, outerBH, outerTH, 0xFFE8A0, haloA);
    const coreA = darkness * NPC_PEAK;
    drawQuad(lHX, -1, innerBH, innerTH, 0xFFF4D0, coreA);
    drawQuad(rHX, +1, innerBH, innerTH, 0xFFF4D0, coreA);
    hg.blendMode = Phaser.BlendModes.NORMAL;
  }

  _renderHeadlights() {
    const g  = this.headlightGfx;
    const gf = this.headlightFixtureGfx;
    if (!g || !gf) return;
    // Bitmap mask from the player sprite, inverted — every pixel of
    // the player PNG that has ANY alpha occludes the beam graphics.
    // This fixes the "beam visible through opaque body" problem that
    // depth ordering couldn't solve on its own (the PNG has subtle
    // semi-transparency throughout the body for paint highlights,
    // not just on the windshield).  Set lazily once the player
    // sprite exists, and re-applied whenever the sprite reference
    // changes (vehicle swap, scene restart, etc).
    if (this.playerSprite && this._headlightMaskOwner !== this.playerSprite) {
      try {
        const mask = this.playerSprite.createBitmapMask();
        mask.invertAlpha = true;       // hide beam WHERE car is, show OUTSIDE
        g.setMask(mask);
        this._headlightMaskOwner = this.playerSprite;
      } catch (_) {}
    }
    g.clear();
    gf.clear();
    const mile     = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const darkness = TimeOfDay.darkness?.(mile) ?? 0;
    if (darkness <= 0.05) return;       // no headlights in daytime
    const carX = this.playerSprite?.x ?? SCREEN_W / 2;
    const carY = this.playerSprite?.y ?? SCREEN_H - 130;
    const carW = this.playerSprite?.displayWidth  ?? 78;
    const carH = this.playerSprite?.displayHeight ?? 49;
    const carTopY = carY - carH;
    // Beams aim at a FIXED angle (~15° below horizontal) relative to
    // the car's forward direction — they do NOT track the actual road
    // surface.  As the road tilts up or down with grade, it moves in
    // and out of the beam path naturally; the beams themselves stay
    // pointed slightly down ahead of the car the way real headlights
    // do.  Use the live camera horizon (chase vs cockpit) so the
    // anchor adapts to view mode, but never to the per-frame slope.
    const HORIZON_Y = CAM.horizonY ?? 210;

    // Per-vehicle profile.
    const profile = this._vehicleHeadlightProfile(this.player?.vehicleId ?? 'beater');

    // Hub positions — spaced like real headlight housings.
    const hubOffset = carW * 0.22;
    const lHubX     = carX - hubOffset;
    const rHubX     = carX + hubOffset;
    // Beam origin sits at the vertical MIDDLE of the car sprite —
    // exactly between the "above the top edge" (carTopY - 2) and
    // "bumper line" (carY - carH * 0.18) positions tried earlier.
    // The player car renders on a layer ABOVE the headlights
    // (depth 9.95 vs 5), so opaque body pixels of the PNG occlude
    // the portion of the beam quad inside the silhouette; only
    // transparent areas of the PNG (windshield glass etc.) reveal
    // the beam through the car.
    const beamBaseY = carY - carH * 0.50;

    // HARD-CAPPED cone height.  The previous formula started from the
    // horizon line and worked DOWN, which produced a cone that always
    // reached up near the horizon (a ~265-pixel-tall column on a
    // 450-px screen).  Real headlights don't shoot at the horizon —
    // they paint a pool on the pavement just ahead of the car.
    // Anchor the tip to a fixed pixel distance ABOVE the beam base
    // and ignore the horizon entirely.  Tunable — bump up for a
    // longer reach, down for a stubbier pool.
    const BEAM_HEIGHT_PX = 55;
    let roadTipY = beamBaseY - BEAM_HEIGHT_PX;

    // Two-layer beam profile, scaled by vehicle width factor.
    const innerBaseHalf = 2.0;
    const innerTipHalf  = 24 * profile.width;   // was 30 — thinner inner cores
    const outerBaseHalf = 5.5;
    const outerTipHalf  = 64 * profile.width;

    // Quad helper.  side = -1 → left-of-car hub, +1 → right.  Inner
    // edge toes IN toward road center so beams converge on a single
    // pavement patch; outer edge fans OUT for the visible spread.
    // Inner-edge offset is CLAMPED to hubOffset so left/right halos
    // can't cross the car centerline and ADD-blend into a brighter
    // triangular band at the tip.  tipYOverride lets a caller stop
    // the quad short of roadTipY (used to land inner cores on the
    // bottom edge of the road-patch oval).
    const drawBeamQuad = (hubX, side, baseHalf, tipHalf, color, alpha, tipYOverride) => {
      g.fillStyle(color, alpha);
      const tipY      = (typeof tipYOverride === 'number') ? tipYOverride : roadTipY;
      const innerOff  = Math.min(tipHalf * 0.45, hubOffset);
      const innerEdge = side > 0 ? -innerOff : innerOff;
      const outerEdge = side > 0 ?  tipHalf  : -tipHalf;
      g.beginPath();
      g.moveTo(hubX - baseHalf, beamBaseY);
      g.lineTo(hubX + baseHalf, beamBaseY);
      g.lineTo(hubX + outerEdge, tipY);
      g.lineTo(hubX + innerEdge, tipY);
      g.closePath();
      g.fillPath();
    };

    const dScale = Math.min(1, darkness * 1.15);

    g.blendMode = Phaser.BlendModes.ADD;
    // 1) Outer halo — soft, wide.  Outer-tip half is sized so each
    //    beam's outer tip edge lands EXACTLY on the road-patch oval's
    //    outer edge: hubX ± (patchW/2 - hubOffset) = carX ± patchW/2.
    const haloAlpha     = 0.18 * dScale * profile.bright;
    const outerOvalHalf = Math.max(outerTipHalf * 0.5,
                                   outerTipHalf * 1.2 * profile.patchBoost - hubOffset);
    drawBeamQuad(lHubX, -1, outerBaseHalf, outerOvalHalf, profile.outer, haloAlpha);
    drawBeamQuad(rHubX, +1, outerBaseHalf, outerOvalHalf, profile.outer, haloAlpha);
    // 2) Inner core — brighter, warmer, narrower.  Cut short of the
    //    full beam length so the core tip lands on the BOTTOM edge of
    //    the road-patch oval (roadTipY + 4 + 11·patchBoost) instead
    //    of passing through it.  Beater uses a slightly different
    //    left-side inner color (asymInner) so its mismatched bulb is
    //    barely-but-visibly readable.
    const coreAlpha    = 0.42 * dScale * profile.bright;
    const leftInner    = profile.asymInner ?? profile.inner;
    const coreTipY     = roadTipY + 4 + 11 * profile.patchBoost;
    drawBeamQuad(lHubX, -1, innerBaseHalf, innerTipHalf, leftInner,     coreAlpha, coreTipY);
    drawBeamQuad(rHubX, +1, innerBaseHalf, innerTipHalf, profile.inner, coreAlpha, coreTipY);
    // 3) Road patch — bright oval where beams converge on the
    //    pavement.  patchBoost makes the EVs' pool noticeably wider
    //    and brighter in the middle.
    const patchAlpha = 0.32 * dScale * profile.bright;
    const patchW     = outerTipHalf * 2.4 * profile.patchBoost;
    g.fillStyle(profile.inner, patchAlpha);
    g.fillEllipse(carX, roadTipY + 4, patchW, 22 * profile.patchBoost);
    g.blendMode = Phaser.BlendModes.NORMAL;

    // (Fixture glow dots removed per user request — the masked beam
    // alone reads as "headlights on," and the dots on the bumper
    // were just visual noise.)
    // NPC traffic lights — warm-white headlights on oncoming cars
    // (player sees the grille) AND red tail lights on same-direction
    // cars (player sees the rear).  Sizing reads the ACTUAL projected
    // sprite for each car (matching what _renderVehicles draws on
    // screen) instead of guessing a fixed aspect ratio — trucks were
    // landing in the wrong screen position because their PNG aspect
    // is taller than a sedan.
    if (TimeOfDay.headlightsOn?.(mile) && this.traffic?.length) {
      const camPosHl = this._renderCamPos();
      // NPC lights peak at 0.10 — kept below even the dimmest player
      // car (beater core ≈ 0.145) so the player's own beams stay the
      // brightest light on the road no matter what they're driving.
      const NPC_PEAK = 0.10;
      const lightA   = darkness * NPC_PEAK;            // peaks 0.25
      const haloA    = darkness * NPC_PEAK * 0.6;      // peaks 0.15
      for (const t of this.traffic) {
        if (!t.alive || t.crashed) continue;
        const relZ = t.position - camPosHl;
        // Match the car-sprite culls used by _renderVehicles so lights
        // ONLY appear when the actual car would render: same near-cull
        // (300 in chase view; 100 in cockpit), and far-cull on both
        // distance and projected width.  Without this lights survived
        // past the car silhouette, producing orphan glows on the road.
        const nearCullHl = this._cockpitActive ? 100 : 300;
        if (relZ < nearCullHl || relZ > 26000) continue;
        const proj = this.road?.sampleSurface?.(relZ, t.laneOffset, { allowClipped: true });
        if (!proj || proj.sw < 8) continue;
        // Resolve the actual projected sprite size for this NPC.
        // _renderVehicles uses targetW = proj.sw and targetH from
        // texture aspect ratio.  Read the same texture metadata so
        // lights land on the real silhouette regardless of car type.
        const oncoming = (t.speed ?? 0) < 0;
        const facing   = oncoming ? 'front' : 'back';
        const texKey   = this._carTexKey?.(t.colorSet, facing) ?? 'npc_car_white';
        const tex      = this.textures.get(texKey)?.source?.[0];
        const baseW    = tex?.width  || 64;
        const baseH    = tex?.height || 40;
        const targetW  = proj.sw;
        const targetH  = targetW * (baseH / baseW);
        // Dot radius scales with the projected car (no minimum floor),
        // so distant tiny cars get correspondingly tiny lights instead
        // of "lights bigger than the car."
        const dotR     = targetW * 0.045;
        if (oncoming) {
          // Oncoming-car headlights, from the user's reference diagram:
          //   1+2) Yellow lamp halos at the headlight housings on the
          //        front face (cars 0.50, trucks/SUVs 0.65 of sprite
          //        height from the bottom).
          //     4) TWO cones, one per lamp.  Each cone's OUTER edge
          //        runs from the outer side of its lamp down to the
          //        outer edge of the splash ellipse.
          //     3) ONE full yellow ellipse splash on the road below.
          //        Its outer edges align with the outer edges of the
          //        two cones.
          const isTallNpc     = t.colorSet && /truck|suv/i.test(t.colorSet);
          const headlightFrac = isTallNpc ? 0.65 : 0.50;
          const lampY         = proj.sy - targetH * headlightFrac;
          const haloR         = Math.max(1.6, dotR * 3.0);
          const coreR         = Math.max(0.55, dotR * 1.2);
          const grilleDx      = Math.max(0, targetW * 0.42 - haloR);
          // ── 1 & 2: yellow lamp halos at the headlight housings ──
          gf.blendMode = Phaser.BlendModes.ADD;
          gf.fillStyle(0xFFD850, lightA);
          gf.fillCircle(proj.sx - grilleDx, lampY, haloR);
          gf.fillCircle(proj.sx + grilleDx, lampY, haloR);
          gf.fillStyle(0xFFE680, Math.min(1, lightA * 1.4));
          gf.fillCircle(proj.sx - grilleDx, lampY, coreR);
          gf.fillCircle(proj.sx + grilleDx, lampY, coreR);
          gf.blendMode = Phaser.BlendModes.NORMAL;
          // ── Splash geometry — full yellow ellipse on the road ──
          const NEAR_END_G  = 1500;
          const FAR_START_G = 12000;
          const distFactor  = Math.max(0, Math.min(1,
                              (relZ - NEAR_END_G) / (FAR_START_G - NEAR_END_G)));
          // Cones END at coneEndY.  The splash equator (widest line of
          // the ellipse) is placed AT coneEndY — i.e. the splash has
          // been slid UP by groundH so its widest part touches the
          // bottom of the cones (per user request).
          const coneEndY    = proj.sy + targetH * (0.45 + 0.25 * distFactor);
          const groundW     = Math.max(6.0, targetW * 0.55);
          const groundH     = Math.max(2.0, targetW * 0.15);
          const splashCY    = coneEndY;     // widest part at cone bottom
          // ── 4: TWO yellow cones, inner edges meeting at center bottom,
          //      outer edges meeting the splash outer tips. ──
          g.blendMode = Phaser.BlendModes.ADD;
          g.fillStyle(0xFFD850, Math.min(1, darkness * 0.12));
          // LEFT cone
          g.beginPath();
          g.moveTo(proj.sx - grilleDx - haloR * 0.5, lampY);     // top-outer
          g.lineTo(proj.sx - grilleDx + haloR * 0.5, lampY);     // top-inner
          g.lineTo(proj.sx,                          coneEndY);  // bottom-inner — CENTER
          g.lineTo(proj.sx - groundW,                coneEndY);  // bottom-outer — splash outer tip
          g.closePath();
          g.fillPath();
          // RIGHT cone (mirror)
          g.beginPath();
          g.moveTo(proj.sx + grilleDx - haloR * 0.5, lampY);     // top-inner
          g.lineTo(proj.sx + grilleDx + haloR * 0.5, lampY);     // top-outer
          g.lineTo(proj.sx + groundW,                coneEndY);  // bottom-outer — splash outer tip
          g.lineTo(proj.sx,                          coneEndY);  // bottom-inner — CENTER
          g.closePath();
          g.fillPath();
          // ── 3: BOTTOM-HALF yellow splash, uniform shade.  Flat top
          //      sits at coneEndY (= the widest line of the would-be
          //      full ellipse) so it kisses the cone bottoms without
          //      the upper half overlapping the cones and adding extra
          //      brightness on ADD blend. ──
          g.fillStyle(0xFFD850, Math.min(1, lightA * 1.4));
          const ARC_STEPS = 24;
          g.beginPath();
          g.moveTo(proj.sx + groundW, splashCY);
          for (let _i = 1; _i <= ARC_STEPS; _i++) {
            const _a = Math.PI * (_i / ARC_STEPS);
            g.lineTo(proj.sx + groundW * Math.cos(_a),
                     splashCY + groundH * Math.sin(_a));
          }
          g.closePath();
          g.fillPath();
          g.blendMode = Phaser.BlendModes.NORMAL;
        } else {
          // Same direction — tail lights at mid-height (cars 0.50,
          // trucks/SUVs a little higher at 0.55).  Outer edge of the
          // halo touches the outer edge of the sprite.
          const isTallNpcT = t.colorSet && /truck|suv/i.test(t.colorSet);
          const tailFrac   = isTallNpcT ? 0.55 : 0.50;
          const tailY      = proj.sy - targetH * tailFrac;
          const haloRt     = dotR * 2.2;
          const tailDx     = Math.max(0, targetW * 0.50 - haloRt);
          g.fillStyle(0xFF2A1A, haloA);
          g.fillCircle(proj.sx - tailDx, tailY, haloRt);
          g.fillCircle(proj.sx + tailDx, tailY, haloRt);
          g.fillStyle(0xFF5544, lightA);
          g.fillCircle(proj.sx - tailDx, tailY, dotR);
          g.fillCircle(proj.sx + tailDx, tailY, dotR);
        }
      }
    }
    // Road shoulder reflectors — small white dots glinting back at
    // the camera every ~120 ft on both sides.  Active alongside
    // headlights so the row of points reads as "real reflectors
    // catching your beams."  spacing chosen relative to SEG_LENGTH
    // (200 virtual units / segment, ~5.5 ft / segment with the route
    // scaling).  Every ~22 segments ≈ 120 ft.
    if (darkness > 0.25 && this.road?.segments?.length) {
      const segs       = this.road.segments;
      const camPosRef  = this._renderCamPos();
      const startSegRf = Math.floor(camPosRef / SEG_LENGTH);
      const SPACING    = 22;
      const firstSeg   = Math.ceil((startSegRf + 1) / SPACING) * SPACING;
      const lastSeg    = Math.floor((startSegRf + 380) / SPACING) * SPACING;
      g.fillStyle(0xFFFFFF, Math.min(1, darkness * 0.95));
      for (let absSeg = lastSeg; absSeg >= firstSeg; absSeg -= SPACING) {
        const relZRef  = absSeg * SEG_LENGTH - camPosRef + SEG_LENGTH * 0.5;
        if (relZRef < 200 || relZRef > 60000) continue;
        // ±1.0 lane units sits the dot ON the white fog line itself
        // (the road's outer edge stripe) instead of outboard in the
        // shoulder, per user request.
        for (const side of [-1.0, 1.0]) {
          const p = this.road.sampleSurface?.(relZRef, side, { allowClipped: true });
          if (!p || p.sw < 0.6) continue;
          const r = Math.max(0.6, p.sw * 0.018);
          g.fillCircle(p.sx, p.sy - r * 0.4, r);
        }
      }
    }
    // Restore default blend so subsequent graphics writes aren't
    // affected (we share this Graphics object across frames).
    g.blendMode = Phaser.BlendModes.NORMAL;
  }

  _renderWeatherFx() {
    const g = this.weatherFxGfx;
    if (!g) return;
    g.clear();
    if (!this._renderHUDWasReady) {
      // Render even on title screen (frozen world drift) so the visual
      // matches grip math which is also Weather-dependent.
    }
    const mile  = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const state = Weather.state?.(mile);
    if (state !== 'rain' && state !== 'snow') {
      // No weather: kill any leftover particles so they don't keep
      // animating after the player drives out of a window.
      if (this._rainDrops) this._rainDrops.length = 0;
      if (this._snowFlakes) this._snowFlakes.length = 0;
      return;
    }
    const inten = Weather.intensity?.(mile) ?? 0;
    const sev   = Weather.severity?.(mile)  ?? 1;
    const eff   = Math.max(0, Math.min(2.4, inten * sev));
    // dt for particle update — use the same Phaser delta the scene runs at.
    const dt = (this.game?.loop?.delta ?? 16) / 1000;

    if (state === 'rain') {
      this._snowFlakes && (this._snowFlakes.length = 0);
      const MAX_DROPS = 220;
      const targetCount = Math.round(MAX_DROPS * (eff / 2.4));
      const pool = (this._rainDrops = this._rainDrops ?? []);
      // Wind angle gusts slowly mile-by-mile so the rain doesn't fall
      // perfectly vertical — gives the "multiple directions" feel.
      const windRad = Math.sin(mile * 0.7) * 0.35;   // ±20° tilt
      // Speed scales with severity — late-storm rain falls faster.
      const fallSpeed = 600 + 500 * (eff / 2.4);
      // Stream length scales with speed (motion-blur streak effect).
      const streakLen = 12 + 14 * (eff / 2.4);
      // Spawn new drops up to targetCount.  Initial Y is uniform across
      // the FULL screen height (plus a small bleed above so streaks
      // entering from above the top edge aren't all coming from the
      // same row) — without this every fresh drop starts ABOVE the
      // visible screen and the lower portion stays empty until the
      // initial wave falls through.
      while (pool.length < targetCount) {
        pool.push({
          x:  Math.random() * (SCREEN_W + 80) - 40,
          y:  Math.random() * (SCREEN_H + 80) - 40,
          v:  fallSpeed * (0.85 + Math.random() * 0.3),
        });
      }
      // Trim excess drops (severity dropped).
      if (pool.length > targetCount) pool.length = targetCount;
      const sinW = Math.sin(windRad);
      const cosW = Math.cos(windRad);
      // Bigger drops at peak severity.
      const dropW = 1 + 0.8 * (eff / 2.4);
      g.fillStyle(0xAACCDD, 0.55);
      for (const d of pool) {
        d.x += d.v * sinW * dt;
        d.y += d.v * cosW * dt;
        if (d.y > SCREEN_H + 4) {
          d.y = -streakLen;
          d.x = Math.random() * (SCREEN_W + 80) - 40;
        }
        if (d.x < -20) d.x = SCREEN_W + 10;
        else if (d.x > SCREEN_W + 20) d.x = -10;
        // Draw streak as a thin slanted rectangle.
        g.fillRect(d.x, d.y, dropW, streakLen);
      }
      // Subtle sky darkening at peak storm.
      g.fillStyle(0x101820, 0.10 * (eff / 2.4));
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    } else if (state === 'snow') {
      this._rainDrops && (this._rainDrops.length = 0);
      const MAX_FLAKES = 260;
      const targetCount = Math.round(MAX_FLAKES * (eff / 2.4));
      const pool = (this._snowFlakes = this._snowFlakes ?? []);
      // Snow drifts more than rain — wider wind range, slower fall.
      const windPhase = mile * 0.55;
      const fallSpeed = 140 + 180 * (eff / 2.4);
      while (pool.length < targetCount) {
        pool.push({
          x:    Math.random() * (SCREEN_W + 40) - 20,
          y:    Math.random() * SCREEN_H * -1,
          v:    fallSpeed * (0.6 + Math.random() * 0.7),
          r:    1.0 + Math.random() * 2.0 * (0.5 + 0.5 * (eff / 2.4)),
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (pool.length > targetCount) pool.length = targetCount;
      g.fillStyle(0xFFFFFF, 0.85);
      for (const f of pool) {
        // Sinusoidal lateral drift gives the "swirling" snow look.
        const drift = Math.sin((this.time?.now ?? 0) * 0.001 + f.phase + windPhase) * 30;
        f.y += f.v * dt;
        f.x += drift * dt;
        if (f.y > SCREEN_H + 4) {
          f.y = -4;
          f.x = Math.random() * (SCREEN_W + 40) - 20;
        }
        if (f.x < -10) f.x = SCREEN_W + 5;
        else if (f.x > SCREEN_W + 10) f.x = -5;
        g.fillCircle(f.x, f.y, f.r);
      }
      // Sky desaturation at peak snow.
      g.fillStyle(0xCEDADE, 0.08 * (eff / 2.4));
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  // ── DEBUG OVERLAY ───────────────────────────────────────────────────
  // Visualizes the four systems we keep getting confused between:
  //  1. PNG frame — blue stroke — may contain transparent padding
  //  2. COLLISION bbox — red stroke — what _updatePhysics tests
  //  3. Sprite anchor — cyan dot — proj.sx, proj.sy from sampleSurface
  //  4. Player AABB — lime stroke — the player rect collision uses
  //  + tunnel mouth rect (magenta), NPC AABBs (orange).
  // The render + collision rects use the SAME math as the live systems
  // (copied below), so any divergence between this overlay and the
  // actual on-screen sprite means the live systems disagree too.
  _renderDebugOverlay() {
    if (!this._debugOn || !this._debugGfx) return;
    const g = this._debugGfx;
    g.clear();
    // Recycle the tex-key labels pool — same trick as sign overlay.
    if (!this._debugTexLabels) this._debugTexLabels = [];
    for (const t of this._debugTexLabels) t.setVisible(false);
    let labelI = 0;
    const ensureLabel = () => {
      if (labelI < this._debugTexLabels.length) {
        return this._debugTexLabels[labelI++];
      }
      const t = this.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '9px',
        color: '#00FFFF', backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 2, y: 1 },
      }).setDepth(19).setOrigin(0, 0);
      this._debugTexLabels.push(t);
      labelI++;
      return t;
    };

    // ── Player TRAPEZOID hitbox (mirrors live NPC + scenery collision) ──
    // Same trapezoid classifyHit() tests (sprite chassis: 0.45 half-width at
    // the bumper, 0.30 at the hood) — when this green box crosses an orange
    // NPC box, a crash fires.
    const playerDisplayW = this.playerSprite?.displayWidth  ?? 78;
    const playerDisplayH = this.playerSprite?.displayHeight ?? 49;
    const pcx = this.playerSprite?.x ?? SCREEN_W / 2;
    const pSpriteY = this.playerSprite?.y ?? (SCREEN_H - 130);
    const pBotY = pSpriteY;
    const pTopY = pSpriteY - playerDisplayH * 0.5;
    const pBotHalfW = playerDisplayW * 0.45;
    const pTopHalfW = playerDisplayW * 0.30;
    g.lineStyle(2, 0x00FF66, 1);
    g.strokePoints([
      { x: pcx - pBotHalfW, y: pBotY },
      { x: pcx + pBotHalfW, y: pBotY },
      { x: pcx + pTopHalfW, y: pTopY },
      { x: pcx - pTopHalfW, y: pTopY },
    ], true);

    // ── Tunnel mouth rect ──
    const tm = this.road?._tunnelMouthRect;
    if (tm) {
      g.lineStyle(2, 0xFF00FF, 0.9);
      g.strokeRect(tm.x, tm.y, tm.w, tm.h);
    }

    // ── Scenery sprites: PNG frame (blue) + collision band (red) ──
    const segs = this.road?.segments;
    let sceneryCount = 0;
    let collidableCount = 0;
    let culledCount = 0;
    if (segs?.length) {
      const startSeg = Math.floor(this.player.position / SEG_LENGTH);
      const SCENERY_TYPES = new Set([
        'tree', 'building', 'house', 'shrub', 'landmark', 'cop_random_parked',
      ]);
      const firstTunnelN = this.road?._firstTunnelN ?? -1;
      const tunnelMouthRect = this.road?._tunnelMouthRect ?? null;
      // Walk same range _renderSceneSprites uses but cap at 200 segs to
      // keep overlay cost bounded.
      for (let n = 0; n <= 200; n++) {
        const seg = segs[(startSeg + n) % segs.length];
        if (!seg?.sprites) continue;
        const pastTunnel = firstTunnelN >= 0 && n > firstTunnelN;
        for (const sp of seg.sprites) {
          if (!sp.texKey && !sp.copEncounter) continue;
          if (sp.collected || sp.isCollectible) continue;
          const isStructure = sp.type === 'building' || sp.type === 'house';
          // Mirror the renderer's past-tunnel cull.
          const culledByTunnel = pastTunnel && isStructure;
          const profile = SCENERY_IMAGE_PROFILES[sp.texKey];

          // Mirror renderer minOffset logic (1.05 safety net, see renderer note)
          let visualOffset = sp.offset ?? 0;
          if (isStructure) {
            const profileMin = profile?.minOffset ?? 0;
            const spriteMin  = sp.visualMinOffset ?? 1.05;
            const minOffset  = Math.max(profileMin, spriteMin);
            const sign = visualOffset >= 0 ? 1 : -1;
            visualOffset = sign * Math.max(Math.abs(visualOffset), minOffset);
          }
          const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
          let proj = this.road.sampleSurface?.(
            relZ, visualOffset,
            isStructure ? { allowClipped: true } : undefined,
          );
          if (!proj || proj.sw < 0.5) continue;

          // Mirror renderer sizing
          const tex = sp.texKey ? this.textures.get(sp.texKey)?.source?.[0] : null;
          const baseW = tex?.width  ?? 800;
          const baseH = tex?.height ?? 800;
          const heightBoost = sp.heightBoost ?? 1;
          const isTree = sp.type === 'tree' || sp.type === 'shrub';
          const isLandmark = sp.type === 'landmark';
          const isCopRand = sp.copEncounter === true;
          const sizeMult = sp.sizeMult
            ?? (isCopRand ? 1.4 : isLandmark ? 5.5 : isTree ? 2.0 : 2.6);
          let targetW, targetH;
          if (profile?.heightMult) {
            targetH = proj.sw * profile.heightMult;
            targetW = targetH * (baseW / baseH);
          } else {
            targetW = proj.sw * (profile?.widthMult ?? sizeMult);
            targetH = targetW * (baseH / baseW);
          }
          targetW *= heightBoost; targetH *= heightBoost;
          const maxW = profile?.maxW
            ?? (isCopRand ? SCREEN_W * 0.18 : isTree ? SCREEN_W * 0.20 : SCREEN_W * 0.42);
          const maxH = profile?.maxH
            ?? (isCopRand ? SCREEN_H * 0.18
              : isTree ? SCREEN_H * 0.44
              : sp.type === 'house' ? SCREEN_H * 0.36
              : SCREEN_H * 0.68);
          const shrink = Number.isFinite(sp.roadEdgeGapCars) ? 1 : Math.min(
            1,
            (maxW * heightBoost) / Math.max(1, targetW),
            (maxH * heightBoost) / Math.max(1, targetH),
          );
          targetW *= shrink; targetH *= shrink;
          // Mirror the live ramp-clearance displacement. Without this,
          // F3 shows a stale frame/hitbox in the ramp even after the
          // skyline has been moved clear by the renderer.
          if (sp.rampClearance && proj.roadHalfW > 1) {
            // Mirror renderer (2026-05-30): push past FULL ramp extent
            // always — see _renderSceneSprites for the rationale.
            const sign = visualOffset >= 0 ? 1 : -1;
            const rampOuterEdge = 1 + 3.30;
            const visibleHalfWidth = (targetW * 0.5) / proj.roadHalfW;
            const neededOffset = rampOuterEdge + 0.30 + visibleHalfWidth;
            if (Math.abs(visualOffset) < neededOffset) {
              visualOffset = sign * neededOffset;
              const shifted = this.road.sampleSurface?.(
                relZ, visualOffset,
                isStructure ? { allowClipped: true } : undefined,
              );
              if (!shifted) continue;
              proj = shifted;
            }
            proj.sx += 80 * sign;
            targetW *= 0.88;
            targetH *= 0.88;
          }
          const renderL = proj.sx - targetW * 0.5;
          const renderT = proj.sy - targetH;
          // Mirror the renderer's tunnel mouth-overlap cull (only
          // active for buildings within ±100 segs of the tunnel).
          let culledByMouth = false;
          if (!culledByTunnel && tunnelMouthRect && isStructure
              && firstTunnelN >= 0 && Math.abs(n - firstTunnelN) <= 100) {
            const r = tunnelMouthRect;
            culledByMouth = renderL < r.x + r.w
                         && renderL + targetW > r.x
                         && renderT < r.y + r.h
                         && renderT + targetH > r.y;
          }
          const culled = culledByTunnel || culledByMouth;
          // Blue frame is the full PNG rectangle, not collision geometry;
          // transparent pixels inside it are expected.
          if (culled) {
            g.lineStyle(1, 0x666666, 0.35);   // gray = renderer skipped this sprite
            culledCount++;
          } else {
            g.lineStyle(1, 0x3388FF, 0.55);
            sceneryCount++;
          }
          g.strokeRect(renderL, renderT, targetW, targetH);
          // Cyan anchor dot (= proj.sy, the road plane at this sprite's segment).
          g.fillStyle(0x00FFFF, 1);
          g.fillCircle(proj.sx, proj.sy, 3);
          // Tex-key label so we can identify which PNG is floating /
          // misaligned.  Only label structures and only when on-screen.
          if (isStructure && sp.texKey && proj.sx > -50 && proj.sx < SCREEN_W + 50
              && proj.sy > -50 && proj.sy < SCREEN_H + 50) {
            const lbl = ensureLabel();
            lbl.setText(sp.texKey).setPosition(proj.sx + 4, proj.sy + 4).setVisible(true);
          }

          // Red collision bbox — only when sprite is collidable + scenery type
          if (sp.collidable !== false && SCENERY_TYPES.has(sp.type)) {
            const isCitySkyline = (sp.visualMinOffset ?? 0) >= 4.5;
            const isPhotoHome = typeof sp.texKey === 'string'
              && sp.texKey.startsWith('west_seattle_');
            const collisionWidthFraction = sp.type === 'house' ? 0.22
                                         : isPhotoHome         ? 0.70
                                         : sp.type === 'shrub' ? 0.50
                                         : sp.type === 'tree'  ? 0.40
                                         : isCitySkyline       ? 0.90
                                         : 0.65;
            // Mirror the opt-in gate the live collision check uses.
            const isStructureColl = (sp.type === 'building' || sp.type === 'house')
                                  && Number.isFinite(sp.roadEdgeGapCars)
                                  && !sp.rampClearance;
            let collL, collR;
            if (isStructureColl) {
              const sign = (sp.offset ?? 0) >= 0 ? 1 : -1;
              const centerX = proj.sx - proj.roadHalfW * sp.offset;
              const roadEdgeX = centerX + sign * proj.roadHalfW;
              const desiredInnerEdgeX = roadEdgeX + sign * proj.sw * sp.roadEdgeGapCars;
              const bbox = STRUCTURE_BBOX[sp.texKey] ?? STRUCTURE_BBOX_DEFAULT;
              const paintedW = (bbox.rightFrac - bbox.leftFrac) * targetW;
              collL = sign >= 0 ? desiredInnerEdgeX : desiredInnerEdgeX - paintedW;
              collR = sign >= 0 ? desiredInnerEdgeX + paintedW : desiredInnerEdgeX;
            } else {
              collL = proj.sx - targetW * 0.5 * collisionWidthFraction;
              collR = proj.sx + targetW * 0.5 * collisionWidthFraction;
            }
            // Structures use a bottom-band collision rect (only the
            // base of the building can crash into the chassis).
            const collisionBandH = isStructureColl ? Math.max(18, Math.min(targetH, targetH * 0.22, 110)) : targetH;
            // Match the rendered base (proj.sy + targetH*groundDrop) so the
            // debug box tracks the same band the live collision now uses.
            const _bandBaseY = proj.sy + (isStructureColl ? targetH * (profile?.groundDrop ?? 0) : 0);
            const collT = _bandBaseY - collisionBandH;
            g.lineStyle(2, 0xFF0000, 0.85);
            g.strokeRect(collL, collT, collR - collL, collisionBandH);
            // (F2 painted-edge lines moved to _renderSceneSprites and
            // drawn on the standalone _paintedEdgeGfx layer so they
            // toggle independently of this F3 overlay.)
            collidableCount++;
          }
        }
      }
    }

    // ── NPC AABBs (orange) ──
    let npcCount = 0;
    if (this.traffic?.length) {
      for (const car of this.traffic) {
        if (!car.alive) continue;
        const relZ = car.position - this._renderCamPos();
        if (relZ < -800 || relZ > 60000) continue;
        const proj = this.road.getVehicleProjection?.(relZ, car.laneOffset ?? 0);
        if (!proj) continue;
        const halfX = proj.sw * 0.42;
        const npcH  = proj.sw * (40 / 64) * 0.85;
        g.lineStyle(2, 0xFFA800, 0.9);
        g.strokeRect(proj.sx - halfX, proj.sy - npcH, halfX * 2, npcH);
        npcCount++;
      }
    }

    // ── Text readout ──
    const mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const t = Math.min(this.player.position / (ROUTE_SEGS * SEG_LENGTH), 0.999);
    const palette = getPaletteAtProgress(t);
    const region = palette?.name ?? '?';
    const speedUnits = this.player?.speed ?? 0;
    const mph = Math.round(speedUnits / 100);
    const px = this.player?.x ?? 0;
    const firstTunnelN = this.road?._firstTunnelN ?? -1;
    const seg = segs?.[Math.floor(this.player.position / SEG_LENGTH) % (segs?.length ?? 1)];
    const onBridge = !!(seg?.bridge || seg?.water);
    const inTunnel = !!(seg?.tunnel);
    this._debugText.setText([
      `MILE ${mile.toFixed(2)} / ${TOTAL_ROUTE_MILES}  region=${region}`,
      `x=${px.toFixed(3)}  pos=${Math.round(this.player.position)}  ${mph} mph`,
      `scenery=${sceneryCount} (coll=${collidableCount}, culled=${culledCount})  npc=${npcCount}`,
      `tunnel: firstN=${firstTunnelN}  bridge=${onBridge}  inTunnel=${inTunnel}`,
      `camera: ${this.road?._cameraTracksPlayer === false ? 'CENTERED (F4)' : 'TRACKS PLAYER (F4)'}`,
      `iframe=${Math.max(0, this._invincibleUntil - (this.time?.now ?? 0)).toFixed(0)}ms`,
    ].join('\n'));
  }

  _applyPlayerSpriteDisplaySize(targetW = 78, fallbackH = 49) {
    if (!this.playerSprite) return;
    const texKey = this.playerSprite.texture?.key;
    const procedural = !texKey || texKey === 'car_player' || texKey === 'player_car';
    if (procedural) {
      this.playerSprite.setDisplaySize(targetW, fallbackH);
      return;
    }
    const src = this.textures.get(texKey)?.getSourceImage?.();
    const tw = src?.width || targetW;
    const th = src?.height || fallbackH;
    const ratio = tw > 0 ? th / tw : fallbackH / targetW;
    this.playerSprite.setDisplaySize(targetW, targetW * ratio);
  }

  /** Paint the player's license-plate handle on the back bumper of the
   *  third-person car.  Re-anchored every frame to the player sprite —
   *  matches its x, lean angle, blink alpha, and display scale, and rides
   *  ~17 % of the sprite height above the bumper.  Hidden in cockpit view,
   *  when the car sprite is hidden, or before the player has set a plate. */
  _updateRearPlate() {
    const plate = this._rearPlate;
    const car   = this.playerSprite;
    if (!plate || !car) return;
    const save = this.registry.get('save');
    const str = String(save?.activePlate ?? '').trim();
    const img = this._rearPlateImg;
    if (!str || this._cockpitActive || car.visible === false) {
      if (plate.visible) plate.setVisible(false);
      if (img && img.visible) img.setVisible(false);
      return;
    }
    // Rebuild text + refit only when the plate string changes.
    if (str !== this._rearPlateStr) {
      this._rearPlateStr = str;
      plate.setText(str);
    }
    // Plate art = the active player's state plate (slot 0/1/2 → WA/OR/ID).
    if (img) {
      const key = PLATE_KEYS[save?.activeSlot | 0] ?? PLATE_KEYS[0];
      if (img.texture?.key !== key && this.textures.exists(key)) img.setTexture(key);
    }
    const dispW = car.displayWidth  || 78;
    const dispH = car.displayHeight || 49;
    // Where each car's BACK sprite paints its blank license plate.  yUp =
    // plate-center as a fraction of sprite height ABOVE the bottom (origin
    // 0.5,1); w = plate width as a fraction of display width.  Measured from
    // the PNG art: the beater's plate sits dead-centre, ~51 % up — i.e.
    // between the two taillights, not down on the bumper.  Unlisted vehicles
    // use DEFAULT (the codex car art is framed consistently).
    const ANCHOR = { beater: { yUp: 0.51, w: 0.30 } };
    const a = ANCHOR[this.player?.vehicleId] ?? { yUp: 0.51, w: 0.30 };
    const theta = car.rotation || 0;
    const up    = dispH * a.yUp;
    const cx    = car.x + up * Math.sin(theta);
    const cy    = car.y - up * Math.cos(theta);
    // Plate art fills the painted plate area (a.w of car width, aspect-correct).
    const plateW = dispW * a.w;
    if (img) {
      img.setDisplaySize(plateW, plateW / PLATE_ASPECT);
      img.setPosition(cx, cy);
      img.rotation = theta;
      img.alpha    = car.alpha;
      if (!img.visible) img.setVisible(true);
    }
    // Handle text fits the plate's NUMBER BAND (~72% of plate width); the plate
    // art provides the background + state name.  (Falls back to filling the
    // plate width if the art is missing.)
    const baseW    = plate.width || 1;
    const targetTW = plateW * (img ? 0.72 : 1);
    plate.setScale(targetTW / baseW);
    plate.x = cx;
    plate.y = cy;
    plate.rotation = theta;
    plate.alpha = car.alpha;
    if (!plate.visible) plate.setVisible(true);
  }

  /** Resolve the right texture key for a car based on its colorSet and
   *  its direction relative to the player.  Same-direction → BACK image
   *  (player sees the rear); oncoming → FRONT image (car driving toward
   *  the player).  Falls back to legacy keys if a paired asset is absent. */
  _carTexKey(colorSet, facing /* 'back' | 'front' */) {
    if (!colorSet) return 'npc_car_white';
    const candidate = `car_${facing}_${colorSet}`;
    if (this.textures.exists(candidate)) return candidate;
    // Legacy fallbacks while the asset set isn't fully paired yet.
    if (colorSet === 'police') {
      if (this.textures.exists('cop_police')) return 'cop_police';
    }
    if (this.textures.exists(`car_${colorSet}`)) return `car_${colorSet}`;
    return 'npc_car_white';
  }

  _renderVehicles() {
    const p = this.player;
    // Shared render-camera position — cockpit shifts the eye 3000 units
    // forward of physics, so traffic relZ, cops relativePos, and the
    // tunnel-segment lookup below all key off the SAME camera the road
    // projection uses (road.render() received this same value).  Mixing
    // p.position here with the shifted road projection caused cars to
    // render at the wrong size + Y and drop out of the tunnel correctly
    // in cockpit mode.
    const camPos = this._renderCamPos();
    const pool = this._carSpritePool;
    const ghostPool = this._carGhostPool;
    // Debug mode suppresses the alcohol ghost so the overlay shows
    // true on-screen NPC positions, not the doubled visual.
    const dv = this._debugOn ? 0 : (this.effects?.doubleVision ?? 0);
    // Base lateral offset in screen pixels.  Per-sprite scaling by
    // perspective (proj.sw) happens at the ghost paint site so far
    // sprites don't fling their ghost across the road.
    const ghostOffsetBase = dv > 0.01 ? dv * 38 : 0;
    const ghostAlpha      = dv > 0.01 ? dv * 0.62 : 0;
    let used = 0;
    let ghostUsed = 0;
    const camSegIdx = ((Math.floor(camPos / SEG_LENGTH)) % this.road.segments.length
      + this.road.segments.length) % this.road.segments.length;
    const cameraInTunnel = !!this.road.segments[camSegIdx]?.tunnel;

    // Reset the shared tire-shadow canvas — we redraw all car shadows
    // fresh each frame, anchored to sampleSurface() (NOT sprite Y), so
    // any 1-3 px sprite mismatch still reads as a grounded car.
    const shadowG = this._tireShadowGfx;
    if (shadowG) shadowG.clear();

    // ── Position the player car on the CURRENT-FRAME road surface ───
    // road.render() ran moments ago and built this frame's _drawn array.
    // _updatePlayer (way earlier in update()) only set X + angle; Y is
    // set here so we never read from a stale projection.  No lerp —
    // current-frame data doesn't need smoothing.
    if (this.playerSprite?.visible !== false) {
      const surf = this.road?.sampleSurface?.(PLAYER_VIRTUAL_Z, 0, { allowClipped: true });
      if (surf && Number.isFinite(surf.sy)) {
        // +17 px nudges the player car down so its tires read as
        // touching the asphalt instead of hovering above it.  The
        // bottom-of-screen sample point hits the road plane a couple
        // pixels above where the car art's contact line sits.
        this.playerSprite.y = surf.sy + 17;
      }
    }
    // Glue the rear license plate to the (now-positioned) player car.
    this._updateRearPlate();

    const cockpit = this._cockpitActive;
    // Near-cull threshold.  Chase view culls at 0.65×PLAYER_VIRTUAL_Z
    // so NPCs disappear once they pass behind the visible player car
    // sprite (which sits at PLAYER_VIRTUAL_Z = 3000).  Cockpit has no
    // player sprite to occlude and the eye sits in the driver seat —
    // a same-direction car being overtaken should keep rendering as
    // it grows huge in the windshield, then naturally slide off
    // below the dashboard.  Drop the chase floor to 300 (was
    // PLAYER_VIRTUAL_Z * 0.65 ≈ 1950) so cars roll all the way past
    // the bottom of the screen instead of vanishing mid-screen.
    // Cockpit stays at 100 as before.
    const nearCull = cockpit ? 100 : 300;
    const place = (relZ, laneOffset, color, scaleHint, rotation, texKey) => {
      if (relZ < nearCull || relZ > 76000) return;
      const segIdx = Math.floor((camPos + relZ) / SEG_LENGTH) % this.road.segments.length;
      const inTunnel = !!this.road.segments[segIdx]?.tunnel;
      // No tunnel lane clamp — the tunnel walls sit OUTSIDE the road
      // (offset > 1.0), so cars in the outer lanes (±0.75) are still
      // on the pavement, not in the wall.  Clamping the sprite to
      // ±0.48 used to render outer-lane cars on the hash marks between
      // lanes while collision stayed out at ±0.75 — the long-standing
      // "drive through cars sitting between lanes" bug.  Sprite +
      // collision now both use the real laneOffset.
      const proj = this.road.getVehicleProjection(relZ, laneOffset);
      if (!proj || proj.sw < 2) return;
      const useTex = texKey || 'npc_car_white';
      const tex = this.textures.get(useTex)?.source?.[0];
      const baseW = tex?.width  || 64;
      const baseH = tex?.height || 40;
      const targetW = proj.sw * (scaleHint ?? 1) * (inTunnel ? 0.88 : 1);
      const targetH = targetW * (baseH / baseW);
      // Cars inside a curving tunnel paint above the shell so the curb
      // does not cover cars on the exposed pavement. Cull only when the
      // visible body is actually behind a nearer concrete side wall.
      if (cameraInTunnel && inTunnel
          && this.road.isTunnelVehicleOccluded?.(
            relZ, proj.sx, proj.sy - targetH * 0.42,
          )) {
        return;
      }
      // Tire shadow — NPC sprites use origin (0.5, 1), so the car's
      // BOTTOM (wheels) sit at proj.sy.  The shadow is anchored to
      // proj.sy and pulled slightly UP into the car's footprint so it
      // tucks tight under the wheels instead of trailing below.  A
      // second shadow paints at the ghost offset during double-vision
      // so the ghost copy doesn't float without one.
      if (shadowG) {
        const shW = proj.sw * 0.78;
        const shH = Math.max(1.2, proj.sw * 0.10);
        const shY = proj.sy - shH * 0.55;
        shadowG.fillStyle(0x000000, 0.32);
        shadowG.fillEllipse(proj.sx, shY, shW, shH);
        if (ghostOffsetBase > 0) {
          const ghostOffset = ghostOffsetBase * Math.min(1, (proj.sw ?? 0) / 200);
          shadowG.fillStyle(0x000000, 0.32 * ghostAlpha);
          shadowG.fillEllipse(proj.sx + ghostOffset, shY, shW, shH);
        }
      }
      if (used >= pool.length) return;
      const s = pool[used++];
      if (s.texture.key !== useTex) s.setTexture(useTex);
      // Unified world-space depth — all roadside sprites (buildings, trees,
      // cars, drugs) share the 7.0–9.5 band, mapped from z-distance so that
      // a *closer* sprite always paints over a *farther* one regardless of
      // type. Without this, cars (formerly depth 9) painted through any
      // building (depth 7.5) sitting between them and the camera.
      // Tunnel walls/ceiling live on tunnelGfx at depth 9.82.  When the
      // camera is outside, keep tunnel traffic below that overlay so the
      // entrance facade can hide cars behind its concrete sides.  Once
      // the camera is inside, cars in a tunnel lane must paint above the
      // wall shell: their billboard body rises above the road plane and
      // otherwise gets covered by the wall polygon despite being on the
      // drivable pavement.
      const baseDepth = 9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5;
      const depth = (cameraInTunnel && inTunnel)
        ? 9.83
        : (inTunnel ? Math.min(baseDepth, 9.80) : baseDepth);
      s.setPosition(proj.sx, proj.sy)
        .setDisplaySize(targetW, targetH)
        .setTint(color)
        .setRotation(rotation ?? 0)
        .setDepth(depth)
        .setAlpha(1)
        .setVisible(true);

      // Per-slot masked headlight Graphics — clear it for THIS frame.
      // (Same-direction traffic gets beams drawn here; oncoming /
      // cops / wrecks just leave it empty.)  The Graphics has a
      // BitmapMask sourced from this very sprite (set up at boot)
      // so its draws are auto-clipped to the area OUTSIDE the NPC
      // silhouette — opaque body pixels can't reveal the beam.
      const slotIdx = used - 1;
      const hg = this._npcHeadlightGfxPool?.[slotIdx];
      if (hg) hg.clear();

      // Double-vision ghost copy — shifted laterally and alpha'd.
      // Scale by perspective so far sprites don't get a huge displacement.
      if (ghostOffsetBase > 0 && ghostPool && ghostUsed < ghostPool.length) {
        const ghostOffset = ghostOffsetBase * Math.min(1, (proj.sw ?? 0) / 200);
        const gs = ghostPool[ghostUsed++];
        if (gs.texture.key !== useTex) gs.setTexture(useTex);
        gs.setPosition(proj.sx + ghostOffset, proj.sy)
          .setDisplaySize(targetW, targetH)
          .setTint(color)
          .setRotation(rotation ?? 0)
          .setDepth(depth - 0.01)
          .setAlpha(ghostAlpha)
          .setVisible(true);
      }
    };

    // Traffic — alive cars and crashed wrecks (with spin). Each car looks
    // up its texture per-frame so direction changes (e.g. someone crashes
    // and the wreck spins to face the camera) update the image correctly.
    // Same-direction (positive speed) → BACK; oncoming (negative speed) →
    // FRONT (the player is staring down their grille as they close).
    //
    // For CRASHED wrecks the texture also flips between the back and
    // front images each half-rotation so the spin reads as the car
    // rotating yaw-wise (you see the rear, then the front, then the
    // rear again as it spins out) instead of just one image rolling.
    const TWO_PI = Math.PI * 2;
    for (const t of this.traffic) {
      const relZ = t.position - camPos;
      const baseFacing = (t.speed ?? 0) < 0 ? 'front' : 'back';
      let facing = baseFacing;
      if (t.crashed) {
        const ang = t.crashAng ?? 0;
        const mod = ((ang % TWO_PI) + TWO_PI) % TWO_PI;
        // Flip half: 90°..270° we're looking at the OPPOSITE end of the
        // car (its nose if it was driving away, its tail if oncoming).
        const flipHalf = mod >= Math.PI * 0.5 && mod < Math.PI * 1.5;
        if (flipHalf) facing = baseFacing === 'back' ? 'front' : 'back';
      }
      const texKey = this._carTexKey(t.colorSet, facing);
      const isImg  = texKey && texKey !== 'npc_car_white';
      const tint   = isImg ? 0xFFFFFF : t.color;
      // visualScale: semis read as ~lane-wide (1.35), tractors a hair
      // wider than cars (1.10); everything else stays at 1.0.  Set at
      // spawn time on the traffic record — see _spawnTraffic.
      const vs = t.visualScale ?? 1;
      if (t.crashed) {
        place(relZ, t.laneOffset, isImg ? 0xAA8866 : 0x664422, vs, t.crashAng ?? 0, texKey);
      } else if (t.alive) {
        place(relZ, t.laneOffset, tint, vs, 0, texKey);
        // ── Same-direction headlight beams (per-slot masked) ──
        // Oncoming traffic shows a grille-mounted dot pair handled
        // in _renderHeadlights; same-direction NPCs project forward
        // beams onto the road, drawn into the slot's masked
        // Graphics so the body silhouette occludes the beam.
        if ((t.speed ?? 0) >= 0 && TimeOfDay.headlightsOn?.(
              (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES)
            && this._npcHeadlightGfxPool) {
          this._drawNpcForwardBeams(used - 1, t);
        }
      }
    }

    // Cache the cop list once per frame — getCopsForRender allocates a
    // filtered array, so reusing it across the two loops below saves
    // one allocation + one O(n) traversal per frame.  Pass the render
    // camera position so cop.relativePos matches the camera the road
    // projection uses (cockpit-shifted in first-person view).
    const copsForRender = this.cops.getCopsForRender(camPos);

    // Cops — pursuit-front cops drive same direction (player sees the
    // back), oncoming cops barrel head-on (front), barricade cops parked
    // facing oncoming traffic = front.
    for (const cop of copsForRender) {
      const facing =
        cop.kind === 'oncoming'  ? 'front' :
        cop.kind === 'barricade' ? 'front' :
        (cop.speed ?? 0) < 0     ? 'front' :
                                   'back';
      const texKey = this._carTexKey(cop.colorSet ?? 'police', facing);
      // Cops render ~40% larger than a stock car so they read as imposing; the
      // parked cruiser at a traffic stop is bigger still so it's unmistakably
      // right there on screen beside you.
      const copScale = cop.parked ? 2.2 : 1.4;
      place(cop.relativePos, cop.laneOffset, 0xFFFFFF, copScale, 0, texKey);
    }

    // Player tire shadow — anchored to sprite.y (the actual on-screen
    // bottom of the car, since the sprite is origin (0.5, 1)) instead of
    // the live road sample.  During gameplay sprite.y already tracks the
    // road, so visually identical; on title / pause / death where the
    // sprite sits at its own Y, the shadow follows the car instead of
    // floating to wherever the road would be.
    // Ketamine retinal drift — shadow drifts laterally from the car body,
    // selling the "shadow detached from car" dissociation cue.  Up to
    // 4 px at peak ket bar.
    // Skip the player tire shadow once the sink animation has started —
    // the shadow should vanish first, before tires submerge.
    if (shadowG && this.playerSprite?.visible !== false && !this._sinkState) {
      const PW = this.playerSprite.displayWidth  || 78;
      const PH = this.playerSprite.displayHeight || 49;
      const shW = PW * 0.82;
      const shH = Math.max(2, PH * 0.18);
      const phys2 = this.effects?.getPhysics?.(this.drugs);
      const drift = phys2?.kRetinalDrift ?? 0;
      // Shadow tilts subtly OPPOSITE the car's lean — "body leans into
      // the turn, wheels stay planted" cue.  Applies in all steering
      // modes (classic / tilt / flappy).
      const leanDir = (this.player?.steerVelocity ?? 0) / (TURN_SPEED || 1);
      const shadowAngle = -leanDir * Phaser.Math.DegToRad(4);
      // Lift the shadow up ~10 px so it paints UNDER THE TIRES, not
      // below the sprite's transparent-padding bottom edge.  Without
      // the lift the car art reads as floating with a detached
      // shadow puddle below it.
      const SHADOW_LIFT = 10;
      shadowG.save();
      shadowG.translateCanvas(this.playerSprite.x + drift, this.playerSprite.y - SHADOW_LIFT);
      shadowG.rotateCanvas(shadowAngle);
      shadowG.fillStyle(0x000000, 0.40);
      shadowG.fillEllipse(0, 0, shW, shH);
      shadowG.restore();
    }

    // Hide any sprites in the pool we didn't use this frame.
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
    if (ghostPool) {
      for (let i = ghostUsed; i < ghostPool.length; i++) ghostPool[i].setVisible(false);
    }
    // Clear stale NPC headlight Graphics in unused slots so beams
    // don't linger on the road after their car despawns / scrolls past.
    if (this._npcHeadlightGfxPool) {
      for (let i = used; i < this._npcHeadlightGfxPool.length; i++) {
        this._npcHeadlightGfxPool[i].clear();
      }
    }

    // Cop light bars + night headlights / tail-lights (depth 9.75).
    const g = this._copLightGfx;
    g.clear();

    // ── Night headlights / tail-lights for ALL traffic ───────────────
    // Only visible from late dusk on (nightAmt > 0).  Oncoming cars get
    // bright yellow headlights at the front (= bottom edge from the
    // player's view); same-direction cars show red tail-lights at the
    // bottom edge (= back of the car visible to player).
    const _mileForLights = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const _nightAmt      = TimeOfDay.nightAmount(_mileForLights);
    if (_nightAmt > 0.05) {
      const drawHeadlights = (proj, oncoming) => {
        if (!proj || proj.sw < 6) return;
        const w = proj.sw;
        const x = proj.sx;
        const y = proj.sy;            // bottom edge of NPC sprite
        const lx1 = x - w * 0.28;
        const lx2 = x + w * 0.28;
        const ly  = y - w * 0.10;
        const r1  = Math.max(2, w * 0.07);
        if (oncoming) {
          // Oncoming-car headlight rendering disabled per user request.
        } else {
          // OG same-direction tail-light pair disabled — it was
          // anchored at ly = sy - w * 0.10, which lands inside the
          // wheel base.  Proper mid-height tail lights are drawn by
          // the same-direction branch in _renderHeadlights.
        }
      };
      for (const t of this.traffic) {
        if (t.crashed || !t.alive) continue;
        const relZ = t.position - camPos;
        // Match the cockpit-aware near-cull used by the sprite render
        // loop above so headlights stay attached to NPC sprites all
        // the way to the eye in cockpit, not just to PLAYER_VIRTUAL_Z.
        if (relZ < nearCull || relZ > 76000) continue;
        const proj = this.road.getVehicleProjection(relZ, t.laneOffset);
        const oncoming = (t.speed ?? 0) < 0;
        drawHeadlights(proj, oncoming);
      }
      for (const cop of copsForRender) {
        const proj = this.road.getVehicleProjection(cop.relativePos, cop.laneOffset);
        const oncoming = cop.kind === 'oncoming' || cop.kind === 'barricade' || (cop.speed ?? 0) < 0;
        drawHeadlights(proj, oncoming);
      }
    }

    // Cop flashing light bars stay on top of everything else.
    for (const cop of copsForRender) {
      const proj = this.road.getVehicleProjection(cop.relativePos, cop.laneOffset);
      if (!proj || proj.sw < 6) continue;
      const w = proj.sw, x = proj.sx, y = proj.sy - w * 0.55;
      g.fillStyle(0x111111, 1); g.fillRect(x - w * 0.32, y, w * 0.64, w * 0.10);
      if (this._colorblind) {
        // CB: red half → amber (red↔dark reads as near-black on/off for
        // protan/deutan), blue half unchanged, + a white center that blinks
        // with the bar so "active chase" reads by shape + blink, not hue.
        g.fillStyle(cop.flash ? 0xFFB000 : 0x3A2600, 1);
        g.fillRect(x - w * 0.30, y + 1, w * 0.28, w * 0.07);
        g.fillStyle(cop.flash ? 0x2255FF : 0x000044, 1);
        g.fillRect(x + w * 0.02, y + 1, w * 0.28, w * 0.07);
        if (cop.flash) { g.fillStyle(0xFFFFFF, 1); g.fillRect(x - w * 0.035, y, w * 0.07, w * 0.10); }
      } else {
        g.fillStyle(cop.flash ? 0xFF3333 : 0x440000, 1);
        g.fillRect(x - w * 0.30, y + 1, w * 0.28, w * 0.07);
        g.fillStyle(cop.flash ? 0x2255FF : 0x000044, 1);
        g.fillRect(x + w * 0.02, y + 1, w * 0.28, w * 0.07);
      }
    }
  }

  /** Bellevue approach strip: opaque distant city frontage that starts
   * tiny on the horizon around mile 13 and grows until Bellevue is passed.
   * The actual close/solid buildings still come from _renderSceneSprites.
   */
  _renderHorizonStrips() {
    const stripL = this._horizonStripL;
    const stripR = this._horizonStripR;
    if (!stripL || !stripR) return;
    // The Bellevue horizon strip was reading "below the horizon, in the
    // road" — the +offset / outward math placed it on top of the
    // pavement instead of beyond the road edge.  Close-by Bellevue
    // buildings already paint via the normal scene-sprite pass, so
    // disable the strip until it can be repositioned properly.
    stripL.setVisible(false);
    stripR.setVisible(false);
    return;
    // (unreachable — preserved so we can flip the disable later)
    // eslint-disable-next-line no-unreachable
    const hide = () => {
      stripL.setVisible(false);
      stripR.setVisible(false);
    };

    const mile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const city = {
      enterMile: 13.0,
      exitMile: 16.0,
      leftKey:  'codex_bellevue_roadside_strip',
      rightKey: 'codex_bellevue_roadside_strip',
    };
    if (mile < city.enterMile || mile > city.exitMile) {
      hide();
      return;
    }

    const segs = this.road?.segments;
    if (segs?.length) {
      // Visual-camera tunnel check — cockpit eye may already be inside
      // a tunnel before player.position reaches the mouth.  Strips are
      // visual decoration, so hide them when the CAMERA is inside.
      const camPos = this._renderCamPos();
      const idx = ((Math.floor(camPos / SEG_LENGTH) % segs.length) + segs.length) % segs.length;
      if (segs[idx]?.tunnel) {
        hide();
        return;
      }
    }

    let leftEdge = null;
    let rightEdge = null;
    for (let step = 5; step < 80; step += 5) {
      const relZ = (DRAW_DIST - step) * SEG_LENGTH;
      leftEdge  = this.road.sampleSurface?.(relZ, -1.05, { allowClipped: true });
      rightEdge = this.road.sampleSurface?.(relZ, +1.05, { allowClipped: true });
      if (leftEdge && rightEdge) break;
    }
    if (!leftEdge || !rightEdge) {
      hide();
      return;
    }

    const span = Math.max(0.001, city.exitMile - city.enterMile);
    const t = clamp((mile - city.enterMile) / span, 0, 1);
    const ease = t * t * (3 - 2 * t);
    const scale = 0.035 + 0.33 * ease;
    const groundY = Math.max(leftEdge.sy, rightEdge.sy) + 8 + 42 * ease;
    const outward = 8 + 110 * ease;

    if (stripL.texture?.key !== city.leftKey && this.textures.exists(city.leftKey)) {
      stripL.setTexture(city.leftKey);
    }
    if (stripR.texture?.key !== city.rightKey && this.textures.exists(city.rightKey)) {
      stripR.setTexture(city.rightKey);
    }

    stripL
      .setOrigin(1, 1)
      .setPosition(leftEdge.sx - outward, groundY)
      .setScale(scale)
      .setAlpha(1)
      .setDepth(5.7)
      .setVisible(true);
    stripR
      .setOrigin(0, 1)
      .setPosition(rightEdge.sx + outward, groundY)
      .setScale(scale)
      .setAlpha(1)
      .setDepth(5.7)
      .setVisible(true);
  }

  /** Lightweight field fence: one projected rail strip plus pooled post images. */
  _renderRuralFences() {
    const g = this._ruralFenceGfx;
    const segs = this.road?.segments;
    const posts = this._fencePostPool ?? [];
    if (!g || !segs?.length) {
      for (const post of posts) post.setVisible(false);
      return;
    }
    g.clear();

    const camPos = this._renderCamPos();
    const startSeg = Math.floor(camPos / SEG_LENGTH);
    const spacing = 14;
    const firstPostSeg = Math.ceil((startSeg + 1) / spacing) * spacing;
    const lastPostSeg = Math.floor((startSeg + DRAW_DIST - 1) / spacing) * spacing;
    let usedPosts = 0;
    for (const side of [-1, 1]) {
      let previous = null;
      let secondPrev = null;
      let lastPostW = 1;
      for (let absoluteSeg = lastPostSeg; absoluteSeg >= firstPostSeg; absoluteSeg -= spacing) {
        const wrappedSeg = ((absoluteSeg % segs.length) + segs.length) % segs.length;
        const seg = segs[wrappedSeg];
        if (!seg?.ruralFence) {
          previous = null;
          secondPrev = null;
          continue;
        }
        const relativeZ = absoluteSeg * SEG_LENGTH - camPos + SEG_LENGTH * 0.5;
        const p = this.road.sampleSurface?.(
          relativeZ,
          side * 2.15,
          { allowClipped: true },
        );
        if (!p || p.sw < 1.1) {
          previous = null;
          secondPrev = null;
          continue;
        }
        const postH = clamp(p.sw * 0.62, 2, 42);
        const postW = clamp(postH * 0.43, 1, 18);
        const railA = p.sy - postH * 0.68;
        const railB = p.sy - postH * 0.37;

        if (previous) {
          g.lineStyle(clamp(postW * 0.42, 1, 2), 0x72563C, 0.90);
          g.beginPath();
          g.moveTo(previous.x, previous.railA);
          g.lineTo(p.sx, railA);
          g.moveTo(previous.x, previous.railB);
          g.lineTo(p.sx, railB);
          g.strokePath();
        }
        if (usedPosts < posts.length) {
          const postIndex = usedPosts++;
          const variation = (Math.floor(absoluteSeg / spacing) + (side > 0 ? 2 : 0)) % 4;
          const postScale = [0.93, 1.04, 0.97, 1.08][variation];
          posts[postIndex]
            .setTexture('east_wa_fence_post')
            .setPosition(p.sx, p.sy)
            .setDisplaySize(postW * postScale, postH * postScale)
            .setRotation(([0.010, -0.012, 0.007, -0.009][variation]) * side)
            .setVisible(true);
        }
        secondPrev = previous;
        previous = { x: p.sx, railA, railB };
        lastPostW = postW;
      }
      // ── Rail continuation past the closest visible post ─────────────
      // Mirrors the utility-line wire continuation: without this the
      // rail stops dead at the nearest on-screen post and floats in
      // mid-air with no terminus, while the matching power line above
      // it keeps going off the screen edge.  Extend X using the
      // per-spacing drift and HOLD Y CONSTANT — same rationale as the
      // wire: perspective-projecting the rail toward the camera would
      // make it dip into the road as it exits.
      if (previous && secondPrev) {
        const dx = previous.x - secondPrev.x;
        const extX = previous.x + dx * 3;   // 3 spacings past the closest post
        g.lineStyle(clamp(lastPostW * 0.42, 1, 2), 0x72563C, 0.90);
        g.beginPath();
        g.moveTo(previous.x, previous.railA);
        g.lineTo(extX, previous.railA);
        g.moveTo(previous.x, previous.railB);
        g.lineTo(extX, previous.railB);
        g.strokePath();
      }
    }
    for (let i = usedPosts; i < posts.length; i++) posts[i].setVisible(false);
  }

  /** Sparse roadside utility line: pooled pole sprites linked by projected wire. */
  _renderUtilityLines() {
    const g = this._utilityLineGfx;
    const segs = this.road?.segments;
    const poles = this._utilityPolePool ?? [];
    if (!g || !segs?.length) {
      for (const pole of poles) pole.setVisible(false);
      return;
    }
    g.clear();

    const camPos = this._renderCamPos();
    const startSeg = Math.floor(camPos / SEG_LENGTH);
    // 2026-05-31 rewrite: wire and pole rendering are now two separate
    // passes so the wire can sample the road densely (every WIRE_STEP
    // segments, same cadence as the fence-rail render) while the pole
    // sprites stay at real-world spacing (~200 ft).  The previous
    // single-loop pass only sampled every 61 segs, drawing straight
    // lines between consecutive samples — on a curved road that
    // straight-line shortcut cut across the curve and read as the
    // wire visibly dropping toward the road as it exited the frame.
    //
    // WIRE_STEP matches the fence post step (14) so the wire follows
    // the road surface exactly the same way the fence rail does.  Pole
    // SPACING stays at 61 (≈200 ft, the real I-90 pole pitch).
    const WIRE_STEP = 14;
    const SPACING   = 61;

    // ── Pass 1: continuous wire ribbon ────────────────────────────────
    const firstWireSeg = Math.ceil((startSeg + 1) / WIRE_STEP) * WIRE_STEP;
    const lastWireSeg  = Math.floor((startSeg + DRAW_DIST - 1) / WIRE_STEP) * WIRE_STEP;
    for (const wireSide of [-1, 1]) {
      let prev = null;
      let secondPrev = null;
      let lastH = 1;
      for (let absSeg = lastWireSeg; absSeg >= firstWireSeg; absSeg -= WIRE_STEP) {
        const wrappedSeg = ((absSeg % segs.length) + segs.length) % segs.length;
        const seg = segs[wrappedSeg];
        const side = seg?.utilityLineSide ?? 0;
        if (side !== wireSide || seg.ruralFence || seg.bridge || seg.tunnel || seg.water) {
          prev = null; secondPrev = null;
          continue;
        }
        const relativeZ = absSeg * SEG_LENGTH - camPos + SEG_LENGTH * 0.5;
        const p = this.road.sampleSurface?.(relativeZ, side * 2.0, { allowClipped: true });
        if (!p || p.sw < 1.1) {
          prev = null; secondPrev = null;
          continue;
        }
        const wireH = clamp(p.sw * 3.35, 4, 190);
        const wireA = p.sy - wireH * 0.94;
        const wireB = p.sy - wireH * 0.90;
        if (prev) {
          g.lineStyle(clamp(wireH * 0.5 * 0.025, 0.7, 1.6), 0x26282A, 0.85);
          g.beginPath();
          g.moveTo(prev.x, prev.wireA);
          g.lineTo(p.sx,   wireA);
          g.moveTo(prev.x, prev.wireB);
          g.lineTo(p.sx,   wireB);
          g.strokePath();
        }
        secondPrev = prev;
        prev = { x: p.sx, wireA, wireB };
        lastH = wireH;
      }
      // Edge continuation: hold Y constant past the closest visible
      // sample (matches the fence rail continuation).
      if (prev && secondPrev) {
        const dx   = prev.x - secondPrev.x;
        const extX = prev.x + dx * 3;
        g.lineStyle(clamp(lastH * 0.5 * 0.025, 0.7, 1.6), 0x26282A, 0.85);
        g.beginPath();
        g.moveTo(prev.x, prev.wireA);
        g.lineTo(extX,   prev.wireA);
        g.moveTo(prev.x, prev.wireB);
        g.lineTo(extX,   prev.wireB);
        g.strokePath();
      }
    }

    // ── Pass 2: pole sprites at real 200ft spacing ────────────────────
    const firstPoleSeg = Math.ceil((startSeg + 1) / SPACING) * SPACING;
    const lastPoleSeg  = Math.floor((startSeg + DRAW_DIST - 1) / SPACING) * SPACING;
    let usedPoles = 0;
    for (let absoluteSeg = lastPoleSeg; absoluteSeg >= firstPoleSeg; absoluteSeg -= SPACING) {
      const wrappedSeg = ((absoluteSeg % segs.length) + segs.length) % segs.length;
      const seg = segs[wrappedSeg];
      const side = seg?.utilityLineSide ?? 0;
      if (!side || seg.ruralFence || seg.bridge || seg.tunnel || seg.water) continue;
      const relativeZ = absoluteSeg * SEG_LENGTH - camPos + SEG_LENGTH * 0.5;
      const p = this.road.sampleSurface?.(relativeZ, side * 2.0, { allowClipped: true });
      if (!p || p.sw < 1.1) continue;
      const poleH = clamp(p.sw * 3.35, 4, 190);
      const poleW = poleH * 0.5;
      if (usedPoles >= poles.length) break;
      const slot = Math.floor(absoluteSeg / SPACING);
      const transformerEvery = seg.utilityNearHomes ? 3 : 5;
      const transformer = (slot % transformerEvery) === 0;
      const variation = (slot + (side > 0 ? 2 : 0)) % 4;
      const polePostScale = [0.93, 1.04, 0.97, 1.08][variation];
      const polePostRot   = [0.010, -0.012, 0.007, -0.009][variation] * side;
      poles[usedPoles++]
        .setTexture(transformer ? 'east_wa_utility_pole_transformer' : 'east_wa_utility_pole_plain')
        .setPosition(p.sx, p.sy)
        .setDisplaySize(poleW * polePostScale, poleH * polePostScale)
        .setRotation(polePostRot)
        .setVisible(true);
    }
    for (let i = usedPoles; i < poles.length; i++) poles[i].setVisible(false);
  }

  _renderSceneSprites() {
    const pool = this._sceneSpritePool;
    if (!pool?.length) return;
    const planePool = this._strip3dPool ?? [];
    const segs = this.road.segments;
    if (!segs?.length) return;
    // F2 painted-edge overlay layer — cleared each frame, drawn into
    // from inside the painted-edge invariant block per-sprite.
    if (this._paintedEdgeDebugOn && this._paintedEdgeGfx) {
      this._paintedEdgeGfx.clear();
    }
    // G — one-shot dump of every visible structure's painted-edge math.
    const _peDump = this._paintedEdgeDumpRequested;
    if (_peDump) {
      this._paintedEdgeDumpRequested = false;
      console.log('────── painted-edge dump ──────');
      console.log('mile=', ((this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES).toFixed(2),
                  'player.x=', (this.player.x ?? 0).toFixed(3),
                  'SCREEN_W=', SCREEN_W);
    }
    this._peDumpRowsThisFrame = _peDump ? [] : null;
    // Cockpit forward-bias: render scene sprites relative to the
    // shifted camera Z (driver-seat viewpoint in cockpit mode).
    const playerPos = this._renderCamPos();
    const startSeg  = Math.floor(playerPos / SEG_LENGTH);
    // Wind strength once per frame (drives tree sway below).
    const _windSway = this._windStrength();
    let used = 0;
    let usedPlanes = 0;
    // Night-tint: dim every scenery sprite by TimeOfDay.darkness().
    // Multiplicative tint — 0xFFFFFF = no change, darker greys =
    // proportional darken.  Max darken is 55% (sprite goes to 45% of
    // its source brightness at full night) so things still read at
    // night without going pitch-black.  Slight cool bias on the blue
    // channel for moonlight feel.
    const _mileNowScn = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    const _darknessScn = TimeOfDay.darkness?.(_mileNowScn) ?? 0;
    let _scnTint = 0xFFFFFF;
    if (_darknessScn > 0) {
      const dim = 1 - _darknessScn * 0.55;
      const blueDim = 1 - _darknessScn * 0.48;     // less darkening on blue → moonlight cast
      const r = Math.round(255 * dim);
      const g = Math.round(255 * dim);
      const b = Math.round(255 * blueDim);
      _scnTint = (r << 16) | (g << 8) | b;
    }

    // Iterate NEAR → FAR so close scenery gets pool slots first.
    // Depth is set per-sprite (closer = higher depth) so paint order
    // still works.  Iteration extended to 1000 segments per user
    // direction — far skyline + city blocks are now visible.  The
    // size cull below still skips sub-1.5-px specks so the work per
    // frame doesn't balloon.
    // Tunnel-area building cull, two layers:
    //
    //   (a) PAST-tunnel cull (cheap, by segment): any building whose
    //       segment sits past the first visible tunnel is fully
    //       hidden by the facade anyway, so skip outright.
    //
    //   (b) MOUTH-OVERLAP cull (per-sprite, by screen rect): the
    //       trickier case.  Houses NEAR the tunnel project to
    //       screen positions where their sprite bounding box
    //       overlaps the mouth opening rectangle.  Even with
    //       correct depth ordering, the PNG's transparent padding
    //       around the building structure would let the tunnel
    //       interior show through.  This check is the real fix —
    //       it works regardless of segment distance, catching
    //       large/tall sprites that overlap the mouth from
    //       further out than a fixed segment buffer would cover.
    //
    // (a) is done here; (b) needs the projected size, so it runs
    // after `targetW/targetH` are computed below.
    const firstTunnelN = (this.road?._firstTunnelN ?? -1);
    const tunnelMouthRect = this.road?._tunnelMouthRect ?? null;
    // When the camera is INSIDE a tunnel, "past tunnel" must mean
    // past the EXIT (where the player can see daylight), not past the
    // first tunnel segment (which is right at the camera).  Without
    // this distinction every building past the player got culled
    // mid-tunnel, so the user saw an empty world until they drove out
    // of the exit — Mercer-Island lid tunnel especially, where homes
    // line both sides of the exit.
    const cameraInTunnel = !!this.road?._cameraInTunnel;
    // When the camera is INSIDE a tunnel, do not cull buildings at all
    // — they should render exactly like trees do, naturally occluded
    // (or revealed through the mouth) by the tunnel structure's depth.
    // The earlier behavior culled every building past the first tunnel
    // segment, which is why you could see trees through the exit but
    // never homes.  Outside the tunnel, the facade cull still applies
    // (real facade does occlude buildings behind it).
    const occluderN      = cameraInTunnel ? -1 : firstTunnelN;
    for (let n = 0; n <= 1000 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      const pastTunnel = occluderN >= 0 && n > occluderN;
      for (const sp of seg.sprites) {
        // Skip building/house sprites past the tunnel mouth — fully
        // occluded by the facade.  Collectibles, signs, and tunnel-
        // interior sprites still render.
        if (pastTunnel && (sp.type === 'building' || sp.type === 'house')) {
          // Arm the fade-in: while this structure is hidden behind the
          // tunnel wall, clear any prior reveal stamp so that the frame
          // it first becomes visible again (the instant you exit the
          // mouth) it fades 0→1 over FADE_MS instead of popping in at
          // full opacity.  Cost is one property write per culled sprite.
          sp._fadeInStart = -1;
          continue;
        }
        // Random roadside cop encounters — pick the appropriate police
        // texture (left/right side for parked, back for driving) and let
        // the rest of the pool placement logic handle scaling.
        let copTexKey = null;
        if (sp.copEncounter && !sp.triggered) {
          if (sp.type === 'cop_random_parked') {
            copTexKey = sp.side === 'left'
              ? (this.textures.exists('car_left_police')  ? 'car_left_police'  : 'car_back_police')
              : (this.textures.exists('car_right_police') ? 'car_right_police' : 'car_back_police');
          } else {
            copTexKey = this.textures.exists('car_back_police') ? 'car_back_police' : 'cop_police';
          }
        }
        if (!copTexKey && !sp.texKey) continue;
        if (sp.collected) continue;
        // Pickups (drugs, F12, etc.) are rendered by _renderDrugSprites at a
        // smaller pickup size — skip them here so they don't double-render
        // at building/tree size.
        if (sp.isCollectible) continue;
        const useTexKey = copTexKey ?? sp.texKey;
        if (!this.textures.exists(useTexKey)) continue;
        // Far-sprite perspective scaling.  sampleSurface() clamps
        // positions past DRAW_DIST (380) to the horizon projection, so
        // without intervention every sprite past DRAW_DIST shares the
        // SAME horizon-size + horizon-position.  Two visible artifacts
        // come from this:
        //   (a) Pop-in: sprites snap from horizon-size to real-size
        //       the moment n crosses DRAW_DIST.
        //   (b) Drift: while clamped, the lateral position is the
        //       horizon road-center + horizon-roadHalfW * offset, so
        //       it tracks the horizon's curve sway rather than each
        //       sprite's true per-segment position.  Visually the
        //       sprite "drifts sideways with the curve" then snaps
        //       to its real position at the DRAW_DIST boundary.
        // Fix: apply a manual 1/n perspective falloff (size + lateral
        // anchor toward vanishing point) for sprites past DRAW_DIST.
        // Applied to cranes (huge — visible across the bay) and
        // West Seattle homes (the user noticed the mid-distance snap
        // on the right-side frontage row).
        // NOT applied to general buildings/houses elsewhere — an
        // earlier blanket attempt made other regions' mid-distance
        // rows look gappy.  Add per-region opt-ins if needed.
        const isCrane = typeof useTexKey === 'string' && useTexKey.startsWith('codex_ws_crane_');
        const isWestSeattleHome = typeof useTexKey === 'string'
          && useTexKey.startsWith('west_seattle_');
        // Issaquah/eastside cluster homes are large authored cutouts placed far
        // off the road (offset ~2.75), exactly like the WS homes — they need
        // the SAME far-distance shrink/reposition or, past DRAW_DIST, they pin
        // to the horizon clamp and float in the sky (Preston foothill view).
        const isIssaquahHome = typeof useTexKey === 'string'
          && useTexKey.startsWith('codex_issaquah_');
        // Space Needle — visible from far west (West Seattle Bridge)
        // looking ahead toward downtown.  Treated like the cranes
        // (extended draw distance + 1/n perspective falloff).
        const isSpaceNeedle = useTexKey === 'space_needle';
        const isCitySkyline = (sp.visualMinOffset ?? 0) >= 4.5;
        // DIAGNOSTIC (per user): the far-perspective branch below
        // mutates proj.sx by `proj.roadHalfW * visualOffset * (1 -
        // farDistScale)` once a sprite crosses DRAW_DIST.  That is an
        // approach-dependent lateral shift, and is the prime suspect
        // for the "crowding when close, backing off when far" wobble.
        // Buildings/houses had been opted INTO this branch earlier
        // this session; this diagnostic excludes them again so the
        // wobble can be A/B compared with no other code changes.
        // Cranes / Space Needle / WS homes still use far-perspective
        // (they're authored to depend on it).
        const _isStructureForPerspective = false;     // ← DIAGNOSTIC: was `sp.type === 'building' || 'house'`
        const usesFarPerspective = isCrane || isWestSeattleHome || isSpaceNeedle
                                  || isIssaquahHome || _isStructureForPerspective;
        const farDistScale = (usesFarPerspective && n > DRAW_DIST) ? DRAW_DIST / n : 1;
        // Space Needle gets a longer lookahead than cranes so it pops
        // in at the same player position the cranes do (game start
        // ≈ mile 0) — needle now lives at mile 1.85 (just past the
        // crane stretch) and needs ~2 mi of visibility to reach the
        // player from the bridge approach.
        const farLookahead = isSpaceNeedle ? DRAW_DIST * 9 : DRAW_DIST * 6;
        if ((isCrane || isSpaceNeedle) && n > farLookahead) continue;
        const profile = SCENERY_IMAGE_PROFILES[useTexKey];
        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        let visualOffset = sp.offset;
        const isStructure = sp.type === 'building' || sp.type === 'house';
        if (isStructure) {
          // Use MAX(profile.minOffset, sp.visualMinOffset).  Previously
          // this was `profile?.minOffset ?? sp.visualMinOffset` — a
          // ?? chain that returned profile.minOffset whenever it
          // existed (even small values like 2.05), so the renderer
          // was drawing Bellevue skyline buildings at offset ~2.05
          // even though the spawn set a larger CITY_BUILDING_SETBACK
          // via sp.visualMinOffset.  Collision was using
          // sp.visualMinOffset directly, so the renderer and the
          // collision disagreed on where the building actually was —
          // you saw the building near the road but couldn't crash
          // into it.  Now both pick the LARGER constraint so the
          // setback always wins when it's higher than the profile
          // floor.
          // Floor is now a safety net (1.05 = just past fog line).
          // Real placement is spawn-time via fogLineOffset.
          const profileMin = profile?.minOffset ?? 0;
          const spriteMin  = sp.visualMinOffset ?? 1.05;
          const minOffset  = Math.max(profileMin, spriteMin);
          const sign = visualOffset >= 0 ? 1 : -1;
          visualOffset = sign * Math.max(Math.abs(visualOffset), minOffset);
        }
        // Buildings pass allowClipped so curve/far-clipped segments still
        // return a projection (keeps far rows from blinking out on curves).
        let proj = this.road.sampleSurface?.(
          relZ, visualOffset,
          isStructure ? { allowClipped: true } : undefined
        );
        // Min on-screen size cull.  Default 1.5 px for general scenery;
        // buildings/houses drop to 0.5 px so a continuous house row
        // remains as small specks at the horizon instead of vanishing
        // mid-distance.  Per-sprite override via `minRenderSw` still
        // wins (used by skyline reveals that should fade in late).
        const minRenderSw = sp.minRenderSw ?? (isStructure ? 0.5 : 1.5);
        if (!proj || proj.sw < minRenderSw) continue;
        const structureCrestHidden = isStructure && proj.visible === false;
        if (structureCrestHidden) continue;
        if (used >= pool.length) {
          // Track pool exhaustion across frames so it's visible in F3
          // (and audit logs).  Bellevue + skyline + cycle + cranes can
          // realistically push the 400-slot pool when density is high.
          this._sceneSpritePoolExhausted = (this._sceneSpritePoolExhausted ?? 0) + 1;
          break;
        }
        const s = pool[used++];
        if (s.texture.key !== useTexKey) s.setTexture(useTexKey);
        const tex = this.textures.get(useTexKey).source[0];
        const baseW = tex?.width  || 64;
        const baseH = tex?.height || 64;
        const isTree     = sp.type === 'tree' || sp.type === 'cactus' || sp.type === 'palm' || sp.type === 'shrub';
        const isLandmark = sp.type === 'landmark';
        const isCopRand  = sp.copEncounter === true;
        const isCopParked = sp.type === 'cop_random_parked';
        const sizeMult   = sp.sizeMult
                         ?? (isCopParked ? 2.38            // 1.7× the 1.4 base — parked roadside trap reads bigger
                           : isCopRand ? 1.4
                           : isLandmark ? 5.5
                           : isTree ? 2.0
                           : 2.6);
        const heightBoost = sp.heightBoost ?? 1;
        let targetW;
        let targetH;
        // UNIFIED structure scaling — every building/house scales its
        // size strictly off proj.sw (the ground-line projection width)
        // and its texture aspect ratio, period.  This removes the
        // width-led vs height-led split that made adjacent asset
        // types expand at different rates with depth and visually
        // drift relative to each other.  If only widthMult exists,
        // it's converted to an equivalent heightMult so the math goes
        // through the same code path.  Non-structures keep the
        // original two-path logic.
        if (isStructure) {
          const unifiedMult = profile?.heightMult
            ?? (profile?.widthMult ? profile.widthMult * (baseH / baseW) : sizeMult);
          targetH = proj.sw * unifiedMult;
          targetW = targetH * (baseW / baseH);
        } else if (profile?.heightMult) {
          targetH = proj.sw * profile.heightMult;
          targetW = targetH * (baseW / baseH);
        } else {
          targetW = proj.sw * (profile?.widthMult ?? sizeMult);
          targetH = targetW * (baseH / baseW);
        }
        targetW *= heightBoost;
        targetH *= heightBoost;
        // Cranes past DRAW_DIST: shrink linearly with 1/n perspective
        // so they read as small distant objects, not horizon-sized
        // cutouts.  Also pull screen X toward the vanishing point by
        // the same factor — sampleSurface uses sx = roadCenterX +
        // roadHalfW * laneOffset, so the lateral component (roadHalfW
        // * visualOffset) is what needs to scale.  Without this,
        // cranes would shrink in place but stay at their DRAW_DIST-
        // projected X, then "creep" outward toward their true world
        // position as they cross DRAW_DIST.
        if (usesFarPerspective && farDistScale < 1) {
          targetW *= farDistScale;
          targetH *= farDistScale;
          if (proj.roadHalfW) {
            proj.sx -= proj.roadHalfW * visualOffset * (1 - farDistScale);
          }
        }
        const maxW = profile?.maxW
          ?? (isCopParked ? SCREEN_W * 0.306    // 1.7× the 0.18 cap so the larger parked trap isn't clipped up close
            : isCopRand ? SCREEN_W * 0.18 : isTree ? SCREEN_W * 0.20 : SCREEN_W * 0.42);
        const maxH = profile?.maxH
          ?? (isCopParked ? SCREEN_H * 0.306
            : isCopRand ? SCREEN_H * 0.18
            : isTree ? SCREEN_H * 0.44
            : sp.type === 'house' ? SCREEN_H * 0.36
            : SCREEN_H * 0.68);
        // Do not cap fixed frontage: the fixed center offset and the image
        // width must scale together or the inner edge appears to recede.
        // Skip the cap for ALL structures (not just roadEdgeGapCars
        // sprites) — different assets hitting maxW vs maxH at different
        // depths is what was making neighbouring buildings expand at
        // mismatched rates and visually drift past each other.
        const shrink = (Number.isFinite(sp.roadEdgeGapCars) || isStructure)
          ? 1
          : Math.min(1, (maxW * heightBoost) / Math.max(1, targetW), (maxH * heightBoost) / Math.max(1, targetH));
        targetW *= shrink;
        targetH *= shrink;
        if (sp.rampClearance && proj.roadHalfW > 1) {
          // Push past the FULL ramp extent (rs=1) regardless of this
          // segment's rampStrength.  Previously gated on rs > 0.30,
          // which left homes spawned at the START of the ramp window
          // (mile-0.86 etc.) un-pushed for their first ~0.7 mi — their
          // own segment's rs was still ~0.14, below threshold, so they
          // stayed at the spawn offset (~2.05) all the way through the
          // approach until the player was nearly on top of them.  By
          // using the max ramp extent always, every rampClearance home
          // sits behind the ramp's fully diverged outer edge from the
          // moment it appears on screen.
          const sign = visualOffset >= 0 ? 1 : -1;
          const rampOuterEdge = 1 + 3.30;   // Road.js full divergence: gap 2.05 + width 1.25
          const visibleHalfWidth = (targetW * 0.5) / proj.roadHalfW;
          const neededOffset = rampOuterEdge + 0.30 + visibleHalfWidth;
          if (Math.abs(visualOffset) < neededOffset) {
            visualOffset = sign * neededOffset;
            const shifted = this.road.sampleSurface?.(
              relZ, visualOffset,
              isStructure ? { allowClipped: true } : undefined
            );
            if (!shifted) continue;
            proj = shifted;
          }
          // Small screen-space nudge so ramp homes clear the
          // shoulder/sidewalk without flying off into horizon-distance.
          // Sign-aware: each side pushes outward.
          const screenSign = visualOffset >= 0 ? 1 : -1;
          proj.sx += 80 * screenSign;
          targetW *= 0.88;
          targetH *= 0.88;
        }
        // West Seattle homes and city skyline buildings use authored
        // setbacks and must NOT be pushed by the dynamic
        // road-clearance rule below.  That rule recomputes a per-frame
        // "needed offset" based on projected road half-width and
        // sprite width. For Bellevue towers this made the buildings
        // visibly "dip" away from the car right before collision.
        // rampClearance sprites are also excluded — they already got
        // their own gore-clearance push above (including a +80 px
        // screen-space nudge) and a second re-sample here would drop
        // the proj.sx adjust on the floor.
        // Structures (building / house) bypass the dynamic clearance
        // push so their spawn-time visualOffset stays 100 % locked.
        // The push computed a per-frame `neededOffset` from the
        // projected sprite width, then re-sampled the road surface at
        // the new offset and overrode `proj.sx` — which made the
        // building visibly slide laterally as it approached.  Spawn
        // code already places buildings at a designed setback via
        // `fogLineOffset`; that authored offset is what we want to
        // honour all the way in.
        if (!isCopRand && !isWestSeattleHome && !isCitySkyline
            && !Number.isFinite(sp.roadEdgeGapCars)
            && !sp.rampClearance
            && sp.type !== 'building' && sp.type !== 'house'
            && proj.roadHalfW > 1) {
          const sign = visualOffset >= 0 ? 1 : -1;
          const clearPx = proj.sw * SCENERY_ROAD_CLEARANCE_CAR_LENGTHS;
          const neededOffset = 1 + (targetW * 0.5 + clearPx) / proj.roadHalfW;
          if (Math.abs(visualOffset) < neededOffset) {
            visualOffset = sign * neededOffset;
            const shifted = this.road.sampleSurface?.(
              relZ, visualOffset,
              isStructure ? { allowClipped: true } : undefined
            );
            if (!shifted) continue;
            proj = shifted;
          }
        }
        // (b) MOUTH-OVERLAP cull — only applies to buildings/houses
        // whose SEGMENT is close to the tunnel in world space (within
        // ~100 segs ≈ 0.05 mi).  Earlier this fired on ANY building
        // whose screen bounding box happened to touch the mouth rect,
        // which killed distant Mercer Island houses that project near
        // the horizon (right where the tunnel mouth also projects)
        // even though they're 0.2+ mi closer than the tunnel.  Now
        // the cull is bounded: a house 0.3 mi before the tunnel
        // stays visible (it doesn't visually overlap the mouth
        // structure-wise, only at the horizon edge), while a house
        // ~50 segs before the tunnel — whose PNG padding actually
        // touches the mouth opening at the same screen position —
        // gets culled to prevent see-through.
        const nearTunnelWorld = firstTunnelN >= 0
          && Math.abs(n - firstTunnelN) <= 100;
        if (tunnelMouthRect && nearTunnelWorld
            && (sp.type === 'building' || sp.type === 'house')) {
          const bx1 = proj.sx - targetW / 2;
          const bx2 = proj.sx + targetW / 2;
          const by1 = proj.sy - targetH;
          const by2 = proj.sy;
          const r = tunnelMouthRect;
          const overlaps = bx1 < r.x + r.w
                        && bx2 > r.x
                        && by1 < r.y + r.h
                        && by2 > r.y;
          if (overlaps) {
            used--;                // release the pool slot we took
            s.setVisible(false);
            continue;
          }
        }
        // Unified depth scheme — see _renderVehicles. Buildings/trees and
        // cars now share one band so a car between camera and a near
        // building correctly paints in front of the further building.
        // (Reuses relZ from above — was computed twice unnecessarily.)
        // Per-sprite renderDepth override (e.g., cranes use a low depth
        // so the bridge's water/structure paints over them, making the
        // bridge act as an occluder); fall back to the depth ramp.
        const depth = sp.renderDepth ?? (9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5);
        // Auto-mirror any building/house placed on the LEFT side of the
        // road.  EVERY scenery PNG is authored as a right-side building
        // (per user convention) — `_left` / `_right` suffixes are just
        // cosmetic file names, the art is always right-side.  The
        // renderer therefore flips left-side instances unconditionally.
        const autoFlipLeft = (sp.type === 'building' || sp.type === 'house')
          && (sp.offset ?? 0) < 0;
        // Shrubs may carry a brief lateral kick from a recent player
        // glance — visibly displace the sprite a few pixels in the
        // kick direction, decaying linearly back to 0 over the kick
        // window.  Magnitude scales with projected width so close
        // shrubs lean more than tiny far-away ones.
        let kickPx = 0;
        if (sp.type === 'shrub' && sp.kickUntil) {
          const _kNow = this.time?.now ?? 0;
          if (_kNow < sp.kickUntil) {
            const remain = (sp.kickUntil - _kNow) / 400;          // 1 → 0 over 400ms
            kickPx = (sp.kickDir ?? 0) * targetW * 0.12 * remain;
          } else {
            sp.kickDir   = 0;
            sp.kickUntil = 0;
          }
        }
        // Distance-based fade-in for structures so they materialize
        // smoothly instead of popping in at full opacity.  Two triggers,
        // both keyed on a per-sprite reveal timestamp (sp._fadeInStart):
        //   • Tunnel exit: the past-tunnel cull above stamps -1 while a
        //     home is hidden behind the mouth, so the frame it first
        //     renders again it fades 0→1 (no hard snap on tunnel exit).
        //   • Draw-range entry: a structure that first appears anywhere
        //     also fades, smoothing the far-plane / curve-reveal pop.
        // Non-structures (trees, cops, landmarks) keep full opacity.
        // The tunnel facade (depth 9.82) still occludes everything past
        // the mouth regardless of alpha, so this never makes the tunnel
        // see-through — a faded home behind the wall is still painted
        // over by the opaque concrete facade.
        let fadeAlpha = 1;
        const isFadeStructure = sp.type === 'building' || sp.type === 'house';
        if (isFadeStructure) {
          const FADE_MS = 450;
          // Phaser's monotonic clock — ticks every frame regardless of
          // the run state.  Previously this used `this.gameTime`, which
          // only starts advancing after the first L/R/SPACE input (the
          // ready-state freeze).  That stamped `_fadeInStart = 0` on
          // every first-seen building and left `fadeAlpha = 0` for the
          // entire pre-input window — so buildings WERE rendered but
          // invisible, and pressing L/R or pause/unpause (SPACE) was
          // the trigger that started the fade ticking.  Using
          // `this.time.now` decouples the fade from input state.
          const nowMs = this.time?.now ?? 0;
          // (Re)arm when unseen this stretch: a fresh sprite has no stamp,
          // and the tunnel cull stamps -1 to force a re-fade on reveal.
          if (sp._fadeInStart == null || sp._fadeInStart < 0) {
            sp._fadeInStart = nowMs;
          }
          const elapsed = nowMs - sp._fadeInStart;
          fadeAlpha = elapsed >= FADE_MS ? 1 : Math.max(0, elapsed / FADE_MS);
        }
        // ─── Painted-edge invariant for structures ────────────────
        // Per user algorithm: the painted ROAD-FACING edge of every
        // building/house must remain a FIXED projected gap outside
        // the projected road edge every frame.  The sprite CENTER is
        // not the authority — proj.sx is replaced by a center that
        // back-solves from the desired painted edge position.
        //
        // 1. Road center recovered from the same projection sample
        //    that produced proj.sx (works even when curve + roadScale
        //    skew the projection).
        // 2. Projected road edge = centerX + sign × roadHalfW.
        // 3. Desired painted inner edge = roadEdgeX + sign × gapPx,
        //    where gapPx is the spawn-time gapCars × proj.sw (so the
        //    gap is in CAR-LENGTH units, matching the original
        //    fogLineOffset spec).
        // 4. innerEdgeFrac is the screen-space U-coordinate (0..1
        //    across the sprite frame) of the painted road-facing
        //    edge after autoFlipLeft is applied:
        //      - sign≥0 (right side, no flip): leftFrac of texture
        //      - sign<0 with flip:               1 − leftFrac  (mirror)
        //      - sign<0 no flip (_left variant): rightFrac
        // 5. spriteCenterX = desiredInnerEdgeX − (innerEdgeFrac − 0.5) × targetW.
        // 6. Same bbox is used for collision (see _checkCollisions).
        //
        // Non-structures keep the original proj.sx (trees, cops, etc).
        let _renderX = proj.sx + kickPx;
        // Painted-edge invariant — opt-in via sp.roadEdgeGapCars.
        // Sprites without an authored gap (cranes, Space Needle, etc.)
        // keep their legacy proj.sx-driven placement so their special
        // far-perspective behavior isn't broken.
        // ALSO SKIP for sprites carrying the rest-stop ramp-clearance
        // flag — those have visualOffset mutated to ~5.4 lanes by the
        // ramp push block, which is far outside the painted-edge
        // invariant's frame of reference.  The legacy ramp push
        // handles their lateral placement.
        if (isStructure && proj.roadHalfW > 1
            && Number.isFinite(sp.roadEdgeGapCars)
            && !sp.rampClearance) {
          const sign = (visualOffset >= 0) ? 1 : -1;
          const centerX = proj.sx - proj.roadHalfW * visualOffset;
          const roadEdgeX = centerX + sign * proj.roadHalfW;
          const gapCars = sp.roadEdgeGapCars;
          const gapPx = proj.sw * gapCars;
          const desiredInnerEdgeX = roadEdgeX + sign * gapPx;
          const bbox = STRUCTURE_BBOX[useTexKey] ?? STRUCTURE_BBOX_DEFAULT;
          // Every PNG is authored as a right-side building, so flip is
          // determined purely by which side this sprite spawned on.
          const flipped = autoFlipLeft;
          let innerEdgeFrac;
          if (sign >= 0) {
            innerEdgeFrac = bbox.leftFrac;
          } else if (flipped) {
            innerEdgeFrac = 1 - bbox.leftFrac;
          } else {
            innerEdgeFrac = bbox.rightFrac;
          }
          _renderX = desiredInnerEdgeX - (innerEdgeFrac - 0.5) * targetW + kickPx;
          // Stash for the F2 debug overlay + collision parity.
          sp._dbgRoadEdgeX        = roadEdgeX;
          sp._dbgDesiredInnerEdgeX = desiredInnerEdgeX;
          sp._dbgInnerEdgeFrac    = innerEdgeFrac;
          sp._dbgPaintedHalfL     = (innerEdgeFrac - bbox.leftFrac)  * targetW;  // for left painted edge
          sp._dbgPaintedHalfR     = (bbox.rightFrac - innerEdgeFrac) * targetW;  // for right painted edge
          sp._dbgRenderX          = _renderX;
          // G — dump row collection.  Only on the specific frame the
          // user requested a dump, so the steady-state cost is zero.
          if (this._peDumpRowsThisFrame) {
            this._peDumpRowsThisFrame.push({
              tex:        useTexKey,
              sp_off:     +sp.offset.toFixed(3),
              vis_off:    +visualOffset.toFixed(3),
              sign,
              flipped: flipped ? 1 : 0,
              proj_sx:    +proj.sx.toFixed(1),
              roadHalfW:  +proj.roadHalfW.toFixed(1),
              centerX:    +centerX.toFixed(1),
              roadEdgeX:  +roadEdgeX.toFixed(1),
              gapCars:    sp.roadEdgeGapCars,
              gapPx:      +gapPx.toFixed(1),
              desiredInner: +desiredInnerEdgeX.toFixed(1),
              targetW:    +targetW.toFixed(1),
              bboxL:      bbox.leftFrac,
              bboxR:      bbox.rightFrac,
              innerFrac:  +innerEdgeFrac.toFixed(4),
              renderX:    +_renderX.toFixed(1),
              n,
            });
          }
          // F2 painted-edge overlay — independent of F3.  Lines drawn
          // here using the SAME values the renderer is about to apply,
          // so there can be no divergence between "what the algorithm
          // thinks" and "what the renderer draws."
          if (this._paintedEdgeDebugOn && this._paintedEdgeGfx) {
            const pg = this._paintedEdgeGfx;
            const topY = proj.sy - targetH;
            const botY = proj.sy + 8;
            // Yellow: projected road edge
            pg.lineStyle(3, 0xFFFF00, 0.95);
            pg.lineBetween(roadEdgeX, topY, roadEdgeX, botY);
            // Cyan FIRST (drawn TALLER): actual painted inner edge.
            // Read from the SAME computation the renderer used, so
            // cyan = where the painted edge IS being drawn.
            const paintedW = (bbox.rightFrac - bbox.leftFrac) * targetW;
            const actualInnerEdgeX = sign >= 0
              ? desiredInnerEdgeX
              : desiredInnerEdgeX;  // both — they coincide by construction
            pg.lineStyle(3, 0x00FFFF, 0.95);
            pg.lineBetween(actualInnerEdgeX, topY - 18, actualInnerEdgeX, botY + 18);
            // Magenta ON TOP: desired painted inner edge.
            pg.lineStyle(3, 0xFF00FF, 0.95);
            pg.lineBetween(desiredInnerEdgeX, topY, desiredInnerEdgeX, botY);
            // Optional: paint the FAR painted edge in dim cyan so the
            // user can see the full painted footprint of the sprite.
            const farEdgeX = sign >= 0
              ? desiredInnerEdgeX + paintedW
              : desiredInnerEdgeX - paintedW;
            pg.lineStyle(2, 0x00CCCC, 0.45);
            pg.lineBetween(farEdgeX, topY, farEdgeX, botY);
          }
        }
        const spriteBaseY = proj.sy + targetH * (profile?.groundDrop ?? 0);
        s.setCrop();
        s.setPosition(_renderX, spriteBaseY)
          .setDisplaySize(targetW, targetH)
          .setDepth(depth)
          .setAlpha(fadeAlpha)
          .setFlipX(!!sp.flipX || autoFlipLeft || isCopParked)   // parked cop flips to face the road (both shoulders)
          .setVisible(true);
        // ── Per-sprite crest occlusion (clip, not a screen-space band) ──
        // A structure beyond a hill crest must be hidden by the hill for
        // the part of it BELOW the crest silhouette; otherwise its lower
        // half floats over the gap the crest-cull leaves.  crestClipY()
        // returns that silhouette's screen-Y; with the sprite's bottom-
        // centre origin, cropping the texture to keep only the TOP portion
        // lands the visible bottom edge exactly on the crest line (the
        // sink-crop's "flies up" behaviour — which here is what we want, so
        // no compensating shift).  Authored far-perspective art (cranes /
        // Space Needle / city skyline) lives above the horizon and is
        // excluded.  The setCrop() reset above clears this on non-clipped
        // frames as pool slots are reused.
        if (isStructure && !isCrane && !isSpaceNeedle && !isCitySkyline) {
          const crestY = this.road.crestClipY?.(relZ);
          // Only clip when a nearer crest is clearly ABOVE the structure's
          // true ground line (proj.sy).  Flat / climbing terrain keeps the
          // nearest ground BELOW the base, so this never fires there.
          if (Number.isFinite(crestY) && crestY < proj.sy - 6) {
            const clipPx = spriteBaseY - crestY;   // display px hidden by the hill
            if (clipPx >= targetH - 1) {
              s.setVisible(false);                 // wholly behind the crest
            } else if (clipPx > 0) {
              const visibleTexH = Math.max(1, Math.round(baseH * (1 - clipPx / targetH)));
              s.setCrop(0, 0, baseW, visibleTexH); // keep top, hide bottom at the crest line
            }
          }
        }
        // Wind sway — trees/shrubs lean + oscillate.  Origin (0.5,1) pivots
        // at the trunk base so the canopy swings, not the whole stamp.
        // Scales with wind strength (huge in Vantage) over a gentle baseline.
        // Reset to 0 for non-trees since the pooled sprite is reused.
        s.setRotation(isTree ? this._treeSwayRot(sp, _windSway) : 0);
        // Apply night-tint (or clear it on a day-side region) — only
        // update if changed to avoid touching dirty flag every frame.
        if (s.tintTopLeft !== _scnTint || s.tintFill !== false) s.setTint(_scnTint);
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
    for (let i = usedPlanes; i < planePool.length; i++) planePool[i].setVisible(false);
    this._renderedSpriteCount = used;
    // G — flush the painted-edge dump after the loop so the rows are
    // in render order (near → far is how the loop walks).
    if (this._peDumpRowsThisFrame) {
      const rows = this._peDumpRowsThisFrame;
      this._peDumpRowsThisFrame = null;
      console.log('[painted-edge] ' + rows.length + ' visible structures (near→far):');
      console.table(rows);
      console.log('────── end dump ──────');
    }
  }

  /** Paint actual letters on the green / brown highway signs.  The Road
   *  Graphics layer draws the sign shapes (green face, white plates,
   *  yellow flags) but can't render text — this overlay places Phaser
   *  Text objects on each plate, sized + positioned to match the sign
   *  geometry as it scales with perspective. */
  _renderSignText() {
    const segs = this.road.segments;
    if (!segs?.length) return;

    if (!this._signTextPool) {
      this._signTextPool = [];
      for (let i = 0; i < 120; i++) {
        const t = this.add.text(0, 0, '', {
          fontSize: '12px', fontFamily: '"Helvetica Neue", Arial, sans-serif',
          fontStyle: 'bold',
          color: '#000000', align: 'center', resolution: 2,
        }).setOrigin(0.5).setVisible(false);
        this._signTextPool.push(t);
        this._worldObjects?.push(t);
        // CRITICAL: this pool is lazy-initialized AFTER create() finished
        // setting up cameras.  Phaser's _uiCam.ignore(this._worldObjects)
        // was called once with the (then-empty) array — pushing new
        // objects to that array now does NOT update the camera's ignore
        // set.  Without an explicit ignore call here, every text label
        // is rendered by BOTH the main camera AND the UI camera, which
        // is exactly what produces the "doubled sign text" the user has
        // been seeing.
        this._uiCam?.ignore?.(t);
      }
    }
    const pool = this._signTextPool;
    let used   = 0;

    // Drunk-only sign-text drift: at full alcohol bar (1.0), text starts
    // wandering off the sign as a "you can't read it anymore" gag.  Below
    // 100 % the text is rock-solid anchored.
    const alc = this.drugs?.get?.(DRUGS.ALCOHOL) ?? 0;
    const drunkDrift = alc >= 1.0 ? 1.0 : 0;
    const tNow       = (this.gameTime ?? 0);

    /** Place a text label, shrinking the font if it would overflow `maxW`.
     *  This keeps long town names like "MERCER ISLAND" inside the sign
     *  without manually tuning per-string.  Defensive against destroyed
     *  pool entries (scene restart) and NaN font sizes. */
    const place = (text, color, cx, cy, baseFontSize, maxW, depth) => {
      if (used >= pool.length) return;
      const t = pool[used++];
      // Skip if Phaser has destroyed this Text behind our back — its
      // internal canvas goes null and setText would crash with
      // "Cannot read properties of null (reading 'drawImage')".
      if (!t || !t.scene || t.canvas == null) return;
      const safeText = String(text ?? '');
      if (!safeText.length) { t.setVisible(false); return; }
      // Helvetica Neue Bold avg char width ~0.62 × font size.
      const estCharW = 0.62;
      const MIN_FS   = 2;
      const estW     = safeText.length * baseFontSize * estCharW;
      const shrunk   = estW > maxW ? maxW / (safeText.length * estCharW) : baseFontSize;
      const fs       = Math.max(MIN_FS, Math.round(shrunk || baseFontSize));
      // At far distances, allow very small text to remain visible as
      // sign markings instead of making the sign look blank. If it still
      // cannot fit, clip conceptually by shrinking harder rather than
      // hiding the label.
      const widthAtFs = safeText.length * fs * estCharW;
      const finalFs = widthAtFs > maxW
        ? Math.max(1, Math.floor(maxW / Math.max(1, safeText.length * estCharW)))
        : fs;
      // Drift offset — 0 unless 100 % drunk.  Small per-text seed makes
      // each label wander independently so the sign looks chaotic.
      let dx = 0, dy = 0;
      if (drunkDrift > 0) {
        const seed = (used * 1.7 + safeText.length * 0.3);
        dx = Math.sin(tNow * 1.4 + seed) * baseFontSize * 0.9;
        dy = Math.cos(tNow * 1.1 + seed * 1.3) * baseFontSize * 0.7;
      }
      try {
        t.setText(safeText)
         .setStyle({ fontSize: `${finalFs}px`, color, fontFamily: '"Helvetica Neue", Arial, sans-serif', fontStyle: 'bold' })
         .setPosition(cx + dx, cy + dy)
         .setDepth(depth)
         .setVisible(true);
      } catch (_) {
        // Text in a bad internal state — hide and move on rather than
        // taking down the frame.
        t.setVisible?.(false);
      }
    };

    // Cockpit forward-bias: sign text + decals must use the same
    // camera Z as the sign GRAPHIC (rendered through Road.js which
    // received the biased playerPos).  Without this, the text drifts
    // off the sign in cockpit mode.
    const startSeg = Math.floor(this._renderCamPos() / SEG_LENGTH);
    for (let n = 0; n <= 380 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected) continue;
        const t = sp.type;
        if (t !== 'rest_sign' && t !== 'exit_sign_green' && t !== 'amenities_sign'
         && t !== 'next_stops_sign' && t !== 'mileage_sign' && t !== 'grade_sign') continue;

        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        // Gate on a VALID projection only — the signW cutoff below is the real
        // LOD throttle.  The old `proj.sw < 4` gate was far stricter than the
        // Road.js frame's `spriteH >= 1`, so the green/white sign FACE appeared
        // a long way before its text/logo, reading as a "blank sign that fills
        // in up close."  Letting signW govern keeps text+frame in lockstep.
        if (!proj || proj.sw <= 0) continue;

        // Convert vehicle-projection (sized for an 825-unit car body) to
        // sign size:  signW = baseW * proj.sw * 0.5 / 825.
        const signW = proj.sw * (sp.baseW / 825) * 0.5;
        const signH = proj.sw * (sp.baseH / 825) * 0.5;
        // Text draws whenever the sign frame is at all visible.  The
        // Road.js sign frame is painted at any sub-pixel width via
        // fillRect, so cutting the text at signW < 1 left a perceivable
        // "frame in distance, text fills in later" stage on approach
        // (especially noticeable on the big Vantage exit sign — the
        // green face shows but the EXIT label fades in late).  Drop the
        // cutoff to 0.25 so text starts placing the moment the frame
        // becomes more than a couple of subpixels wide.
        if (signW < 0.25) continue;

        const cx   = proj.sx;
        const topY = proj.sy - signH;
        // Per-sign dynamic depth — mirrors the scene-sprite ramp so
        // closer trees/buildings naturally occlude distant sign text
        // (previously fixed at 9.9 which forced sign text above ALL
        // scenery, producing "see signs through homes").  +0.12 keeps
        // sign text just above its sign frame (frame uses +0.10).
        const depth = (9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5) + 0.12;

        if (t === 'rest_sign') {
          // White text directly on the green face — header + distance row.
          // Yellow flag (when present) gets black text since it sits on yellow.
          place('REST STOP', '#FFFFFF', cx, topY + signH * 0.18,
                signW * 0.20, signW * 1.06, depth);
          if (sp.sub === '5mi') {
            place('5 MI', '#FFFFFF', cx, topY + signH * 0.38,
                  signW * 0.24, signW * 0.90, depth);
          } else if (sp.sub === '1mi') {
            place('1 MI',     '#FFFFFF', cx, topY + signH * 0.38,
                  signW * 0.24, signW * 0.90, depth);
            place('NEXT EXIT','#000000', cx, topY - signH * 0.05,
                  signW * 0.18, signW * 0.58, depth);
          } else {
            place('EXIT', '#000000', cx, topY - signH * 0.05,
                  signW * 0.20, signW * 0.58, depth);
          }
        } else if (t === 'exit_sign_green') {
          const town  = String(sp.townName ?? '').toUpperCase();
          // Label convention (2026-05-30):
          //  • Rest-stop signs   → "EXIT XX" (real-world WSDOT exit number
          //                        from sp.exitLabel, e.g. "Exit 7B").
          //  • Pass-through cities (no rest stop) → "MILE XX" where XX is
          //                        the in-game mileage, since the sign
          //                        doesn't lead to a save-point exit.
          const _miNum  = (sp.mileage != null) ? Math.round(sp.mileage) : '';
          const exitLbl = sp.passThrough
            ? `MILE ${_miNum}`
            : String(sp.exitLabel ?? sp.exitNum ?? `EXIT ${_miNum}`).toUpperCase();
          // Real-highway sign format: yellow REST STOP plaque on top, the
          // exit label + town below.  Highway-shield badge in the top-left
          // of the green face is overlaid as an Image by _renderSignDecals.
          // Pass-through cities (no rest stop at this exit) drop the
          // plaque text — Road.js skips the yellow rect for the same flag.
          // Font multipliers dropped ~20% (2026-05-30) after the sign
          // frame was bumped 33% — without this scale-down PRESTON / EXIT
          // filled the full sign width and looked oversized.
          if (!sp.passThrough) {
            place('REST STOP', '#000000', cx, topY - signH * 0.09,
                  signW * 0.16, signW * 0.78, depth);
          }
          // EXIT label is on the same row as the shield, so it stays
          // shifted right to clear the badge.
          place(exitLbl, '#FFFFFF', cx + signW * 0.12, topY + signH * 0.20,
                signW * 0.22, signW * 0.62, depth);
          // Town text — multi-word names get split into TWO LINES so
          // each line renders at full font size instead of being
          // auto-shrunk to fit one row (which made "MERCER ISLAND" /
          // "SNOQUALMIE PASS" / etc. unreadable).  Town text is
          // centered on the green face since the shield is in the
          // upper half — the bottom half is clear so we can use the
          // full sign width.
          // Town text vertical position (2026-05-30): raised so the town
          // sits centered between the EXIT row (signH * 0.20) and the
          // sign's bottom border (signH * 0.70) — center at ~0.45.
          // Multi-line: lines at 0.37 / 0.53 (gap 0.16, centered on 0.45).
          // Single-word: centered on 0.45.
          const townWords = town.split(/\s+/).filter(Boolean);
          if (townWords.length >= 2) {
            const mid = Math.ceil(townWords.length / 2);
            const line1 = townWords.slice(0, mid).join(' ');
            const line2 = townWords.slice(mid).join(' ');
            place(line1, '#FFFFFF', cx, topY + signH * 0.37,
                  signW * 0.18, signW * 1.16, depth);
            place(line2, '#FFFFFF', cx, topY + signH * 0.53,
                  signW * 0.18, signW * 1.16, depth);
          } else {
            place(town, '#FFFFFF', cx, topY + signH * 0.45,
                  signW * 0.24, signW * 1.16, depth);
          }
        } else if (t === 'amenities_sign') {
          // Sign face is a pre-baked PNG with the header text + brand
          // logos already burned in — _renderSignDecals draws the texture.
        } else if (t === 'next_stops_sign') {
          // Header + 3 rows of "<town>   <mi> MI" painted directly on the green face.
          place('NEXT EXITS', '#FFFFFF', cx, topY - signH * 0.06,
                signW * 0.16, signW * 0.78, depth);
          const rows = sp.rows ?? [];
          for (let r = 0; r < Math.min(3, rows.length); r++) {
            const row = rows[r];
            const town = String(row.name ?? '').toUpperCase();
            const mi   = String(row.mi ?? '');
            const yRow = topY + signH * (0.12 + r * 0.18);
            place(town, '#FFFFFF', cx - signW * 0.18, yRow,
                  signW * 0.16, signW * 0.62, depth);
            place(`${mi} MI`, '#FFFFFF', cx + signW * 0.32, yRow,
                  signW * 0.16, signW * 0.34, depth);
          }
        } else if (t === 'mileage_sign') {
          const town  = String(sp.townName ?? '').toUpperCase();
          // Mileage rounded — sign labels never display decimals.
          const mileN = (sp.mileage != null) ? String(Math.round(sp.mileage)) : '';
          // Two rows kept INSIDE the green face.
          if (mileN) place(`MILE ${mileN}`, '#FFFFFF', cx, topY + signH * 0.16,
                signW * 0.18, signW * 0.78, depth);
          place(town, '#FFFFFF', cx, topY + signH * 0.38,
                signW * 0.20, signW * 0.82, depth);
        } else if (t === 'grade_sign') {
          // Two-line yellow warning — black text on the yellow face.
          const line1 = String(sp.line1 ?? '').toUpperCase();
          const line2 = String(sp.line2 ?? '').toUpperCase();
          if (line1) place(line1, '#000000', cx, topY + signH * 0.18,
                signW * 0.20, signW * 0.85, depth);
          if (line2) place(line2, '#000000', cx, topY + signH * 0.40,
                signW * 0.18, signW * 0.85, depth);
        }
      }
    }

    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
  }

  /** Overlay textured decals on top of the Graphics-drawn signs:
   *    • exit_sign_green → highway shield (top-left of green face)
   *    • amenities_sign  → up to 4 brand-logo placards on the blue face
   *  Lazy pool of Phaser Images, recycled per frame like _signTextPool. */
  _renderSignDecals() {
    const segs = this.road.segments;
    if (!segs?.length) return;

    if (!this._signDecalPool) {
      this._signDecalPool = [];
      for (let i = 0; i < 80; i++) {
        const img = this.add.image(0, 0, 'hwy_i90')
          .setOrigin(0.5)
          .setVisible(false);
        this._signDecalPool.push(img);
        this._worldObjects?.push(img);
        this._uiCam?.ignore?.(img);
      }
    }
    const pool = this._signDecalPool;
    let used = 0;

    const place = (texKey, cx, cy, w, h, depth, alpha = 1) => {
      if (used >= pool.length) return;
      if (!texKey || !this.textures.exists(texKey)) return;
      const img = pool[used++];
      if (!img || !img.scene) return;
      if (img.texture.key !== texKey) img.setTexture(texKey);
      img.setPosition(cx, cy)
         .setDisplaySize(w, h)
         .setDepth(depth)
         .setAlpha(alpha)
         .setVisible(true);
    };

    // Cockpit forward-bias: sign text + decals must use the same
    // camera Z as the sign GRAPHIC (rendered through Road.js which
    // received the biased playerPos).  Without this, the text drifts
    // off the sign in cockpit mode.
    const startSeg = Math.floor(this._renderCamPos() / SEG_LENGTH);
    for (let n = 0; n <= 380 && used < pool.length; n++) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (sp.collected) continue;
        if (sp.type !== 'exit_sign_green' && sp.type !== 'amenities_sign') continue;

        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        // Valid-projection gate only — signW cutoff below is the LOD throttle.
        // The old `proj.sw < 4` left the white amenities FRAME on screen long
        // before its logo PNG (frame draws at spriteH >= 1, much farther), the
        // "white sign until you're close" bug.  Logos now appear with the frame.
        if (!proj || proj.sw <= 0) continue;

        const signW = proj.sw * (sp.baseW / 825) * 0.5;
        const signH = proj.sw * (sp.baseH / 825) * 0.5;
        // Decals draw whenever the sign frame is visible at all — the
        // frame itself (white amenities placard / green exit sign face)
        // is drawn by Road.js even at sub-pixel sizes, so cutting the
        // decals at signW < 2 produced a "white-only sign" stage on
        // approach that read as the asset half-loading.  Threshold
        // lowered 2 → 0.5 so the shield / brand logos appear at the
        // same instant the frame does.
        if (signW < 0.5) continue;
        const decalAlpha = 1;

        const cx   = proj.sx;
        const topY = proj.sy - signH;
        // Per-sign dynamic depth — mirrors the sign-text ramp so
        // shield/brand decals sit just above their sign text at the
        // same world distance, and closer scenery still occludes
        // distant decals.  +0.14 keeps decals just above their text
        // (text uses +0.12; frame uses +0.10).
        const depth = (9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5) + 0.14;

        if (sp.type === 'exit_sign_green' && sp.hwyKey) {
          // Highway shield anchored to the UPPER-LEFT corner of the
          // green face.  padX 0.04 → 0.015 (2026-05-30) per user
          // direction — nudges the shield ~3-5 px left so it sits
          // tighter to the sign's white border without touching it.
          // padY unchanged so vertical alignment with EXIT row holds.
          const badgeSize = signH * 0.24;
          const padX      = signW * 0.015;
          const padY      = signH * 0.04;
          const badgeX    = cx - signW * 0.5 + badgeSize * 0.5 + padX;
          const badgeY    = topY + badgeSize * 0.5 + padY;
          place(sp.hwyKey, badgeX, badgeY, badgeSize, badgeSize, depth, decalAlpha);
        } else if (sp.type === 'amenities_sign' && sp.signKey) {
          // Pre-baked "SHOPPING - NEXT RIGHT" PNG — preserve the
          // source 1277:840 ≈ 1.52:1 aspect.  Bumped from 1.20→1.55
          // so the brand logos fill more of the white frame and are
          // readable from approach distance.
          const pngW   = signW * 1.55;
          const pngH   = pngW / 1.52;          // preserve source aspect
          const pngCy  = topY + signW * 0.395; // center of white frame
          place(sp.signKey, cx, pngCy, pngW, pngH, depth, decalAlpha);
        }
      }
    }

    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
  }

  _renderDrugSprites() {
    const pool = this._drugSpritePool;
    if (!pool?.length) return;
    const segs = this.road.segments;
    if (!segs?.length) return;
    // Cockpit forward-bias — same as _renderSceneSprites.
    const playerPos = this._renderCamPos();
    const startSeg  = Math.floor(playerPos / SEG_LENGTH);
    const ghostPool = this._drugGhostPool;
    // Debug mode suppresses the alcohol ghost on drug/weapon pickups
    // so their true world position is visible under the debug boxes.
    const dv = this._debugOn ? 0 : (this.effects?.doubleVision ?? 0);
    const ghostOffsetBase = dv > 0.01 ? dv * 38 : 0;
    const ghostAlpha      = dv > 0.01 ? dv * 0.62 : 0;
    let used = 0;
    let ghostUsed = 0;
    // Reset halo gfx — repainted per-frame for ketamine + fentanyl pickups.
    this._drugHaloGfx?.clear();

    // Walk visible segments far→near. Render BOTH drug pickups and F12
    // weapon tokens through this pool — same depth, same sizing rules.
    const customMode = Difficulty.mode() === 'custom';
    for (let n = 380; n >= 0 && used < pool.length; n--) {
      const seg = segs[(startSeg + n) % segs.length];
      if (!seg?.sprites) continue;
      for (const sp of seg.sprites) {
        if (!sp.isCollectible || sp.collected) continue;
        if (sp.type === 'drug-pending') continue;
        // Custom mode — no drug pickups on the road (player chose
        // starting bar levels via slider, can adjust mid-run).  Weapons
        // still render so the player has tools.
        if (customMode && sp.collectibleType === 'drug') continue;
        // 4★+ drug pickup suppression — ~40% of drugs simply don't render
        // (they're "gone" — narcs swept the area).  Stable per-sprite roll.
        if (sp.collectibleType === 'drug'
            && this.cops.starDisplay >= 4
            && (sp.lootSeed ?? 1) < 0.40) continue;
        // Pick texture: drugs use drug_<type>, F12 tokens have texKey already.
        let texKey;
        if (sp.collectibleType === 'drug') {
          texKey = `drug_${sp.type}`;
        } else if (sp.collectibleType === 'f12') {
          // Hide weapon pickups when player is maxed (3-per-type cap).
          // Maps the route's 'f12_*' to the inventory's normalised name.
          const invType = { f12_gun: 'gun', f12_spike: 'spike_strip', f12_paint: 'paint_bomb', f12_rocket: 'rocket' }[sp.type];
          if (invType && !this.cops.canCarryMore(invType)) continue;
          texKey = sp.texKey;
        } else {
          continue;
        }
        if (!texKey || !this.textures.exists(texKey)) continue;
        const relZ = n * SEG_LENGTH + SEG_LENGTH / 2;
        const proj = this.road.getVehicleProjection(relZ, sp.offset);
        if (!proj || proj.sw < 4) continue;
        if (used >= pool.length) break;
        const s = pool[used++];
        if (s.texture.key !== texKey) s.setTexture(texKey);
        // Preserve each image's original aspect ratio. We size each so
        // the LARGEST dimension equals targetMax — so all pickups appear
        // at "roughly the same size" without distorting any of them.
        const tex = this.textures.get(texKey).source[0];
        const baseW = tex?.width  || 64;
        const baseH = tex?.height || 64;
        const targetMax = proj.sw * 0.6;
        let dispW, dispH;
        if (baseW >= baseH) { dispW = targetMax; dispH = targetMax * (baseH / baseW); }
        else                { dispH = targetMax; dispW = targetMax * (baseW / baseH); }
        // Unified depth scheme — pickups share the same z-banded depth as
        // buildings/cars, so a car between you and a drug pickup occludes it.
        // (Reuses relZ from above — was computed twice unnecessarily.)
        const depth = 9.5 - Math.max(0, Math.min(1, relZ / 76000)) * 2.5;
        s.setPosition(proj.sx, proj.sy - dispH * 0.4)
          .setDisplaySize(dispW, dispH)
          .setDepth(depth)
          .setAlpha(1)
          .setVisible(true);

        // Double-vision ghost copy — scaled by perspective so far
        // pickups don't fling their ghost over the road centerline.
        if (ghostOffsetBase > 0 && ghostPool && ghostUsed < ghostPool.length) {
          const ghostOffset = ghostOffsetBase * Math.min(1, (proj.sw ?? 0) / 200);
          const gs = ghostPool[ghostUsed++];
          if (gs.texture.key !== texKey) gs.setTexture(texKey);
          gs.setPosition(proj.sx + ghostOffset, proj.sy - dispH * 0.4)
            .setDisplaySize(dispW, dispH)
            .setDepth(depth - 0.01)
            .setAlpha(ghostAlpha)
            .setVisible(true);
        }
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
    if (ghostPool) {
      for (let i = ghostUsed; i < ghostPool.length; i++) ghostPool[i].setVisible(false);
    }
  }

  _renderExplosions() {
    // Fire/star bursts go on the high-depth _explosionGfx layer (9.96)
    // so they paint OVER buildings, vehicles, and signs — visible
    // regardless of what the player crashed into.  Smoke/wreck trails
    // still use the older path (roadGfx for some smoke, _smokeGfx for
    // standalone puffs) since those are meant to drift behind/around
    // the scene rather than over it.
    const fireG = this._explosionGfx ?? this.roadGfx;
    if (this._explosionGfx) this._explosionGfx.clear();
    const g = this.roadGfx;
    const smokeG = this._smokeGfx;
    if (smokeG) smokeG.clear();
    const t = this.gameTime ?? 0;
    for (const exp of this.explosions) {
      const prog  = exp.timer / exp.maxTimer;  // 0→1
      const alpha = 1 - prog;
      // ── Gunshot star — small white burst with 4 short spokes. ─────
      if (exp.kind === 'star') {
        const s = exp.sw * (0.5 + prog * 0.4);
        fireG.fillStyle(0xFFFFFF, alpha * 0.95);
        // Cross
        fireG.fillTriangle(exp.sx - s * 0.6, exp.sy,         exp.sx, exp.sy - s * 0.25, exp.sx, exp.sy + s * 0.25);
        fireG.fillTriangle(exp.sx + s * 0.6, exp.sy,         exp.sx, exp.sy - s * 0.25, exp.sx, exp.sy + s * 0.25);
        fireG.fillTriangle(exp.sx, exp.sy - s * 0.6,         exp.sx - s * 0.25, exp.sy, exp.sx + s * 0.25, exp.sy);
        fireG.fillTriangle(exp.sx, exp.sy + s * 0.6,         exp.sx - s * 0.25, exp.sy, exp.sx + s * 0.25, exp.sy);
        // Centre highlight
        fireG.fillStyle(0xFFFFAA, alpha * 0.95);
        fireG.fillCircle(exp.sx, exp.sy, s * 0.18);
        continue;
      }
      // ── Wreck — actual car sprite spinning + smoke trail. ─────────
      if (exp.kind === 'wreck') {
        const w = exp.sw * 0.9;
        const h = w * 0.55;
        // Update the Phaser Image: position, rotation, fade.
        if (exp.img && exp.img.scene) {
          exp.img.setPosition(exp.sx, exp.sy);
          exp.img.setRotation(exp.rotation ?? 0);
          exp.img.setAlpha(alpha);
        }
        // Smoke trail — multiple puffs drifting up + back, growing
        // with progress.  Drawn into roadGfx so it sits BEHIND the
        // car image on screen (roadGfx depth 0 < image depth 9.6).
        const r = w * (0.30 + prog * 0.7);
        g.fillStyle(0x666666, alpha * 0.55);
        g.fillCircle(exp.sx,             exp.sy - h * 0.5 - prog * w * 0.3, r);
        g.fillStyle(0x888888, alpha * 0.45);
        g.fillCircle(exp.sx + r * 0.35,  exp.sy - h * 0.6 - prog * w * 0.5, r * 0.75);
        g.fillStyle(0xAAAAAA, alpha * 0.30);
        g.fillCircle(exp.sx - r * 0.30,  exp.sy - h * 0.7 - prog * w * 0.7, r * 0.55);
        continue;
      }
      // Smoke puffs: grey fluffy circle that drifts up + sways
      // side-to-side, drawn into _smokeGfx (depth 9.97) so it sits
      // above the player car rather than behind it.
      if (exp.smoke) {
        const r  = exp.sw * (0.4 + prog * 0.9);
        const yOff = -prog * exp.sw * 0.6;
        // Lateral sway — per-puff phase keeps adjacent puffs from
        // sliding in unison.  Sway widens slightly with progress.
        if (exp.swayPhase == null) exp.swayPhase = Math.random() * Math.PI * 2;
        const sway = Math.sin(t * 3 + exp.swayPhase) * (10 + prog * 14);
        const cx = exp.sx + sway;
        const drawG = smokeG ?? g;
        drawG.fillStyle(0x666666, alpha * 0.55);
        drawG.fillCircle(cx, exp.sy + yOff, r * 1.05);
        drawG.fillStyle(0x888888, alpha * 0.4);
        drawG.fillCircle(cx + r * 0.25, exp.sy + yOff - r * 0.2, r * 0.7);
        drawG.fillStyle(0xAAAAAA, alpha * 0.3);
        drawG.fillCircle(cx - r * 0.2, exp.sy + yOff + r * 0.15, r * 0.55);
        continue;
      }
      const radius = prog * exp.sw * 2.2;
      fireG.fillStyle(0xFF8800, alpha * 0.85);
      fireG.fillCircle(exp.sx, exp.sy, radius * 1.5);
      fireG.fillStyle(0xFFFF44, alpha * 0.9);
      fireG.fillCircle(exp.sx, exp.sy, radius * 0.85);
      fireG.fillStyle(0xFFFFFF, alpha * 0.6);
      fireG.fillCircle(exp.sx, exp.sy, radius * 0.35);
      // Smoke ring
      fireG.fillStyle(0x444444, alpha * 0.3);
      fireG.fillCircle(exp.sx, exp.sy - radius * 0.4, radius * 0.9);
    }
  }

  /** Screen-level critical damage warning shared by chase and cockpit views. */
  _renderDamageGlass() {
    const g = this._damageGlassGfx;
    if (!g) return;
    g.clear();

    const hp = this.damage?.getDurability?.() ?? 100;
    if (hp > 10) return;

    // At 10 HP one impact mark appears; additional branch systems emerge
    // steadily as durability falls so zero HP resolves as shattered glass.
    const severity = clamp((11 - Math.max(0, hp)) / 11, 0, 1);
    const hubs = [
      { x: 638, y: 104, show: 0.00, arms: 6, radius: 88 },
      { x: 172, y: 162, show: 0.22, arms: 7, radius: 105 },
      { x: 534, y: 282, show: 0.50, arms: 8, radius: 120 },
      { x: 286, y: 76,  show: 0.74, arms: 7, radius: 98 },
    ];

    const drawCrack = (alpha, width, color) => {
      g.lineStyle(width, color, alpha);
      for (let h = 0; h < hubs.length; h++) {
        const hub = hubs[h];
        if (severity < hub.show) continue;
        const reach = hub.radius * clamp((severity - hub.show + 0.18) / 0.55, 0.20, 1);
        for (let a = 0; a < hub.arms; a++) {
          const ang = a * (Math.PI * 2 / hub.arms) + h * 0.61;
          const bend = Math.sin(a * 8.71 + h * 3.2) * 0.24;
          const x1 = hub.x + Math.cos(ang) * reach * 0.36;
          const y1 = hub.y + Math.sin(ang) * reach * 0.36;
          const x2 = hub.x + Math.cos(ang + bend) * reach * 0.70;
          const y2 = hub.y + Math.sin(ang + bend) * reach * 0.70;
          const x3 = hub.x + Math.cos(ang - bend * 0.7) * reach;
          const y3 = hub.y + Math.sin(ang - bend * 0.7) * reach;
          g.beginPath();
          g.moveTo(hub.x, hub.y);
          g.lineTo(x1, y1);
          g.lineTo(x2, y2);
          g.lineTo(x3, y3);
          g.strokePath();
          if (severity > hub.show + 0.26 && (a % 2) === 0) {
            g.beginPath();
            g.moveTo(x2, y2);
            g.lineTo(
              x2 + Math.cos(ang + 1.0) * reach * 0.28,
              y2 + Math.sin(ang + 1.0) * reach * 0.28,
            );
            g.strokePath();
          }
        }
        g.fillStyle(color, alpha);
        g.fillCircle(hub.x, hub.y, 1.5 + severity * 2);
      }
    };

    drawCrack(0.20 + severity * 0.18, 3, 0x18202A);
    drawCrack(0.42 + severity * 0.48, severity > 0.58 ? 2 : 1, 0xEAF6FF);
    if (severity > 0.60) {
      g.fillStyle(0xD9EEFF, (severity - 0.60) * 0.10);
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  _projectVehicle(relativeZ, laneOffset, playerX) {
    const scale = CAM_DEPTH / relativeZ;
    const worldX = laneOffset * ROAD_WIDTH - playerX * ROAD_WIDTH;
    const sx = Math.round(SCREEN_W / 2 + scale * worldX * SCREEN_W / 2);
    const sy = Math.round(SCREEN_H / 2 - scale * (-1000) * SCREEN_H / 2);
    // Vehicle width tied to a fixed car width (~1100 world units), NOT to the
    // road width — so widening the road for 4 lanes doesn't bloat the cars.
    const sw = Math.round(scale * 1100 * 0.42 * SCREEN_W / 2);
    return { sx, sy, sw };
  }

  // ─── HUD ──────────────────────────────────────────────────────────────
  _buildHUD() {
    const d = 20;

    // Handedness helpers — when `_leftHanded`, mirror x-coordinates and
    // origin-x anchors so the right-side stack (HP, gas, speed,
    // weapons) lands on the left and the drug bars land on the right.
    // Music controls, score/clock/dist, and centre HUD stay put.
    const lh  = !!this._leftHanded;
    const mx  = (x) => lh ? (SCREEN_W - x) : x;
    const mox = (o) => lh ? (1 - o) : o;

    // ── Time + Multiplier (top row) → Cash → HP — stacked next to the
    // rear-view mirror (base coords). mx/mox flip the whole cluster
    // to the OTHER side of the mirror in left-handed (default) mode.
    // Timer sits adjacent to the mirror; multiplier extends further
    // outward on the same row.
    const READOUT_GAP = 6;
    const READOUT_LEFT_X  = SCREEN_W / 2 - 130 - READOUT_GAP;
    const READOUT_RIGHT_X = SCREEN_W / 2 + 130 + READOUT_GAP;
    // Mult sits just past Timer's outward edge (timer text is ~58 px
    // wide).  Smaller font keeps the readout clear of the next
    // top-row button (Mute on the right side in default LH).
    const READOUT_LEFT_MULT_X = READOUT_LEFT_X - 60;
    this.hudPartyClock = this.add.text(mx(READOUT_LEFT_X), 4, '⏱  --:--', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(mox(1), 0).setDepth(d);
    this.hudMult = this.add.text(mx(READOUT_LEFT_MULT_X), 4, '', {
      fontSize: '16px', fontFamily: IMPACT,
      color: '#44FF88', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(mox(1), 0).setDepth(d);
    this.hudScore = this.add.text(mx(READOUT_LEFT_X), 20, '$0', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#39FF8A', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(mox(1), 0).setDepth(d);
    // Mileage moved to the bottom — sits just LEFT of the region
    // label (centered at SCREEN_W/2, SCREEN_H - 8), right-aligned so
    // it reads "8 MI · WASHINGTON" across the bottom centre.
    this.hudDist = this.add.text(SCREEN_W / 2 - 6, SCREEN_H - 8, '0 MI', {
      fontSize: '13px', fontFamily: IMPACT,
      color: '#88DDFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 1).setDepth(d);

    // ── TOP-CENTER: Region + stars ─────────────────────────────────────
    // Region/location label — bottom-center, just above the bottom edge.
    this.hudRegion = this.add.text(SCREEN_W / 2, SCREEN_H - 8, 'WASHINGTON', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(d);
    // Wanted stars sit JUST ABOVE the location label so they share the
    // bottom-center status row.  Smaller font keeps both readable.
    this.hudStars = this.add.text(SCREEN_W / 2, SCREEN_H - 26, '', {
      fontSize: '13px', color: '#FFDD00', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(d);

    // Car HP readout — sits directly BELOW the cash readout in the
    // mirror-adjacent cluster.  Font matches Cash (22 px) so the
    // readout never extends past the cluster's right edge into the
    // adjacent button column.  Color stays pink at every value; the
    // floating "-X" damage popup beside it conveys took-damage events.
    this.hudHP = this.add.text(mx(READOUT_LEFT_X), 44, '100 HP', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#FF39AF', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(mox(1), 0).setDepth(d);

    // Floating "-X" damage popup — appears just on the OUTWARD side
    // of HP for 1.5 s after each hit.  Positioned dynamically in the
    // damage listener so it tracks the live HP text bounds.
    this.hudHPDamage = this.add.text(0, 44, '', {
      fontSize: '17px', fontFamily: IMPACT,
      color: '#FF2244', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(mox(1), 0).setDepth(d).setVisible(false);
    this._hpDamageUntil = 0;

    // ── Gas gauge (below MPH, in the speed cluster) ─────────────────
    // PNG pump icon (ui_gas_full → ui_gas_empty swap below 30 mi) sits
    // on the OUTWARD side of the remaining-miles text — pushed outside
    // the speed cluster so it never tucks under the mirror.  Smaller
    // displaySize (24 px) than the old 36 px so it fits beside the
    // 22 px text without crowding the adjacent top-row button.
    const _gasIconKey = this.textures.exists('ui_gas_full') ? 'ui_gas_full' : null;
    if (_gasIconKey) {
      // Icon sits OUTWARD of the Speed number (away from the mirror)
      // — aligned vertically with Speed's center.  _renderHUD repositions
      // its x each frame relative to the live Speed text bounds.
      this.hudGasIcon = this.add.image(mx(READOUT_RIGHT_X), 21, 'ui_gas_full')
        .setOrigin(0.5, 0.5).setDepth(d).setDisplaySize(24, 24);
    } else {
      this.hudGasIcon = null;
    }
    this.hudGas = this.add.text(mx(READOUT_RIGHT_X), 56,
      this.hudGasIcon ? '--- mi' : '⛽ --- mi', {
        fontSize: '22px', fontFamily: IMPACT,
        color: '#39A8FF', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(mox(0), 0).setDepth(d);
    // Accel-pedal charge bar — thin status bar that sits directly
    // under the gas readout.  Width matches the gas text bounds
    // (re-measured every frame in _renderHUD).  5 min full drain, 20
    // min refill.
    this.hudAccelBar = this.add.graphics().setDepth(d);

    // ── TOP-RIGHT: Speed (big) + radio ─────────────────────────────────
    // Speed colour matches the run's difficulty so the readout itself
    // signals which mode you're in.  Palette tracks the title-screen
    // chrome: pink Easy, blue Normal, red Hard (matches "DRIVE"),
    // purple Custom (matches "IMPROVISE").
    const speedTones = {
      easy:   { main: '#FF39AF', sub: '#FF8FCC' },
      normal: { main: '#39A8FF', sub: '#88DDFF' },
      hard:   { main: '#FF2244', sub: '#FF6688' },
      custom: { main: '#CE67FF', sub: '#BD70FF' },
    };
    // Colorblind: spread difficulty across blue/amber/orange + lightness —
    // the default NORMAL-blue vs HARD-red is the CVD-vulnerable pair.
    const speedTonesCB = {
      easy:   { main: '#FFFFFF', sub: '#DDEEFF' },
      normal: { main: '#3A9BFF', sub: '#9FD0FF' },
      hard:   { main: '#FF7A00', sub: '#FFB870' },
      custom: { main: '#FFD23D', sub: '#FFE89A' },
    };
    const _spTones = this._colorblind ? speedTonesCB : speedTones;
    const tones = _spTones[Difficulty.mode()] ?? _spTones.normal;
    // Speed sits IMMEDIATELY RIGHT of the rear-view mirror (base
    // coords). mx/mox flips it to the left in left-handed (default) mode.
    // READOUT_RIGHT_X is declared at the top of _buildHUD alongside
    // READOUT_LEFT_X so the gas readout (built earlier) can use it too.
    this.hudSpeed = this.add.text(mx(READOUT_RIGHT_X), 4, '0', {
      fontSize: '34px', fontFamily: IMPACT,
      color: tones.main, stroke: '#000000', strokeThickness: 6,
    }).setOrigin(mox(0), 0).setDepth(d);
    const _mphSub = this.add.text(mx(READOUT_RIGHT_X), 42, 'MPH', {
      fontSize: '11px', fontFamily: IMPACT,
      color: tones.sub, stroke: '#000000', strokeThickness: 2,
    }).setOrigin(mox(0), 0).setDepth(d);
    this._mphSub = _mphSub;   // ref so the units toggle can swap MPH↔KM/H
    this._hudObjects?.push(_mphSub);

    // ── Party clock (top-center, below the radio name) ──────────────
    // Counts down from Difficulty.partyClockSec().  Color shifts:
    //   > 10 min remaining → white
    //   5–10 min           → yellow
    //   < 5 min            → red + pulse
    // (hudPartyClock moved earlier in the build, above hudScore — see
    // the TOP-LEFT block.)
    this._hudObjects?.push(this.hudPartyClock);

    // ── Top-row buttons ─────────────────────────────────────────────
    // Default (left-handed) layout, left → right:
    //   Pause | FF | Genre | [Mirror] | Mute | Map | Garage | Wiper(*)
    // When the player flips handedness, the whole row mirrors across
    // SCREEN_W/2 — Pause moves to the right edge, Garage moves to the
    // left, etc.  Each button registers itself in
    // this._topRowButtons; _applyTopRowHandedness() re-runs the draw
    // helper with the mirrored x on flip.
    const muteSize       = 56;
    const muteTop        = 2;
    const MIRROR_LEFT_X  = SCREEN_W / 2 - 130;
    const MIRROR_RIGHT_X = SCREEN_W / 2 + 130;
    const TOP_GAP        = 1;
    // Reserved column on each side of the mirror for the speed /
    // time / dollars readouts.  Buttons slot OUTSIDE this reservation
    // so they don't overlap the text.
    const READOUT_W      = 95;
    // _topRowButtons is initialised at the top of create() so the
    // Map / Garage buttons created earlier can also register.
    const registerTopBtn = (entry) => this._topRowButtons.push(entry);
    // Mute sits past the readout reservation on the mirror's right.
    const muteLeft  = MIRROR_RIGHT_X + READOUT_W + TOP_GAP;
    const muteRight = muteLeft + muteSize;
    this.hudMuteBtn = this.add.graphics().setDepth(62);
    this.hudMuteBtn.setInteractive(new Phaser.Geom.Rectangle(muteLeft, muteTop, muteSize, muteSize), Phaser.Geom.Rectangle.Contains);
    this.hudMuteBtn.input.cursor = 'pointer';
    this.hudMuteLbl = this.add.image(muteLeft + muteSize / 2, muteTop + muteSize / 2, this._topRowButtonTexture('mute', !!this.audio?.muted))
      .setDisplaySize(muteSize, muteSize)
      .setDepth(63);
    this._hudMuteIconState = !!this.audio?.muted;
    this.hudMuteBtn.on('pointerover', () => this.hudMuteLbl.setAlpha(1));
    this.hudMuteBtn.on('pointerout',  () => this.hudMuteLbl.setAlpha(0.96));
    this.hudMuteBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.toggleMute?.();
      this._hudMuteIconState = !!this.audio?.muted;
      this._setTopRowButtonTexture(this.hudMuteLbl, 'mute', this._hudMuteIconState, muteSize);
    });
    this._hudObjects?.push(this.hudMuteBtn, this.hudMuteLbl);
    registerTopBtn({ id: 'mute', bg: this.hudMuteBtn, lbl: this.hudMuteLbl, artType: 'mute', baseLeft: muteLeft, size: muteSize });

    // Music-note button (GENRE — cycle station) — sits past the readout
    // reservation on the mirror's left.
    const noteRight = MIRROR_LEFT_X - READOUT_W - TOP_GAP;
    const noteLeft  = noteRight - muteSize;
    this.hudNoteBtn = this.add.graphics().setDepth(62);
    this.hudNoteBtn.setInteractive(new Phaser.Geom.Rectangle(noteLeft, muteTop, muteSize, muteSize), Phaser.Geom.Rectangle.Contains);
    this.hudNoteBtn.input.cursor = 'pointer';
    this.hudNoteLbl = this.add.image(noteLeft + muteSize / 2, muteTop + muteSize / 2, this._topRowButtonTexture('genre'))
      .setDisplaySize(muteSize, muteSize)
      .setDepth(63);
    this.hudNoteBtn.on('pointerover', () => this.hudNoteLbl.setAlpha(1));
    this.hudNoteBtn.on('pointerout',  () => this.hudNoteLbl.setAlpha(0.96));
    this.hudNoteBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.nextStation?.();
    });
    this._hudObjects?.push(this.hudNoteBtn, this.hudNoteLbl);
    registerTopBtn({ id: 'genre', bg: this.hudNoteBtn, lbl: this.hudNoteLbl, artType: 'genre', baseLeft: noteLeft, size: muteSize });

    // Skip-track button — same size, immediately LEFT of the note button.
    // Tapping skips to the next song on real-track stations (Country,
    // EDM, Hip-Hop, Heavy Metal, Polka, Reggae, Mariachi, Pop, MK64).
    // No-op on procedural-only stations.
    // Skip / FAST-FORWARD — second from the left, between Pause and Genre.
    const skipRight = noteRight - muteSize - TOP_GAP;
    const skipLeft  = skipRight - muteSize;
    this.hudSkipBtn = this.add.graphics().setDepth(62);
    this.hudSkipBtn.setInteractive(new Phaser.Geom.Rectangle(skipLeft, muteTop, muteSize, muteSize), Phaser.Geom.Rectangle.Contains);
    this.hudSkipBtn.input.cursor = 'pointer';
    this.hudSkipLbl = this.add.image(skipLeft + muteSize / 2, muteTop + muteSize / 2, this._topRowButtonTexture('ff'))
      .setDisplaySize(muteSize, muteSize)
      .setDepth(63);
    this.hudSkipBtn.on('pointerover', () => this.hudSkipLbl.setAlpha(1));
    this.hudSkipBtn.on('pointerout',  () => this.hudSkipLbl.setAlpha(0.96));
    this.hudSkipBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._setTopRowButtonTexture(this.hudSkipLbl, 'ff', true, muteSize);
      // FF only skips the current track — never starts the game.
      // The title screen's START panel is the only path into a run.
      this.audio?.skipTrack?.();
    });
    const releaseFF = () => this._setTopRowButtonTexture(this.hudSkipLbl, 'ff', false, muteSize);
    this.hudSkipBtn.on('pointerup', releaseFF);
    this.hudSkipBtn.on('pointerupoutside', releaseFF);
    this.hudSkipBtn.on('pointerout', releaseFF);
    this._hudObjects?.push(this.hudSkipBtn, this.hudSkipLbl);
    registerTopBtn({ id: 'ff', bg: this.hudSkipBtn, lbl: this.hudSkipLbl, artType: 'ff', baseLeft: skipLeft, size: muteSize });

    // Weather / wiper button — beside BRAKE on the inner side of the
    // pedal column. It mirrors with the pedals when handedness flips.
    // Icon is a custom windshield-with-single-wiper symbol; red border
    // signals a negative weather effect for both rain and snow.
    const WIPER_PEDAL_W = 70;
    const WIPER_PEDAL_H = 50;
    const WIPER_SIDE_GAP = 8;
    const WIPER_BRAKE_Y = SCREEN_H - 8;
    // Wiper sits on the INNER side of the pedal column (toward screen
    // center).  Pedals are on the side OPPOSITE the weapon column.
    //   leftHanded=true  → pedals RIGHT, wiper LEFT of right pedal
    //   leftHanded=false → pedals LEFT, wiper RIGHT of left pedal
    const getWiperLeft = () => this._leftHanded
      ? (SCREEN_W - WIPER_PEDAL_W - 4 - WIPER_SIDE_GAP - muteSize)
      : (WIPER_PEDAL_W + 4 + WIPER_SIDE_GAP);
    let wiperLeft = getWiperLeft();
    const wiperTop = WIPER_BRAKE_Y - WIPER_PEDAL_H / 2 - muteSize / 2;
    this.hudWiperBtn = this.add.graphics().setDepth(62).setVisible(false);
    const drawWiper = (alpha = 0.85) => {
      this.hudWiperBtn.clear();
      this.hudWiperBtn.fillStyle(0x222222, alpha);
      this.hudWiperBtn.fillRoundedRect(wiperLeft, wiperTop, muteSize, muteSize, 10);
      // Red stroke — weather is a NEGATIVE effect.
      this.hudWiperBtn.lineStyle(3, 0xFF3333, 1);
      this.hudWiperBtn.strokeRoundedRect(wiperLeft + 1.5, wiperTop + 1.5, muteSize - 3, muteSize - 3, 10);
      // Conventional windshield wiper warning icon: a curved windshield
      // outline plus one swept blade and pivot. Drawn directly so the
      // small HUD mark stays crisp without adding another image asset.
      const cx = wiperLeft + muteSize / 2;
      const topY = wiperTop + 14;
      const lowerY = wiperTop + 35;
      const icon = 0xF1F3F4;
      // Windshield frame: faceted curves stay legible at a 56 px button.
      this.hudWiperBtn.lineStyle(3, icon, 0.96);
      this.hudWiperBtn.beginPath();
      this.hudWiperBtn.moveTo(cx - 18, topY + 5);
      this.hudWiperBtn.lineTo(cx - 10, topY + 1);
      this.hudWiperBtn.lineTo(cx, topY);
      this.hudWiperBtn.lineTo(cx + 10, topY + 1);
      this.hudWiperBtn.lineTo(cx + 18, topY + 5);
      this.hudWiperBtn.lineTo(cx + 12, lowerY);
      this.hudWiperBtn.lineTo(cx + 5, lowerY - 2);
      this.hudWiperBtn.lineTo(cx - 5, lowerY - 2);
      this.hudWiperBtn.lineTo(cx - 12, lowerY);
      this.hudWiperBtn.closePath();
      this.hudWiperBtn.strokePath();
      // One visible swept blade, like a dashboard windshield-wiper icon.
      const pivotX = cx;
      const pivotY = lowerY + 4;
      const bladeX = cx - 9;
      const bladeY = topY + 7;
      this.hudWiperBtn.lineStyle(4, icon, 0.98);
      this.hudWiperBtn.beginPath();
      this.hudWiperBtn.moveTo(pivotX, pivotY);
      this.hudWiperBtn.lineTo(bladeX, bladeY);
      this.hudWiperBtn.strokePath();
      this.hudWiperBtn.fillStyle(icon, 1);
      this.hudWiperBtn.fillCircle(pivotX, pivotY, 3);
    };
    drawWiper();
    this.hudWiperBtn.setInteractive(new Phaser.Geom.Rectangle(wiperLeft, wiperTop, muteSize, muteSize), Phaser.Geom.Rectangle.Contains);
    this.hudWiperBtn.input.cursor = 'pointer';
    // Mode-indicator text in the lower-right corner of the button —
    // shows "OFF" / "SLOW" / "FAST" so the player knows which speed
    // the wipers are at.  Tiny so it doesn't crowd the wiper icon.
    this.hudWiperLbl = this.add.text(wiperLeft + muteSize - 4, wiperTop + muteSize - 4, 'OFF', {
      fontSize: '9px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 1).setDepth(63).setVisible(false);
    this._layoutWiperButton = () => {
      wiperLeft = getWiperLeft();
      if (this.hudWiperBtn.input) {
        this.hudWiperBtn.input.hitArea = new Phaser.Geom.Rectangle(wiperLeft, wiperTop, muteSize, muteSize);
        this.hudWiperBtn.input.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
      }
      this.hudWiperLbl?.setPosition(wiperLeft + muteSize - 4, wiperTop + muteSize - 4);
      drawWiper();
    };
    this.hudWiperBtn.on('pointerover', () => drawWiper(1));
    this.hudWiperBtn.on('pointerout',  () => drawWiper(0.85));
    this.hudWiperBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      // Toggle OFF ↔ ON (was 3-state OFF/SLOW/FAST).  Single ON speed
      // matches what was previously FAST — keeps the windshield
      // good-enough clear without the player picking a speed.
      this._wiperMode = this._wiperMode ? 0 : 1;
    });
    this._hudObjects?.push(this.hudWiperBtn, this.hudWiperLbl);
    // NOT registered with _topRowButtons — this belongs beside BRAKE and
    // follows pedal handedness through _layoutWiperButton().

    // Custom-mode drug-slider button removed — drug levels are now set
    // by clicking/dragging the actual HUD drug bars directly when in
    // custom mode (see drag handler registered in create()).

    // ── Rear-view mirror ───────────────────────────────────────────
    // Sits where the top-center HUD text is.  hudMirrorBg paints just
    // the frame border (static).  hudMirrorGlass paints the SCENE
    // INTERIOR (sky / ground / horizon / perspective lines) every frame
    // using the live world palette + TimeOfDay tint, so the mirror's
    // colours match what the player is driving through (instead of a
    // hardcoded dark-blue + dark-grey backdrop).
    {
      const mw = 260, mh = 56;
      const mx = SCREEN_W / 2 - mw / 2;
      const my = 2;
      const f = this.add.graphics().setDepth(d - 5);
      // Frame body — outer black housing + light grey trim only.
      f.fillStyle(0x1A1A1A, 0.95);
      f.fillRoundedRect(mx, my, mw, mh, 9);
      f.lineStyle(2, 0x666666, 1);
      f.strokeRoundedRect(mx + 0.5, my + 0.5, mw - 1, mh - 1, 9);
      const glassX = mx + 4, glassY = my + 4;
      const glassW = mw - 8, glassH = mh - 8;
      const horizonY = glassY + glassH * 0.42;
      const roadCx     = glassX + glassW / 2;
      const roadBotY   = glassY + glassH - 2;
      const roadHalfW  = glassW * 0.40;
      this.hudMirrorBg    = f;
      this.hudMirrorGlass = this.add.graphics().setDepth(d - 4);
      this._mirrorBounds  = {
        x: mx, y: my, w: mw, h: mh,
        glassX, glassY, glassW, glassH, horizonY,
        roadCx, roadBotY, roadHalfW,
      };
      this._hudObjects?.push(this.hudMirrorBg, this.hudMirrorGlass);

      // Geometry mask — clips both the sprite pool AND the painted
      // road / sky / ground so nothing escapes the mirror frame even
      // when parallax pushes the road sideways or the player is at the
      // edge of a lane.
      const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
      maskShape.fillStyle(0xFFFFFF, 1);
      maskShape.fillRect(glassX, glassY, glassW, glassH);
      this._mirrorMask = maskShape.createGeometryMask();
      this._mirrorMaskShape = maskShape;
      this.hudMirrorGlass.setMask(this._mirrorMask);
      this._hudObjects?.push(maskShape);

      // Pool of mirror car sprites — same textures as the world's cars,
      // using the FRONT-view variant since looking back you see the
      // grille of the car you've passed (or the cop chasing you).
      this._mirrorCarPool = [];
      for (let i = 0; i < 14; i++) {
        const s = this.add.image(0, 0, 'car_front_white')
          .setOrigin(0.5, 1)
          .setDepth(d - 3.5)
          .setVisible(false)
          .setMask(this._mirrorMask);
        this._mirrorCarPool.push(s);
        this._hudObjects?.push(s);
      }
      // Pool of mirror building sprites — buildings the player has
      // already driven past, painted as small images to either side of
      // the mirror road.
      this._mirrorBuildingPool = [];
      for (let i = 0; i < 8; i++) {
        const s = this.add.image(0, 0, 'codex_bellevue_skyline')
          .setOrigin(0.5, 1)
          .setDepth(d - 3.6)        // beneath cars in z-order
          .setVisible(false)
          .setMask(this._mirrorMask);
        this._mirrorBuildingPool.push(s);
        this._hudObjects?.push(s);
      }
    }

    // Radio station name — sits directly UNDER the Genre (note)
    // button so the label visually belongs to the control that
    // changes it.  Tap also cycles stations.
    const radioCenterX = noteLeft + muteSize / 2;
    const radioY       = muteTop + muteSize + 2;
    this.hudRadio = this.add.text(radioCenterX, radioY, 'CLASSIC ROCK', {
      fontSize: '14px', fontFamily: IMPACT,
      color: '#5DD4FF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(d).setInteractive({ useHandCursor: true });
    this.hudRadio.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this.audio?.nextStation?.();
    });

    // ── (FIRE-banner + F12-hint removed per player request — they were
    //    blocking the bottom-right corner so the GAS pedal couldn't sit
    //    symmetric with BRAKE.  Weapon icons themselves are still
    //    individually tap-to-fire; weapon-cycle still works via Q on
    //    keyboard.)  Stub hudWeaponSel so existing render code is a no-op.
    this.hudF12hint   = null;
    this.hudWeaponSel = null;

    // ── BOTTOM-CENTER: Popup ────────────────────────────────────────────
    // Toasts (crashes, checkpoints, drug unlocks, phone texts, etc.) sit
    // bottom-centre, just ABOVE the mile/town location line (moved here from
    // below the rear-view mirror per user).  Bottom-anchored (origin 0.5,1)
    // so multi-line toasts grow UP and never run off the bottom edge.  The
    // per-frame block in _renderHUD re-applies origin + Y by view mode
    // (cockpit parks it on the dashboard instead).
    this.hudPopup = this.add.text(SCREEN_W / 2, HUD_POPUP_BOTTOM_Y, '', {
      fontSize: '18px', fontFamily: IMPACT,
      color: '#FFFF00', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5, 1).setDepth(d + 5);

    // Speed-trap sign — same bottom-centre spot, driven persistently from
    // update(): alternating SLOW DOWN / PULL OVER during the comply window,
    // then TRAFFIC STOP + countdown once pulled over.  No emojis.
    this._trapSign = this.add.text(SCREEN_W / 2, HUD_POPUP_BOTTOM_Y, '', {
      fontSize: '22px', fontFamily: IMPACT,
      color: '#FF3B30', stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5, 1).setDepth(d + 6).setVisible(false);

    // ── Phone-only GAS + BRAKE pedals — TOGGLE buttons (tap once to turn
    //    on, tap again to turn off). Mutually exclusive and stacked:
    //    ACCEL on top, BRAKE below. They always occupy the edge opposite
    //    the weapon stack so both thumbs have separate controls.
    const PEDAL_W = 70, PEDAL_H = 50;
    const PEDAL_GAP = 4;                              // gap between stacked pedals
    // Pedal CENTER X.  Origin is (0.5, 1) so the rectangle's right
    // edge sits at PEDAL_X + PEDAL_W/2. Side OPPOSES the weapon edge
    // so the drug-icon 2-col grid + pedals share the off-weapon side.
    // _applyPedalHandedness() below re-runs the same math when the
    // flag flips mid-run.
    this._pedalDim  = { w: PEDAL_W, h: PEDAL_H };
    const PEDAL_X   = this._leftHanded
      ? (SCREEN_W - PEDAL_W / 2 - 4)
      : (PEDAL_W / 2 + 4);
    const BRAKE_Y   = SCREEN_H - 8;                   // bottom
    const GAS_Y     = BRAKE_Y - PEDAL_H - PEDAL_GAP;  // above brake

    // Buttons are always created in the BRAKE/ACCEL layout, but their
    // labels + visibility + handler logic switch dynamically based on
    // the current steering mode via _applyPedalModeUI().  This avoids
    // a stale snapshot when the user picks TILT after _buildHUD has
    // already run (e.g. switching modes from the title carousel).
    const refreshGas = () => {
      this._gasBtn
        ?.setFillStyle?.(this._touchBoost ? 0x0F2A4A : 0x050812, this._touchBoost ? 0.96 : 0.72)
        ?.setStrokeStyle?.(this._touchBoost ? 3 : 2, 0x39A8FF, this._touchBoost ? 1 : 0.88);
    };
    const refreshBrake = () => {
      if (this._lastPedalModeIsTilt) {
        // RE-ZERO button: steady styling, no toggle highlight.
        this._brakeBtn
          ?.setFillStyle?.(0x050812, 0.72)
          ?.setStrokeStyle?.(2, 0xFFD23A, 0.88);
        return;
      }
      this._brakeBtn
        ?.setFillStyle?.(this._touchBrake ? 0x3A112B : 0x050812, this._touchBrake ? 0.96 : 0.72)
        ?.setStrokeStyle?.(this._touchBrake ? 3 : 2, 0xFF39AF, this._touchBrake ? 1 : 0.88);
    };
    this._refreshPedals = () => { refreshGas(); refreshBrake(); };

    const gasBtn = this.add.rectangle(
      PEDAL_X, GAS_Y, PEDAL_W, PEDAL_H, 0x050812, 0.72,
    ).setOrigin(0.5, 1).setDepth(d + 1).setStrokeStyle(2, 0x39A8FF, 0.88);
    this._gasBtn = gasBtn;
    const gasLbl = this.add.text(PEDAL_X, GAS_Y - PEDAL_H / 2,
      '▲\nACCEL', {
        fontSize: '16px', fontFamily: IMPACT,
        color: '#F4F7FF', stroke: '#39A8FF', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5).setDepth(d + 2);
    this._gasLbl = gasLbl;
    gasBtn.setInteractive({ useHandCursor: true });
    gasBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      // No-op while tilt mode owns the throttle; the button is also
      // hidden in that mode but guard here too in case visibility
      // hasn't propagated.
      if (this._steeringMode?.() === 'tilt') return;
      this._touchBoost = !this._touchBoost;
      this._refreshPedals();
    });

    const brakeBtn = this.add.rectangle(
      PEDAL_X, BRAKE_Y, PEDAL_W, PEDAL_H, 0x050812, 0.72,
    ).setOrigin(0.5, 1).setDepth(d + 1).setStrokeStyle(2, 0xFF39AF, 0.88);
    this._brakeBtn = brakeBtn;
    const brakeLbl = this.add.text(PEDAL_X, BRAKE_Y - PEDAL_H / 2,
      'BRAKE\n▼', {
        fontSize: '17px', fontFamily: IMPACT,
        color: '#F4F7FF', stroke: '#FF39AF', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5).setDepth(d + 2);
    this._brakeLbl = brakeLbl;
    brakeBtn.setInteractive({ useHandCursor: true });
    brakeBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      if (this._steeringMode?.() === 'tilt') {
        // RE-ZERO: kick off a fresh ~0.5 s averaging window.
        this._tiltCalibrating = true;
        this._tiltCalSamples  = [];
        this._tiltThrottle    = 0;
        this._tiltBrake       = 0;
        const lbl = this._brakeLbl;
        if (lbl) {
          const prev = lbl.text;
          lbl.setText('ZEROING');
          this.time?.delayedCall?.(620, () => {
            if (lbl?.scene) lbl.setText(prev);
          });
        }
        return;
      }
      this._touchBrake = !this._touchBrake;
      if (this._touchBrake) this._touchBoost = false;
      this._refreshPedals();
    });

    // Centralised mode-swap.  Called from end of _buildHUD AND from the
    // update loop whenever the steering mode changes — including after
    // a title-carousel pick that doesn't rebuild HUD.
    this._applyPedalModeUI = (force = false) => {
      const isTilt = (this._steeringMode?.() === 'tilt');
      if (!force && this._lastPedalModeIsTilt === isTilt) return;
      this._lastPedalModeIsTilt = isTilt;
      // ACCEL: hidden + non-interactive in tilt mode; shown otherwise.
      if (this._gasBtn) {
        this._gasBtn.setVisible(!isTilt);
        if (isTilt) this._gasBtn.disableInteractive?.();
        else        this._gasBtn.setInteractive({ useHandCursor: true });
      }
      if (this._gasLbl) this._gasLbl.setVisible(!isTilt);
      // BRAKE slot: relabel + restyle for RE-ZERO when tilt is on.
      if (this._brakeLbl) {
        this._brakeLbl
          .setText(isTilt ? 'RE-ZERO\n⟲' : 'BRAKE\n▼')
          .setStyle({
            stroke: isTilt ? '#FFD23A' : '#FF39AF',
            fontSize: isTilt ? '15px' : '17px',
          });
      }
      // When entering tilt mode, clear any toggled-on brake state so
      // the player isn't stuck slowing after the mode swap.
      if (isTilt) this._touchBrake = this._touchBoost = false;
      this._refreshPedals?.();
    };
    this._applyPedalModeUI(true);
    this._hudObjects?.push(gasBtn, gasLbl, brakeBtn, brakeLbl);

    // ── Pause button — upper-right area, but moved LEFT of the speed
    //    cluster so it never overlaps the MPH readout.  Tappable on
    //    phones, also still triggered by SPACE.
    // Pause sits as a separate control at the outer end of the music cluster.
    // Right edge at SCREEN_W-75 leaves ~65 px to the speedometer.
    const pauseSize = 56;
    // Pause is now the LEFTMOST top-row button — sits two slots left
    // of the mirror, with FF + Genre between it and the mirror.
    const pauseRight = (typeof skipLeft !== 'undefined')
      ? (skipLeft - TOP_GAP)
      : (SCREEN_W / 2 - 266);
    const pauseLeft  = pauseRight - pauseSize;
    const pauseTop   = 2;
    const pauseBtn = this.add.graphics().setDepth(62);
    // drawPause takes a "lit" flag so the border glows magenta while
    // the paused screen is active. _togglePause redraws it on state changes.
    // Geometry redraw only — alpha (hover dim / lit) is conveyed via
    // pauseBtn.setAlpha so it survives _applyTopRowHandedness redraws.
    const drawPause = (_alpha = 0.85, lit = false) => {
      const x = this._leftHanded ? pauseLeft : (SCREEN_W - pauseLeft - pauseSize);
      pauseBtn.clear();
      this._setTopRowButtonTexture(this._pauseLblRef, 'pause', lit, pauseSize);
    };
    pauseBtn.setInteractive(new Phaser.Geom.Rectangle(pauseLeft, pauseTop, pauseSize, pauseSize), Phaser.Geom.Rectangle.Contains);
    pauseBtn.input.cursor = 'pointer';
    const pauseLbl = this.add.image(pauseLeft + pauseSize / 2, pauseTop + pauseSize / 2, this._topRowButtonTexture('pause'))
      .setDisplaySize(pauseSize, pauseSize)
      .setDepth(63);
    pauseBtn.on('pointerover', () => pauseLbl.setAlpha(1));
    pauseBtn.on('pointerout',  () => pauseLbl.setAlpha(0.96));
    pauseBtn.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      this._togglePause();
    });
    // Store on `this` so _togglePause can light it up when paused.
    // ORDER MATTERS: assign `_pauseLblRef` BEFORE first drawPause call
    // so the closure dereferences the fresh GameObject, not a stale
    // ref from a previous scene instance (Phaser reuses the scene on
    // scene.start, but the previous create()'s display objects were
    // destroyed — calling setTexture on them throws "Cannot read
    // properties of undefined (reading 'sys')").
    this._pauseBtnRef     = pauseBtn;
    this._pauseLblRef     = pauseLbl;
    this._redrawPauseBtn  = drawPause;
    // Now safe to invoke the initial redraw — pauseLbl already had the
    // 'pause' texture set at construction; drawPause re-applies size
    // and tracks the lit flag.
    drawPause(1, false);
    this._hudObjects?.push(pauseBtn, pauseLbl);
    registerTopBtn({ id: 'pause', bg: pauseBtn, lbl: pauseLbl, artType: 'pause', baseLeft: pauseLeft, size: pauseSize });

    // ── REAR-COP indicator (cop behind the player; visible only when active)
    this.hudRearCop = this.add.text(SCREEN_W / 2, SCREEN_H - 32, '', {
      fontSize: '14px', fontFamily: IMPACT,
      color: this._colorblind ? '#FFB000' : '#FF3333', stroke: '#000000', strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(d).setVisible(false);

    // ── 5★ helicopter overlay — ASCII chopper that hovers high above the
    // road centre and pulses red+blue rotor flash.  Decorative only —
    // signals "you're at maximum heat" without adding extra collision logic.
    this.hudHelicopter = this.add.text(SCREEN_W / 2, 96, '', {
      fontSize: '34px', fontFamily: 'Courier New, monospace',
      color: '#222222', stroke: '#FF3333', strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(d - 2).setVisible(false);

    // Sprite version of the 5★ chopper — built from the cop_heli_1 /
    // cop_heli_2 PNG pair (plus _flip variants for the opposite banking
    // direction).  The renderer alternates the two rotor frames at
    // ~10 Hz and flips when the sway sends the chopper to the left.
    // Falls back to the emoji text above if the textures are missing.
    if (this.textures.exists('cop_heli_1')) {
      this.hudHelicopterImg = this.add.image(SCREEN_W / 2, 96, 'cop_heli_1')
        .setOrigin(0.5).setDepth(d - 2).setVisible(false)
        .setDisplaySize(140, 80);
    } else {
      this.hudHelicopterImg = null;
    }

    // (Yellow "TAKE EXIT → REST STOP" prompt removed — too many rest
    //  stops on the route for that visual to be useful, and the in-world
    //  exit signage already tells the player when one's coming up.
    //  Swerve right to take any exit.)

    // Full-frame title artwork: logo, rainy Seattle road and neon menu
    // chrome are baked together so the first impression matches the mockup.
    // Interactive/live text layers below cover only selector values.
    this._titleScrim = this.add.graphics().setDepth(d + 8); // retained for shared visibility code
    this._titleBackdrop = this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'ui_title_screen')
      .setOrigin(0.5)
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setDepth(d + 9);
    this._titleLetters = [];
    this._titleMain = null;
    this._titleSub = null;
    this._titleRoute = null;

    const save = this.registry.get('save');
    const last = save?.get?.('lastRestStop');

    // Interactive menu zones align to the four bottom cards in the artwork.
    // START and LOAD SAVE are fully baked; selector interiors receive live
    // text because the choice can change.
    const panelY = 350;
    const panelH = 58;
    const compactPanelH = 47;
    const btnY = panelY;
    this._titleDifficultyBtns = [];
    this._titleWheelMap = {};

    const titlePanelShape = (x, w, h = panelH, slant = 12) => ({
      points: [
        new Phaser.Geom.Point(x + slant, panelY),
        new Phaser.Geom.Point(x + w, panelY),
        new Phaser.Geom.Point(x + w - slant, panelY + h),
        new Phaser.Geom.Point(x, panelY + h),
      ],
      outline: [
        new Phaser.Geom.Point(x + slant + 5, panelY),
        new Phaser.Geom.Point(x + w - 5, panelY),
        new Phaser.Geom.Point(x + w - 2, panelY + 1),
        new Phaser.Geom.Point(x + w, panelY + 5),
        new Phaser.Geom.Point(x + w - slant + 2, panelY + h - 5),
        new Phaser.Geom.Point(x + w - slant, panelY + h - 2),
        new Phaser.Geom.Point(x + w - slant - 4, panelY + h),
        new Phaser.Geom.Point(x + 5, panelY + h),
        new Phaser.Geom.Point(x + 2, panelY + h - 1),
        new Phaser.Geom.Point(x, panelY + h - 5),
        new Phaser.Geom.Point(x + slant - 2, panelY + 5),
        new Phaser.Geom.Point(x + slant, panelY + 2),
      ],
    });
    const makeTitleZone = (shape, glow, onTap, paintInterior = null) => {
      const g = this.add.graphics().setDepth(d + 10);
      const draw = (hover = false) => {
        g.clear();
        paintInterior?.(g);
        if (hover) {
          g.lineStyle(2, glow, 1);
          g.strokePoints(shape.outline, true);
        }
      };
      draw();
      const hitArea = new Phaser.Geom.Polygon(shape.points);
      g.setInteractive(hitArea, Phaser.Geom.Polygon.Contains);
      g.input.cursor = 'pointer';
      g.on('pointerover', () => draw(true));
      g.on('pointerout',  () => draw(false));
      g.on('pointerdown', (ptr) => {
        draw(true);
        ptr.event?.stopPropagation?.();
        onTap?.();
      });
      g._titleDraw = draw;
      return g;
    };

    const THUMBS_OPTIONS = [
      { id: 'classic', label: 'THUMBS', blurb: 'Left & Right Thumbs' },
      { id: 'flappy',  label: 'TAP',    blurb: 'Remember Flappy Bird?' },
      { id: 'tilt',    label: 'TILT',   blurb: 'Accelerometer!' },
    ];
    const DIFF_OPTIONS = [
      { id: 'easy',   label: 'EASY',   blurb: 'Less Cars, No Weather' },
      { id: 'normal', label: 'NORMAL', blurb: 'Standard Ass Gameplay' },
      { id: 'hard',   label: 'HARD',   blurb: 'Max NPC, Cops, Damage' },
      { id: 'custom', label: 'CUSTOM', blurb: 'Set your own trip.' },
    ];

    // Initial wheel state — preserve whatever the player explicitly
    // picked last time (registry values set by a prior Start tap).
    // First-ever defaults: Thumbs "2" (classic) and Difficulty Normal.
    const storedSteering = this.registry?.get?.('titleThumbsPick')
                        ?? this.registry?.get?.('steeringMode');
    const storedDiff     = this.registry?.get?.('titleDiffPick');
    let thumbsIdx = THUMBS_OPTIONS.findIndex(o => o.id === storedSteering);
    if (thumbsIdx < 0) thumbsIdx = 0;   // default → THUMBS: 2 (classic)
    let diffIdx = DIFF_OPTIONS.findIndex(o => o.id === storedDiff);
    if (diffIdx < 0) diffIdx = DIFF_OPTIONS.findIndex(o => o.id === 'normal');
    if (diffIdx < 0) diffIdx = 1;        // default → Normal
    this._wheelCursor = DIFF_OPTIONS[diffIdx].id;

    const dynamicFill = (g, x, w) => {
      g.fillStyle(0x070B14, 0.92);
      g.fillRoundedRect(x + 8, panelY + 6, w - 16, panelH - 12, 6);
    };
    const diffX = 249, diffW = 177;
    const steeringX = 422, steeringW = 190;

    this._titleDiffHeader = this.add.text(diffX + diffW / 2, panelY + 9, 'DIFFICULTY', {
      fontSize: '13px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#E9F4FF',
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleDiffValue = this.add.text(diffX + diffW / 2, panelY + 28, '', {
      fontSize: '20px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#37B9FF', stroke: '#07111F', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleDiffBlurb = this.add.text(diffX + diffW / 2, panelY + 49, '', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#D0D8E4',
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleThumbsHeader = this.add.text(steeringX + steeringW / 2, panelY + 9, 'DRIVING TYPE', {
      fontSize: '13px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#E9F4FF',
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleThumbsValue = this.add.text(steeringX + steeringW / 2, panelY + 28, '', {
      fontSize: '20px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#BD70FF', stroke: '#130A1E', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleThumbsBlurb = this.add.text(steeringX + steeringW / 2, panelY + 49, '', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#D0D8E4',
    }).setOrigin(0.5).setDepth(d + 12);
    this._titleDifficultyBtns.push(
      this._titleDiffHeader, this._titleDiffValue, this._titleDiffBlurb,
      this._titleThumbsHeader, this._titleThumbsValue, this._titleThumbsBlurb,
    );

    // Difficulty value tint mirrors the in-game Speed/MPH palette so
    // the player sees their selected mode's color before the run even
    // starts (pink Easy / blue Normal / red Hard / purple Custom).
    const diffValueColors = {
      easy:   '#FF39AF',
      normal: '#39A8FF',
      hard:   '#FF2244',
      custom: '#CE67FF',
    };
    // CB: the EASY-pink vs HARD-red pair is the opposite-stakes confusion.
    // Spread across white/blue/orange/amber (the label word still names it).
    const diffValueColorsCB = { easy: '#E9F4FF', normal: '#39A8FF', hard: '#FF7A00', custom: '#FFD23D' };
    // Driving type value tint — by mode, matching the in-game palette
    // (pink Thumbs, blue Tap, red Tilt) so each scheme reads as a
    // distinct color before the run starts.
    const thumbsValueColors = {
      classic: '#FF39AF',   // THUMBS — pink
      flappy:  '#39A8FF',   // TAP    — blue
      tilt:    '#FF2244',   // TILT   — red
    };
    const thumbsValueColorsCB = { classic: '#E9F4FF', flappy: '#39A8FF', tilt: '#FF7A00' };
    const updateSelectionText = () => {
      const diffId = DIFF_OPTIONS[diffIdx].id;
      this._titleDiffValue?.setText(DIFF_OPTIONS[diffIdx].label);
      this._titleDiffValue?.setColor((this._colorblind ? diffValueColorsCB : diffValueColors)[diffId] ?? '#37B9FF');
      this._titleDiffBlurb?.setText(DIFF_OPTIONS[diffIdx].blurb);
      const thumbsId = THUMBS_OPTIONS[thumbsIdx].id;
      this._titleThumbsValue?.setText(THUMBS_OPTIONS[thumbsIdx].label);
      this._titleThumbsValue?.setColor((this._colorblind ? thumbsValueColorsCB : thumbsValueColors)[thumbsId] ?? '#BD70FF');
      this._titleThumbsBlurb?.setText(THUMBS_OPTIONS[thumbsIdx].blurb);
    };
    this._refreshDifficultyHighlights = updateSelectionText;

    const startBg = makeTitleZone(titlePanelShape(74, 176, compactPanelH, 11), 0xFF5FCC,
      () => this._fireTitleCursor?.());
    const diffBg = makeTitleZone(titlePanelShape(diffX, diffW), 0x3CCBFF, () => {
      diffIdx = (diffIdx + 1) % DIFF_OPTIONS.length;
      this._wheelCursor = DIFF_OPTIONS[diffIdx].id;
      updateSelectionText();
      diffBg._titleDraw?.(true);
    }, g => dynamicFill(g, diffX, diffW));
    const steeringBg = makeTitleZone(titlePanelShape(steeringX, steeringW), 0xCE67FF, () => {
      thumbsIdx = (thumbsIdx + 1) % THUMBS_OPTIONS.length;
      // Persist the carousel pick immediately so _armTiltPrefetch's
      // next-tap listener can see whether the user is about to start
      // a tilt run.  Without this the registry only updates on START,
      // by which point we've missed the iOS gesture frame.
      this.registry?.set?.('titleThumbsPick', THUMBS_OPTIONS[thumbsIdx].id);
      updateSelectionText();
      steeringBg._titleDraw?.(true);
    }, g => dynamicFill(g, steeringX, steeringW));
    const savedBg = makeTitleZone(titlePanelShape(611, 154, compactPanelH, 12), 0x4BB7FF,
      () => this._promptForCode(last?.code ?? ''));
    this._titleDifficultyBtns.push(startBg, diffBg, steeringBg, savedBg);
    this._titleResume = savedBg;
    this._titleResumeTxt = null;
    updateSelectionText();

    // ── Player-profile plates (left side) — pick / create the driver ──
    this._buildPlateSlots(d);

    // Shared START dispatcher — used by the painted START panel and
    // keyboard handlers; current selector values determine the launch.
    this._fireTitleCursor = () => {
      if (!this._awaitingStart) return;
      // Commit the wheel selections now (Start tap is a fresh user
      // gesture — required for the iOS tilt permission prompt).
      const pickedThumbs = THUMBS_OPTIONS[thumbsIdx]?.id;
      if (pickedThumbs) {
        // Remember the menu pick separately so the title can restore it
        // even if the steering subsystem falls back (e.g. tilt unsupported).
        this.registry?.set?.('titleThumbsPick', pickedThumbs);
        this._setSteeringMode?.(pickedThumbs);
      }
      const pickedDiff = DIFF_OPTIONS[diffIdx]?.id;
      if (pickedDiff) this.registry?.set?.('titleDiffPick', pickedDiff);
      if (pickedDiff && pickedDiff !== 'custom') {
        Difficulty.set(pickedDiff, this.registry);
        this._partyClockSec    = Difficulty.partyClockSec();
        this._partyClockSecMax = this._partyClockSec;
      }
      const cur = this._wheelCursor ?? Difficulty.mode();
      if (cur === 'custom') {
        this._buildDrugSliderModal({
          mode: 'custom',
          onConfirm: ({ drugLevels, checkpointPos, noNpcDamage, noPolice, startStars, customSub, drivingType, vehicleId, accessories }) => {
            Difficulty.set('custom', this.registry);
            if (customSub) Difficulty.setCustomSub(customSub, this.registry);
            if (drivingType) {
              this.registry?.set?.('titleThumbsPick', drivingType);
              this._setSteeringMode?.(drivingType);
            }
            // Custom is a sandbox — let the player drive ANY vehicle
            // and toggle ANY accessory for this run.  Stored as
            // scene-instance overrides so the persisted save state
            // (ownedVehicles, accessories[vid]) isn't clobbered.
            if (vehicleId && VEHICLES[vehicleId]) {
              this._customStartVehicleId = vehicleId;
              this._applyVehicleSwap?.(vehicleId);
            }
            this._customStartAccessories = accessories ?? null;
            this._customStartLevels = drugLevels;
            this._customFlags = { noNpcDamage: !!noNpcDamage, noPolice: !!noPolice };
            this._customStartStars = Math.max(0, Math.min(5, startStars ?? 0));
            this._customStartPosition = Math.max(0, checkpointPos ?? 0);
            // Reset the party clock to Custom's setting (40 min by spec)
            // so the run begins with a fresh countdown.
            this._partyClockSec    = Difficulty.partyClockSec();
            this._partyClockSecMax = this._partyClockSec;
            this._startGameplay();
          },
        });
        return;
      }
      if (cur === 'saved') {
        this._promptForCode(last?.code ?? '');
        return;
      }
      this._startGameplay();
    };

    // Stub _titleTap so the existing fade-out / hud-list code that
    // references it doesn't choke on undefined.
    this._titleTap = this.add.text(SCREEN_W / 2, btnY, '', {
      fontSize: '1px',
    }).setOrigin(0.5).setDepth(d + 10).setVisible(false);

    // (Removed: title-screen 🗺 MAP / 🚗 GARAGE / 🏆 TROPHY icon row.
    //  The always-visible 56-px MAP + GARAGE buttons to the left of
    //  the mirror cover those two during gameplay AND the title, and
    //  the trophy lives on the iPhone-menu trophy chip now.)

    // Legacy enter-code button removed.
    this._titleEnterCode    = null;
    this._titleEnterCodeTxt = null;

    if (!this._awaitingStart) {
      // Mission entry — hide title immediately.
      this._setTitleVisible(false);
    }

    // Track every text-rich HUD element so the UI camera can render only these,
    // and the main camera can ignore them (so shake/sway never moves the HUD).
    if (this._hudObjects) {
      // Filter undefineds — `_titleResume` only exists if a save snapshot
      // was found, so pushing it raw would leave a hole that Phaser's
      // camera.ignore() chokes on with "Cannot read properties of undefined
      // (reading 'isParent')".
      this._hudObjects.push(
        ...[
          this.hudScore, this.hudMult, this.hudDist, this.hudRegion, this.hudStars, this.hudHP, this.hudHPDamage, this.hudGas, this.hudGasIcon, this.hudAccelBar,
          this.hudSpeed, this.hudRadio, this.hudPopup, this._trapSign,
          this.hudRearCop, this.hudRestStop, this.hudHelicopter, this.hudHelicopterImg,
          this._titleScrim, this._titleBackdrop, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
          this._titleResume,    this._titleResumeTxt,
          this._titleEnterCode, this._titleEnterCodeTxt,
          ...(this._titleDifficultyBtns ?? []),
          ...(this._titleLetters ?? []),
        ].filter(Boolean),
      );
      // The unnamed "MPH" + "R=next M=mute" sublabels are the only un-tracked
      // children. Walk the display list and grab them by detecting siblings
      // at the right edge that aren't already tracked. Cheaper: capture
      // them via setName at creation time below.
    }
  }

  /** Out-of-gas → AAA tow.  Charges 50% of player's cash + delivers
   *  to the PREVIOUS rest stop (so they don't accidentally finish the
   *  game on a freebie).  If player has $0, falls back to repo logic
   *  (loses non-Beater vehicle, free tow back in the Beater). */
  _runTow() {
    const cash    = this.score ?? 0;
    const aaaCost = Math.floor(cash * 0.50);
    const curMile = (this.player.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
    // Previous rest stop = the last one whose mileage <= curMile.
    let prevStop = null;
    for (const rs of REST_STOPS) {
      if (rs.mileage <= curMile) prevStop = rs;
      else break;
    }
    if (cash > 0) {
      this.score -= aaaCost;
      this._showPopup?.(`🚚 AAA — $${aaaCost.toLocaleString()}`, '#FFCC44');
    } else if (this.player.vehicleId !== 'beater') {
      // No cash AND non-Beater → repo.
      this._showPopup?.(`💀 REPO'D — back to the Beater`, '#FF4444');
      const owned = (this.registry.get('ownedVehicles') ?? ['beater'])
        .filter(v => v !== this.player.vehicleId);
      if (!owned.includes('beater')) owned.unshift('beater');
      this.registry.set('ownedVehicles', owned);
      this.registry.set('vehicleId',     'beater');
      this.player.vehicleId = 'beater';
    } else {
      this._showPopup?.(`🚚 FREE TOW (broke + Beater)`, '#FFCC44');
    }
    const _veh = VEHICLES[this.player.vehicleId];
    this.player.gasMaxMi = _veh.rangeMi;
    this.player.gasMi    = _veh.rangeMi;
    if (prevStop) {
      this.player.position = prevStop.t * (ROUTE_SEGS * SEG_LENGTH);
    }
    this._strandedShown = false;
  }

  /** Black-screen ad placeholder for sleep / charging.  Pauses the game
   *  and overlays a full-screen black rect with white "AD" text for ms
   *  milliseconds, then resumes.  Real ad SDK wiring is a future job;
   *  for now this is a 5-second blocked input. */
  _showAdScreen(ms) {
    if (this._adActive) return;
    this._adActive = true;
    const wasPaused = this._paused;
    this._paused = true;
    this.audio?.setPaused?.(true);
    const overlay = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 1)
      .setOrigin(0).setDepth(1000);
    const text = this.add.text(SCREEN_W / 2, SCREEN_H / 2, 'AD', {
      fontSize: '64px', fontFamily: IMPACT, color: '#FFFFFF',
      stroke: '#222', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1001);
    if (this._hudObjects) {
      this._hudObjects.push(overlay, text);
      this.cameras.main?.ignore?.([overlay, text]);
    }
    this.time.delayedCall(ms, () => {
      overlay.destroy();
      text.destroy();
      this._paused = wasPaused;
      if (!wasPaused) this.audio?.setPaused?.(false);
      this._adActive = false;
    });
  }

  _renderHUD() {
    const p        = this.player;
    const progress = p.position / (ROUTE_SEGS * SEG_LENGTH);

    // ── HUD alpha modulation ─────────────────────────────────────
    // Fentanyl fades the readouts down ("screen shutting down"); meth +
    // LSD jitter the alpha each frame for the wired/glitchy feel.
    {
      const _phys  = this.effects?.getPhysics?.(this.drugs);
      const _fade  = _phys?.hudAlphaMul ?? 1;
      const _flick = _phys?.hudFlicker  ?? 0;
      const _alpha = Math.max(0, _fade * (_flick > 0 ? 1 - _flick * Math.random() : 1));
      if (this._hudObjects) {
        for (const obj of this._hudObjects) {
          if (obj && 'alpha' in obj) obj.alpha = _alpha;
        }
      }
    }

    // Top speed: 120 MPH base + 5 MPH per cocaine pickup (capped at OD).
    // ceil so a car actually rolling (< 0.5 mph) doesn't read as "0 MPH".
    const rawMph   = this._displayMPH();
    const _spd     = this._unitsKmh ? rawMph * 1.60934 : rawMph;
    const mph      = _spd > 0 && _spd < 1 ? 1 : Math.round(_spd);
    // Odometer: speed-derived at 4× time compression (120 mph → 120 mi/15 min)
    const milesRaw = this._odometer ?? 0;
    const miles    = Math.floor(milesRaw);
    const palette  = getPaletteAtProgress(Math.min(progress, 0.999));

    {
      const scoreStr = `$${Math.round(this.score).toLocaleString()}`;
      if (this.hudScore.text !== scoreStr) this.hudScore.setText(scoreStr);
    }

    // Car HP — green > 50, orange > 20, red ≤ 20.  Reads from the existing
    // DamageModel (max 100) so all takeDamage calls feed the same number.
    if (this.hudHP && this.damage) {
      // CEIL so the displayed HP only reads "0" once durability is
      // ACTUALLY 0 (and the wreck event has fired).  Math.round used
      // to show "0 HP" at durability 0.49, which made the game look
      // like it kept going after the readout hit zero.
      const dur = this.damage.getDurability?.() ?? 100;
      const hp  = Math.max(0, Math.ceil(dur));
      const hpStr = `${hp} HP`;
      if (this.hudHP.text !== hpStr) {
        this.hudHP.setText(hpStr).setColor('#FF39AF');
      }
    }
    // Hide the floating "-X" damage popup once its 1.5-s window passes.
    if (this.hudHPDamage?.visible && this._hpDamageUntil
        && (this.time?.now ?? 0) >= this._hpDamageUntil) {
      this.hudHPDamage.setVisible(false);
      this._hpDamageUntil = 0;
    }
    // Gas gauge — miles remaining.  Green > 30, amber 30→10, red ≤ 10
    // with a slow blink (sin gate) so the low-fuel state is unmistakable.
    // Also forces the warning state when an upcoming rest-stop exit is
    // ≤1 mi ahead (so the player notices their tank as a refuel option
    // approaches), per spec.
    if (this.hudGas) {
      const gas = Math.max(0, Math.round(this.player.gasMi ?? 0));
      // Colorblind cue — a "!"/"!!" prefix so the urgency reads without color
      // (redundant with the gas_full↔gas_empty icon swap).
      const gCue = this._colorblind
        ? (gas <= 0 ? '' : gas <= 10 ? '!! ' : gas <= GAS_LIGHT_AT_MI ? '! ' : '')
        : '';
      // Color tracks the gas level only.  The old near-exit warning
      // flicker (orange when ≤1 mi from a rest stop) was dropped per
      // player feedback — it made the gas readout strobe between
      // blue and orange as exits passed.
      let gColor;
      if (this._colorblind) {
        // CB: critical pulses on LUMINANCE (white↔blue), never red↔dark.
        if (gas <= 0)                    gColor = '#BBBBBB';
        else if (gas <= 10)              gColor = (Math.sin(this.gameTime * 6) > 0 ? '#FFFFFF' : '#39A8FF');
        else if (gas <= GAS_LIGHT_AT_MI) gColor = '#FFAA22';
        else                             gColor = '#39A8FF';
      } else {
        if (gas <= 0)                    gColor = '#888888';
        else if (gas <= 10)              gColor = (Math.sin(this.gameTime * 6) > 0 ? '#FF2244' : '#660000');
        else if (gas <= GAS_LIGHT_AT_MI) gColor = '#FFAA22';
        else                             gColor = '#39A8FF';
      }
      // If the PNG icon is mounted, render text-only (no emoji); icon
      // texture swaps to gas_empty once miles ≤ GAS_LIGHT_AT_MI (30).
      if (this.hudGasIcon) {
        const gStr = gas <= 0 ? 'EMPTY' : `${gCue}${gas} mi`;
        if (this.hudGas.text !== gStr) this.hudGas.setText(gStr);
        if (this.hudGas.style.color !== gColor) this.hudGas.setColor(gColor);
        const wantKey = gas <= GAS_LIGHT_AT_MI ? 'ui_gas_empty' : 'ui_gas_full';
        if (this.hudGasIcon.texture.key !== wantKey
            && this.textures.exists(wantKey)) {
          this.hudGasIcon.setTexture(wantKey);
        }
        // Position icon just OUTWARD of the Speed number — away from
        // the mirror.  Speed cluster mirrors with handedness, so the
        // icon hugs Speed's outward edge on both sides.
        const tb = this.hudSpeed?.getBounds?.();
        if (tb) {
          const GAP = 5, ICON_HALF = 12;
          this.hudGasIcon.x = this._leftHanded
            ? (tb.left  - GAP - ICON_HALF)
            : (tb.right + GAP + ICON_HALF);
        }
      } else {
        const gStr = gas <= 0 ? '⛽ EMPTY' : `⛽ ${gCue}${gas} mi`;
        if (this.hudGas.text !== gStr) this.hudGas.setText(gStr);
        if (this.hudGas.style.color !== gColor) this.hudGas.setColor(gColor);
      }
    }
    // Accel-pedal charge bar — thin status bar directly below the gas
    // readout; width matches the live gas text bounds so it stretches
    // with the readout no matter what's displayed ("EMPTY", "180 mi",
    // etc.).  Colour shifts from green → amber → red as it depletes.
    if (this.hudAccelBar && this.hudGas) {
      const tb = this.hudGas.getBounds?.();
      this.hudAccelBar.clear();
      if (tb) {
        const barH = 4;
        const barY = tb.bottom + 2;
        const barX = tb.left;
        const barW = tb.width;
        const pct  = Math.max(0, Math.min(1, (this._accelCharge ?? 100) / 100));
        // CB: danger-red → orange (no red↔blue ambiguity), plus two fixed
        // white ticks at the 20%/50% tier boundaries so the tier reads from
        // WHERE the fill edge sits, not its hue.
        const fillColor = this._colorblind
          ? (pct < 0.2 ? 0xFF7A00 : pct < 0.5 ? 0xFFAA00 : 0x39A8FF)
          : (pct < 0.2 ? 0xFF4444 : (pct < 0.5 ? 0xFFAA00 : 0x39A8FF));
        this.hudAccelBar.fillStyle(0x222222, 0.7).fillRect(barX, barY, barW, barH);
        this.hudAccelBar.fillStyle(fillColor, 0.95).fillRect(barX, barY, barW * pct, barH);
        if (this._colorblind) {
          this.hudAccelBar.fillStyle(0xFFFFFF, 0.9);
          this.hudAccelBar.fillRect(barX + Math.round(barW * 0.2), barY, 1, barH);
          this.hudAccelBar.fillRect(barX + Math.round(barW * 0.5), barY, 1, barH);
        }
      }
    }
    // Multiplier readout — just the number now ("×3.5"), no combo
    // name.  Combos still drive the score multiplier underneath and
    // still feed the Connoisseur achievement.
    const mult   = this._scoreMult();
    const combos = this.drugs.getActiveCombos?.() ?? [];
    if (combos.length) {
      this._combosFiredThisRun = this._combosFiredThisRun ?? new Set();
      for (const c of combos) this._combosFiredThisRun.add(c.key);
      const total = Object.keys(DRUG_COMBOS).length;
      if (this._combosFiredThisRun.size >= total && !this._connoisseurFired) {
        this._connoisseurFired = true;
        AchievementSystem.award('connoisseur', this.registry);
      }
    }
    if (mult > 1 || combos.length) {
      // Colorblind-safe ramp (blue→amber→orange) vs the default red/orange/
      // green — green↔red is the pair red-green CVD players can't separate.
      const tierColor = this._colorblind
        ? (mult >= 8 ? '#FF7A00' : mult >= 5 ? '#FFD23D' : '#3A9BFF')
        : (mult >= 8 ? '#FF2244' : mult >= 5 ? '#FFAA22' : '#44FF88');
      // Non-color tier cue (colorblind mode only): a redundant pip suffix so
      // the tier boundary survives without relying on the blue/amber/orange
      // hue. <5x → "·", 5-8x → "··", 8x+ → "···". The NON-colorblind text
      // ("×3.5") is left byte-identical — the cue is appended only when the
      // toggle is on.
      const tierCue = this._colorblind
        ? (mult >= 8 ? ' ···' : mult >= 5 ? ' ··' : ' ·')
        : '';
      this.hudMult
        .setText(`×${mult.toFixed(1)}${tierCue}`)
        .setColor(tierColor)
        .setVisible(true);
    } else {
      this.hudMult.setVisible(false);
    }
    {
      const _distVal = this._unitsKmh ? milesRaw * 1.60934 : milesRaw;
      const dStr = `${_distVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this._unitsKmh ? 'KM' : 'MI'}`;
      if (this.hudDist.text !== dStr) this.hudDist.setText(dStr);
      const sStr = `${mph}`;
      if (this.hudSpeed.text !== sStr) this.hudSpeed.setText(sStr);
      if (this._mphSub) {
        const _base = this._unitsKmh ? 'KM/H' : 'MPH';
        // CB: suffix the difficulty letter so the mode reads without color.
        const _u = this._colorblind
          ? `${_base}·${({ easy: 'E', normal: 'N', hard: 'H', custom: 'C' })[Difficulty.mode()] ?? 'N'}`
          : _base;
        if (this._mphSub.text !== _u) this._mphSub.setText(_u);
      }
    }
    // Re-apply the difficulty-tinted Speed color each frame.  _buildHUD's
    // initial color was being locked at scene-init time (before the
    // player tapped a difficulty button), so it stuck on the previous
    // mode's tone.  Resolved here against the current Difficulty.
    // Palette mirrors the title-screen chrome (pink/blue/red/purple).
    {
      // Must be CB-gated too, or it overwrites the colorblind build color.
      const tones = this._colorblind
        ? { easy: '#FFFFFF', normal: '#3A9BFF', hard: '#FF7A00', custom: '#FFD23D' }
        : { easy: '#FF39AF', normal: '#39A8FF', hard: '#FF2244', custom: '#CE67FF' };
      const c = tones[Difficulty.mode()] ?? tones.normal;
      if (this.hudSpeed && this.hudSpeed.style.color !== c) this.hudSpeed.setColor(c);
    }
    // Catch mid-run mode changes (e.g. title-carousel pick that
    // didn't trigger a scene rebuild).  Function early-returns when
    // the mode hasn't actually changed, so cost is one comparison.
    this._applyPedalModeUI?.();

    // Party clock readout — MM:SS, with color thresholds.  At 0 it shows
    // a ring-of-fire "TOO LATE" tag so the player knows the bonus is gone.
    if (this.hudPartyClock) {
      const sec   = Math.max(0, Math.floor(this._partyClockSec ?? 0));
      const mm    = Math.floor(sec / 60).toString().padStart(2, '0');
      const ss    = (sec % 60).toString().padStart(2, '0');
      // Default: white → yellow → orange-red → red urgency ramp.
      // Colorblind: white → amber → orange → blue-on-fire is no good
      // (orange↔red is the unreadable pair), so remap to a CVD-safe
      // blue→amber→orange ramp AND prefix a tier glyph so the urgency
      // band is legible from the symbol alone, not the color.
      //   >10m  ·     (calm)      / blue-white
      //   5-10m ·!    (heads up)  / amber
      //   <5m   ·!!   (hurry)     / orange
      //   0     ✖     (TOO LATE)  / orange (kept bright)
      const color = this._colorblind
        ? (sec <= 0  ? '#FF7A00'
         : sec < 300 ? '#FF7A00'      // < 5 min  (orange)
         : sec < 600 ? '#FFD23D'      // < 10 min (amber)
         :             '#9CD3FF')     // calm     (blue-white)
        : (sec <= 0  ? '#FF2244'
         : sec < 300 ? '#FF6644'      // < 5 min
         : sec < 600 ? '#FFCC44'      // < 10 min
         :             '#FFFFFF');
      const tag = this._colorblind
        ? (sec < 300 ? ' !!' : sec < 600 ? ' !' : '')
        : '';
      const pStr = sec <= 0
        ? (this._colorblind ? '⏱  ✖ TOO LATE' : '⏱  TOO LATE')
        : `⏱${tag}  ${mm}:${ss}`;
      if (this.hudPartyClock.text !== pStr) this.hudPartyClock.setText(pStr);
      if (this.hudPartyClock.style.color !== color) this.hudPartyClock.setColor(color);
    }
    // Bottom-center label tracks the LAST FREEWAY SIGN the player has
    // passed (rest-stop exit signs + pass-through city signs).  Each
    // sign is posted 1 mi before its target mileage, so the HUD updates
    // a mile early as the player approaches.  Falls back to the
    // CHECKPOINTS / palette name before the first sign is passed.
    {
      const mileNow = progress * TOTAL_ROUTE_MILES;
      const rStr = getLastSignTown(mileNow) || getLocationName(progress) || palette.name || '';
      if (this.hudRegion.text !== rStr) this.hudRegion.setText(rStr);
    }
    // Park hudDist (mileage) immediately to the LEFT of hudRegion so
    // the two read as one "8 MI  WASHINGTON" line.  Done here because
    // region's bounds change with the location name length.
    if (this.hudDist && this.hudRegion) {
      const rb = this.hudRegion.getBounds?.();
      if (rb) this.hudDist.x = rb.left - 8;
    }
    // Keep the in-game mute icon in sync with the audio system —
    // covers any path that flips audio.muted from outside this
    // button's own click handler (iPhone-menu long-press, etc.).
    if (this.hudMuteLbl) {
      const muted = !!this.audio?.muted;
      if (this._hudMuteIconState !== muted) {
        this._hudMuteIconState = muted;
        this._setTopRowButtonTexture(this.hudMuteLbl, 'mute', muted, 56);
      }
    }
    const stars = this.cops.starDisplay;
    let starsText = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
    // Surface whichever per-type counter is closest to busting the player
    // — the user's about-to-die meter, not a generic total.
    const cs = this.cops;
    const tallies = [];
    if (cs.rearBumpCount > 0) tallies.push(`RAM ${cs.rearBumpCount}/5`);
    if (cs.headOnCount   > 0) tallies.push(`HEAD-ON ${cs.headOnCount}/3`);
    if (cs.pitCount      > 0) tallies.push(`PIT ${cs.pitCount}/1`);
    if (tallies.length) starsText += `  •  ${tallies.join('  ')}`;
    if (this.hudStars.text !== starsText) this.hudStars.setText(starsText);

    {
      const rName = this.audio.currentName;
      if (this.hudRadio.text !== rName) this.hudRadio.setText(rName);
    }
    if (this.hudMuteLbl) {
      const muted = !!this.audio?.muted;
      if (this._hudMuteIconState !== muted) {
        this._hudMuteIconState = muted;
        this._setTopRowButtonTexture(this.hudMuteLbl, 'mute', muted, 56);
      }
    }

    // ── Rear-view mirror — populate sprite pools with rear scene ──
    if (this.hudMirrorGlass && this._mirrorBounds && this._mirrorCarPool && !this._perf?.noMirror) {
      const mb = this._mirrorBounds;
      const carPool      = this._mirrorCarPool;
      const buildingPool = this._mirrorBuildingPool;
      // Reset all pool slots to invisible — anything we don't reuse
      // this frame stays hidden.
      for (const s of carPool)      s.setVisible(false);
      for (const s of buildingPool) s.setVisible(false);

      // ── Repaint mirror interior with live world colours ─────────
      const mg = this.hudMirrorGlass;
      mg.clear();
      // Detect what's BEHIND the player so the mirror can paint the
      // correct backdrop — open road shows sky + grass, tunnel shows
      // concrete, water bridge shows water tile.
      const segsForState = this.road?.segments;
      const playerSegIdx = segsForState?.length
        ? (Math.floor(p.position / SEG_LENGTH) % segsForState.length + segsForState.length) % segsForState.length
        : 0;
      const playerSeg = segsForState?.[playerSegIdx];
      const inTunnel  = !!playerSeg?.tunnel;
      // West Seattle bridge crosses paved port flats with two short
      // water channels — only paint open water when the segment is
      // *actually* over water (seg.water) or over one of the WS
      // channels (seg.bridgeWaterChannel).  Bare bridge-over-port-land
      // shows grey port flats instead.
      const onWaterChannel = !!playerSeg?.bridgeWaterChannel;
      const onWater     = !!playerSeg?.water || onWaterChannel;
      const onPortBridge = !!playerSeg?.bridge && !onWater;
      const onWaterLeft = !!playerSeg?.waterLeft && !onWater;

      const _mileMirror = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const duskT  = TimeOfDay.duskAmount(_mileMirror);
      const nightT = TimeOfDay.nightAmount(_mileMirror);
      const DUSK_TOP  = 0xC56B3D, DUSK_FOG = 0xE8A06E;
      const NIGHT_TOP = 0x06080F, NIGHT_FOG = 0x0E1424;
      const skyTop = lerpColor(lerpColor(palette.sky, DUSK_TOP, duskT), NIGHT_TOP, nightT);
      const skyFog = lerpColor(lerpColor(palette.fog, DUSK_FOG, duskT), NIGHT_FOG, nightT);

      if (inTunnel) {
        // TUNNEL — solid concrete ceiling + walls.  The mirror reflects
        // the tunnel interior the player just drove through, NOT open
        // sky as it was doing before.
        mg.fillStyle(0x4E4A40, 1);
        mg.fillRect(mb.glassX, mb.glassY, mb.glassW, mb.glassH * 0.55);
        mg.fillStyle(0x6E6A60, 1);
        mg.fillRect(mb.glassX, mb.glassY + mb.glassH * 0.55, mb.glassW, mb.glassH * 0.07);
      } else {
        // Sky: gradient top→horizon (4 thin slices reads smooth at this size).
        const skySliceH = (mb.horizonY - mb.glassY) / 4;
        for (let i = 0; i < 4; i++) {
          const tt = i / 4;
          mg.fillStyle(lerpColor(skyTop, skyFog, tt), 1);
          mg.fillRect(mb.glassX, mb.glassY + i * skySliceH,
                      mb.glassW, skySliceH + 1);
        }
      }
      // ── Lateral parallax — road shifts opposite the player's drift ──
      const playerLane   = p.x ?? 0;
      const lateralShift = -playerLane * (mb.glassW * 0.55);
      const drawnRoadCx  = mb.roadCx + lateralShift;

      // ── Curvature — sample segments BEHIND the player and accumulate
      // their curve to bend the rear-view's vanishing point.  Mirror
      // image: a left turn forward shows as the road bending to the
      // RIGHT in the rear-view, so we negate the sum.
      const segsForCurve = this.road?.segments;
      let curveShift   = 0;
      if (segsForCurve?.length) {
        const startBack = Math.floor(p.position / SEG_LENGTH);
        let acc = 0;
        for (let n = 1; n <= 80; n++) {
          const idx = (startBack - n + segsForCurve.length) % segsForCurve.length;
          const c = segsForCurve[idx]?.curve ?? 0;
          // Earlier (closer-to-camera) segments contribute more.
          acc += c * (1 - n / 80);
        }
        // Scale so a full curve impulse (~0.012 sustained) shifts the
        // horizon point ~glassW * 0.30.
        curveShift = -acc * (mb.glassW * 1.4);
        // Clamp so the bend stays inside the glass even on hairpins.
        curveShift = Math.max(-mb.glassW * 0.30,
                     Math.min( mb.glassW * 0.30, curveShift));
      }
      // Vanishing point — combines lateral parallax with the curve bend.
      const horizonCx = mb.roadCx + lateralShift + curveShift;

      // Ground beneath the horizon — context-aware: grass on open road,
      // concrete walls in a tunnel, deep-blue water on a bridge.  For
      // waterLeft segments (West Seattle approach mile 0-1) the ground
      // is SPLIT — water on one side of the road, grass on the other.
      // The mirror preserves the driver's left/right frame, so water
      // (forward-LEFT) stays on mirror-LEFT.
      const groundY = mb.horizonY;
      const groundH = mb.glassY + mb.glassH - mb.horizonY;
      if (inTunnel) {
        mg.fillStyle(0x55524A, 1);
        mg.fillRect(mb.glassX, groundY, mb.glassW, groundH);
      } else if (onWater) {
        mg.fillStyle(0x1E3850, 1);
        mg.fillRect(mb.glassX, groundY, mb.glassW, groundH);
      } else if (onPortBridge) {
        // Paved port flats below the West Seattle high bridge — grey
        // gravel/concrete, not lake water.
        mg.fillStyle(0x4A4742, 1);
        mg.fillRect(mb.glassX, groundY, mb.glassW, groundH);
      } else if (onWaterLeft) {
        const grass = palette.grass1 ?? 0x3F6E40;
        const water = 0x1E3850;
        // Real rear-view mirrors preserve the driver's left/right frame —
        // an object forward-LEFT stays on the mirror LEFT when seen
        // behind you (the eye-to-mirror-to-rear bounce keeps left as
        // left). Water on the forward-LEFT → water on mirror LEFT.
        mg.fillStyle(water, 1);
        mg.fillRect(mb.glassX, groundY, drawnRoadCx - mb.glassX, groundH);
        mg.fillStyle(grass, 1);
        mg.fillRect(drawnRoadCx, groundY, (mb.glassX + mb.glassW) - drawnRoadCx, groundH);
      } else {
        mg.fillStyle(palette.grass1 ?? 0x3F6E40, 1);
        mg.fillRect(mb.glassX, groundY, mb.glassW, groundH);
      }
      // Road trapezoid — converges to horizon vanishing point (curved!)
      // from the bottom edges (parallax-shifted only).  Mask clips any
      // overspill to the glass area.
      mg.fillStyle(palette.road2 ?? palette.road1 ?? 0x2A2A2A, 1);
      mg.fillPoints([
        { x: horizonCx - 1,               y: mb.horizonY },
        { x: horizonCx + 1,               y: mb.horizonY },
        { x: drawnRoadCx + mb.roadHalfW,  y: mb.roadBotY },
        { x: drawnRoadCx - mb.roadHalfW,  y: mb.roadBotY },
      ], true);
      // Horizon line.
      mg.lineStyle(1, lerpColor(skyFog, 0x000000, 0.3), 0.6);
      mg.beginPath();
      mg.moveTo(mb.glassX + 2, mb.horizonY);
      mg.lineTo(mb.glassX + mb.glassW - 2, mb.horizonY);
      mg.strokePath();
      // ── Road markings — match the forward view (yellow double in
      // the centre, white dashed lane lines + solid white edge lines).
      // Lines converge from the road's bottom edges to the (curved!)
      // vanishing point at horizonCx so they bend with the road.
      const yellowCol = 0xFFEE44;
      const whiteCol  = 0xF6F2DC;
      const horizonX  = horizonCx;            // curved vanishing point
      const stripeAt  = (xRatio, color, alpha) => {
        // xRatio in [-1..+1]: -1 = far-left edge of mirror road, +1 = far-right.
        const xBot = drawnRoadCx + xRatio * mb.roadHalfW;
        mg.lineStyle(1, color, alpha);
        mg.beginPath();
        mg.moveTo(xBot, mb.roadBotY);
        mg.lineTo(horizonX, mb.horizonY);
        mg.strokePath();
      };
      // White edge lines — left & right outer stripes.
      stripeAt(-1.00, whiteCol, 0.65);
      stripeAt( 1.00, whiteCol, 0.65);
      // White dashed lane dividers — interior of each carriageway.
      // Render as 4 dashes per side so they read as broken lines.
      const dashedStripeAt = (xRatio, color, alpha) => {
        const xBot = drawnRoadCx + xRatio * mb.roadHalfW;
        mg.lineStyle(1, color, alpha);
        const dashes = 4;
        for (let i = 0; i < dashes; i++) {
          const t1 = (i + 0.10) / dashes;
          const t2 = (i + 0.60) / dashes;
          // Each dash also tapers in x toward the horizon (perspective).
          const x1 = xBot + (horizonX - xBot) * t1;
          const x2 = xBot + (horizonX - xBot) * t2;
          const y1 = mb.roadBotY + (mb.horizonY - mb.roadBotY) * t1;
          const y2 = mb.roadBotY + (mb.horizonY - mb.roadBotY) * t2;
          mg.beginPath();
          mg.moveTo(x1, y1);
          mg.lineTo(x2, y2);
          mg.strokePath();
        }
      };
      dashedStripeAt(-0.50, whiteCol, 0.60);
      dashedStripeAt( 0.50, whiteCol, 0.60);
      // Yellow double centre line — two parallel solid lines, slightly
      // offset on either side of the median.
      stripeAt(-0.05, yellowCol, 0.85);
      stripeAt( 0.05, yellowCol, 0.85);
      // Stash both centres so projectRear() can interpolate between
      // them — cars at the bottom of the mirror anchor on drawnRoadCx,
      // cars near the horizon converge to horizonCx (curved).
      mb._dynamicRoadCx = drawnRoadCx;
      mb._horizonCx     = horizonCx;
      mb._playerLane    = playerLane;

      // Project (relZ, laneOffset) onto the mirror's rear-perspective
      // road.  Linear depth — simpler than full pseudo-3D, reads fine
      // inside a 50-px panel.  Lateral position factors in the player's
      // own lane so cars stay attached to the parallax-shifted road
      // (i.e. an NPC in your lane stays directly behind your sprite).
      const dynRoadCx = mb._dynamicRoadCx ?? mb.roadCx;
      const horizonCx2 = mb._horizonCx     ?? mb.roadCx;
      const playerLn  = mb._playerLane ?? 0;
      const projectRear = (relZ, laneOffset, maxZ) => {
        const t      = Math.max(0, Math.min(1, relZ / maxZ));
        const depthT = 1 - t;     // 0 = at horizon, 1 = right behind you
        const yMin   = mb.horizonY + 1;
        const yMax   = mb.roadBotY - 1;
        const y      = yMin + depthT * (yMax - yMin);
        const halfW  = mb.roadHalfW * depthT;
        // Centerline interpolates from horizon (curved) at depthT=0 to
        // the bottom-edge (parallax-shifted only) at depthT=1, so a car
        // far back follows the curve and a car right behind you doesn't.
        const centerX = dynRoadCx + (horizonCx2 - dynRoadCx) * (1 - depthT);
        const x      = centerX + ((laneOffset ?? 0) - playerLn) * (halfW + 4);
        return { x, y, depthT };
      };

      // Helper — set a pool sprite to a texture and place it.  Caps
      // height by depth so a close-by car stays inside the glass.
      const placeSprite = (s, tex, x, y, depthT, maxH = 26) => {
        if (s.texture.key !== tex && this.textures.exists(tex)) s.setTexture(tex);
        const t  = this.textures.get(s.texture.key).source[0];
        const tw = t?.width  || 64;
        const th = t?.height || 32;
        const targetH = Math.max(2.5, 2 + depthT * (maxH - 2));
        const targetW = targetH * (tw / th);
        s.setDisplaySize(targetW, targetH);
        s.setPosition(x, y);
        s.setVisible(true);
      };

      // Buildings the player has driven past — scenery flanking the
      // mirror road.  Anchor the iteration on the player's VISUAL z
      // (camera + virtual_Z) so buildings that have just slipped past
      // the visible player car are picked up immediately.
      // Mirror draw distance — extended so sprites shrink all the way
      // to the vanishing point (where the road lines converge) before
      // they pop out of existence.  Previously buildings stopped at 40
      // segments (8000 u) and cars/cops at 9000–12000 u, making things
      // vanish well short of the horizon.  180 segs ≈ 36000 u puts the
      // farthest visible sprite at depthT=0 (the centerpoint).
      const MIRROR_FAR_Z = 36000;
      const segs = this.road?.segments;
      let usedBuildings = 0;
      if (segs?.length) {
        const visualSegIdx = Math.floor((p.position + PLAYER_VIRTUAL_Z) / SEG_LENGTH);
        for (let n = 1; n <= 180 && usedBuildings < buildingPool.length; n++) {
          const segIdx = (visualSegIdx - n + segs.length) % segs.length;
          const seg = segs[segIdx];
          if (!seg?.sprites) continue;
          for (const sp of seg.sprites) {
            if (sp.collected || !sp.texKey) continue;
            if (sp.isCollectible || sp.copEncounter) continue;
            if (sp.type !== 'building' && sp.type !== 'house'
                && sp.type !== 'tree')  continue;
            const vz = n * SEG_LENGTH + SEG_LENGTH / 2;
            const proj = projectRear(vz, sp.offset, MIRROR_FAR_Z);
            const s = buildingPool[usedBuildings++];
            placeSprite(s, sp.texKey, proj.x, proj.y, proj.depthT, 22);
            // Same auto-mirror rule as the forward scene-sprite pass:
            // Every scenery PNG is authored as a right-side building
            // (per user convention).  Left-side instances flip
            // unconditionally — `_left` / `_right` suffixes are
            // cosmetic only.
            const autoFlipLeft = (sp.type === 'building' || sp.type === 'house')
              && (sp.offset ?? 0) < 0;
            s.setFlipX(!!sp.flipX || autoFlipLeft);
            if (usedBuildings >= buildingPool.length) break;
          }
        }
      }

      // NPC cars — use car_front_<colorSet> so we see grilles + headlights,
      // matching what you'd see looking backward.  "Behind player" =
      // car is at a smaller z than the player's VISUAL position
      // (player.position + PLAYER_VIRTUAL_Z), even if it hasn't yet
      // passed the camera plane.  vz is the world-space distance
      // BEHIND the player car: 0 = right at the player's visual z,
      // bigger = further back.
      // Cars + cops use MIRROR_FAR_Z so they shrink all the way to the
      // vanishing point.  Sort FAR-FIRST so a car that's been falling
      // behind keeps its pool slot as it shrinks toward the horizon
      // (and near paints over far on overlap).  Pool overflow drops
      // brand-new cars instead — they reappear next frame anyway.
      let usedCars = 0;
      const visualPlayerZ = p.position + PLAYER_VIRTUAL_Z;
      // Cars within MIRROR_NEAR_CULL of the player's PHYSICAL position
      // are big on the main game screen — drop them from the mirror so
      // we don't see "the whole car" in the rearview at the same time
      // it's right next to the player.
      const MIRROR_NEAR_CULL = PLAYER_VIRTUAL_Z;
      const carsBehind = (this.traffic ?? [])
        .map(c => ({ c, vz: visualPlayerZ - c.position }))
        .filter(o => o.c.alive && o.vz > MIRROR_NEAR_CULL && o.vz <= MIRROR_FAR_Z)
        .sort((a, b) => b.vz - a.vz);   // far first → near paints over far
      // Mirror-side light gating — same TimeOfDay check used in the
      // forward view so headlights / tail lights only appear at dusk+.
      const _mileMirrorHl = (p.position / (ROUTE_SEGS * SEG_LENGTH)) * TOTAL_ROUTE_MILES;
      const _darknessMirror = TimeOfDay.darkness?.(_mileMirrorHl) ?? 0;
      const _hlOnMirror     = TimeOfDay.headlightsOn?.(_mileMirrorHl) ?? false;
      const NPC_PEAK_M = 0.10;                       // matches forward-view cap
      const lightAM    = _darknessMirror * NPC_PEAK_M;
      const haloAM     = _darknessMirror * NPC_PEAK_M * 0.6;
      for (const { c: car, vz } of carsBehind) {
        if (usedCars >= carPool.length) break;
        const proj = projectRear(vz, car.laneOffset, MIRROR_FAR_Z);
        // In the mirror, same-direction NPCs (behind player, going the
        // same way) are facing the player → show FRONT.  Oncoming NPCs
        // have already passed the player and are receding → show BACK.
        const wasOncoming = (car.speed ?? 0) < 0;
        const facing  = wasOncoming ? 'back' : 'front';
        const tex     = `car_${facing}_${car.colorSet ?? 'white'}`;
        const fallback = this.textures.exists(tex) ? tex : `car_${facing}_white`;
        const slot    = carPool[usedCars++];
        placeSprite(slot, fallback, proj.x, proj.y, proj.depthT, 18);
        // Lights in the mirror — mirror the forward-view rules.
        // Same-direction traffic in the mirror is, perspective-wise,
        // exactly what oncoming traffic looks like in the forward view
        // (cars driving toward the camera with their headlights on);
        // oncoming traffic that has just passed the player is now what
        // same-direction traffic looks like ahead (cars receding with
        // their tail lights showing).  Apply matching halos.
        if (_hlOnMirror) {
          const targetW = slot.displayWidth;
          const targetH = slot.displayHeight;
          const dotR    = targetW * 0.045;
          if (!wasOncoming) {
            // Same-direction in mirror → same rules as forward-view
            // oncoming cars: yellow lamp halos at the headlight
            // housings, two cones meeting at the centerline at the
            // bottom, bottom-half yellow splash whose flat top kisses
            // the cone bottoms.  Brightened ~1.5× in the mirror only
            // (mirror sprites are tiny, the extra glow reads better
            // at small scale).
            const MIRROR_HL_BOOST = 1.5;
            const isTallM      = car.colorSet && /truck|suv/i.test(car.colorSet);
            const headlightFrac = isTallM ? 0.65 : 0.50;
            const lampY         = proj.y - targetH * headlightFrac;
            const haloR        = Math.max(0.9, dotR * 3.0);
            const coreR        = Math.max(0.4, dotR * 1.2);
            const grilleDx     = Math.max(0, targetW * 0.42 - haloR);
            const NEAR_END_G   = 1500;
            const FAR_START_G  = 12000;
            const distFactorM  = Math.max(0, Math.min(1,
                                 (vz - NEAR_END_G) / (FAR_START_G - NEAR_END_G)));
            const coneEndY     = proj.y + targetH * (0.45 + 0.25 * distFactorM);
            const groundW      = Math.max(2.0, targetW * 0.55);
            const groundH      = Math.max(1.0, targetW * 0.15);
            const splashCY     = coneEndY;
            mg.blendMode = Phaser.BlendModes.ADD;
            // ── 4: two yellow cones meeting at the centerline ──
            mg.fillStyle(0xFFD850, Math.min(1, _darknessMirror * 0.12 * MIRROR_HL_BOOST));
            // LEFT cone
            mg.beginPath();
            mg.moveTo(proj.x - grilleDx - haloR * 0.5, lampY);
            mg.lineTo(proj.x - grilleDx + haloR * 0.5, lampY);
            mg.lineTo(proj.x,                          coneEndY);
            mg.lineTo(proj.x - groundW,                coneEndY);
            mg.closePath();
            mg.fillPath();
            // RIGHT cone
            mg.beginPath();
            mg.moveTo(proj.x + grilleDx - haloR * 0.5, lampY);
            mg.lineTo(proj.x + grilleDx + haloR * 0.5, lampY);
            mg.lineTo(proj.x + groundW,                coneEndY);
            mg.lineTo(proj.x,                          coneEndY);
            mg.closePath();
            mg.fillPath();
            // ── 3: bottom-half yellow splash, flat top at coneEndY ──
            mg.fillStyle(0xFFD850, Math.min(1, lightAM * 1.4 * MIRROR_HL_BOOST));
            const ARC_STEPS_M = 18;
            mg.beginPath();
            mg.moveTo(proj.x + groundW, splashCY);
            for (let _i = 1; _i <= ARC_STEPS_M; _i++) {
              const _a = Math.PI * (_i / ARC_STEPS_M);
              mg.lineTo(proj.x + groundW * Math.cos(_a),
                        splashCY + groundH * Math.sin(_a));
            }
            mg.closePath();
            mg.fillPath();
            // ── 1 & 2: yellow lamp halos at the headlight housings ──
            mg.fillStyle(0xFFD850, Math.min(1, lightAM * MIRROR_HL_BOOST));
            mg.fillCircle(proj.x - grilleDx, lampY, haloR);
            mg.fillCircle(proj.x + grilleDx, lampY, haloR);
            mg.fillStyle(0xFFE680, Math.min(1, lightAM * 1.4 * MIRROR_HL_BOOST));
            mg.fillCircle(proj.x - grilleDx, lampY, coreR);
            mg.fillCircle(proj.x + grilleDx, lampY, coreR);
            mg.blendMode = Phaser.BlendModes.NORMAL;
          } else {
            // Oncoming-then-passed in mirror → simple red brake-light
            // halos only (no cones, no splash — brake lights don't
            // project beams onto the road).  Mid-height of the car
            // (cars 0.50, trucks a little higher at 0.55), outer
            // edge of the halo aligned with the outer edge of the
            // sprite.
            const isTallM   = car.colorSet && /truck|suv/i.test(car.colorSet);
            const tailFrac  = isTallM ? 0.55 : 0.50;
            const tailY     = proj.y - targetH * tailFrac;
            const haloR     = Math.max(0.9, dotR * 3.0);
            const coreR     = Math.max(0.4, dotR * 1.2);
            const tailDx    = Math.max(0, targetW * 0.50 - haloR);
            mg.blendMode = Phaser.BlendModes.ADD;
            mg.fillStyle(0xFF2A1A, lightAM);
            mg.fillCircle(proj.x - tailDx, tailY, haloR);
            mg.fillCircle(proj.x + tailDx, tailY, haloR);
            mg.fillStyle(0xFF5544, Math.min(1, lightAM * 1.4));
            mg.fillCircle(proj.x - tailDx, tailY, coreR);
            mg.fillCircle(proj.x + tailDx, tailY, coreR);
            mg.blendMode = Phaser.BlendModes.NORMAL;
          }
        }
      }

      // Rear cops — front-view police art.  Strobe lights on the roof
      // are baked into the texture, so no per-frame flashing needed.
      const copsBehind = (this.cops?.cops ?? [])
        .map(c => ({ c, vz: visualPlayerZ - c.position }))
        .filter(o => o.vz > MIRROR_NEAR_CULL && o.vz <= MIRROR_FAR_Z)
        .sort((a, b) => b.vz - a.vz);
      for (const { c: cop, vz } of copsBehind) {
        if (usedCars >= carPool.length) break;
        const proj = projectRear(vz, cop.laneOffset, MIRROR_FAR_Z);
        const tex = this.textures.exists('car_front_police') ? 'car_front_police' : 'car_front_white';
        placeSprite(carPool[usedCars++], tex, proj.x, proj.y, proj.depthT, 20);
      }

      // (Previously this trailing .clear() erased the dot-drawing pass;
      // the dots are gone now and the live-palette backdrop above
      // already starts with mg.clear(), so nothing left to do here.)
    }

    // Rear cop pursuit indicator — pseudo-3D can't render behind the player,
    // so we show a HUD chevron when a cop is closing from the rear.
    const rear = this.cops.getRearCopInfo?.(p.position);
    if (rear?.count) {
      const distFt = Math.max(1, Math.round(-rear.nearestRelZ / 10));
      this.hudRearCop
        .setText(`${this._colorblind ? '[!] ' : ''}◀ PURSUIT ${rear.count > 1 ? '×' + rear.count + ' ' : ''}— ${distFt} ft behind`)
        .setVisible(true);
    } else {
      this.hudRearCop.setVisible(false);
    }

    this._drawDrugBars();
    this._drawF12Inventory();

    // Popup position depends on view mode.  Chase view: bottom-centre, just
    // ABOVE the mile/town location line — bottom-anchored (origin 0.5,1) so
    // multi-line toasts grow UP.  Cockpit view: no rear-view at the top and
    // the dashboard fills the lower screen, so park popups on the dashboard
    // panel (top-anchored, as before) where they read against the dark dash.
    if (this._cockpitActive) {
      this.hudPopup.setOrigin(0.5, 0).setY(Math.floor(SCREEN_H * 0.72));
    } else {
      this.hudPopup.setOrigin(0.5, 1).setY(HUD_POPUP_BOTTOM_Y);
    }
    this.hudPopup
      .setVisible(this.popupTimer > 0)
      .setAlpha(Math.min(1, this.popupTimer * 2));

// 5★ helicopter overlay — hovers above the road, sway + bob + rotor.
    if (this.cops.helicopterActive) {
      const phase = (this.cops.helicopterPhase ?? 0);
      const sway  = Math.sin(phase * 2.4) * 60;
      const bobY  = 96 + Math.sin(phase * 1.6) * 6;
      const x     = SCREEN_W / 2 + sway;
      if (this.hudHelicopterImg) {
        // Pick rotor frame + facing.  `sway < 0` = banking left → use the
        // _flip variants so the chopper visually leans the right way.
        const facingLeft = sway < 0;
        const rotorFrame = (Math.sin(phase * 28) > 0) ? 1 : 2;
        const key = facingLeft
          ? (rotorFrame === 1 ? 'cop_heli_1_flip' : 'cop_heli_2_flip')
          : (rotorFrame === 1 ? 'cop_heli_1'      : 'cop_heli_2');
        this.hudHelicopterImg.setTexture(key);
        this.hudHelicopterImg.setPosition(x, bobY);
        this.hudHelicopterImg.setVisible(true);
        // Red/blue rotor flash via tint alternating each ~0.2s.
        // Colorblind mode: swap the red phase for amber so the pulse is the
        // CVD-safe amber↔blue emergency pair (red↔blue washes out for strong
        // protan/deutan viewers). Blue phase unchanged. Non-colorblind look
        // is left byte-identical.
        const flashOn = ((phase * 5) | 0) % 2 === 0;
        const tint = this._colorblind
          ? (flashOn ? 0xFFC247 : 0xAACCFF)
          : (flashOn ? 0xFFAAAA : 0xAACCFF);
        this.hudHelicopterImg.setTint(tint);
        // Non-color cue (colorblind only): a redundant "5★" tag pinned under
        // the chopper so the max-heat signal survives even without the rotor
        // hue — and the chopper is identifiable as the 5★ overlay at a glance.
        if (this._colorblind) {
          this.hudHelicopter
            .setPosition(x, bobY + 30)
            .setText('5★')
            .setStroke('#000000', 4)
            .setColor('#FFC247')
            .setVisible(true);
        } else {
          this.hudHelicopter.setVisible(false);
        }
      } else {
        // Emoji fallback when the heli textures didn't load.
        const rotor = (Math.sin(phase * 28) > 0) ? '— —' : ' = ';
        // Colorblind mode: swap the red flash phase for amber (amber↔blue is
        // CVD-safe; red↔blue is not reliably separable for protan/deutan),
        // append a redundant "5★" tag so the max-heat signal isn't carried by
        // the rotor hue alone. Non-colorblind look left byte-identical.
        const flashOn = ((phase * 5) | 0) % 2 === 0;
        const tint = this._colorblind
          ? (flashOn ? '#FFB000' : '#3366FF')
          : (flashOn ? '#FF3333' : '#3366FF');
        const body = this._colorblind ? `${rotor}\n  🚁\n  5★` : `${rotor}\n  🚁`;
        this.hudHelicopter
          .setPosition(x, bobY)
          .setText(body)
          .setColor('#222222')
          .setStroke(tint, 3)
          .setVisible(true);
      }
    } else {
      this.hudHelicopter.setVisible(false);
      this.hudHelicopterImg?.setVisible(false);
    }

    // (Selected-weapon banner removed — weapons are tap-to-fire on their
    // individual icons, and the cycled-selection visual lives on the
    // icon's own glow ring.)
  }

  _drawDrugBars() {
    const g = this.hudGfx;
    g.clear();
    // Title screen — bars graphics stay cleared and the label nodes
    // are hidden by _setHudVisible(false).
    if (this._awaitingStart) return;
    this._drawDrugIcons();
    return;
  }

  /** New drug-icon HUD — mirrors the weapon-icon stack on the
   *  OPPOSITE side of the screen.  Each drug shows a translucent
   *  icon whose alpha = bar level (so a 55%-filled bar = 55%-opaque
   *  icon).  No text labels.  Custom mode keeps the drag-to-set
   *  hit zones so the player can tap an icon to set its level. */
  _drawDrugIcons() {
    const g = this.hudGfx;
    // Texture name map — alcohol uses the 'beer' art.
    const TEX = {
      alcohol:  'drug_beer',
      weed:     'drug_weed',
      cocaine:  'drug_cocaine',
      shrooms:  'drug_shrooms',
      lsd:      'drug_lsd',
      heroin:   'drug_heroin',
      rx:       'drug_rx',
      fentanyl: 'drug_fentanyl',
      ketamine: 'drug_ketamine',
      meth:     'drug_meth',
    };
    // Colorblind: recolor the confusable bar-fill pairs (weed↔meth both greenish,
    // lsd reddish — fentanyl keeps its lethal red) and stamp an authoritative
    // one-letter badge on each card so the drug is read by LETTER, not hue.
    const CB_FILL   = { weed: 0x3A9BFF, meth: 0xFF9A3D, lsd: 0xFFD23D, fentanyl: 0xFF2222 };
    const CB_LETTER = { alcohol: 'B', weed: 'W', cocaine: 'C', shrooms: 'S', lsd: 'L', heroin: 'H', rx: 'R', fentanyl: 'F', ketamine: 'K', meth: 'M' };
    if (!this._drugBadges) this._drugBadges = {};
    // 2-column grid of square-ish icons.  All 10 drugs fit in 5 rows
    // × 2 cols above the pedal stack, leaving the bottom of the
    // off-weapon edge for ACCEL/BRAKE.
    const iconW = 46, iconH = 42, rowGap = 4, colGap = 4;
    const yTop  = 65;
    // Drug column sits on the OPPOSITE side from weapons.
    const drugsOnRight = !!this._leftHanded;
    const xLeft   = 10;
    const xRight  = SCREEN_W - 10;
    // Inner column is closest to screen center; outer column hugs the edge.
    const xOuter  = drugsOnRight ? (xRight - iconW)                : xLeft;
    const xInner  = drugsOnRight ? (xRight - iconW * 2 - colGap)   : (xLeft + iconW + colGap);

    if (!this._drugIcons) this._drugIcons = {};
    const showAllDrugs = Difficulty.mode?.() === 'custom';
    const used = new Set();
    if (!this._drugBarHits) this._drugBarHits = [];
    this._drugBarHits.length = 0;
    this._ensureDrugBarDragHandler();

    // Build the real logo image for a drug, scaled to fit the icon cell.
    const buildDrugImage = (texKey, cx, cy) => {
      const tex   = this.textures.get(texKey)?.source?.[0];
      const baseW = tex?.width  || iconW;
      const baseH = tex?.height || iconH;
      const fit   = Math.min((iconW - 6) / baseW, (iconH - 6) / baseH);
      return this.add.image(cx, cy, texKey)
        .setOrigin(0.5).setDepth(25)
        .setDisplaySize(baseW * fit, baseH * fit);
    };

    let slotIdx = 0;
    for (const id of Object.values(DRUGS)) {
      if (!showAllDrugs && !this.drugs.isUnlocked(id)) continue;
      const level = Math.max(0, Math.min(1, this.drugs.get(id)));
      const cfg   = DRUG_CONFIG[id];
      // 2-column fill order: alternate (0,0), (1,0), (0,1), (1,1), …
      const col   = slotIdx % 2;
      const row   = Math.floor(slotIdx / 2);
      const x     = col === 0 ? xOuter : xInner;
      const y     = yTop + row * (iconH + rowGap);

      // ── Lazy create the icon + interactive hit zone ──────────────
      const texKey = TEX[id];
      if (!this._drugIcons[id]) {
        const hasImg = texKey && this.textures.exists(texKey);
        // Use the real logo if its texture is ready; otherwise a temporary
        // dot fallback that gets UPGRADED below once the texture loads.
        const icon = hasImg
          ? buildDrugImage(texKey, x + iconW / 2, y + iconH / 2)
          : this.add.text(x + iconW / 2, y + iconH / 2, '•', {
              fontSize: '32px', color: cfg.hexCss,
            }).setOrigin(0.5).setDepth(25);
        const hit = this.add.rectangle(
          x + iconW / 2, y + iconH / 2, iconW, iconH, 0x000000, 0,
        ).setDepth(24).setInteractive({ useHandCursor: true });
        this._drugIcons[id] = { icon, hit, isImage: hasImg };
        if (this._hudObjects) {
          this._hudObjects.push(icon, hit);
          this.cameras.main.ignore?.([icon, hit]);
        }
      }
      const slot = this._drugIcons[id];
      // Upgrade a placeholder dot to the real logo the moment its texture
      // finishes loading — fixes icons drawn before the asset loader caught
      // up (intermittent missing drug logos on slow/cold phone loads).
      if (!slot.isImage && texKey && this.textures.exists(texKey)) {
        const oldIcon = slot.icon;
        if (this._hudObjects) {
          const oi = this._hudObjects.indexOf(oldIcon);
          if (oi >= 0) this._hudObjects.splice(oi, 1);
        }
        oldIcon.destroy();
        slot.icon = buildDrugImage(texKey, x + iconW / 2, y + iconH / 2);
        slot.isImage = true;
        if (this._hudObjects) {
          this._hudObjects.push(slot.icon);
          this.cameras.main.ignore?.([slot.icon]);
        }
      }
      slot.icon.setPosition(x + iconW / 2, y + iconH / 2).setVisible(true);
      slot.hit.setPosition(x + iconW / 2, y + iconH / 2);
      // Icon opacity = level (with 0.25 floor so empty icons still
      // read).  At 55% bar → ~58% opaque icon.
      slot.icon.setAlpha(0.25 + 0.75 * level);
      used.add(id);

      // ── Colorblind letter badge — authoritative drug ID, top-left ──
      if (this._colorblind) {
        let badge = this._drugBadges[id];
        if (!badge) {
          badge = this.add.text(0, 0, CB_LETTER[id] ?? '?', {
            fontSize: '13px', fontFamily: IMPACT, color: '#FFFFFF',
            stroke: '#000000', strokeThickness: 3,
          }).setOrigin(0, 0).setDepth(26);
          this._drugBadges[id] = badge;
          if (this._hudObjects) { this._hudObjects.push(badge); this.cameras.main.ignore?.([badge]); }
        }
        badge.setPosition(x + 2, y + 1).setVisible(true);
      } else if (this._drugBadges[id]) {
        this._drugBadges[id].setVisible(false);
      }

      // ── Card visuals ────────────────────────────────────────────
      // Dark translucent base so the icon reads against the road.
      g.fillStyle(0x000000, 0.45);
      g.fillRoundedRect(x, y, iconW, iconH, 4);
      // Level-proportional colored FILL rising from the BOTTOM —
      // unambiguous "bar fills up as drug accumulates" cue.
      if (level > 0.01) {
        const fillH = Math.max(2, Math.floor((iconH - 2) * level));
        const fillY = y + (iconH - 1) - fillH;
        g.fillStyle(this._colorblind ? (CB_FILL[id] ?? cfg.color) : cfg.color, 0.55);
        g.fillRoundedRect(x + 1, fillY, iconW - 2, fillH, 4);
      }
      // Border
      g.lineStyle(1, 0x000000, 0.6);
      g.strokeRoundedRect(x, y, iconW, iconH, 4);

      // OD warning — pulsing red border at near-OD levels.
      if (cfg.canOD && level > cfg.odThreshold * 0.80) {
        if (this._colorblind) {
          // CB: always-on amber border (white on the pulse peak) + a warning
          // triangle in the corner — danger read by SHAPE + luminance, not red.
          const pk = Math.abs(Math.sin(this.gameTime * 7)) > 0.5;
          g.lineStyle(3, pk ? 0xFFFFFF : 0xFFB000, 1);
          g.strokeRoundedRect(x - 1, y - 1, iconW + 2, iconH + 2, 5);
          const tx = x + iconW - 11, ty = y + 2;
          g.fillStyle(0x1A1205, 1); g.fillTriangle(tx - 1, ty + 9, tx + 9, ty + 9, tx + 4, ty - 1);
          g.fillStyle(0xFFB000, 1); g.fillTriangle(tx, ty + 8, tx + 8, ty + 8, tx + 4, ty);
        } else if (Math.abs(Math.sin(this.gameTime * 7)) > 0.5) {
          g.lineStyle(2, 0xFF2222, 1);
          g.strokeRoundedRect(x - 1, y - 1, iconW + 2, iconH + 2, 5);
        }
      }

      // Drag-to-set hit rect for Custom mode (full cell).
      this._drugBarHits.push({
        id, x, y, w: iconW, h: iconH,
      });
      slotIdx++;
    }

    // Hide any drugs we didn't render this frame (rest stop, etc.).
    for (const id of Object.keys(this._drugIcons)) {
      if (!used.has(id)) {
        this._drugIcons[id].icon.setVisible(false);
        this._drugBadges?.[id]?.setVisible(false);
      }
    }
    // Old text labels — hide them all (legacy code path).
    if (this._drugLabels) {
      for (const id of Object.keys(this._drugLabels)) {
        this._drugLabels[id].setVisible(false);
      }
    }
  }

  _drawDrugBarsOld_disabled() {
    const g = this.hudGfx;

    // Stack of "[NAME] [BAR]" rows.  Right-handed (default) anchors at
    // the left edge; left-handed mirrors the whole block to the right
    // edge so the drug bars sit on the opposite side from the weapon
    // stack.  Internal label-then-bar layout is preserved either way —
    // the player still reads left-to-right.
    const barW   = 110, barH = 15, rowH = 22;
    const labelW = 64;
    const x      = this._leftHanded ? (SCREEN_W - 10 - labelW - barW) : 10;
    const yTop   = 85;

    if (!this._drugLabels) this._drugLabels = {};
    const labelsUsed = new Set();
    // Hit-rect array consumed by the pointer drag handler.  Rebuilt
    // every frame so it tracks the live unlocked-drug list and any
    // future re-layout.  In custom mode, dragging on these rects sets
    // the corresponding drug level directly (replaces the old slider
    // modal that the 🎚 button used to open).
    if (!this._drugBarHits) this._drugBarHits = [];
    this._drugBarHits.length = 0;
    // Lazy register the global pointer drag handler once.
    this._ensureDrugBarDragHandler();

    // Custom mode shows ALL drugs (locked included) so the player can
    // drag any bar to set its level — the full menu is the slider UI.
    const showAllDrugs = Difficulty.mode?.() === 'custom';
    let row = 0;
    for (const id of Object.values(DRUGS)) {
      if (!showAllDrugs && !this.drugs.isUnlocked(id)) continue;
      const level = this.drugs.get(id);
      const cfg   = DRUG_CONFIG[id];
      const y     = yTop + row * rowH;

      // Stripped label (drop emoji prefix; pull the word).
      const cleanName = (cfg.label || id).replace(/^[^A-Za-z]+/, '').trim().toUpperCase();

      if (!this._drugLabels[id]) {
        this._drugLabels[id] = this.add.text(x, y, cleanName, {
          fontSize: '11px',
          fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
          color: cfg.hexCss,
          stroke: '#000000', strokeThickness: 3,
        }).setDepth(20);
        if (this._hudObjects) {
          this._hudObjects.push(this._drugLabels[id]);
          this.cameras.main.ignore(this._drugLabels[id]);
        }
      }
      const txt = this._drugLabels[id];
      txt.setPosition(x, y + 1).setVisible(true);   // +1 vertical-align with taller bar
      labelsUsed.add(id);

      const bx = x + labelW;
      // Backdrop — was 0.72 alpha; lowered to 0.40 so it reads as a
      // translucent track instead of a solid box.
      g.fillStyle(0x000000, 0.40);
      g.fillRect(bx - 2, y - 2, barW + 4, barH + 4);
      g.lineStyle(1, 0x444444, 0.55);
      g.strokeRect(bx - 2, y - 2, barW + 4, barH + 4);

      // Fill — drug colour at 0.78 alpha (was fully opaque) so the road
      // showing through the HUD reads softer.
      g.fillStyle(cfg.color, 0.78);
      g.fillRect(bx, y, Math.round(barW * level), barH);

      if (level > 0.02) {
        g.fillStyle(0xFFFFFF, 0.16);
        g.fillRect(bx, y, Math.round(barW * level), Math.ceil(barH * 0.30));
      }

      if (cfg.canOD && level > cfg.odThreshold * 0.80) {
        if (Math.abs(Math.sin(this.gameTime * 7)) > 0.5) {
          g.lineStyle(2, 0xFF2222, 1);
          g.strokeRect(bx - 2, y - 2, barW + 4, barH + 4);
        }
      }

      // Register hit-rect for drag-to-set.  Slightly enlarged top/bottom
      // so it's comfortable to grab on touch.
      this._drugBarHits.push({
        id, x: bx, y: y - 3, w: barW, h: barH + 6,
      });
      row++;
    }

    for (const id of Object.keys(this._drugLabels)) {
      if (!labelsUsed.has(id)) this._drugLabels[id].setVisible(false);
    }
  }

  /** Wire up the click/drag handler for the HUD drug bars.  Idempotent
   *  — only attaches once.  Active only in custom mode.  The bars fill
   *  vertically (bottom = empty, top = full), so dragging tracks the
   *  pointer's VERTICAL position within the cell.  Tap-to-set lands the
   *  level wherever the player tapped on first contact, then the drag
   *  follows; once a cell is grabbed, the pointer can leave the cell
   *  and the level still tracks (clamped 0..1). */
  _ensureDrugBarDragHandler() {
    if (this._drugBarDragWired) return;
    this._drugBarDragWired = true;
    this._draggingDrugId = null;

    const setLevelFromPointer = (py) => {
      const id = this._draggingDrugId;
      if (!id) return;
      const hits = this._drugBarHits;
      const hit  = hits && hits.find(h => h.id === id);
      if (!hit) return;
      // Vertical map: top of cell → 1.0, bottom of cell → 0.0.
      const frac = Math.max(0, Math.min(1, 1 - (py - hit.y) / hit.h));
      if (this.drugs?.levels) this.drugs.levels[id] = frac;
      // Mark unlocked so the bar keeps rendering even if the player
      // pulled it from 0 (otherwise unlocked-only filter hides it next
      // frame and the drag breaks).
      if (this.drugs?.unlocked && frac > 0) this.drugs.unlocked[id] = true;
      if (this.drugs?.snapshotUnlocks) {
        this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks());
      }
    };

    const isCustom = () => Difficulty.mode?.() === 'custom';

    // Pad the touch target around each cell so a slightly-off finger
    // still grabs the bar.  Only affects hit-detection on first
    // contact; once held, the level tracks ptr.y unconditionally.
    const TOUCH_PAD = 12;

    this.input.on('pointerdown', (ptr) => {
      if (!isCustom()) return;
      const hits = this._drugBarHits;
      if (!hits) return;
      const px = ptr.x, py = ptr.y;
      for (const h of hits) {
        if (px >= h.x - TOUCH_PAD && px <= h.x + h.w + TOUCH_PAD
         && py >= h.y - TOUCH_PAD && py <= h.y + h.h + TOUCH_PAD) {
          this._draggingDrugId = h.id;
          setLevelFromPointer(py);
          break;
        }
      }
    });
    this.input.on('pointermove', (ptr) => {
      if (!this._draggingDrugId) return;
      if (!isCustom()) { this._draggingDrugId = null; return; }
      setLevelFromPointer(ptr.y);
    });
    const endDrag = () => { this._draggingDrugId = null; };
    this.input.on('pointerup',     endDrag);
    this.input.on('pointerupoutside', endDrag);
  }

  _drawF12Inventory() {
    const g      = this.hudGfx;
    const tokens = this.cops.f12Tokens;
    // Title screen — icons are hidden by _setHudVisible(false).
    if (this._awaitingStart) return;

    const TYPES = [
      { id: 'gun',         color: 0x888888, label: '🔫', tex: 'weapon_gun'         },
      { id: 'spike_strip', color: 0xFF7700, label: '📍', tex: 'weapon_spike_strip' },
      { id: 'paint_bomb',  color: 0xFFEE00, label: '🎨', tex: 'weapon_paint_bomb' },
      { id: 'rocket',      color: 0xFF3300, label: '🚀', tex: 'weapon_rocket'     },
      { id: 'grenade',     color: 0x44AA22, label: '💣', tex: 'weapon_grenade'    },
      { id: 'disguise',    color: 0xFFCC00, label: '🎭', tex: 'weapon_disguise'   },
    ];

    if (!this._f12Texts) this._f12Texts = {};

    const counts = {};
    for (const t of tokens) counts[t] = (counts[t] ?? 0) + 1;
    // Gun is ammo-counted (6 bullets per pickup) so its count is the raw
    // bullet total, not the number of stacked tokens.
    counts.gun = this.cops.gunAmmo ?? 0;

    // Touch-target sized icons — squarer cells (was 66×56, now 58×56)
    // per UX feedback that the rectangles read too wide.  Roughly a
    // square thumb pad.
    const iconW = 58, iconH = 56, rowGap = 6;
    // Stack anchors against whichever edge is the player's "dominant"
    // thumb — right edge by default, left edge in left-handed mode.
    const lhWeap = !!this._leftHanded;
    const xLeft  = 10;
    const xRight = SCREEN_W - 10;
    const yTop   = 65;
    const top    = tokens.length ? tokens[tokens.length - 1] : null;

    let row = 0;
    for (const tType of TYPES) {
      const count = counts[tType.id] ?? 0;
      const y     = yTop + row * (iconH + rowGap);
      const x     = lhWeap ? xLeft : (xRight - iconW);

      // Pre-create the icon (real image if available, fallback to emoji) +
      // count text once per type.
      if (!this._f12Texts[tType.id]) {
        const hasImg = tType.tex && this.textures.exists(tType.tex);
        let icon;
        if (hasImg) {
          // Preserve the source image aspect ratio — only shrink to fit
          // inside (iconW-6) × (iconH-6).  Wider sources get full width
          // and proportional height; taller sources get full height and
          // proportional width.  No stretching.
          const tex   = this.textures.get(tType.tex)?.source?.[0];
          const baseW = tex?.width  || iconW;
          const baseH = tex?.height || iconH;
          const fit   = Math.min((iconW - 6) / baseW, (iconH - 6) / baseH);
          icon = this.add.image(x + iconW / 2, y + iconH / 2, tType.tex)
            .setOrigin(0.5).setDepth(25)
            .setDisplaySize(baseW * fit, baseH * fit);
        } else {
          icon = this.add.text(x + iconW / 2, y + iconH / 2, tType.label, {
            fontSize: '32px',
          }).setOrigin(0.5).setDepth(25);
        }
        // Invisible interactive hit-zone covering the cell — taps select
        // and fire that weapon (mobile-friendly direct fire).
        const hit = this.add.rectangle(
          x + iconW / 2, y + iconH / 2, iconW, iconH, 0x000000, 0,
        ).setDepth(24).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          this._fireWeaponByType(tType.id);
        });
        this._f12Texts[tType.id] = {
          icon,
          hit,
          // Count badge — bottom-right corner INSIDE the icon box, with
          // a heavier black stroke so it stays readable on top of the
          // weapon image.  Smaller font (13 → fits the 57×49 cell).
          count: this.add.text(x + iconW - 3, y + iconH - 2, '', {
            fontSize: '13px', fontFamily: 'Impact, Arial Black, sans-serif',
            color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
          }).setOrigin(1, 1).setDepth(26),
        };
        this._hudObjects?.push(icon, hit, this._f12Texts[tType.id].count);
        this.cameras.main.ignore?.([icon, hit, this._f12Texts[tType.id].count]);
      }

      const txt = this._f12Texts[tType.id];
      // Owned types are bright + show count; un-owned show ghosted icon.
      txt.icon.setPosition(x + iconW / 2, y + iconH / 2);
      txt.hit?.setPosition(x + iconW / 2, y + iconH / 2);
      txt.hit?.setSize?.(iconW, iconH);
      // Count badge anchored to bottom-right INSIDE the cell.
      txt.count.setPosition(x + iconW - 3, y + iconH - 2);
      txt.icon.setAlpha(count > 0 ? 1 : 0.18);
      txt.count.setText(count > 0 ? `×${count}` : '');

      // Card background
      g.fillStyle(tType.color, count > 0 ? 0.55 : 0.12);
      g.fillRoundedRect(x, y, iconW, iconH, 4);
      g.lineStyle(1, 0x000000, 0.6);
      g.strokeRoundedRect(x, y, iconW, iconH, 4);

      // Glow on the next-to-be-used token
      if (count > 0 && tType.id === top) {
        g.lineStyle(2, tType.color, 1);
        g.strokeRoundedRect(x - 1, y - 1, iconW + 2, iconH + 2, 5);
      }

      row++;
    }
  }

  _showPopup(text, color = '#FFFFFF') {
    this.hudPopup.setText(text).setColor(color);
    this.popupTimer = 2.2;
    // Phone-text popups (📱) buzz twice like an incoming-text notification —
    // active on iOS once Capacitor Haptics is wrapped in; a clean no-op
    // elsewhere.  Non-text popups (★ WANTED, crashes, drug lines) don't buzz.
    if (typeof text === 'string' && text.startsWith('📱')) {
      this.haptics?.notify?.();
    }
  }

  /** Fire one characterful "flavor" text from a non-gameplay contact (The Ex /
   *  Mom / The Boss / The Unknown).  Shows a phone-notification popup and logs
   *  it to the per-run thread so the Messages app can show the conversation.
   *  Pure tone — no gameplay effect. */
  _fireBuddyText() {
    this._buddyDefs ??= {
      ex: { name: '🖤 The Ex', color: '#FF8FB0', pool: [
        'so we\'re really not talking now?',
        'I drove past your place. whose car was that',
        'cool. ignore me. classic.',
        'i\'m not even mad i just think it\'s hilarious',
        'who is she',
        'you looked weirdly happy in that photo',
        'have FUN at your little party 🙄',
        'remember when you said you\'d change lol',
      ] },
      mom: { name: '👜 The Mom', color: '#FFD27A', pool: [
        'Did you eat today? You look thin ❤️',
        'Drive safe honey, text me when you\'re there',
        'Your father says hi (he can\'t work the phone)',
        'There\'s a plate in the fridge for you',
        'Are you SURE you\'re okay to be driving?',
        'Saw on the news the police are out. Be careful!!',
        'I love you. Call your mother.',
      ] },
      boss: { name: '💼 The Boss', color: '#FF6B5C', pool: [
        'where are you',
        'the Hendricks account won\'t close itself',
        'I don\'t pay you to take road trips',
        'call me back. now.',
        'the company tracker says you\'re "busy" lol',
        'if you\'re not in tomorrow, don\'t come in at all',
        'this is your final warning. and your last one.',
      ] },
      unknown: { name: '❓ The Unknown', color: '#9FB4C8', pool: [
        'I know what you\'re carrying.',
        'we need to talk. you know who this is.',
        'nice plates. real subtle.',
        'they\'re waiting for you in Colfax. don\'t.',
        'wrong number. or is it.',
        'delete this thread.',
      ] },
      // Spam / scams — each carries its own fake "from", so it logs the sender.
      spam: { name: '🚫 The Spam', color: '#7FE0A0', spam: true, pool: [
        { from: 'USPS', text: 'Your package can\'t be delivered. Update info: usps-trk.co/x9' },
        { from: 'IRS', text: 'FINAL NOTICE: you owe $4,829. Pay now or a warrant is issued.' },
        { from: 'Scam Likely', text: 'We\'ve been trying to reach you about your car\'s extended warranty.' },
        { from: 'PRIZE', text: 'CONGRATS! You\'ve won a $1,000 gift card. Claim in 24h: clm.gift/u' },
        { from: 'Wells Fargo', text: 'Suspicious activity on your account. Verify SSN: wf-secure.co' },
        { from: '+1 (800) 555-0147', text: 'Hi it\'s Brad from Apple Support. Your iCloud has been locked.' },
        { from: 'CRYPTO', text: '$DOGE is up 4000% 🚀 don\'t miss out. Buy now: moon.bet' },
        { from: 'Unknown', text: 'is this still your number? i have the photos.' },
        { from: 'GOV-RELIEF', text: 'You qualify for a $750 deposit. Reply YES to claim.' },
        { from: 'Prince A.', text: 'Dear friend, I have $20,000,000 USD to transfer to you...' },
        { from: 'VOTE', text: 'Re-elect for a STRONGER tomorrow! Reply STOP to opt out.' },
        { from: 'Singles', text: 'Lonely drivers near you want to meet 😏 tap: hot.sgl/near' },
      ] },
    };
    const ids = Object.keys(this._buddyDefs);
    const cid = ids[(Math.random() * ids.length) | 0];
    const def = this._buddyDefs[cid];
    const thread = (this._buddyThreads[cid] ??= []);
    const txtOf = (e) => (typeof e === 'string' ? e : e.text);
    const last = thread.length ? thread[thread.length - 1].text : null;
    let entry = def.pool[(Math.random() * def.pool.length) | 0];
    for (let i = 0; i < 4 && txtOf(entry) === last; i++) entry = def.pool[(Math.random() * def.pool.length) | 0];
    const text = txtOf(entry);
    // Spam carries its own fake sender; the others come from the contact.
    const from = (typeof entry === 'string') ? def.name : entry.from;
    this._logBuddyText(cid, from, text);
  }

  /** Log an incoming text to its Messages thread and show a generic on-screen
   *  NOTIFICATION ("📱 New text — <sender>") rather than the message body — the
   *  content lives in the Messages app, so the HUD just says a text arrived. */
  _logBuddyText(cid, from, text) {
    const thread = (this._buddyThreads[cid] ??= []);
    thread.push({ text, from, mile: Math.round(this._odometer ?? 0) });
    if (thread.length > 12) thread.shift();
    this._showPopup('📱 New text — ' + from, '#9FE8FF');
  }

  // ── The Crush (the Girl) — relationship, not a cash faucet ──────────────
  // Texting is FREE and once per town; text her each town to keep her warm.
  // Skip a town and she cools to "…"; skip more than GIRL_MAX_SKIPS towns
  // total and she's gone for the run.  Arrive at the party still together →
  // GIRL_PARTY_BONUS (handled at the finish).  State lives in the save so the
  // Messages app + the fresh-run reset both see it; `_girlTextPending` is the
  // per-run "she's waiting for a text in the CURRENT town" flag.
  /** Snapshot for the Messages app (window.__girl.status). */
  _girlStatus() {
    const s = this.registry.get('save');
    const gone = s?.get?.('girlGone', false) === true;
    const sent = s?.get?.('girlTexts', 0) ?? 0;
    const skips = s?.get?.('girlSkips', 0) ?? 0;
    return {
      gone,
      responded:  s?.get?.('girlResponded', false) === true,
      sent,
      everTexted: sent > 0,
      canText:    !gone && !!this._girlTextPending,
      skips,
      skipsLeft:  Math.max(0, GIRL_MAX_SKIPS - skips),
      thread:     (this._girlThread ?? []).slice(),
    };
  }

  /** Log an incoming text FROM the Crush to the thread + a road notification.
   *  `quiet` (the "…" silent-treatment bubbles) skips the loud popup. */
  _girlMsg(text, quiet = false) {
    (this._girlThread ??= []).push({ text, mile: Math.round(this._odometer ?? 0) });
    if (this._girlThread.length > 12) this._girlThread.shift();
    this._showPopup(quiet ? '💕 …' : '📱 New text — The Crush', quiet ? '#C9B6D8' : '#FF9FD0');
  }

  /** Player tapped "Text" in the Messages app.  Free, once per town.  Texting
   *  3 towns in a row earns a miss-you reply. */
  _girlText() {
    const s = this.registry.get('save');
    if (!s) return { ok: false, reason: 'nosave' };
    if (s.get('girlGone', false) === true) return { ok: false, reason: 'gone' };
    if (!this._girlTextPending)            return { ok: false, reason: 'soon' };  // already this town
    s.set('girlTexts', (s.get('girlTexts', 0) ?? 0) + 1);
    s.set('girlResponded', true);     // warm again (clears a "…" cool-down)
    this._girlTextPending = false;    // satisfied this town
    this._girlStreak = (this._girlStreak ?? 0) + 1;
    if (this._girlStreak >= 3) {      // 3 towns in a row → they reply, miss you
      this._girlStreak = 0;
      this._girlMsg('ok i miss you 🥺 hurry uppp — people keep asking me to go to their party instead 👀');
    }
    return { ok: true };
  }

  /** Called when the player enters a NEW town (checkpoint).  If the relationship
   *  is active and the town just left went un-texted, that's a skip → they cool
   *  off and text you (annoyed → angry → silent "…"); past GIRL_MAX_SKIPS total
   *  they find someone else. */
  _girlOnNewTown() {
    const s = this.registry.get('save');
    if (!s || s.get('girlGone', false) === true) return;
    const started = (s.get('girlTexts', 0) ?? 0) > 0;
    if (started && this._girlTextPending) {
      this._girlStreak = 0;           // a skip breaks the texting streak
      const skips = (s.get('girlSkips', 0) ?? 0) + 1;
      s.set('girlSkips', skips);
      s.set('girlResponded', false);  // cools to "…"
      if (skips > GIRL_MAX_SKIPS) {
        s.set('girlGone', true);
        this._girlMsg('forget it 💔 someone else is taking me to a party.');
      } else if (skips === 1) {
        this._girlMsg('hey?? did you forget about me already 🙄');
      } else if (skips === 2) {
        this._girlMsg('wow. not ONE text. cool cool cool 😤');
      } else {
        // skip 3 & 4 — the silent treatment: just "…" bubbles.
        this._girlMsg('…', true);
      }
    }
    this._girlTextPending = true;     // they're waiting for a text in the new town
  }

  /** Flashing cruiser lightbar overlay for the held traffic stop — alternates
   *  a red half / blue half top band (plus soft side columns) ~5×/sec, the
   *  reflection of the trooper parked behind you.  Drawn on the HUD layer so
   *  it sits over the world but under the banner text. */
  _drawTrapStopLights() {
    const g = this._trapLightGfx;
    if (!g) return;
    g.clear();
    this._trapLightWasOn = true;
    const elapsed = COP_TRAP_HOLD_SEC - (this._trapStopHoldTimer ?? 0);
    const redOn   = (Math.floor(elapsed * 5) % 2) === 0;   // swap ~5×/sec
    const rA = redOn ? 0.40 : 0.12;
    const bA = redOn ? 0.12 : 0.40;
    const w = SCREEN_W, h = SCREEN_H, barH = h * 0.11;
    // Top band: red over the left half, blue over the right half.
    g.fillStyle(0xFF1E1E, rA); g.fillRect(0,       0, w * 0.5, barH);
    g.fillStyle(0x2A5BFF, bA); g.fillRect(w * 0.5, 0, w * 0.5, barH);
    // Soft side columns for a wraparound "lights filling the cabin" feel.
    g.fillStyle(0xFF1E1E, rA * 0.6); g.fillRect(0,        0, w * 0.06, h);
    g.fillStyle(0x2A5BFF, bA * 0.6); g.fillRect(w * 0.94, 0, w * 0.06, h);
  }

  /** Combined multiplier — strictly ADDITIVE, lands on a clean 0.5
   *  increment.  Combos are cosmetic labels only; no score bonus comes
   *  from them.  Components:
   *    • base                                  → 1.0
   *    • each drug ≥ 5%   ≤ 50%                → +0.5
   *    • each drug > 50%                        → +0.5 more (i.e. +1.0 total)
   *    • each cop star                          → +1.0
   *  Example (beer 50% + weed 25% + Cross-Faded label active):
   *    1 + 0.5 (beer) + 0.5 (weed) = 2.0×  ✓
   */
  _scoreMult() {
    // Custom mode awards zero score — multiplier collapses to 0 so every
    // additive `this.score += pts * _scoreMult()` callsite no-ops.
    if (Difficulty.noScore?.()) return 0;
    const mult = this.drugs.scoreMultiplier + (this.cops.starDisplay ?? 0);
    let m = Math.round(mult * 2) / 2;
    // DUI penalty — a recent intoxicated traffic stop throttles ALL earnings
    // to ×COP_DUI_EARN_MULT until the odometer passes the penalty mile.
    if ((this._odometer ?? 0) < (this._duiEarnPenaltyMi ?? -1)) m *= COP_DUI_EARN_MULT;
    return m;
  }

  /** Punchy display labels for each drug-line type — used by the spawner
   *  to flash a themed banner ("🍻 BEER RUN!", "🧙 MUSHROOM HUNTING!", …)
   *  when a line drops on the road.  Mixed-drug lines fall back to the
   *  generic mixed banner below. */
  _drugLineLabel(drugType) {
    const labels = {
      beer:     '🍻 BEER RUN!',
      weed:     '🌿 CHAIN SMOKING!',
      cocaine:  '❄️ RAIL RUN!',
      shrooms:  '🍄 MUSHROOM HUNTING!',
      lsd:      '💊 TAB RUN!',
      heroin:   '💉 TRACK MARKS!',
      rx:       '📜 SCRIPT ROLL!',
      fentanyl: '☠️ RUSSIAN ROULETTE!',
      ketamine: '🐴 K-HOLE!',
      meth:     '⚡ TWEAKER TRAIL!',
    };
    return labels[drugType] ?? '💊 STREET STASH!';
  }

  /** Inject a long line of drug pickups onto consecutive segments ahead.
   *  Each pickup adds the standard 0.17 to the alcohol bar, so 3 cans nets
   *  roughly +50% — i.e. a 3-can line is enough to half-fill the player's
   *  beer status.  Lines spawn periodically (every ~1.5 min) and a longer
   *  mixed line spawns every ~100 in-game miles. */
  _injectDrugLine(o$ = {}) {
    const segs = this.road?.segments;
    if (!segs?.length) return;
    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    const ahead    = 250 + ((Math.random() * 200) | 0);
    // Centre the line in a SAME-direction lane (offset 0.0 to +0.45) so the
    // player doesn't have to swerve hard across traffic to grab it.
    const offset = 0.05 + Math.random() * 0.40;
    const types  = o$.types  ?? ['beer', 'beer', 'beer'];
    const spread = o$.spread ?? 14;        // segments between cans
    let placed = 0;
    for (let i = 0; i < types.length; i++) {
      const segIdx = (startSeg + ahead + i * spread) % segs.length;
      const seg    = segs[segIdx];
      if (!seg) continue;
      seg.sprites.push({
        type:            types[i],            // resolved drug type, NOT 'drug-pending'
        offset,
        baseW: 720, baseH: 880,
        collected:       false,
        isCollectible:   true,
        collectibleType: 'drug',
        lootSeed:        Math.random(),
        _bonusLine:      true,
      });
      placed++;
    }
    if (placed > 0) {
      this._showPopup(o$.label ?? '🍻 BEER RUN!', '#FFCC44');
    }
  }

  /** Inject a synthesized F12 weapon sprite onto a segment ~30-80 segments
   *  ahead so the player picks it up shortly.  Used at 4★+ to keep the
   *  player armed under heavy heat.  Picks balanced forward / rear types. */
  _injectBonusWeapon() {
    const segs = this.road?.segments;
    if (!segs?.length) return;
    const startSeg = Math.floor(this.player.position / SEG_LENGTH);
    const ahead    = 30 + ((Math.random() * 50) | 0);
    const seg      = segs[(startSeg + ahead) % segs.length];
    if (!seg) return;
    // 50/50 forward / rear so F12 drops at high stars stay balanced.
    const r = Math.random();
    let f12Type, texKey;
    if (r < 0.30)      { f12Type = 'f12_gun';    texKey = 'weapon_gun'; }
    else if (r < 0.55) { f12Type = 'f12_rocket'; texKey = 'weapon_rocket'; }
    else if (r < 0.80) { f12Type = 'f12_spike';  texKey = 'weapon_spike_strip'; }
    else               { f12Type = 'f12_paint';  texKey = 'weapon_paint_bomb'; }
    seg.sprites.push({
      type:            f12Type,
      texKey,
      offset:          (Math.random() * 0.9) - 0.45,
      baseW: 720, baseH: 880,
      collected:       false,
      isCollectible:   true,
      collectibleType: 'f12',
      _bonus:          true,
    });
  }

  /** Generate a stable 5-char save code: <stopId><diffChar><3-hash>.
   *  Difficulty is encoded as E / N / H so the player can tell at a glance
   *  which mode the code resumes (and the resume path can restore the
   *  matching difficulty before launching the run).  Custom mode resumes
   *  under its underlying customSub (E/N/H) — the Custom-specific opt-ins
   *  (drug sliders, starting stars, flags) aren't carried in the save
   *  code anyway, so collapsing to the sub keeps codes always one of three
   *  letters and avoids a 'C' the popup parser doesn't currently handle. */
  _makeSaveCode(stopId, score) {
    const m = Difficulty.mode() ?? 'normal';
    const effective = m === 'custom' ? (Difficulty.customSub?.() ?? 'normal') : m;
    const diffChar = effective.charAt(0).toUpperCase(); // 'E' | 'N' | 'H'
    const hash3 = (Math.abs(score * 2654435761) % (36 * 36 * 36))
      .toString(36).toUpperCase().padStart(3, '0');
    return `${stopId}${diffChar}${hash3}`;
  }

  /** Parse a save code back into { stopId, difficulty }.  Accepts both
   *  the legacy 4-char format (no difficulty letter) and the new 5-char
   *  format.  Returns null if the code is too short or unrecognised. */
  _parseSaveCode(code) {
    if (typeof code !== 'string') return null;
    const c = code.trim().toUpperCase();
    if (c.length < 4) return null;
    const stopId = c.charAt(0);
    // 5-char form: stopId + (E|N|H) + 3-hash
    if (c.length >= 5 && /^[ENH]$/.test(c.charAt(1))) {
      const map = { E: 'easy', N: 'normal', H: 'hard' };
      return { stopId, difficulty: map[c.charAt(1)] ?? 'normal' };
    }
    // Legacy 4-char form: assume normal difficulty.
    return { stopId, difficulty: 'normal' };
  }

  /** Take the exit ramp into a rest stop. Records the stop as visited,
   *  generates a 4-digit save code, persists state, and fades into the
   *  RestStopScene with the player's current snapshot. */
  _takeRestStopExit(rs) {
    if (this._takingExit) return;        // guard against double-fire
    this._takingExit = true;
    this._passedRestStops.add(rs.id);
    this._everUsedRestStop = true;
    const code = this._makeSaveCode(rs.id, Math.round(this.score));
    this._saveRestStop(rs.id, code);
    this._lastCheckpoint = { name: rs.name, position: this.player.position, scoreAtCP: this.score };

    // Music keeps playing in the rest stop — only the mute button (M key /
    // in-game mute icon) silences the radio.  Previously paused on entry,
    // unpaused on _continue; removed per user direction so the player has
    // a soundtrack while shopping.

    // Fade-to-white-then-launch effect — short cinematic so the transition
    // feels like an actual off-ramp pull-over, not an instant scene swap.
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RestStop', {
        stop:     rs,
        code,
        score:    Math.round(this.score),
        stars:    this.cops.starDisplay ?? 0,
        position: this.player.position,
        odometer: this._odometer,
        // Full drug-bar snapshot — drug status pauses at the rest stop and
        // resumes from these levels (no decay during the menu, no silent
        // wipe of unlocked bars).  COFFEE / SNOOZE buys mutate this on
        // resume via the reduceDrugs multiplier.
        drugLevelsAtEntry: { ...(this.drugs?.levels ?? {}) },
        // Car durability also carries through — without this, the new
        // DamageModel built in the next GameScene starts at 100%, silently
        // healing the car for free.  REPAIR CAR explicitly resets to 100.
        durabilityAtEntry: this.damage?.getDurability?.() ?? 100,
        // Vehicle + tank state — pricing of refuel/charge depends on this.
        vehicleId:      this.player.vehicleId,
        gasMi:          this.player.gasMi,
        gasMaxMi:       this.player.gasMaxMi,
        ownedVehicles:  this.registry.get('ownedVehicles') ?? ['beater'],
        // Per-drug exposure history — gates per-shop drug menus.  Camp
        // sells fent/ket/meth ONLY if the player has sampled them on
        // the road first.
        drugPickupCounts: { ...(this.drugs?.pickupCounts ?? {}) },
      });
    });
  }

  /** Persist rest-stop checkpoint to localStorage so the game can resume
   *  from that position next session via the save code. We keep two records:
   *  `lastRestStop` (most recent, for quick "Resume" UI) and a code-keyed
   *  `restStopSaves[code]` map so the player can enter any code they wrote
   *  down from this device and pick up there. */
  _saveRestStop(stopId, code) {
    try {
      const save = this.registry.get('save');
      if (!save) return;
      const snapshot = {
        id:        stopId,
        code,
        difficulty: Difficulty.mode(),    // restore on resume
        score:     Math.round(this.score),
        stars:     Math.round(this.cops.starDisplay ?? 0),
        position:  this.player.position,
        odometer:  this._odometer,
        ts:        Date.now(),
      };
      save.set('lastRestStop', snapshot);
      const all = save.get('restStopSaves') ?? {};
      all[code] = snapshot;
      save.set('restStopSaves', all);
      // Bump the cross-mode tier for this checkpoint: Easy→bronze,
      // Normal→silver, Hard→gold.  Keeps the highest-ever reached so
      // dropping to easier modes never downgrades a stop.  Drives the
      // tier-coloring + tap-to-warp on the route-map modal.
      const TIER_BY_MODE = { easy: 'bronze', normal: 'silver', hard: 'gold' };
      const TIER_RANK    = { bronze: 1, silver: 2, gold: 3 };
      const tier = TIER_BY_MODE[Difficulty.mode()];
      if (tier) {
        const tiers = save.get('checkpointTiers') ?? {};
        const prev  = tiers[stopId];
        if (!prev || TIER_RANK[tier] > TIER_RANK[prev]) {
          tiers[stopId] = tier;
          save.set('checkpointTiers', tiers);
        }
      }
    } catch (e) { console.warn('[saveRestStop]', e); }
  }

  _setTitleVisible(v) {
    [
      this._titleScrim, this._titleBackdrop, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
      this._titleResume,    this._titleResumeTxt,
      this._titleEnterCode, this._titleEnterCodeTxt,
      ...(this._titleDifficultyBtns ?? []),
    ].forEach(o => o?.setVisible(v));
    if (Array.isArray(this._titleLetters)) {
      this._titleLetters.forEach(img => img?.setVisible(v));
    }
  }

  // ─── Player-profile plates (title screen) ────────────────────────────
  // Three license plates on the left of the title = three independent
  // player saves.  Tap a named plate to make that player active; tap a
  // blank plate to name it (opens the DOM plate modal) and select it.
  // The active player's plate is their rear-bumper tag + leaderboard name.
  // Plate names are cleared only via Settings → Reset (per design).
  _buildPlateSlots(d) {
    const save = this.registry.get('save');
    this._plateSlotObjs = [];
    this._plateWidgets  = [];
    if (!save?.slotInfo) return;

    // Slots sized to the plate art's TRUE aspect (827:374 ≈ 2.21:1) so the
    // plates aren't stretched — taller than the old 158×44 buttons.
    const X = 16, W = 137, H = 62, GAP = 6;
    // Center the 3-plate stack vertically between the top music/FF dock (~56)
    // and the START / difficulty panel (panelY 350) — shifts it UP from the
    // old Y0 150 so it reads centered against those button rows.
    const Y0 = Math.round(56 + ((350 - 56) - (3 * H + 2 * GAP)) / 2);   // → 104
    const hdr = this.add.text(X + W / 2, Y0 - 17, 'WHO’S DRIVING?', {
      fontSize: '12px', fontFamily: 'Impact, "Arial Black", Arial, sans-serif',
      color: '#E9F4FF', stroke: '#07111F', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(d + 12);
    this._plateSlotObjs.push(hdr);

    const count = save.slotCount ?? 3;
    for (let i = 0; i < count; i++) {
      const y = Y0 + i * (H + GAP);
      const g = this.add.graphics().setDepth(d + 10);
      // Plate art for a NAMED slot — aspect-correct, height-fit, centred in the
      // row (texture is fixed per slot index; only visibility toggles).  Below
      // the handle text, above the graphics face.
      const plateKey = PLATE_KEYS[i] ?? PLATE_KEYS[0];
      const img = this.textures.exists(plateKey)
        ? this.add.image(X + W / 2, y + H / 2, plateKey).setDepth(d + 11).setVisible(false)
        : null;
      if (img) img.setDisplaySize(W, H);   // fill the whole slot (button-size)
      const t = this.add.text(X + W / 2, y + H / 2, '', {
        fontSize: '20px', fontFamily: '"Arial Black", Impact, sans-serif',
        color: '#16233f', align: 'center',
        stroke: '#FFFFFF', strokeThickness: 3,   // contrasting outline so the
      }).setOrigin(0.5).setDepth(d + 12);          // handle reads over busy plate art
      g.setInteractive(new Phaser.Geom.Rectangle(X, y, W, H), Phaser.Geom.Rectangle.Contains);
      g.input.cursor = 'pointer';
      g.on('pointerdown', (ptr) => { ptr.event?.stopPropagation?.(); this._onPlateSlotTap(i); });
      this._plateWidgets.push({ g, t, img, x: X, y, w: W, h: H, index: i });
      this._plateSlotObjs.push(g, t);
      if (img) this._plateSlotObjs.push(img);
    }
    this._refreshPlateSlots();
    // Track with the other title objects so the title show/hide toggle and
    // the UI camera (text-only) both pick these up.
    this._titleDifficultyBtns.push(...this._plateSlotObjs);
  }

  _refreshPlateSlots() {
    const save = this.registry.get('save');
    if (!save?.slotInfo || !this._plateWidgets) return;
    const info   = save.slotInfo();
    const active = save.activeSlot;
    for (const wdg of this._plateWidgets) {
      const slot     = info[wdg.index] || { used: false, plate: '' };
      const isActive = wdg.index === active && slot.used;
      const { g, t, img, x, y, w, h } = wdg;
      g.clear();
      // Every slot ALWAYS shows its fixed state plate (slot 0/1/2 → WA/OR/ID),
      // filling the whole button-size slot.  Used → the handle in the number
      // band; unused → "NEW".  Active player gets the gold-glow border.
      if (img) {
        img.setVisible(true);
        g.lineStyle(isActive ? 4 : 2, isActive ? 0xFFD23F : 0x20304A, isActive ? 1 : 0.8);
        g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 8);
        if (isActive) {
          g.lineStyle(1, 0xFFE98A, 0.9);
          g.strokeRoundedRect(x, y, w, h, 7);
        }
      } else {
        // No art available (texture missing) — fall back to the old face.
        g.fillStyle(slot.used ? 0xECE7D5 : 0x121C2E, slot.used ? 1 : 0.92);
        g.fillRoundedRect(x, y, w, h, 7);
        g.lineStyle(isActive ? 4 : 2, isActive ? 0xFFD23F : 0x39506E, 1);
        g.strokeRoundedRect(x, y, w, h, 7);
      }
      // Handle (used) or "NEW" (unused) in the plate's number band.
      t.setScale(1);
      t.setText(slot.used ? slot.plate : 'NEW');
      t.setColor('#16233f');   // dark navy — legible on every plate's light number band
      const maxW = w * 0.72;
      if (t.width > maxW) t.setScale(maxW / t.width);
      t.setPosition(x + w / 2, y + h * 0.60);
    }
  }

  _onPlateSlotTap(i) {
    if (!this._awaitingStart) return;   // only live while the title is up
    const save = this.registry.get('save');
    if (!save) return;
    const selectAndRefresh = () => {
      save.selectSlot?.(i);
      this.registry.get('stats')?.reload?.();
      this._refreshPlateSlots();
    };
    if (save.slotUsed?.(i)) {
      selectAndRefresh();
    } else {
      // Blank slot → name it via the DOM modal, then make it active.
      window.showPlateModal?.({
        current: '',
        onDone: (name) => {
          save.setSlotPlate?.(i, name);
          selectAndRefresh();
        },
      });
    }
  }

  /** Restart the Game scene at a given saved-snapshot. Snapshot is the
   *  shape persisted by `_saveRestStop`.  Difficulty is restored from the
   *  snapshot first so the next scene boots in the matching mode. */
  _resumeFromSavedSnapshot(snap) {
    if (snap?.difficulty) Difficulty.set(snap.difficulty, this.registry);
    this.scene.start('Game', {
      resumeFromStop: snap.id,
      resumeScore:    snap.score ?? 0,
      resumeStars:    snap.stars ?? 0,
    });
  }

  /** Pop a browser prompt asking for the 4-digit code, look it up against
   *  the per-device code map, and resume from the matching snapshot.
   *  `defaultCode` pre-fills the prompt — pass the most recent save code
   *  so the player can either accept it (Enter) or erase + type another. */
  _promptForCode(defaultCode = '') {
    this._buildCodeEntryPopup(defaultCode, (raw) => {
      const code = (raw || '').trim().toUpperCase();
      if (!code) return;
      const save = this.registry.get('save');
      const all  = save?.get?.('restStopSaves') ?? {};
      const snap = all[code];
      // Decode the code structure (stop letter + difficulty letter) so
      // even codes we've never saved locally still resume into the right
      // mode at the right rest stop.  Fresh codes seed a $0 / 0★ run.
      const parsed = this._parseSaveCode(code);
      if (snap) {
        if (snap.difficulty) Difficulty.set(snap.difficulty, this.registry);
        else if (parsed?.difficulty) Difficulty.set(parsed.difficulty, this.registry);
        this._resumeFromSavedSnapshot(snap);
        return;
      }
      if (parsed && REST_STOPS.find(r => r.id === parsed.stopId)) {
        Difficulty.set(parsed.difficulty, this.registry);
        this.scene.start('Game', { resumeFromStop: parsed.stopId, resumeScore: 0, resumeStars: 0 });
      } else {
        this._showPopup('CODE NOT FOUND', '#FF4444');
      }
    });
  }

  _addHudObjs(...objs) {
    for (const o of objs) {
      if (!o) continue;
      this._hudObjects?.push(o);
      this.cameras.main?.ignore(o);
    }
  }

  _buildConfirmPopup(title, message, onYes, onNo) {
    this._modalOpen = true;
    const objs = [];
    const D = 230;
    const cx = SCREEN_W / 2, cy = SCREEN_H / 2;

    const scrim = this.add.rectangle(cx, cy, SCREEN_W, SCREEN_H, 0x000000, 0.65)
      .setDepth(D).setInteractive();
    scrim.on('pointerdown', (p) => { p.event?.stopPropagation?.(); });
    objs.push(scrim);

    const cardW = 380, cardH = 180;
    const card = this.add.graphics().setDepth(D + 1);
    card.fillStyle(0x050812, 0.97);
    card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 7);
    card.lineStyle(3, 0x39A8FF, 0.92);
    card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 7);
    card.lineStyle(1, 0xFF39AF, 0.70);
    card.strokeRoundedRect(cx - cardW / 2 + 5, cy - cardH / 2 + 5, cardW - 10, cardH - 10, 5);
    objs.push(card);

    const ttl = this.add.text(cx, cy - 56, title, {
      fontSize: '20px', fontFamily: '"Arial Black", sans-serif', color: '#F4F7FF',
      stroke: '#FF39AF', strokeThickness: 2, align: 'center',
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(ttl);

    const msg = this.add.text(cx, cy - 16, message, {
      fontSize: '13px', fontFamily: '"Helvetica Neue", Arial, sans-serif',
      color: '#E3EDFF', align: 'center', wordWrap: { width: cardW - 30 },
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(msg);

    const close = () => {
      this._modalOpen = false;
      objs.forEach(o => o?.destroy?.());
    };

    const makeModalBtn = (x, label, neonColor, handler) => {
      const bg = this.add.graphics().setDepth(D + 2);
      const draw = (hover = false) => {
        bg.clear();
        bg.fillStyle(0x050812, hover ? 1 : 0.92);
        bg.fillRoundedRect(x - 60, cy + 32, 120, 36, 5);
        bg.lineStyle(hover ? 3 : 2, neonColor, 1);
        bg.strokeRoundedRect(x - 60, cy + 32, 120, 36, 5);
      };
      draw(false);
      bg.setInteractive(
        new Phaser.Geom.Rectangle(x - 60, cy + 32, 120, 36),
        Phaser.Geom.Rectangle.Contains,
      );
      bg.input.cursor = 'pointer';
      const css = `#${neonColor.toString(16).padStart(6, '0')}`;
      const txt = this.add.text(x, cy + 50, label, {
        fontSize: '16px', fontFamily: '"Arial Black", sans-serif',
        color: '#F4F7FF', stroke: css, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3);
      bg.on('pointerover', () => draw(true));
      bg.on('pointerout', () => draw(false));
      bg.on('pointerdown', handler);
      objs.push(bg, txt);
    };
    makeModalBtn(cx + 80, 'YES', 0xFF39AF, (p) => {
      p.event?.stopPropagation?.();
      close();
      onYes?.();
    });
    makeModalBtn(cx - 80, 'CANCEL', 0x39A8FF, (p) => {
      p.event?.stopPropagation?.();
      close();
      onNo?.();
    });

    this._addHudObjs(...objs);
  }

  _buildCodeEntryPopup(defaultCode, onAccept, onCancel) {
    this._modalOpen = true;
    const CODE_LEN = 5;
    let code = String(defaultCode || '').toUpperCase().slice(0, CODE_LEN);
    const objs = [];
    const D = 230;
    const cx = SCREEN_W / 2, cy = SCREEN_H / 2;

    const scrim = this.add.rectangle(cx, cy, SCREEN_W, SCREEN_H, 0x000000, 0.65)
      .setDepth(D).setInteractive();
    scrim.on('pointerdown', (p) => { p.event?.stopPropagation?.(); });
    objs.push(scrim);

    const cardW = 540, cardH = 330;
    const cardX = cx - cardW / 2;
    const cardY = cy - cardH / 2;
    const card = this.add.graphics().setDepth(D + 1);
    card.fillStyle(0x020611, 0.96);
    card.fillRoundedRect(cardX, cardY, cardW, cardH, 7);
    card.lineStyle(3, 0x39A8FF, 0.96);
    card.strokeRoundedRect(cardX, cardY, cardW, cardH, 7);
    card.lineStyle(1, 0xFF39AF, 0.78);
    card.strokeRoundedRect(cardX + 7, cardY + 7, cardW - 14, cardH - 14, 5);
    card.lineStyle(1, 0xF4F7FF, 0.28);
    card.strokeRoundedRect(cardX + 13, cardY + 13, cardW - 26, cardH - 26, 4);
    objs.push(card);

    const title = this.add.text(cx, cy - cardH/2 + 26, 'ENTER 5-CHAR SAVE CODE', {
      fontSize: '20px',
      fontFamily: 'Impact, "Arial Black", sans-serif',
      color: '#F4F7FF',
      stroke: '#39A8FF',
      strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5).setDepth(D + 2);
    objs.push(title);

    const slotsY = cy - cardH/2 + 78;
    const slotW = 38, slotGap = 10;
    const slotsTotalW = CODE_LEN * slotW + (CODE_LEN - 1) * slotGap;
    const slotsX = cx - slotsTotalW / 2 + slotW / 2;
    const slotTexts = [];
    const slotBgs = [];
    for (let i = 0; i < CODE_LEN; i++) {
      const x = slotsX + i * (slotW + slotGap);
      const sBg = this.add.graphics().setDepth(D + 2);
      const drawSlot = (active = false) => {
        sBg.clear();
        sBg.fillStyle(0x00030A, 0.95);
        sBg.fillRoundedRect(x - slotW / 2, slotsY - 22, slotW, 44, 4);
        sBg.lineStyle(active ? 3 : 2, active ? 0xFF39AF : 0x39A8FF, active ? 1 : 0.82);
        sBg.strokeRoundedRect(x - slotW / 2, slotsY - 22, slotW, 44, 4);
        sBg.lineStyle(1, 0xF4F7FF, active ? 0.55 : 0.22);
        sBg.strokeRoundedRect(x - slotW / 2 + 4, slotsY - 18, slotW - 8, 36, 3);
      };
      drawSlot(false);
      const sTx = this.add.text(x, slotsY, '', {
        fontSize: '24px',
        fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#F4F7FF',
        stroke: '#FF39AF',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3);
      objs.push(sBg, sTx);
      slotBgs.push(drawSlot);
      slotTexts.push(sTx);
    }
    const refresh = () => {
      for (let i = 0; i < CODE_LEN; i++) {
        slotTexts[i].setText(code[i] ?? '');
        slotBgs[i](i === code.length && code.length < CODE_LEN);
      }
    };
    refresh();

    const KEYS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const cols = 9;
    const keyW = 42, keyH = 26;
    const keyGap = 6;
    const padTotalW = cols * keyW + (cols - 1) * keyGap;
    const padX = cx - padTotalW / 2 + keyW / 2;
    const padY = cy - 8;
    for (let i = 0; i < KEYS.length; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = padX + c * (keyW + keyGap);
      const y = padY + r * (keyH + keyGap);
      const ch = KEYS[i];
      const kBg = this.add.graphics().setDepth(D + 2);
      const drawKey = (hover = false) => {
        kBg.clear();
        kBg.fillStyle(0x050812, hover ? 1 : 0.90);
        kBg.fillRoundedRect(x - keyW / 2, y - keyH / 2, keyW, keyH, 4);
        kBg.lineStyle(hover ? 2 : 1, hover ? 0xFF39AF : 0x2E8DD8, hover ? 0.96 : 0.70);
        kBg.strokeRoundedRect(x - keyW / 2, y - keyH / 2, keyW, keyH, 4);
      };
      drawKey(false);
      kBg.setInteractive(
        new Phaser.Geom.Rectangle(x - keyW / 2, y - keyH / 2, keyW, keyH),
        Phaser.Geom.Rectangle.Contains,
      );
      kBg.input.cursor = 'pointer';
      const kTx = this.add.text(x, y, ch, {
        fontSize: '15px',
        fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#F4F7FF',
        stroke: '#071224',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3);
      kBg.on('pointerover', () => drawKey(true));
      kBg.on('pointerout',  () => drawKey(false));
      kBg.on('pointerdown', (p) => {
        p.event?.stopPropagation?.();
        if (code.length < CODE_LEN) { code += ch; refresh(); }
      });
      objs.push(kBg, kTx);
    }

    const btnY = cy + cardH/2 - 30;
    const close = () => {
      this._modalOpen = false;
      objs.forEach(o => o?.destroy?.());
    };

    const makeActionBtn = (x, w, label, neonColor, handler) => {
      const bg = this.add.graphics().setDepth(D + 2);
      const draw = (hover = false) => {
        bg.clear();
        bg.fillStyle(0x050812, hover ? 1 : 0.92);
        bg.fillRoundedRect(x - w / 2, btnY - 18, w, 36, 5);
        bg.lineStyle(hover ? 3 : 2, neonColor, 1);
        bg.strokeRoundedRect(x - w / 2, btnY - 18, w, 36, 5);
      };
      draw(false);
      bg.setInteractive(
        new Phaser.Geom.Rectangle(x - w / 2, btnY - 18, w, 36),
        Phaser.Geom.Rectangle.Contains,
      );
      bg.input.cursor = 'pointer';
      const css = `#${neonColor.toString(16).padStart(6, '0')}`;
      const txt = this.add.text(x, btnY, label, {
        fontSize: '17px',
        fontFamily: 'Impact, "Arial Black", sans-serif',
        color: '#F4F7FF',
        stroke: css,
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3);
      bg.on('pointerover', () => draw(true));
      bg.on('pointerout',  () => draw(false));
      bg.on('pointerdown', handler);
      objs.push(bg, txt);
    };

    makeActionBtn(cx - 150, 124, 'CANCEL', 0x39A8FF, (p) => {
      p.event?.stopPropagation?.();
      close();
      onCancel?.();
    });
    makeActionBtn(cx, 94, 'DEL', 0xFF39AF, (p) => {
      p.event?.stopPropagation?.();
      code = code.slice(0, -1);
      refresh();
    });
    makeActionBtn(cx + 150, 124, 'OK', 0x39A8FF, (p) => {
      p.event?.stopPropagation?.();
      close();
      onAccept?.(code);
    });

    this._addHudObjs(...objs);
  }

  /** Start the radio at the earliest moment the browser allows.  All audio is
   *  blocked until a user gesture, so the run can't auto-play music on load —
   *  the START tap is the first legal gesture.  Called from _startGameplay (on
   *  START) and again from fireFirstTap (first in-game input) as a fallback.
   *  Inits on first call (which also arms the iOS native-gesture unlock),
   *  resumes the context if an autoplay block suspended it, and never restarts
   *  a song that's already playing.  Respects the mute toggle. */
  _kickRadio() {
    const a = this.audio;
    if (!a) return;
    if (!a.ready)                          a.init();             // first ever → inits + starts default station
    else if (a._ctx?.state !== 'running') { a._enablePlayback?.(); a.play?.(); }  // resume after an autoplay block
  }

  _startGameplay() {
    this._awaitingStart = false;
    // Kick the radio NOW — this runs inside the START tap's gesture frame, the
    // earliest point the browser permits audio (see _kickRadio).
    this._kickRadio();
    // Fresh-run-only path — this is where a brand-new trip begins (rest-stop
    // resume + checkpoint respawn skip _startGameplay), so reset the per-trip
    // session and tick the lifetime trips-started counter here.
    this.stats?.tripStart(this.player.vehicleId, { ranked: Difficulty.mode?.() !== 'custom' });
    // Fresh runs begin in a "ready" state — the road is frozen, time
    // and the party clock don't advance, and the player car sits at
    // idle without any blink.  The NEXT user input (tap / Right /
    // Space) flips the flag, the world starts scrolling, and gameTime
    // begins counting from that moment.
    this._awaitingFirstGameTap = true;
    // First-ever run: ask the player to set their license plate (their
    // name on the leaderboard).  DOM popup so the native keyboard is used;
    // only shows when no plate is saved yet, so it appears exactly once.
    if (window.__plate?.needsEntry?.()) window.showPlateModal?.();
    // Grace window — the START button's own pointerdown is currently
    // mid-dispatch, so any once-listener attached now would fire for
    // the same event and clear the flag immediately.  Delay listener
    // attachment past the event tick so only the NEXT input clears it.
    const fireFirstTap = () => {
      this._awaitingFirstGameTap = false;
      // Fallback radio kick — _startGameplay already fired one on the START
      // tap; this covers the case where that gesture frame didn't take (iOS
      // routes Phaser input outside the native gesture frame).  No-ops if
      // music is already running.
      this._kickRadio();
    };
    this.time.delayedCall(180, () => {
      this.input.once('pointerdown', fireFirstTap);
      // Either steering direction should kick the run off — previously
      // only Right (+ Space/Enter) cleared the flag, which left Easy
      // players unable to start with a Left tap in L/R mode.
      this.input.keyboard?.once('keydown-LEFT',  fireFirstTap);
      this.input.keyboard?.once('keydown-RIGHT', fireFirstTap);
      this.input.keyboard?.once('keydown-SPACE', fireFirstTap);
      this.input.keyboard?.once('keydown-ENTER', fireFirstTap);
    });
    // Custom mode — apply the slider levels chosen on the title screen.
    // Also unlock every drug at level > 0 so the bar renders properly.
    if (this._customStartLevels && this.drugs?.levels) {
      for (const [id, lvl] of Object.entries(this._customStartLevels)) {
        this.drugs.levels[id] = lvl;
        if (lvl > 0 && this.drugs.unlocked) this.drugs.unlocked[id] = true;
      }
      // Refresh the registry-stored unlock map so the HUD redraws bars.
      if (this.drugs.snapshotUnlocks) {
        this.registry.set('drugUnlocks', this.drugs.snapshotUnlocks());
      }
      this._customStartLevels = null;
    }
    // Custom mode — seed the wanted level from the modal's star picker.
    // Resets to 0 once consumed so a Start Over doesn't carry it.
    if (typeof this._customStartStars === 'number' && this.cops) {
      this.cops.stars     = this._customStartStars;
      this.cops.starTimer = 4;            // matches addStar's reset
      this._customStartStars = null;
    }
    // Custom mode — seed the wallet with $100,000 so the sandbox run
    // starts with money to spend on gas / weapons / pickups instead of
    // a $0 wallet.  Custom runs don't score, so this isn't "earned" —
    // it's just spending money for sandbox testing.
    if (Difficulty.mode?.() === 'custom') {
      this.score = 100000;
    }
    // Initialize/play radio on first user interaction (browser audio
    // gate).  PHONK (index 0) is the default station — the default vibe
    // when no other music is already playing.  But if the player
    // started a song or a playlist from the iPhone-menu music app
    // before launching, that selection takes priority — we do NOT
    // switch them off it.
    if (this.audio) {
      const customMusicPlaying =
        (!!this.audio._trackEl && !this.audio._trackEl.paused) ||
        (Array.isArray(this.audio._playlistQueue) && this.audio._playlistQueue.length > 0);
      if (!this.audio._inited) {
        // First-ever init — default to PHONK.
        this.audio.currentStation = 0;
        this.audio.init?.();
        this.audio._inited = true;
      } else if (!customMusicPlaying) {
        // No music currently playing — kick a fresh PHONK track so
        // Start Over / Checkpoint still drops the player into music
        // instead of silence.
        this.audio.currentStation = 0;
        this.audio._enablePlayback?.();
        this.audio.setStation?.(0);
      } else {
        // Player's own song/playlist is already running.  Resume
        // playback state without touching the station selection.
        this.audio._enablePlayback?.();
      }
    }
    // Fade out the full-frame title artwork and its interactive overlays
    // before revealing the live drive view.
    const titleObjs = [
      this._titleScrim, this._titleBackdrop, this._titleMain, this._titleSub, this._titleRoute, this._titleTap,
      this._titleResume,    this._titleResumeTxt,
      this._titleEnterCode, this._titleEnterCodeTxt,
      ...(this._titleDifficultyBtns ?? []),
      ...(this._titleLetters ?? []),
    ];
    const targets = titleObjs.filter(Boolean);
    this.tweens.add({
      targets, alpha: 0, duration: 300, ease: 'Cubic.Out',
      onComplete: () => this._setTitleVisible(false),
    });
    // Reveal HUD.
    this._setHudVisible(true);
    this._introDone = true;
    // Erase any "drift" the title screen accumulated — during _awaitingStart
    // we let player.position advance so the road wasn't a static
    // freeze-frame, but that mileage shouldn't bank into the actual run.
    // Resume paths set _resumeFromPosition / _resumeFromStop and have
    // already pinned position; only reset when starting fresh.
    if (this._resumeFromPosition == null && !this._resumeFromStop) {
      const startPosition = Math.max(0, this._customStartPosition ?? 0);
      const startProgress = startPosition / (ROUTE_SEGS * SEG_LENGTH);
      this.player.position = startPosition;
      this._odometer       = startProgress * TOTAL_ROUTE_MILES;
      this._passedCheckpoints = new Set(
        CHECKPOINTS.filter(cp => cp.t <= startProgress).map(cp => cp.name),
      );
      this._passedRestStops = new Set(
        REST_STOPS.filter(rs => rs.t <= startProgress).map(rs => rs.id),
      );
      const startCp = [...CHECKPOINTS].reverse().find(cp => cp.t <= startProgress);
      this._lastCheckpoint = {
        name: startCp?.name ?? 'West Seattle',
        position: startPosition,
        scoreAtCP: 0,
      };
      this._customStartPosition = null;
    }
    this.lastSegIdx = Math.floor(this.player.position / SEG_LENGTH);
    this.gameTime   = 0;
    // Clear any tap latch so it doesn't immediately fire steering.
    this._touchLeft = this._touchRight = this._touchF12 = false;
  }

  // Top speed in internal units, accounting for cocaine + meth pickup boosts + NOS.
  _maxSpeedWithBoost() {
    const cokeBonus = this.drugs.getCocaineSpeedBonusMPH?.() ?? 0;
    const methBonus = this.drugs.getMethSpeedBonusMPH?.()    ?? 0;
    const nosTier   = this._vehicleAccessories?.().nos ?? 0;
    const topMph    = 120 + cokeBonus + methBonus + nosTier * 5;
    return MAX_SPEED * (topMph / 120);
  }

  // Displayed MPH = (current speed / current top-speed) × top-MPH.
  _displayMPH() {
    // +4 mph per coke bag, +4 mph per meth pickup, +5 mph per NOS tier.
    const cokeBonus = this.drugs?.getCocaineSpeedBonusMPH?.() ?? 0;
    const methBonus = this.drugs?.getMethSpeedBonusMPH?.()    ?? 0;
    const nosTier   = this._vehicleAccessories?.().nos ?? 0;
    const topMph   = 120 + cokeBonus + methBonus + nosTier * 5;
    const topUnits = MAX_SPEED * (topMph / 120);
    const trueMph  = (this.player.speed / topUnits) * topMph;
    // LSD ≥ 60% — time distortion: world keeps scrolling at the player's
    // real speed, but the speedometer pegs at 60 mph for the trippy
    // "I'm crawling but everything's flying past" feel.
    const lsd = this.drugs?.get?.(DRUGS.LSD) ?? 0;
    if (lsd >= 0.60) return Math.min(60, trueMph);
    return trueMph;
  }

  _regionIndex(progress) {
    for (let i = 0; i < REGION_ORDER.length; i++) {
      if (progress < REGION_ORDER[i].end) return i;
    }
    return REGION_ORDER.length - 1;
  }

  _onArrested() {
    const cp         = this._lastCheckpoint;
    const earnedSince = Math.max(0, this.score - cp.scoreAtCP);
    let   lost        = Math.floor(earnedSince / 2);
    // Lawyer on retainer → busted fine cut in half.
    if (this.registry.get('save')?.get?.('lawyerRetained')) lost = Math.floor(lost * 0.5);
    this.score       -= lost;
    this._endGame('busted', { charge: 'DUI', losses: lost });
  }

  /** Speed-trap traffic stop (Stage 3) — assess the offense from the drug bars
   *  AT THE TIME OF THE STOP.  Returns { dui, base }: `dui` = over the legal
   *  limit (an intoxicated stop), `base` = the pre-lawyer fine.  Limit (sober):
   *  alcohol < COP_DUI_ALCOHOL_LIMIT AND every OTHER drug < COP_DUI_DRUG_LIMIT.
   *  Exception: with COP_DUI_MULTI_COUNT+ drugs active at once, EVERY drug
   *  (alcohol included) must be < the stricter COP_DUI_MULTI_LIMIT. */
  _assessTrafficStop() {
    const ids = Object.values(DRUGS);
    const lvl = (id) => this.drugs?.get?.(id) ?? 0;
    const activeCount = ids.reduce((n, id) => n + (lvl(id) > 0 ? 1 : 0), 0);
    let dui;
    if (activeCount >= COP_DUI_MULTI_COUNT) {
      dui = ids.some(id => lvl(id) >= COP_DUI_MULTI_LIMIT);
    } else {
      dui = lvl(DRUGS.ALCOHOL) >= COP_DUI_ALCOHOL_LIMIT
         || ids.some(id => id !== DRUGS.ALCOHOL && lvl(id) >= COP_DUI_DRUG_LIMIT);
    }
    return { dui };
  }

  /** Resolve the held traffic stop (Stage 3): apply the lawyer discount, run
   *  the bust checks, charge the fine, set the DUI earnings debuff, record the
   *  stats, and surface the result.  A bust routes to GameOver; otherwise the
   *  player pays up and drives off.  (Money == persisted score, so fines
   *  subtract from score.) */
  _issueTrafficTicket() {
    const t = this._trapTicket;
    this._trapTicket = null;
    if (!t) { this._showPopup('✅ Ticket issued. Drive safe.', '#88FF88'); return; }

    const hasLawyer = this.registry.get('save')?.get?.('lawyerRetained') === true;
    // Fine = a fraction of current cash, capped at a dollar ceiling:
    //   speeding = 50% of cash, max $300.   DUI = 100% of cash, max $10,000.
    // Lawyer on retainer waives speeding and halves the DUI fine.  (The lawyer
    // also halves arrest bail elsewhere — unchanged.)
    const frac = t.dui ? COP_TICKET_DUI_FRAC : COP_TICKET_SPEEDING_FRAC;
    const cap  = t.dui ? COP_TICKET_DUI_CAP  : COP_TICKET_SPEEDING_CAP;
    let fine   = Math.min(cap, Math.round(Math.max(0, this.score) * frac));
    if (hasLawyer) fine = t.dui ? Math.round(fine * 0.5) : 0;

    // ── Bust: repeat-DUI suspended license. ────────────────────────────────
    // Only intoxicated stops count toward the rolling COP_DUI_WINDOW_MI window;
    // sober speeding tickets never suspend the license.  A DUI bust no longer
    // ENDS the game — it sends the player back to the start (see
    // _bustBackToStart).  The restart wipes the run, so no fine is charged here.
    if (t.dui) {
      const mi = this._odometer ?? 0;
      this._duiStopMiles = (this._duiStopMiles ?? []).filter(m => m > mi - COP_DUI_WINDOW_MI);
      this._duiStopMiles.push(mi);
      const limit = hasLawyer ? COP_DUI_BUST_COUNT_LAWYER : COP_DUI_BUST_COUNT;
      if (this._duiStopMiles.length >= limit) {
        this.stats?.recordTrafficStop({ dui: true, amountPaid: 0, busted: true });
        this._bustBackToStart();
        return;
      }
    }

    // ── No bust: pay the fine, set the DUI earnings debuff, drive off. ──────
    this.score = Math.max(0, this.score - fine);
    this.stats?.recordTrafficStop({ dui: t.dui, amountPaid: fine, busted: false });
    if (t.dui) {
      this._duiEarnPenaltyMi = (this._odometer ?? 0) + COP_DUI_EARN_MI;
      this._showPopup(
        (fine > 0 ? `🚔 DUI — −$${fine.toLocaleString()}` : '🚔 DUI — ⚖️ fine waived') +
        `\nEarnings ×${COP_DUI_EARN_MULT} for ${COP_DUI_EARN_MI} mi`,
        '#FF5C7A');
    } else {
      this._showPopup(
        fine > 0 ? `🎫 Speeding ticket — −$${fine.toLocaleString()}\nDrive safe.`
                 : '⚖️ Lawyer got the speeding ticket dropped.\nDrive safe.',
        fine > 0 ? '#FFDD44' : '#88FF88');
    }
  }

  /** DUI suspended-license outcome — NO LONGER a game-over.  Freeze the run,
   *  show the BUSTED screen for 5 seconds, then restart from the very beginning
   *  with the car already rolling (skipTitle).  The fresh run resets cash, HP,
   *  and mileage to mile 0 — losing the run is the penalty, but the game keeps
   *  going rather than dropping to the Game Over panel. */
  _bustBackToStart() {
    if (this._bustingToStart) return;
    this._bustingToStart = true;            // update() freezes the world while shown
    try { this.audio?.setPaused?.(true); } catch (_) {}
    // Full-screen BUSTED screen (image if present, else a red wash) on the UI
    // camera so world shake/sway can't move it.
    const overlay = this.textures.exists('ui_end_busted_screen')
      ? this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'ui_end_busted_screen')
          .setDisplaySize(SCREEN_W, SCREEN_H).setDepth(3000)
      : this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x330000, 0.94)
          .setOrigin(0).setDepth(3000);
    const label = this.add.text(SCREEN_W / 2, SCREEN_H * 0.84,
      'BUSTED — SUSPENDED LICENSE\nBack to the start…', {
        fontSize: '22px', fontFamily: IMPACT, color: '#FF5C7A',
        stroke: '#000000', strokeThickness: 5, align: 'center',
      }).setOrigin(0.5).setDepth(3001);
    this._hudObjects?.push(overlay, label);
    this.cameras.main?.ignore?.([overlay, label]);
    // 5-second hold, then a fresh rolling run from mile 0.
    this.time.delayedCall(5000, () => {
      try { this.audio?.setPaused?.(false); } catch (_) {}
      this.scene.start('Game', { skipTitle: true });
    });
  }

  /** Overdose handler — freezes the last frame and fades into the
   *  dedicated Overdosed ending screen.  Checkpoint retry handles the
   *  existing monetary/reset consequence from there. */
  _onOverdose(drugId) {
    if (this._odEnding) return;
    this._odEnding = true;
    this.audio?.setPaused?.(true);

    // Keep overdose quiet and final: gameplay freezes, vision fades to
    // black, and only then does the dedicated OVERDOSED ending appear.
    const fade = this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 1)
      .setOrigin(0)
      .setDepth(1000)
      .setAlpha(0);
    this._hudObjects?.push(fade);
    this.cameras.main?.ignore?.(fade);
    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 1100,
      ease: 'Sine.In',
      onComplete: () => this._endGame('overdose', { drug: drugId }),
    });
  }

  _endGame(cause, extra = {}) {
    // (Mission/Hub branch removed — MissionManager and HubScene were
    // vestigial from the abandoned hub-mode design.  Game runs straight
    // through GameScene → GameOverScene now.)

    // Pause the music so the OD/crash dirge isn't the kart-radio loop.
    this.audio?.setPaused?.(true);

    // ── Technical-loss path (TOO LATE + 5★) ─────────────────────────
    // Open the slider modal: pick a checkpoint + drug levels, restart
    // the run from there.  No GameOverScene transition.  Cash penalty
    // is applied (50% of post-checkpoint score) before the restart.
    if (cause === 'busted_late' && !this._restartModalOpen) {
      this._restartModalOpen = true;
      const cp = this._lastCheckpoint ?? { position: 0, scoreAtCP: 0 };
      const earnedSince = Math.max(0, this.score - (cp.scoreAtCP ?? 0));
      let   lost        = Math.floor(earnedSince / 2);
      // Lawyer on retainer → busted fine cut in half.
      if (this.registry.get('save')?.get?.('lawyerRetained')) lost = Math.floor(lost * 0.5);
      this.score        = Math.max(0, this.score - lost);
      this._showPopup(`💀 Cash penalty: −$${lost.toLocaleString()}`, '#FF4444');
      // Open slider modal in restart mode after a brief beat.
      this.time.delayedCall(900, () => {
        this._buildDrugSliderModal({
          mode: 'restart',
          onConfirm: ({ drugLevels, checkpointPos, checkpointLabel }) => {
            // Re-launch GameScene with the chosen checkpoint + drug levels.
            this.audio?.setPaused?.(false);
            this._customStartLevels = drugLevels;
            this.scene.restart({
              resumeFromPosition: checkpointPos,
              resumeFromLabel:    checkpointLabel,
              startDrugLevels:    drugLevels,
            });
          },
        });
      });
      return;
    }

    // Run-summary snapshot for the GameOver "Drug Log" panel — what they
    // unlocked, what they picked up, and what they never saw.
    const drugSummary = {};
    for (const id of Object.values(DRUGS)) {
      drugSummary[id] = {
        unlocked:    !!this.drugs.unlocked?.[id],
        maxReached:  this.drugs.maxReached?.[id] ?? 0,
        pickupCount: this.drugs.pickupCounts?.[id] ?? 0,
      };
    }

    // Career stats: a Pullman finish is a completion; everything else
    // (crash / busted / overdose) is an incomplete run.  Both fold the
    // run into lifetime records and flush.  (busted_late returns earlier.)
    // Guarded so a double _endGame() in one frame can't double-count trips.
    if (!this._statsTripEnded) {
      this._statsTripEnded = true;
      const _s = Math.round(this.score);
      const _mi = this._odometer ?? 0;
      const _t = Math.floor(this.gameTime ?? 0);
      if (cause === 'finish_on_time' || cause === 'finish_late') {
        this.stats?.tripComplete({ score: _s, miles: _mi, timeSec: _t });
      } else {
        this.stats?.tripEnd({ score: _s, miles: _mi, timeSec: _t });
      }
    }

    this.scene.start('GameOver', {
      score:           Math.round(this.score),
      // Pass distance in MILES directly — player.position is in
      // segment-world-units, not feet, so the previous /5280 conversion
      // was wildly wrong (read 640 mi after a 6 mi drive).
      distanceMi:      this._odometer ?? 0,
      runTimeSec:      Math.floor(this.gameTime ?? 0),
      cause,
      drug:            extra.drug ?? null,
      charge:          extra.charge ?? null,
      losses:          Math.round(extra.losses ?? 0),
      checkpointCode:  this.registry.get('save')?.get?.('lastRestStop')?.code ?? null,
      drugSummary,
      lastCheckpoint:  this._lastCheckpoint
        ? {
            name:     this._lastCheckpoint.name,
            position: this._lastCheckpoint.position,
          }
        : null,
    });
  }
}
