// Screen
export const SCREEN_W = 800;
export const SCREEN_H = 450;

// Road
export const ROAD_WIDTH   = 3600; // wide enough for 4 lanes of cars w/ a touch of margin
export const SEG_LENGTH   = 200;   // virtual units per segment
export const RUMBLE_SEGS  = 3;     // segments per rumble stripe
// Lane-marker dash pattern.  A real interstate dashed line is ~10 ft on,
// ~30 ft off (1:3).  We mirror that ratio in segment counts so each dash
// reads as a distinct stripe at perspective distance instead of a tall
// block.  An equal dash-vs-gap setup made distant dashes look like
// totem-pole signs stacked into the vanishing point.
export const LANE_DASH_LEN  = 3;   // segments painted (the actual dash)
export const LANE_DASH_GAP  = 9;   // segments of gap before the next dash
export const LANES        = 3;
export const DRAW_DIST    = 380;   // segments rendered ahead (farther horizon)
export const CAM_HEIGHT   = 1900;  // higher = more road visible ahead (was 1500)
export const CAM_DEPTH    = 0.68;  // lower = wider FOV / more visible distance (was 0.74)
// ── Mutable camera profile (view-mode aware) ─────────────────────────
//   chase   — third-person rear-view (default).  CAM_HEIGHT / CAM_DEPTH
//             above are the initial values.
//   cockpit — first-person driver eye.  Lower height (less elevated
//             overview, more road rushing toward the windshield) +
//             tighter FOV (nearby traffic / signs read larger).
// All projection consumers read from CAM.height / CAM.depth rather
// than the static constants so setCameraMode() can swap profiles on
// the fly (e.g., V key in cockpit-capable vehicles).
export const CAM = {
  height: CAM_HEIGHT,
  depth:  CAM_DEPTH,
  // eyeForwardZ — how far AHEAD of the player's physics position the
  // rendered camera sits.  Chase: 0 (camera is at playerPos, player
  // car sprite painted PLAYER_VIRTUAL_Z=3000 ahead).  Cockpit: 3000
  // (camera moves into the driver seat where the rear-view sprite was;
  // sprite is hidden in this mode).  Gameplay/collision still keys
  // off raw player.position — only the visual viewpoint shifts.
  eyeForwardZ: 0,
  // horizonY — screen-Y of the horizon line / vanishing point.  Chase
  // 225 (SCREEN_H/2).  Cockpit 175 — pushes horizon UP the screen so
  // more windshield area shows road below.  Road.js shifts EVERY
  // horizon-anchored element (road projection, sky, mountains, water,
  // haze band, ground decals) using this same value so the scene
  // stays seamlessly aligned at any horizon setting.
  horizonY: 225,
  mode:   'chase',
};
export function setCameraMode(mode) {
  if (mode === 'cockpit') {
    // Cockpit profile tuned to preserve a useful forward-road window
    // while still feeling more forward than chase.
    //   • CAM.height 1200 — driver's eye sits MUCH lower than chase's
    //     1900.  Chase is a third-person rig that benefits from height
    //     (looking down on the player car); cockpit IS the driver, who
    //     in a used sedan sits ~4 ft / ~800 units high.  1200 reads as
    //     "raised sedan" — over the hood, not perched on a truck cab.
    //   • CAM.depth 0.92 — tighter FOV than chase 0.68 so nearby traffic
    //     reads as close.  Pushed past the earlier 0.78 because the
    //     +3000 forward eye-shift (intentional, for driver-seat POV)
    //     pushes the visible-player-row of NPCs back to relZ 3000-6000
    //     from the camera — they were rendering tiny.  Bumping the
    //     focal length compensates without giving up the driver-seat
    //     viewpoint.
    //   • eyeForwardZ 4500 — forward of driver seat, near the front
    //     bumper of where the chase-mode player car rendered.  3000
    //     (PLAYER_VIRTUAL_Z) placed the eye at the back bumper —
    //     nearby cars and roadside trucks rendered tiny because they
    //     were 3000+ units from the eye even when "right there".
    //     Pushing to 4500 makes a parked roadside vehicle (~1 car
    //     length ahead of the front bumper visually) sit at relZ
    //     ~800-1500 instead of 2500-3000, so it projects at a size
    //     that reads as "right next to me" relative to the dashboard.
    CAM.height      = 1200;
    CAM.depth       = 0.92;
    CAM.eyeForwardZ = 4500;
    CAM.horizonY    = 130;        // raised 95 px so the windshield is mostly road (was 175); leaves ~45 px of sky above the horizon between the HUD bar and the road
    CAM.mode        = 'cockpit';
  } else {
    CAM.height      = CAM_HEIGHT;
    CAM.depth       = CAM_DEPTH;
    CAM.eyeForwardZ = 0;
    CAM.horizonY    = 225;        // SCREEN_H/2 — default chase horizon
    CAM.mode        = 'chase';
  }
}
export const FOG_DENSITY  = 4;

