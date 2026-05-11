const STORAGE_KEY = 'dui.save.v1';
const SCHEMA_VERSION = 1;

const DEFAULT_PROFILE = {
  version: SCHEMA_VERSION,
  money: 0,
  ownedCars: ['beater'],
  currentCar: 'beater',
  drugInventory: {},
  missionProgress: 0,
  settings: {
    muted: false,
    radio: 0,
  },
};

export class SaveSystem {
  constructor() {
    this.profile = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_PROFILE);
      const data = JSON.parse(raw);
      return this._migrate(data);
    } catch (e) {
      console.warn('[SaveSystem] load failed, using defaults:', e);
      return structuredClone(DEFAULT_PROFILE);
    }
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return structuredClone(DEFAULT_PROFILE);
    if (data.version === SCHEMA_VERSION) {
      return { ...structuredClone(DEFAULT_PROFILE), ...data };
    }
    return structuredClone(DEFAULT_PROFILE);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (e) {
      console.warn('[SaveSystem] save failed:', e);
    }
  }

  reset() {
    this.profile = structuredClone(DEFAULT_PROFILE);
    this.save();
  }

  hasSave() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  get(path, fallback = undefined) {
    const parts = path.split('.');
    let cur = this.profile;
    for (const p of parts) {
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur === undefined ? fallback : cur;
  }

  set(path, value) {
    const parts = path.split('.');
    let cur = this.profile;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    this.save();
  }
}
