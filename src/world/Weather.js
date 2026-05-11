// Weather — pure-function weather state keyed off route mileage.  Only
// runs on Normal+ difficulty (Easy short-circuits to 'clear').
//
//   clear     — default everywhere outside the rain/snow windows
//   rain      — mile 30–40 (North Bend approach into the foothills)
//   snow      — mile 40–88 (Cascades / Snoqualmie Pass through Cle Elum)
//
// Each helper takes the player's mileage and returns a 0..1 intensity
// (eased at the edges so weather fades in / out cleanly), or pure flags.
//
// Traction / traffic / road-render overrides are applied by callers based
// on the state + intensity returned here.

import { Difficulty } from '../systems/Difficulty.js';

export const Weather = {
  state(mile) {
    if (!Difficulty.weather()) return 'clear';
    if (mile >= 30 && mile < 40) return 'rain';
    if (mile >= 40 && mile < 88) return 'snow';
    return 'clear';
  },

  /** 0..1 intensity envelope — ramps in/out over the first / last 2 mi
   *  of each window so weather doesn't slam on or off abruptly. */
  intensity(mile) {
    if (!Difficulty.weather()) return 0;
    if (mile >= 30 && mile < 40) {
      if (mile < 32) return (mile - 30) / 2;
      if (mile > 38) return (40 - mile) / 2;
      return 1;
    }
    if (mile >= 40 && mile < 88) {
      if (mile < 42) return (mile - 40) / 2;
      if (mile > 86) return (88 - mile) / 2;
      return 1;
    }
    return 0;
  },

  /** Grip multiplier on player steering / lateral physics.  1.0 = normal,
   *  rain trims 10%, snow chops 25% (per user spec). */
  gripMul(mile) {
    const s = this.state(mile);
    const i = this.intensity(mile);
    if (s === 'rain') return 1 - 0.10 * i;
    if (s === 'snow') return 1 - 0.25 * i;
    return 1;
  },

  /** NPC traffic spawn-cap multiplier.  Snow zones drop the cap by 30%
   *  (per user spec) on Normal AND Hard — Hard's +10% baseline still
   *  applies before this kicks in. */
  trafficMul(mile) {
    return this.state(mile) === 'snow' ? 0.70 : 1;
  },

  isRain(mile) { return this.state(mile) === 'rain'; },
  isSnow(mile) { return this.state(mile) === 'snow'; },
};