// Player
export const ACCEL        = 195;
export const BRAKE        = 340;
export const DECEL        = 76;
export const MAX_SPEED    = 27000; // internal world-units/sec; speedometer reads 120 MPH at this top (raised by cocaine pickups)
export const TURN_SPEED   = 2.8;
export const OFFROAD_SLOW = 0.6;
export const CENTRIFUGAL  = 0.3;

// Scoring — baseline goal is 25 pts per mile of normal driving (no drugs,
// no stars).  PTS_DIST is multiplied by `_scoreMult()` (≥1) and accumulated
// per-segment.  ROUTE_SEGS / TOTAL_ROUTE_MILES = 1632 segs/mi → 25/1632 ≈ 0.0153.
export const PTS_DIST     = 0.0153;
// PTS_CRASH retained for legacy reference; live crash scoring is now
// `$5 × damage received` (see _onNpcCollision in GameScene.js).
export const PTS_CRASH    = 500;
// Hitchhiker NICE FOLKS payout.  PARTY FAVOR is half this (per the
// existing 0.5× multiplier in the hitchhiker handler).
export const PTS_HITCH    = 500;
export const DRUG_MULT    = 0.5;

// Per-drug pickup points (doubled when that bar is full)
// Per-drug pickup payouts: { base } when the bar is below the
// FULL_BAR_THRESHOLD, { full } when the bar is at/above it.  The
// full-bar bonus is per-drug (used to be a flat 2× across the board)
// so risky drugs (fent, heroin) pay disproportionately more for
// keeping their bar topped off.
export const DRUG_PTS = {
  beer:     { base:  5, full:  20 },
  weed:     { base:  5, full:  20 },
  cocaine:  { base: 40, full: 100 },
  shrooms:  { base: 15, full:  40 },
  lsd:      { base: 10, full:  50 },
  heroin:   { base: 15, full: 100 },
  rx:       { base: 10, full:  80 },
  fentanyl: { base: 25, full: 500 },
  ketamine: { base: 15, full:  90 },
  meth:     { base: 15, full:  80 },
};
// Bar percentage at which a pickup awards the full-bar bonus instead
// of the base payout.  Lowered from 0.95 → 0.80 so the bonus is more
// reachable (less precision-driven, more strategic).
export const FULL_BAR_THRESHOLD = 0.80;

// Drug IDs
export const DRUGS = {
  ALCOHOL:  'alcohol',
  WEED:     'weed',
  COCAINE:  'cocaine',
  SHROOMS:  'shrooms',
  LSD:      'lsd',
  HEROIN:   'heroin',
  RX:       'rx',
  FENTANYL: 'fentanyl',
  KETAMINE: 'ketamine',
  METH:     'meth',
};

