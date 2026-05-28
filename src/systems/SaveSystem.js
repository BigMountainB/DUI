const STORAGE_KEY    = 'dui.save.v2';
const SCHEMA_VERSION = 2;

// Keys whose first segment routes to the cross-mode GLOBAL section
// instead of the active per-mode profile.  Per user direction:
// achievements (incl. "beat the others" cross-mode badges) are global;
// audio/mute settings travel with the user, not the mode.  Checkpoint
// tiers (highest-difficulty reached per rest stop, for the route-map
// tier colors) are also global so the map shows lifetime progress.
// Everything else (money, restStopSaves, lastRestStop, missionProgress,
// drug inventory, owned cars) lives in the per-mode profile.
const GLOBAL_KEYS = new Set(['achievements', 'settings', 'checkpointTiers']);

// Storage-key names for each profile bucket.  Kept as-is for backward
// compatibility with on-disk saves.  The GameScene UI uses 'flappy' and
// 'lr' as user-facing labels; we alias those into 'tap' and 'classic'
// via MODE_ALIASES below so the wrong-vocabulary call doesn't silently
// fall through to a no-op (which was the old behavior — a TAP-mode
// player's setMode('flappy') was rejected and the profile stayed on
// whatever was previously active).
const VALID_MODES = ['tap', 'classic', 'tilt'];
const MODE_ALIASES = {
  flappy: 'tap',       // newer UI name for the tap-to-steer scheme
  lr:     'classic',   // newer UI name for the left/right-thumb scheme
};
function normalizeMode(mode) {
  return MODE_ALIASES[mode] ?? mode;
}

const DEFAULT_PROFILE = {
  money:           0,
  ownedCars:       ['beater'],
  currentCar:      'beater',
  drugInventory:   {},
  missionProgress: 0,
  lastRestStop:    null,
  restStopSaves:   {},
  // Per-vehicle accessory state.  Shape:
  //   accessories: { [vehicleId]: { bumper: bool, traction: bool, nos: 0|1|2|3 } }
  // Bumper / traction are one-shot purchases (boolean).  NOS is a tier
  // counter — 0 (none) → 3 (max).  Each tier adds +5 mph to cruise + boost.
  accessories:     {},
};

const DEFAULT_GLOBAL = {
  achievements:    {},
  checkpointTiers: {},          // { [stopId]: 'bronze' | 'silver' | 'gold' }
  settings:        { muted: false, radio: 0 },
};

function emptyData() {
  return {
    version:  SCHEMA_VERSION,
    global:   structuredClone(DEFAULT_GLOBAL),
    profiles: Object.fromEntries(VALID_MODES.map(m => [m, structuredClone(DEFAULT_PROFILE)])),
  };
}

export class SaveSystem {
  constructor() {
    this._mode = 'tap';                  // default; GameScene re-sets after _steeringMode() loads
    this.data  = this._load();
  }

  /** Switch the active profile.  Call this whenever the player's
   *  steering mode changes.  Accepts both legacy ('tap'/'classic') and
   *  newer UI ('flappy'/'lr') mode names — both resolve to the same
   *  underlying storage bucket via normalizeMode.  Subsequent save/load
   *  operations read & write that profile's slot. */
  setMode(mode) {
    const m = normalizeMode(mode);
    if (!VALID_MODES.includes(m)) return;
    this._mode = m;
  }

  /** The active per-mode profile.  Wallet reads/writes `.money` on
   *  this object directly, so it has to stay a live reference, not a
   *  copy. */
  get profile() {
    if (!this.data.profiles[this._mode]) {
      this.data.profiles[this._mode] = structuredClone(DEFAULT_PROFILE);
    }
    return this.data.profiles[this._mode];
  }

  _load() {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) return this._migrate(JSON.parse(rawV2));
      // v1 single-profile save (pre-mode-split) — promote it to the
      // 'tap' profile and keep achievements/settings global.
      const rawV1 = localStorage.getItem('dui.save.v1');
      if (rawV1) return this._migrateV1(JSON.parse(rawV1));
      return emptyData();
    } catch (e) {
      console.warn('[SaveSystem] load failed, using defaults:', e);
      return emptyData();
    }
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return emptyData();
    if (data.version !== SCHEMA_VERSION) return emptyData();
    // Backfill any missing profile slots / global keys against the
    // current defaults so additive future changes don't crash on load.
    const out = emptyData();
    out.global = { ...out.global, ...(data.global ?? {}) };
    for (const m of VALID_MODES) {
      out.profiles[m] = { ...out.profiles[m], ...(data.profiles?.[m] ?? {}) };
    }
    return out;
  }

  _migrateV1(v1) {
    const out = emptyData();
    if (v1?.achievements) out.global.achievements = v1.achievements;
    if (v1?.settings)     out.global.settings     = { ...out.global.settings, ...v1.settings };
    out.profiles.tap = {
      ...out.profiles.tap,
      money:           v1?.money ?? 0,
      ownedCars:       v1?.ownedCars ?? ['beater'],
      currentCar:      v1?.currentCar ?? 'beater',
      drugInventory:   v1?.drugInventory ?? {},
      missionProgress: v1?.missionProgress ?? 0,
      lastRestStop:    v1?.lastRestStop ?? null,
      restStopSaves:   v1?.restStopSaves ?? {},
    };
    return out;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[SaveSystem] save failed:', e);
    }
  }

  /** Clear ALL profiles + global state.  Used by debug "wipe save". */
  reset() {
    this.data = emptyData();
    this.save();
  }

  /** Clear ONLY the active profile (keep global achievements/settings
   *  and the other modes' progress).  Used by per-mode "start over". */
  resetProfile() {
    this.data.profiles[this._mode] = structuredClone(DEFAULT_PROFILE);
    this.save();
  }

  hasSave() {
    return localStorage.getItem(STORAGE_KEY) !== null
        || localStorage.getItem('dui.save.v1') !== null;
  }

  _rootFor(firstSeg) {
    return GLOBAL_KEYS.has(firstSeg) ? this.data.global : this.profile;
  }

  get(path, fallback = undefined) {
    const parts = path.split('.');
    let cur = this._rootFor(parts[0]);
    for (const p of parts) {
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur === undefined ? fallback : cur;
  }

  set(path, value) {
    const parts = path.split('.');
    let cur = this._rootFor(parts[0]);
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    this.save();
  }
}
