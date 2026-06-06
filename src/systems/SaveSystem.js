const STORAGE_KEY    = 'dui.save.v3';
const LEGACY_V2_KEY  = 'dui.save.v2';
const LEGACY_V1_KEY  = 'dui.save.v1';
const SCHEMA_VERSION = 3;

// Number of player profile slots shown on the title screen.  Each slot is a
// FULLY independent save (its own plate, stats, leaderboard, money, cars,
// drugs, checkpoints, achievements) — switching plate = switching players.
const SLOT_COUNT = 3;

// Keys whose first segment routes to the cross-mode GLOBAL section of the
// ACTIVE SLOT (not the per-steering-mode profile).  Per user direction:
// achievements (incl. "beat the others" cross-mode badges) are global;
// audio/mute settings travel with the user, not the mode.  Checkpoint
// tiers (highest-difficulty reached per rest stop, for the route-map
// tier colors) are also global so the map shows lifetime progress.
// Everything else (money, restStopSaves, lastRestStop, missionProgress,
// drug inventory, owned cars) lives in the per-mode profile.
// stats + leaderboard are lifetime/cross-mode, so they live in GLOBAL too:
// a per-mode "start over" must NOT wipe career totals or the high-score
// board.  StatsTracker owns the canonical `stats` shape and deep-merges
// its defaults on load, so the bucket here can start empty.
// NOTE: "global" is now per-SLOT — each player keeps their own lifetime
// stats / achievements; only progress is duplicated per steering mode.
const GLOBAL_KEYS = new Set(['achievements', 'settings', 'checkpointTiers', 'stats', 'leaderboard']);

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
  // One-time $15k retainer (phone → Messages → The Lawyer).  Halves every
  // future "busted" fine.  Per-profile progress, so Reset Progress clears it.
  lawyerRetained:  false,
  // Pre-paid Dealer orders (phone → Messages → The Dealer): a list of drug
  // ids paid for up front, redeemed FREE at the next rest stop's drug menu.
  dealerOrders:    [],
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
  // Career stats — full canonical shape is owned by StatsTracker, which
  // deep-merges its defaults over whatever is here on boot.  Empty is fine.
  stats:           {},
  // Leaderboard run-record history.  Local-only for now; a future remote
  // provider posts the same record shape, so flipping the backend flag
  // doesn't touch this bucket.  Capped by the Leaderboard layer.
  leaderboard:     { runs: [] },
};

// A single player profile slot — its license-plate handle plus a complete,
// self-contained save (global bucket + one profile per steering mode).
function emptySlot() {
  return {
    plate:    '',
    global:   structuredClone(DEFAULT_GLOBAL),
    profiles: Object.fromEntries(VALID_MODES.map(m => [m, structuredClone(DEFAULT_PROFILE)])),
  };
}