// Drug config — decay rates ~50% slower so bars last longer
export const DRUG_CONFIG = {
  alcohol:  { label: '🍺 Beer',    color: 0xF5A623, hexCss: '#F5A623', decayRate: 0.0025, odThreshold: 1.0,  canOD: false, unlocked: true  },
  weed:     { label: '🌿 Weed',    color: 0x4CAF50, hexCss: '#4CAF50', decayRate: 0.0053, odThreshold: 1.0,  canOD: false, unlocked: true  },
  cocaine:  { label: '❄️ Coke',    color: 0xFFFFFF, hexCss: '#FFFFFF', decayRate: 0.0120, odThreshold: 1.00, canOD: true,  unlocked: false },
  shrooms:  { label: '🍄 Shrooms', color: 0xBB44FF, hexCss: '#BB44FF', decayRate: 0.0042, odThreshold: 1.0,  canOD: false, unlocked: false },
  lsd:      { label: '💊 Acid',    color: 0xFF44AA, hexCss: '#FF44AA', decayRate: 0.0033, odThreshold: 1.0,  canOD: false, unlocked: false },
  heroin:   { label: '💉 Heroin',  color: 0x8B4513, hexCss: '#8B4513', decayRate: 0.0060, odThreshold: 0.88, canOD: true,  unlocked: false },
  rx:       { label: '💊 Rx',      color: 0x00BCD4, hexCss: '#00BCD4', decayRate: 0.0068, odThreshold: 0.97, canOD: true,  unlocked: false },
  fentanyl: { label: '☠️ Fent',    color: 0xFF2222, hexCss: '#FF2222', decayRate: 0.0083, odThreshold: 1.00, canOD: true,  unlocked: false },
  ketamine: { label: '🐴 Ket',     color: 0x44EEFF, hexCss: '#44EEFF', decayRate: 0.0075, odThreshold: 0.90, canOD: true,  unlocked: false },
  meth:     { label: '⚡ Meth',    color: 0xCCFFCC, hexCss: '#CCFFCC', decayRate: 0.0090, odThreshold: 0.85, canOD: true,  unlocked: false },
};

// Named drug combos — every constituent drug's bar must be ≥ threshold for
// the combo to fire.  Threshold of 0.10 lights combos up as soon as the
// drugs are visibly active.
//
// Combos are PURELY COSMETIC labels — each drug already grants its own
// +0.5 / +1.0 multiplier ladder, so the combo doesn't add a separate
// bonus.  When active, the combo's `label` shows next to the multiplier
// in the HUD; nothing else changes.  Non-score side-effects (slow-mo on
// near-miss, off-road immunity, etc.) still apply where defined.
export const DRUG_COMBOS = {
  snow_cone:    { drugs: ['cocaine', 'alcohol'],  threshold: 0.10, label: 'SNOW-CONE',   color: '#FFCC44' },
  psychedelic:  { drugs: ['shrooms', 'lsd'],      threshold: 0.10, label: 'PSYCHEDELIC', color: '#FF44FF' },
  croak:        { drugs: ['cocaine', 'meth'],     threshold: 0.10, label: 'CROAK',       color: '#88FFFF' },
  tranq:        { drugs: ['heroin',  'ketamine'], threshold: 0.10, label: 'TRANQ',       color: '#8B44FF' },
  dirty_joint:  { drugs: ['cocaine', 'weed'],     threshold: 0.10, label: 'DIRTY JOINT', color: '#88FF88' },
  crossfaded:   { drugs: ['alcohol', 'weed'],     threshold: 0.10, label: 'CROSS-FADED', color: '#FFEE88' },
  a_bomb:       { drugs: ['heroin',  'weed'],     threshold: 0.10, label: 'A-BOMB',      color: '#AA66CC' },

  // ── 2-drug additions ────────────────────────────────────────────────
  cali_sober:       { drugs: ['weed', 'shrooms'],                          threshold: 0.10, label: 'CALIFORNIA SOBER', color: '#88DD66' },

  // ── 3-drug stacks ──────────────────────────────────────────────────
  wizard_flip:      { drugs: ['lsd', 'shrooms', 'alcohol'],                threshold: 0.10, label: 'WIZARD FLIPPING',  color: '#CC99FF' },
  frisco_speedball: { drugs: ['cocaine', 'heroin', 'lsd'],                 threshold: 0.10, label: 'FRISCO SPEEDBALL', color: '#FFAA66' },
  el_diablo:        { drugs: ['cocaine', 'weed', 'heroin'],                threshold: 0.10, label: 'EL DIABLO',        color: '#CC4422' },
  pharm_run:        { drugs: ['rx', 'cocaine', 'alcohol'],                 threshold: 0.10, label: 'PHARM RUN',        color: '#22CCEE' },
  trifecta:         { drugs: ['alcohol', 'weed', 'cocaine'],               threshold: 0.10, label: 'TRIFECTA',         color: '#EEDD66' },

  // ── 4-drug chaos (PCP substituted with meth per player spec) ────────
  el_diablito:      { drugs: ['cocaine', 'weed', 'heroin', 'meth'],        threshold: 0.10, label: 'EL DIABLITO',      color: '#FF3322' },
  apocalypse:       { drugs: ['heroin', 'meth', 'alcohol', 'weed'],        threshold: 0.10, label: 'APOCALYPSE',       color: '#FF6600' },

  // ── 5-drug max (Rohypnol substituted with rx per player spec) ───────
  five_way:         { drugs: ['heroin', 'cocaine', 'meth', 'alcohol', 'rx'], threshold: 0.10, label: 'FIVE-WAY',       color: '#FF00AA' },
};

