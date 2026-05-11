// Difficulty — single source of truth for Easy / Normal / Hard mode flags
// and their per-system multipliers.  Saved to localStorage via SaveSystem
// (registry key 'difficulty').  Read by GameScene._applyDamage,
// CopSystem.update, TimeOfDay, Weather, and missions.
//
// Easy   → day/night ON (just dim the sky), no weather, gentle cops + dmg.
// Normal → day/night + weather (rain mi 30-40, snow past 40), standard.
// Hard   → Normal + 1.5× damage taken, +50% cop escalation, +10% traffic.

const MODES = {
  easy: {
    id:               'easy',
    label:            'EASY',
    blurb:            'Driving Ms. Daisy Dukes',
    dayNight:         true,
    weather:          false,
    damageMul:        0.7,
    copEscalationMul: 0.7,
    trafficMul:       1.0,
    partyClockSec:    50 * 60,    // 50 min
    onTimeBonusMul:   1.0,        // no bonus on Easy (per user spec)
  },
  normal: {
    id:               'normal',
    label:            'NORMAL',
    blurb:            'Variable Weather & Pig Pursuits',
    dayNight:         true,
    weather:          true,
    damageMul:        1.0,
    copEscalationMul: 1.0,
    trafficMul:       1.0,
    partyClockSec:    40 * 60,    // 40 min
    onTimeBonusMul:   1.5,        // 1.5× cash on time
  },
  hard: {
    id:               'hard',
    label:            'HARD',
    blurb:            'More Traffic, Heat, and Damage',
    dayNight:         true,
    weather:          true,
    damageMul:        1.5,
    copEscalationMul: 1.5,
    trafficMul:       1.10,
    partyClockSec:    30 * 60,    // 30 min
    onTimeBonusMul:   2.0,        // 2× cash on time
  },
  custom: {
    id:               'custom',
    label:            'CUSTOM',
    blurb:            'Drag bars; no points awarded',
    dayNight:         true,
    weather:          true,
    damageMul:        1.0,
    copEscalationMul: 1.0,
    trafficMul:       1.0,
    partyClockSec:    40 * 60,
    onTimeBonusMul:   1.0,        // no bonus — score disabled in custom anyway
    noScore:          true,       // suppress all $ awards
  },
};

const DEFAULT_MODE = 'normal';

let _current = DEFAULT_MODE;

export const Difficulty = {
  /** Set the active mode and persist to the SaveSystem-backed registry.
   *  Called from MenuScene when the player taps Easy/Normal/Hard. */
  set(mode, registry) {
    if (!MODES[mode]) {
      console.warn('[Difficulty] unknown mode:', mode);
      return;
    }
    _current = mode;
    registry?.set?.('difficulty', mode);
    const save = registry?.get?.('save');
    save?.set?.('difficulty', mode);
  },

  /** Hydrate from registry/save on scene boot.  Falls back to default. */
  hydrate(registry) {
    const save = registry?.get?.('save');
    const stored = registry?.get?.('difficulty') ?? save?.get?.('difficulty');
    if (stored && MODES[stored]) _current = stored;
    return _current;
  },

  /** Active mode id (string). */
  mode() { return _current; },

  /** Active mode descriptor (label, blurb, multipliers, flags). */
  current() { return MODES[_current] ?? MODES[DEFAULT_MODE]; },

  /** Convenience flag/multiplier accessors. */
  dayNight()         { return this.current().dayNight; },
  weather()          { return this.current().weather; },
  damageMul()        { return this.current().damageMul; },
  copEscalationMul() { return this.current().copEscalationMul; },
  trafficMul()       { return this.current().trafficMul; },
  partyClockSec()    { return this.current().partyClockSec ?? 40 * 60; },
  onTimeBonusMul()   { return this.current().onTimeBonusMul ?? 1.0; },
  noScore()          { return !!this.current().noScore; },

  /** All modes for the selector UI.  Custom is a 4th option that opens
   *  the drug-slider modal. */
  allModes() { return [MODES.easy, MODES.normal, MODES.hard]; },
  customMode() { return MODES.custom; },
};