function emptyData() {
  return {
    version:    SCHEMA_VERSION,
    activeSlot: 0,
    slots:      Array.from({ length: SLOT_COUNT }, emptySlot),
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

  // ── Player slots ────────────────────────────────────────────────────
  // Each slot is a full independent save.  The title screen surfaces the
  // three slots as license plates; the active slot is the live player.

  get slotCount() { return SLOT_COUNT; }

  /** The active player slot's container.  Guards a corrupt/out-of-range
   *  activeSlot back to a valid index so reads never blow up. */
  get _slot() {
    let i = this.data.activeSlot | 0;
    if (i < 0 || i >= this.data.slots.length) { i = 0; this.data.activeSlot = 0; }
    if (!this.data.slots[i]) this.data.slots[i] = emptySlot();
    return this.data.slots[i];
  }

  get activeSlot() { return this.data.activeSlot | 0; }

  /** Switch the live player slot.  Returns true if the index was valid. */
  selectSlot(i) {
    i = i | 0;
    if (i < 0 || i >= this.data.slots.length) return false;
    this.data.activeSlot = i;
    this.save();
    return true;
  }

  /** The plate (handle) of a given slot, or the active slot if omitted. */
  plateOf(i) {
    const slot = (i == null) ? this._slot : this.data.slots[i | 0];
    return (slot?.plate ?? '').toString();
  }

  /** True when a slot has a non-empty plate (i.e. it's a created player). */
  slotUsed(i) {
    return !!this.plateOf(i).trim();
  }

  /** Lightweight summary for the title-screen plate widgets. */
  slotInfo() {
    return this.data.slots.map((s, i) => ({
      index: i,
      plate: (s?.plate ?? '').toString(),
      used:  !!(s?.plate ?? '').trim(),
    }));
  }

  /** Set a slot's plate handle.  Does NOT switch the active slot. */
  setSlotPlate(i, plate) {
    i = i | 0;
    if (i < 0 || i >= this.data.slots.length) return;
    if (!this.data.slots[i]) this.data.slots[i] = emptySlot();
    this.data.slots[i].plate = (plate ?? '').toString();
    this.save();
  }

  /** The active player's plate handle. */
  get activePlate() { return (this._slot.plate ?? '').toString(); }
  setActivePlate(plate) {
    this._slot.plate = (plate ?? '').toString();
    this.save();
  }

  /** Fully blank a slot (plate + stats + all progress) — used by the
   *  Settings reset, the only path that clears a plate name. */
  resetSlot(i) {
    i = i | 0;
    if (i < 0 || i >= this.data.slots.length) return;
    this.data.slots[i] = emptySlot();
    this.save();
  }

  /** The active per-mode profile within the active slot.  Wallet
   *  reads/writes `.money` on this object directly, so it has to stay a
   *  live reference, not a copy. */
  get profile() {
    const slot = this._slot;
    if (!slot.profiles[this._mode]) {
      slot.profiles[this._mode] = structuredClone(DEFAULT_PROFILE);
    }
    return slot.profiles[this._mode];
  }

  _load() {
    try {
      const rawV3 = localStorage.getItem(STORAGE_KEY);
      if (rawV3) return this._migrate(JSON.parse(rawV3));
      // v2 (mode-split, single player) — promote it to slot 0.
      const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
      if (rawV2) return this._fromV2(JSON.parse(rawV2));
      // v1 (pre-mode-split, single profile) — promote to slot 0 / tap.
      const rawV1 = localStorage.getItem(LEGACY_V1_KEY);
      if (rawV1) return this._fromV1(JSON.parse(rawV1));
      return emptyData();
    } catch (e) {
      console.warn('[SaveSystem] load failed, using defaults:', e);
      return emptyData();
    }
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return emptyData();
    if (data.version !== SCHEMA_VERSION) return emptyData();
    // Backfill any missing slots / global keys / profile slots against the
    // current defaults so additive future changes don't crash on load.
    const out = emptyData();
    out.activeSlot = Number.isInteger(data.activeSlot) ? data.activeSlot : 0;
    if (out.activeSlot < 0 || out.activeSlot >= SLOT_COUNT) out.activeSlot = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const src = Array.isArray(data.slots) ? data.slots[i] : null;
      out.slots[i] = this._fillSlot(src);
    }
    return out;
  }

  /** Merge a stored slot over the default slot shape (defensive backfill). */
  _fillSlot(src) {
    const slot = emptySlot();
    if (!src || typeof src !== 'object') return slot;
    slot.plate  = (src.plate ?? '').toString();
    slot.global = { ...slot.global, ...(src.global ?? {}) };
    for (const m of VALID_MODES) {
      slot.profiles[m] = { ...slot.profiles[m], ...(src.profiles?.[m] ?? {}) };
    }
    return slot;
  }

  /** Promote a v2 ({ global, profiles }) save into slot 0 of a v3 store.
   *  A v2 license plate lived inside a mode profile (it wasn't a GLOBAL_KEY),
   *  so pull the first one we find up to the new per-slot `plate` field. */
  _fromV2(v2) {
    const out = emptyData();
    const slot = out.slots[0];
    if (v2 && typeof v2 === 'object') {
      slot.global = { ...slot.global, ...(v2.global ?? {}) };
      for (const m of VALID_MODES) {
        const p = { ...DEFAULT_PROFILE, ...(v2.profiles?.[m] ?? {}) };
        // Lift any legacy per-profile plate up to the slot, then drop it.
        if (!slot.plate && typeof p.licensePlate === 'string' && p.licensePlate.trim()) {
          slot.plate = p.licensePlate.trim();
        }
        delete p.licensePlate;
        slot.profiles[m] = p;
      }
    }
    return out;
  }

  _fromV1(v1) {
    const out = emptyData();
    const slot = out.slots[0];
    if (v1?.achievements) slot.global.achievements = v1.achievements;
    if (v1?.settings)     slot.global.settings     = { ...slot.global.settings, ...v1.settings };
    slot.profiles.tap = {
      ...slot.profiles.tap,
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

  /** Clear ALL players + state (every slot).  Used by debug "wipe save". */
  reset() {
    this.data = emptyData();
    this.save();
  }

  /** Clear ONLY the active steering-mode profile in the active slot (keep
   *  the plate, the slot's global state, and the other modes' progress).
   *  Used by per-mode "start over". */
  resetProfile() {
    this._slot.profiles[this._mode] = structuredClone(DEFAULT_PROFILE);
    this.save();
  }

  /** Settings → "Reset Progress".  Fully blanks the ACTIVE player slot —
   *  plate, lifetime stats, leaderboard, achievements, and every mode's
   *  progress — leaving the other two players untouched.  This is the only
   *  path that clears a plate name (per design). */
  resetProgress() {
    this.resetSlot(this.data.activeSlot | 0);
  }

  hasSave() {
    return localStorage.getItem(STORAGE_KEY)   !== null
        || localStorage.getItem(LEGACY_V2_KEY) !== null
        || localStorage.getItem(LEGACY_V1_KEY) !== null;
  }

  _rootFor(firstSeg) {
    return GLOBAL_KEYS.has(firstSeg) ? this._slot.global : this.profile;
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