// Vehicle physical bounds in world space — used by the AABB collision
// test so cars at the same Z + lane register as touching, regardless of
// where they happen to project on screen.  Tightened from 700 / 0.18
// after testing — the wider thresholds were firing side-swipes when
// cars were a clear half-lane apart.  Cars now have to be physically
// close to register a hit at all.
export const CAR_LEN_Z       = 500;     // longitudinal half-window (~one car body)
export const CAR_WIDTH_LANES = 0.11;    // lateral half-window in normalised lane units
// The player sprite sits visually at SCREEN_H − 130 ≈ y=320, but in
// pseudo-3D the camera is BEHIND that point on the road.  The screen
// position y=320 corresponds to ~3000 world units in front of the
// camera (with CAM_HEIGHT=1900, CAM_DEPTH=0.68).  Treating the player's
// virtual Z as 3000 means: NPCs that cross into relZ < 3000 have
// VISUALLY passed the player and should hand off to the rear-view.
export const PLAYER_VIRTUAL_Z = 3000;

// Wanted / cop system
export const MAX_STARS    = 5;
export const STAR_DECAY   = 0.04;
export const COP_SPAWN_Z  = DRAW_DIST * SEG_LENGTH * 0.9;
// Type-specific arrest thresholds.  Hitting these → game over (BUSTED).
export const COP_REAR_BUMPS_TO_ARREST = 5;   // rear cops ramming you 5×
export const COP_HEADONS_TO_ARREST    = 3;   // 3rd head-on with oncoming cop
export const COP_PITS_TO_ARREST       = 1;   // any successful PIT = instant BUSTED
// Top speed for any cop, in MPH (matched against player display speed).
// 145 mph means a 140 mph boosted player without cocaine never quite gets
// away; one cocaine pickup (+5 mph) is enough to start outrunning them.
export const COP_TOP_MPH = 145;

// Route total length in segments.
// Sized so a 326-mi trip at MAX_SPEED 27,000 u/s takes ~58 min real time
// (gives the user-requested ~5 mi/min mileage gain) while the road still
// scrolls at full arcade speed.
export const ROUTE_SEGS   = 470000;

