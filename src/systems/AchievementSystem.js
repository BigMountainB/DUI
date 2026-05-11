// AchievementSystem — registry of achievement definitions + per-run
// progress tracking + persistent earned-set (highest tier per ID) saved
// to localStorage via SaveSystem.
//
// Each achievement has Bronze / Silver / Gold tiers tied to the
// difficulty earned on (Easy = bronze, Normal = silver, Hard = gold).
// Highest tier wins — re-earning on Normal upgrades a Bronze to Silver.
//
// Awarding pattern:
//   AchievementSystem.award('lifted', context)  → fires toast + persists
//   AchievementSystem.firstPickup(drugId)       → convenience for "first hit"
//   Run-state hooks (notePickupTotals, noteCleanRun, etc.) are called
//   from GameScene's update / event handlers.
//
// Toast UI lives in GameScene._showAchievementToast(def, tier) — this
// module just emits a callback.

import { Difficulty } from './Difficulty.js';
import { DRUGS } from '../constants.js';

// Per-drug "first-hit" achievements — fire on the first pickup of each
// drug.  `desc` reveals the mechanic and is REVEALED only after the
// drug is earned (collected).  `unlockHint` is shown before earning so
// the player knows how to find the drug in the first place.
const DRUG_INFO = {
  [DRUGS.ALCOHOL]: {
    id:    'liquid_courage',
    label: 'LIQUID COURAGE',
    icon:  '🍺',
    unlockHint: 'Available from the start — pick a beer up off the road.',
    desc:  '7% per beer. Builds double vision & swerves. Burns shrooms + LSD by 15% each pickup. At 100%, sideswipes/corner clips sometimes don\'t damage you.',
  },
  [DRUGS.WEED]: {
    id:    'lifted',
    label: 'LIFTED',
    icon:  '🌿',
    unlockHint: 'Available from the start — pick a joint up off the road.',
    desc:  '12.5% per hit. Tolerance kicks in at 60%, plus the haze and no slow-driving penalty. Hold 100% for 10 mi → Permastoned.',
  },
  [DRUGS.COCAINE]: {
    id:    'white_line_fever',
    label: 'WHITE LINE FEVER',
    icon:  '❄️',
    unlockHint: 'Stay drunk (alcohol > 30%) for 30 seconds total to unlock the dealer.',
    desc:  '10% per bag. +4 mph top speed each pickup. Burns 7% off your alcohol. OD at 100% — don\'t grab another at 90%+.',
  },
  [DRUGS.SHROOMS]: {
    id:    'tripping',
    label: 'TRIPPING',
    icon:  '🍄',
    unlockHint: 'Be drunk AND stoned at the same time (alcohol & weed both ≥ 30%).',
    desc:  '20% per dose. +8% saturation each hit. At 45% NPC traffic pulses in sync (±10 mph). At 65% a rainbow appears.',
  },
  [DRUGS.LSD]: {
    id:    'acid_trip',
    label: 'ACID TRIP',
    icon:  '💊',
    unlockHint: 'Push your shrooms bar past 50% to unlock acid.',
    desc:  '25% per tab. +8% brightness each hit. At 60% your speedo caps at 60 mph but you keep gaining miles. At 90%+ B&W + 1.25× distance.',
  },
  [DRUGS.HEROIN]: {
    id:    'nodding_off',
    label: 'NODDING OFF',
    icon:  '💉',
    unlockHint: 'Drive at least 20% of the route (~mile 60) to find a needle.',
    desc:  '30% per shot. Tunnel vision deepens with each hit. At 15%+ every crash deducts 2 fewer HP.',
  },
  [DRUGS.RX]: {
    id:    'pill_mill',
    label: 'PILL MILL',
    icon:  '💊',
    unlockHint: 'Crash into 50 NPC cars total — you\'ll need pain pills after that.',
    desc:  '8.5% per bottle. Each pickup multiplies every drug bar by 0.9. ±7 mph per pickup on NPC traffic (slows oncoming, speeds same-direction).',
  },
  [DRUGS.FENTANYL]: {
    id:    'deaths_door',
    label: 'DEATH\'S DOOR',
    icon:  '☠️',
    unlockHint: 'Push your heroin bar past 50% to find the bad batch.',
    desc:  '55% per hit — two and you OD. At 25%+ you phase through cars (no damage), but capped at 30% top speed.',
  },
  [DRUGS.KETAMINE]: {
    id:    'k_hole',
    label: 'K-HOLE',
    icon:  '🐴',
    unlockHint: 'Push your acid bar past 40% to unlock the horse stash.',
    desc:  '10% per hit. At 40%+ the camera tilts 5° per pickup. At 82%+ TV static buries the road.',
  },
  [DRUGS.METH]: {
    id:    'tweaker',
    label: 'TWEAKER',
    icon:  '⚡',
    unlockHint: 'Peak your cocaine at 40%+, then come down to 0 and stay clean for 30 seconds.',
    desc:  '10% per pickup. +4 mph top speed each pickup, but +1 extra HP damage on every collision. Risk vs reward.',
  },
};

