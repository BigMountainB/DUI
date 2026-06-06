// Weather — pure-function weather state keyed off route mileage.  Only
// runs on Normal+ difficulty (Easy short-circuits to 'clear').
//
//   clear     — default everywhere outside the weather windows
//   fog       — mile 14–25 (Issaquah valley / Eastside basin)
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
  // Timed fog-lift multiplier (0..1), driven by GameScene.  Holds at 1
  // while the player is in the Issaquah basin, then ramps to 0 over 5 s of
  // real time once they cross mile 23.6 — applied only to the FOG branch of
  // intensity() so the Preston cluster's pop-in is masked by lifting fog
  // instead of appearing in clear air.  Pure-function elsewhere; this one
  // mutable hook is deliberate (time-based, not mile-based).
  _fogLiftMul: 1,

  state(mile) {
    if (!Difficulty.weather()) return 'clear';
    if (mile >= 14 && mile < 25) return 'fog';
    if (mile >= 30 && mile < 40) return 'rain';
    if (mile >= 40 && mile < 88) return 'snow';
    return 'clear';
  },

  /** 0..1 intensity envelope.  Rain eases IN over the first 2 mi (30-32)
   *  then holds full RIGHT UP TO the snow handoff at mile 40 — it does NOT
   *  fade out beforehand.  Snow holds full FROM mile 40 (no fade-in) and
   *  eases out over the last 2 mi (86-88).  The shared full-intensity
   *  boundary at mile 40 means rain hands directly off to snow with no
   *  clear-weather gap in between (per user spec — it should never "clear
   *  up" between the storms). */
  intensity(mile) {
    if (!Difficulty.weather()) return 0;
    if (mile >= 14 && mile < 25) {
      // Issaquah valley fog: rolls in over 14-17, then sits THICK all the
      // way to mile 23.6 (was: lifted over 22-25).  The lift-out is now
      // TIME-based (Weather._fogLiftMul, ramped 1→0 over 5 s by GameScene
      // once the player crosses 23.6), so it masks the Preston pop-in.
      const f = (mile < 17) ? (mile - 14) / 3 : 1;   // ease in over 3 mi, else full
      return f * (this._fogLiftMul ?? 1);
    }
    if (mile >= 30 && mile < 40) {
      if (mile < 32) return (mile - 30) / 2;   // ease in over the first 2 mi
      return 1;                                 // hold full to the snow handoff
    }
    if (mile >= 40 && mile < 88) {
      if (mile > 86) return (88 - mile) / 2;    // ease out over the last 2 mi
      return 1;                                 // full from the rain handoff — no gap
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

  /** Progressive severity multiplier: 1.0 at the start of the weather
   *  window, 2.4 at the end (140 % worse than start, per user spec).
   *  Linear ramp across the full window — combined with intensity()
   *  gives a storm that builds toward a peak.  Returns 1.0 outside any
   *  weather window so callers can safely multiply unconditionally. */
  severity(mile) {
    if (!Difficulty.weather()) return 1;
    // Rain ramps HARD: ~2.0 by mile 35, peaking 2.4 by mile 37 and holding
    // — so it's a heavy, wipers-needed downpour through the back half of
    // the rain window (per user: "very strong after mile 35").
    if (mile >= 30 && mile < 40) return 1 + 1.4 * Math.min(1, (mile - 30) / 7);
    if (mile >= 40 && mile < 88) return 1 + 1.4 * ((mile - 40) / 48);
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
  isFog(mile)  { return this.state(mile) === 'fog';  },
};