// Real route: West Seattle → I-90 East → WA-26 → US-195 South → WSU (Pullman).
// Each location has a [start, end] mile range that drives both the HUD
// bottom-center label and the green exit-sign placements.
const _CP_RAW = [
  // "West Seattle" only until you cross the West Seattle Bridge
  // (bridge stretch ends at mile 1.75); the city east of the bridge
  // is just "Seattle".  Slight buffer to mile 2 so the label change
  // lands clearly past the deck instead of mid-span.
  { name: 'West Seattle',     mileage:   0, end:   2, isStart: true },
  { name: 'Seattle',           mileage:   2, end:   7 },
  // Mercer Island ends at the East Channel Bridge (mile 9.8-10.2).
  // Past that bridge you're on the Bellevue mainland, so the label
  // and the region (eastside_urban at mile 10.2+) need to agree —
  // otherwise the player sees tall Bellevue skyline buildings while
  // the label still reads "Mercer Island" (Mercer Island is
  // residential, no skyscrapers).
  { name: 'Mercer Island',     mileage:   7, end:  10 },
  { name: 'Bellevue',          mileage:  10, end:  16 },
  { name: 'Issaquah',          mileage:  17, end:  25 },
  { name: 'Snoqualmie',        mileage:  26, end:  31 },
  { name: 'North Bend',        mileage:  32, end:  38 },
  { name: 'Snoqualmie Pass',   mileage:  45, end:  55 },
  { name: 'Easton',            mileage:  65, end:  75 },
  { name: 'Cle Elum',          mileage:  78, end:  88 },
  { name: 'Thorp',             mileage:  95, end: 102 },
  { name: 'Ellensburg',        mileage: 105, end: 115 },
  { name: 'Vantage',           mileage: 132, end: 138 },
  { name: 'Royal City',        mileage: 150, end: 165 },
  { name: 'Othello',           mileage: 180, end: 195 },
  { name: 'Washtucna',         mileage: 225, end: 235 },
  { name: 'La Crosse',         mileage: 250, end: 260 },
  { name: 'Colfax',            mileage: 272, end: 278 },
  // 'Pullman' city limit (mile 279) is just the entrance to the
  // greater Pullman region; the actual rest stop / destination is at
  // mile 289 (WSU campus area).  Splitting into two checkpoints so
  // the "city limit" sign reads at 279 but the run only finishes
  // (and the TOO LATE + 5★ technical loss only triggers) at 289.
  { name: 'Pullman',           mileage: 279, end: 289 },
  { name: 'Pullman, WA',       mileage: 289, end: 293, isFinish: true },
];
// Total route length is the END mile of the final checkpoint (Pullman = 293).
export const TOTAL_ROUTE_MILES = _CP_RAW[_CP_RAW.length - 1].end ?? _CP_RAW[_CP_RAW.length - 1].mileage;
export const CHECKPOINTS = _CP_RAW.map(cp => ({
  ...cp,
  t:    cp.mileage / TOTAL_ROUTE_MILES,
  tEnd: (cp.end ?? cp.mileage) / TOTAL_ROUTE_MILES,
}));

/** HUD location label for a given progress (0–1).  Returns the name of
 *  the location whose [start, end] range contains the player, or the
 *  closest preceding location if the player is in a "between" gap. */
export function getLocationName(progress) {
  let last = CHECKPOINTS[0]?.name ?? '';
  for (const cp of CHECKPOINTS) {
    if (progress >= cp.t && progress <= cp.tEnd) return cp.name;
    if (progress > cp.tEnd) last = cp.name;
  }
  return last;
}

