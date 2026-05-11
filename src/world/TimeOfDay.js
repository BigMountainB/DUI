// TimeOfDay — pure-function clock keyed off route mileage.  ONE Pullman
// trip = ONE in-game day.  Easy / Normal / Hard all run the cycle (Easy
// just dims the sky; Normal+ also lights up the world properly with
// stars, NPC headlights, etc.).
//
// Mile timeline:
//   0–80    morning → noon       (bright)
//   80–120  afternoon            (bright, warmer light)
//   120–180 dusk                 (orange / pink, lights kicking in)
//   180–293 night                (stars, moon arc, full dark)
//
// Each helper takes the player's current mileage and returns a 0..1
// scalar.  Callers compose them with palette tweens (see Road.js).

import { Difficulty } from '../systems/Difficulty.js';

export const TimeOfDay = {
  /** 0 = full daylight, 1 = full night.  Smooth ramp through dusk
   *  (mile 120 → 180); stays at 1 from 180 onward. */
  darkness(mile) {
    if (!Difficulty.dayNight()) return 0;
    if (mile < 120) return 0;
    if (mile < 180) return (mile - 120) / 60;
    return 1;
  },

  /** 0..1 dusk amount — peaks around mile 150, zero outside the dusk
   *  window.  Used for the orange/pink sky tint. */
  duskAmount(mile) {
    if (!Difficulty.dayNight()) return 0;
    if (mile < 120) return 0;
    if (mile < 150) return (mile - 120) / 30;       // 0 → 1
    if (mile < 180) return 1 - (mile - 150) / 30;   // 1 → 0
    return 0;
  },

  /** 0..1 night-sky strength — stars/moon visibility.  Ramps from
   *  mile 150 → 200, holds at 1 thereafter. */
  nightAmount(mile) {
    if (!Difficulty.dayNight()) return 0;
    if (mile < 150) return 0;
    if (mile < 200) return (mile - 150) / 50;
    return 1;
  },

  /** Rough phase label — convenient for branching. */
  phase(mile) {
    if (!Difficulty.dayNight()) return 'noon';
    if (mile < 80)  return 'morning';
    if (mile < 120) return 'noon';
    if (mile < 180) return 'dusk';
    return 'night';
  },

  /** Should NPCs render headlights?  True from late dusk on. */
  headlightsOn(mile) {
    return this.darkness(mile) > 0.35;
  },
};