// Run-tracking achievements (the broader set — fire from event hooks).
const RUN_DEFS = {
  stone_cold_sober:  { label: 'STONE COLD SOBER',  icon: '🚭', desc: 'Finish a Pullman run without picking up any drug.' },
  crystal_clean:     { label: 'CRYSTAL CLEAN',     icon: '✨', desc: 'Finish without ever raising a wanted star.' },
  iron_bladder:      { label: 'IRON BLADDER',      icon: '🚽', desc: 'Finish without using any rest stop.' },
  five_star_survivor:{ label: '5★ SURVIVOR',       icon: '⭐', desc: 'Hit 5★ wanted, then escape (stars decay back to 0).' },
  untouchable_1m:    { label: 'UNTOUCHABLE 1m',    icon: '🛡',  desc: '60 seconds straight, zero damage.' },
  untouchable_2m:    { label: 'UNTOUCHABLE 2m',    icon: '🛡',  desc: '120 seconds straight, zero damage.' },
  untouchable_3m:    { label: 'UNTOUCHABLE 3m',    icon: '🛡',  desc: '180 seconds straight, zero damage.' },
  untouchable_5m:    { label: 'UNTOUCHABLE 5m',    icon: '🛡',  desc: '300 seconds straight, zero damage.' },
  untouchable_run:   { label: 'UNTOUCHABLE',       icon: '🏆', desc: 'Finish a Pullman run without taking any damage.' },
  connoisseur:       { label: 'CONNOISSEUR',       icon: '🎩', desc: 'Trigger every named drug combo in a single run.' },
  snowblind:         { label: 'SNOWBLIND',         icon: '❄️', desc: 'Cross Snoqualmie Pass during snow without crashing.  Normal+ only.' },
  permastoned:       { label: 'PERMASTONED',       icon: '🌿', desc: 'Hold the weed bar at 100% for 10 in-game miles.' },
  trifecta:          { label: 'TRIFECTA',          icon: '🏅', desc: 'Pullman finish with Stone Cold Sober + Crystal Clean + Iron Bladder.' },
  full_tank:         { label: 'FULL TANK',         icon: '🛢',  desc: 'Bar one drug to 99% without OD\'ing.' },
  // Maxed-out family — one per OD-capable drug.  Fires when the bar
  // reaches exactly 100% without the player triggering an overdose
  // (which now only happens on overflow past 100%).
  maxed_cocaine:     { label: 'MAXED COKE',        icon: '❄️', desc: 'Hit 100% cocaine without overdosing.' },
  maxed_heroin:      { label: 'MAXED HEROIN',      icon: '💉', desc: 'Hit 100% heroin without overdosing.' },
  maxed_rx:          { label: 'MAXED RX',          icon: '💊', desc: 'Hit 100% Rx without overdosing.' },
  maxed_fentanyl:    { label: 'MAXED FENT',        icon: '☠️', desc: 'Hit 100% fentanyl without overdosing.' },
  maxed_ketamine:    { label: 'MAXED K',           icon: '🐴', desc: 'Hit 100% ketamine without overdosing.' },
  maxed_meth:        { label: 'MAXED METH',        icon: '⚡', desc: 'Hit 100% meth without overdosing.' },
};

// Tier ordering — higher index = better.  Difficulty mode → tier id.
const TIER_BY_MODE = { easy: 'bronze', normal: 'silver', hard: 'gold' };
const TIER_RANK    = { bronze: 1, silver: 2, gold: 3 };
const TIER_COLOR   = { bronze: 0xCD7F32, silver: 0xC0C0C0, gold: 0xFFD700 };

let _onAward = null;       // toast callback set by GameScene

export const AchievementSystem = {
  /** Definitions accessible to UI for the achievements page. */
  drugDefs() { return DRUG_INFO; },
  runDefs()  { return RUN_DEFS; },
  tierColor(tier) { return TIER_COLOR[tier] ?? 0xFFFFFF; },

  /** GameScene calls this once with a function that pops a toast. */
  setAwardCallback(cb) { _onAward = cb; },

  /** Earned set lives on the SaveSystem-backed registry as a plain map
   *  { [id]: 'bronze' | 'silver' | 'gold' }.  Returns the full map. */
  earned(registry) {
    const save = registry?.get?.('save');
    return save?.get?.('achievements') ?? {};
  },

  earnedTier(registry, id) {
    return this.earned(registry)[id] ?? null;
  },

  /** Award an achievement.  Persists the highest tier seen — Bronze on
   *  Easy, Silver on Normal, Gold on Hard.  Returns true if the badge
   *  upgraded (i.e. either first time or higher tier than before).
   *  Custom mode awards nothing — drug levels are user-set so there's
   *  no challenge baseline. */
  award(id, registry) {
    if (Difficulty.noScore?.()) return false;
    const tier = TIER_BY_MODE[Difficulty.mode()] ?? 'silver';
    const save = registry?.get?.('save');
    if (!save) return false;
    const owned = save.get('achievements') ?? {};
    const prev  = owned[id];
    if (prev && TIER_RANK[prev] >= TIER_RANK[tier]) return false;
    owned[id] = tier;
    save.set('achievements', owned);
    const def = DRUG_INFO[Object.keys(DRUG_INFO).find(k => DRUG_INFO[k].id === id)] ?? RUN_DEFS[id];
    if (def && _onAward) _onAward({ id, tier, def });
    return true;
  },

  /** Convenience hook: award on first pickup of a drug. */
  firstPickup(drugId, registry) {
    const def = DRUG_INFO[drugId];
    if (!def) return;
    this.award(def.id, registry);
  },
};