// Rest stops — placed at the towns the player flagged with an asterisk in
// the mileage table.  Each gets advance signs at −5 mi and −1 mi, an exit
// ramp, a sectioned menu (drugs/weapons + garage + sex workers + road),
// and acts as a save checkpoint with a 4-digit alphanumeric code.  ID is
// the first letter of the town name so codes are stable + readable.
// Rest stops use the START of each location's mileage range (the exit is
// "into town").  Save-code IDs are stable A–Z letters keyed off the first
// letter of the town, with single-letter conflicts resolved by the next
// distinguishing character (e.g. Othello = 'O', Royal City = 'Y' to dodge
// future conflicts).
// Rest stops with per-stop amenity sets.  Mileage is the on-road exit
// point, hand-tweaked away from bridges (Lacey V Murrow at mile 7-8 +
// East Channel at 10-11.5) so the off-ramp lands on dry land.  `exit`
// is now the displayed sign label (real-world WA highway exit numbers).
//
// `amenities` is an array of brand keys present at this stop:
//   gas | hunting | camp | dealer | drugs
// The rest-stop scene's landing screen filters tiles to this list, so
// a camp-only stop only shows the Camp tile.
//
// `hwy` is the highway shield badge composited onto the green exit sign
// (top-left).  Real I-90 stops carry the I-90 shield through Vantage; the
// route then jogs onto WA-26 across the Columbia Basin, swings up US-195
// at Colfax, and finishes on WA-270 into Pullman (we reuse hwy_wa270 for
// WA-271 since the same green WA-state badge fits visually).
const _REST_STOP_DEF = [
  { id: 'S',  name: 'Seattle, WA',         mileage:    4, exit: 'Exit 4',     hwy: 'hwy_i90',   amenities: ['gas', 'drugs', 'dealer'] },
  // Mercer Island sits between the Mercer Island Lid Tunnel (8.5–9.0)
  // and the East Channel Bridge (10–11.5).  Mile 9.5 keeps the entire
  // 1-mi ramp window (8.5–9.5) on dry road only after the player exits
  // the lid tunnel — no on-bridge / in-water ramp paint.
  { id: 'M',  name: 'Mercer Island, WA',   mileage:  9.5, exit: 'Exit 7B',    hwy: 'hwy_i90',   amenities: ['camp'] },
  // Bellevue moved 1 mi past the East Channel Bridge end (mile 11.5) so
  // the ramp window (11.5–12.5) lands on dry Bellevue shoreline rather
  // than half-on the floating bridge.
  { id: 'B',  name: 'Bellevue, WA',        mileage: 12.5, exit: 'Exit 10',    hwy: 'hwy_i90',   amenities: ['dealer', 'drugs'] },
  { id: 'I',  name: 'Issaquah, WA',        mileage:   18, exit: 'Exit 18',    hwy: 'hwy_i90',   amenities: ['hunting', 'camp'] },
  { id: 'SQ', name: 'Snoqualmie, WA',      mileage:   25, exit: 'Exit 25',    hwy: 'hwy_i90',   amenities: ['dealer'] },
  { id: 'N',  name: 'North Bend, WA',      mileage:   32, exit: 'Exit 32',    hwy: 'hwy_i90',   amenities: ['gas', 'hunting', 'drugs'] },
  { id: 'SP', name: 'Snoqualmie Pass, WA', mileage:   53, exit: 'Exit 53',    hwy: 'hwy_i90',   amenities: ['camp', 'gas'] },
  { id: 'EA', name: 'Easton, WA',          mileage:   70, exit: 'Exit 70',    hwy: 'hwy_i90',   amenities: ['camp'] },
  { id: 'C',  name: 'Cle Elum, WA',        mileage:   84, exit: 'Exit 84',    hwy: 'hwy_i90',   amenities: ['gas', 'hunting'] },
  { id: 'TH', name: 'Thorp, WA',           mileage:  101, exit: 'Exit 101',   hwy: 'hwy_i90',   amenities: ['camp'] },
  { id: 'E',  name: 'Ellensburg, WA',      mileage:  109, exit: 'Exit 109',   hwy: 'hwy_i90',   amenities: ['dealer', 'gas'] },
  { id: 'V',  name: 'Vantage, WA',         mileage:  137, exit: 'Exit 137',   hwy: 'hwy_i90',   amenities: ['gas'] },
  { id: 'Y',  name: 'Royal City, WA',      mileage:  158, exit: 'WA-262',     hwy: 'hwy_wa26',  amenities: ['hunting'] },
  { id: 'O',  name: 'Othello, WA',         mileage:  184, exit: 'WA-17',      hwy: 'hwy_wa26',  amenities: ['drugs', 'gas'] },
  { id: 'W',  name: 'Washtucna, WA',       mileage:  228, exit: 'WA-261',     hwy: 'hwy_wa26',  amenities: ['gas'] },
  { id: 'L',  name: 'La Crosse, WA',       mileage:  253, exit: 'Airport Rd', hwy: 'hwy_us195', amenities: ['camp'] },
  { id: 'CO', name: 'Colfax, WA',          mileage:  274, exit: 'US-195 S',   hwy: 'hwy_us195', amenities: ['dealer', 'gas'] },
  { id: 'P',  name: 'Pullman, WA',         mileage:  289, exit: 'WA-271 E',   hwy: 'hwy_wa270', amenities: ['gas', 'hunting', 'camp', 'dealer', 'drugs'] },
];
export const REST_STOPS = _REST_STOP_DEF.map(rs => ({
  ...rs, t: rs.mileage / TOTAL_ROUTE_MILES,
}));

