// Hex color utilities
export function hexToPhaser(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8)  |
     Math.round(b1 + (b2 - b1) * t)
  );
}

// Route region palettes — I-90 corridor, West Seattle → Spokane.
// Each palette tries to match what you actually see driving that stretch.
export const REGION_PALETTES = {
  seattle_urban: {
    name: 'West Seattle',
    sky:     0x6E89A5,   // typical PNW overcast
    fog:     0x8FA3B6,
    horizon: 0x556778,
    grass1:  0x4A6048,   // urban greenery (street trees)
    grass2:  0x3B4E3A,
    road1:   0x565656,
    road2:   0x525252,                // narrow contrast — subtle parallax cue
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  downtown_seattle: {
    name: 'Downtown Seattle',
    sky:     0x738DA8,
    fog:     0x95A8B9,
    horizon: 0x5C7080,
    grass1:  0x444444,   // city ground / pavement
    grass2:  0x393939,
    road1:   0x545454,
    road2:   0x505050,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  lake_washington: {
    name: 'Lake Washington',
    sky:     0x80A0BE,
    fog:     0xA8C0D0,
    horizon: 0x5688AC,   // water-blue horizon
    grass1:  0x3A6B92,   // lake water
    grass2:  0x2D547A,
    road1:   0x646464,
    road2:   0x606060,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  mercer_island: {
    name: 'Mercer Island',
    sky:     0x80A0BE,
    fog:     0xA8C0D0,
    horizon: 0x556778,
    grass1:  0x3F6E40,   // suburban lawns + trees
    grass2:  0x2E5832,
    road1:   0x606060,
    road2:   0x5C5C5C,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  eastside_urban: {
    name: 'Bellevue',
    sky:     0x718AAB,
    fog:     0x97AEC3,
    horizon: 0x556B80,
    grass1:  0x4A4A48,   // city pavement / mixed greenery
    grass2:  0x3E3E3D,
    road1:   0x5A5A5A,
    road2:   0x565656,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  eastside: {
    name: 'Eastside',
    sky:     0x6E96BC,
    fog:     0x9DBACF,
    horizon: 0x4F7790,
    grass1:  0x2E7A35,   // PNW evergreen
    grass2:  0x1F5A26,
    road1:   0x626262,
    road2:   0x5E5E5E,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  cascades: {
    name: 'Snoqualmie Pass',
    sky:     0x4C7AAB,   // deeper blue at altitude
    fog:     0x88A4BB,
    horizon: 0xC2CDD4,   // snowy peaks in the haze
    grass1:  0x265D2C,   // dense fir forest
    grass2:  0x174320,
    road1:   0x5E5E5E,
    road2:   0x5A5A5A,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  east_cascades: {
    name: 'Cle Elum / Ellensburg',
    sky:     0x6CA0CE,   // bluer, clearer (rain-shadow side)
    fog:     0xA9C2D5,
    horizon: 0x8B9D88,
    grass1:  0x6E8A3C,   // drier yellow-green grasslands
    grass2:  0x546E2C,
    road1:   0x6A6A62,
    road2:   0x66665E,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  columbia_basin: {
    name: 'Columbia Basin',
    sky:     0x82AED9,
    fog:     0xC1D2DE,
    horizon: 0xCCB07A,   // basalt cliffs, dust haze
    grass1:  0xB0A35C,   // sagebrush yellow
    grass2:  0x8C7E40,
    road1:   0x76725E,
    road2:   0x726E5A,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
  palouse: {
    name: 'Palouse / Spokane',
    sky:     0x6FA1CE,
    fog:     0xACC4D6,
    horizon: 0xC6B881,   // golden wheat horizon
    grass1:  0xC9B14F,   // wheat fields
    grass2:  0x9C8636,
    road1:   0x686860,
    road2:   0x64645C,
    rumble1: 0xFFFFFF,
    rumble2: 0xFFFFFF,
    lane:    0xFFFFCC,
  },
};

// Region thresholds — 0–1 progress along West Seattle → WSU (Pullman).
// I-90 east to Spokane, then US-195 south through the Palouse to Pullman.
// Total route: 358 mi.
// Region boundaries — t = mile / TOTAL_ROUTE_MILES (293).
//   mile  5 = 0.01706,  mile  7 = 0.02389,  mile 11 = 0.03754,
//   mile 12 = 0.04096,  mile 38 = 0.12969,  mile 88 = 0.30034,
//   mile 138 = 0.47099, mile 195 = 0.66553, mile 293 = 1.0
export const REGION_ORDER = [
  { start: 0.0000, end: 0.0068, key: 'seattle_urban'   }, //   0–2 mi: West Seattle (homes before bridge)
  { start: 0.0068, end: 0.0239, key: 'downtown_seattle'}, //   2–7 mi: West Seattle Bridge + downtown towers
  { start: 0.0239, end: 0.0273, key: 'lake_washington' }, //   7–8 mi:   Lacey V. Murrow Floating Bridge (West)
  { start: 0.0273, end: 0.0341, key: 'mercer_island'   }, //   8–10 mi:  Mercer Island land (homes + lid tunnel)
  { start: 0.0341, end: 0.0392, key: 'lake_washington' }, //  10–11.5 mi: East Channel Floating Bridge
  { start: 0.0392, end: 0.0478, key: 'eastside_urban'  }, //  11.5–14 mi: Bellevue (downtown buildings; was a gap 11.5→12)
  { start: 0.0478, end: 0.1297, key: 'eastside'        }, //  14–38 mi: Bellevue suburbs → North Bend
  { start: 0.1297, end: 0.3003, key: 'cascades'        }, //  38–88 mi: Snoqualmie Pass + Easton + Cle Elum
  { start: 0.3003, end: 0.4710, key: 'east_cascades'   }, //  88–138 mi: Thorp → Ellensburg → Vantage
  { start: 0.4710, end: 0.6655, key: 'columbia_basin'  }, // 138–195 mi: Royal City → Othello (WA-26 desert)
  { start: 0.6655, end: 1.0000, key: 'palouse'         }, // 195–293 mi: Washtucna → Colfax → Pullman
];

export function getPaletteAtProgress(t) {
  for (let i = 0; i < REGION_ORDER.length - 1; i++) {
    const r    = REGION_ORDER[i];
    const next = REGION_ORDER[i + 1];
    if (t >= r.start && t < r.end) {
      const regionT = (t - r.start) / (r.end - r.start);
      if (regionT > 0.8) {
        const blend = (regionT - 0.8) / 0.2;
        return blendPalettes(REGION_PALETTES[r.key], REGION_PALETTES[next.key], blend);
      }
      return REGION_PALETTES[r.key];
    }
  }
  // Fallback: if t fell into a gap between regions (no match above),
  // return the closest PRECEDING region instead of jumping to the last
  // region in the array.  Prevents the Bellevue→Palouse-color leak that
  // happened when t=0.0392..0.0410 fell through to the wheat-field
  // palette.  Only the very last entry (palouse) is used when t is
  // genuinely past the end of the route.
  for (let i = REGION_ORDER.length - 1; i >= 0; i--) {
    const r = REGION_ORDER[i];
    if (t >= r.start) return REGION_PALETTES[r.key];
  }
  return REGION_PALETTES[REGION_ORDER[0].key];
}

export function blendPalettes(a, b, t) {
  const result = { name: b.name };
  for (const k in a) {
    if (k === 'name') continue;
    result[k] = lerpColor(a[k], b[k], t);
  }
  return result;
}