// ── Vehicle catalog ──────────────────────────────────────────────────
//   id           — internal key
//   label        — display name
//   hp           — durability cap (max HP)
//   rangeMi      — full-tank/charge range, in miles
//   topMph       — base CRUISE speed at +0 cocaine/meth pickups
//   boostMph     — extra MPH added on top of topMph when boosting
//                  (per-vehicle: sports cars rev harder than trucks)
//   grip         — tire grip multiplier (1.00 baseline; 1.20+ sports, <1 truck)
//   turnRate     — steering responsiveness (1.00 baseline; high = sharp, low = lazy)
//   stability    — resistance to curve push + faster settle (1.00 baseline;
//                  >1 = planted, <1 = nervous)
//   offroadGrip  — multiplier on shoulder/grass/dirt grip (1.00 baseline;
//                  >1 better off-road like SUV/truck, <1 worse like sports)
//   drive        — '2WD' | '4x4' (gates traction-tire bonus)
//   fuel         — 'gas' | 'electric' (charging stations only)
//   heat         — wanted-level visibility multiplier (1 = neutral, >1 attracts cops)
//   priceUsd     — purchase price at dealerships (null = not for sale)
//   sprite       — texture key; falls back to 'car_player' if absent
export const VEHICLES = {
  beater: {
    id: 'beater', label: 'Used Sedan', hp: 50,  rangeMi: 250, topMph: 110, boostMph: 20,
    grip: 1.00, turnRate: 1.00, stability: 1.00, offroadGrip: 1.00,
    drive: '2WD', fuel: 'gas', heat: 0.85, priceUsd: 0,
    sprite: 'car_player', spriteBack: 'codex_beater_back', spriteFront: 'codex_beater_front',
    tint: 0xEEEEEE,    // off-white (swatch only — PNG isn't tinted at render time)
  },
  suv4x4: {
    id: 'suv4x4', label: 'Used 4x4 SUV', hp: 70, rangeMi: 300, topMph: 115, boostMph: 15,
    grip: 1.02, turnRate: 0.88, stability: 1.15, offroadGrip: 1.25,
    drive: '4x4', fuel: 'gas', heat: 0.95, priceUsd: 5000,
    sprite: 'car_player', spriteBack: 'codex_suv4x4_back', spriteFront: 'codex_suv4x4_front',
    tint: 0x3A78D6,    // mid blue (swatch only)
  },
  usedTruck: {
    id: 'usedTruck', label: 'Used Truck', hp: 90, rangeMi: 350, topMph: 117, boostMph: 10,
    grip: 0.96, turnRate: 0.78, stability: 1.18, offroadGrip: 1.18,
    drive: '4x4', fuel: 'gas', heat: 1.00, priceUsd: 10000,
    sprite: 'car_player', spriteBack: 'codex_used_truck_back', spriteFront: 'codex_used_truck_front',
    tint: 0x224488,    // deeper truck blue (swatch only)
  },
  newTruck: {
    id: 'newTruck', label: 'New Truck', hp: 100, rangeMi: 400, topMph: 120, boostMph: 12,
    grip: 0.98, turnRate: 0.80, stability: 1.20, offroadGrip: 1.20,
    drive: '4x4', fuel: 'gas', heat: 1.10, priceUsd: 25000,
    sprite: 'car_player', spriteBack: 'codex_new_truck_back', spriteFront: 'codex_new_truck_front',
    tint: 0x1F1F1F,         // shiny black (swatch only)
  },
  evTruck: {
    id: 'evTruck', label: 'Electric Truck', hp: 85, rangeMi: 300, topMph: 118, boostMph: 18,
    grip: 1.00, turnRate: 0.82, stability: 1.15, offroadGrip: 1.20,
    drive: '4x4', fuel: 'electric', heat: 1.05, priceUsd: 40000,
    sprite: 'car_player', spriteBack: 'codex_ev_truck_back', spriteFront: 'codex_ev_truck_front',
    tint: 0xEE7733,    // orange (swatch only)
  },
  sportsCar: {
    id: 'sportsCar', label: 'Sports Car', hp: 75, rangeMi: 500, topMph: 165, boostMph: 25,
    grip: 1.18, turnRate: 1.14, stability: 0.92, offroadGrip: 0.65,
    drive: '2WD', fuel: 'gas', heat: 1.25, priceUsd: 55000,
    sprite: 'car_player', spriteBack: 'codex_sports_car_back', spriteFront: 'codex_sports_car_front',
    tint: 0xFFC107,         // canary yellow (swatch only)
  },
  bestlaRoadster: {
    id: 'bestlaRoadster', label: 'Electric Roadster', hp: 85, rangeMi: 250, topMph: 200, boostMph: 50,
    grip: 1.22, turnRate: 1.17, stability: 0.88, offroadGrip: 0.62,
    drive: '2WD', fuel: 'electric', heat: 1.30, priceUsd: 75000,
    sprite: 'car_player', spriteBack: 'codex_bestla_roadster_back', spriteFront: 'codex_bestla_roadster_front',
    tint: 0x33AA55,    // emerald green (swatch only)
  },
  playdoutS3X: {
    id: 'playdoutS3X', label: 'Bestla Play\'dOut S3X', hp: 125, rangeMi: 400, topMph: 190, boostMph: 30,
    grip: 1.18, turnRate: 1.08, stability: 1.08, offroadGrip: 0.90,
    drive: '4x4', fuel: 'electric', heat: 1.40, priceUsd: 100000,
    sprite: 'car_player', spriteBack: 'codex_playdout_s3x_back', spriteFront: 'codex_playdout_s3x_front',
    tint: 0x55AAEE,    // lighter sky blue (swatch only)
  },
};

// Gas pricing — $10 per 30 mi of tank (per spec).  Charging is 35% of
// that rate but requires watching an ad.  Robbery roll is per-fillup.
export const GAS_USD_PER_MI         = 0.50;        // $0.50/mi (was 0.333)
export const CHARGE_COST_FACTOR     = 0.66;        // 66% of gas → $0.33/mi (was 35 %)
export const GAS_LIGHT_AT_MI        = 30;          // warning threshold
export const GAS_ROBBERY_CHANCE     = 0.20;        // 20% chance per gas fillup
export const GAS_ROBBERY_FRAC       = 0.20;        // loses 20% of cash if robbed
export const CHARGE_AD_SECONDS      = 90;          // 1.5 min ad timer (game time)
