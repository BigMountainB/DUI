// INTEGRATION CONTRACT:
//   collision (_onVehicleCollision / _onCopCollision) → damageModel.takeDamage(amount, source)
//   hooker sprite collected / BodyShop partial heal   → damageModel.repair(amount)
//   respawn / BodyShop full repair                    → damageModel.reset()

// Stage thresholds (inclusive lower bound)
const STAGES = [
  { name: 'pristine', min: 90 },
  { name: 'dented',   min: 60 },
  { name: 'cracked',  min: 30 },
  { name: 'smoking',  min: 15 },
  { name: 'fire',     min:  1 },
  { name: 'wreck',    min:  0 },
];

const STAGE_VISUALS = {
  pristine: { tintR: 1.00, tintG: 1.00, tintB: 1.00, smokeRate: 0, fireRate: 0, sparkRate: 0 },
  dented:   { tintR: 0.95, tintG: 0.85, tintB: 0.75, smokeRate: 0, fireRate: 0, sparkRate: 0 },
  cracked:  { tintR: 0.85, tintG: 0.70, tintB: 0.55, smokeRate: 1, fireRate: 0, sparkRate: 1 },
  smoking:  { tintR: 0.75, tintG: 0.55, tintB: 0.35, smokeRate: 3, fireRate: 0, sparkRate: 2 },
  fire:     { tintR: 0.90, tintG: 0.30, tintB: 0.10, smokeRate: 2, fireRate: 4, sparkRate: 3 },
  wreck:    { tintR: 0.30, tintG: 0.20, tintB: 0.15, smokeRate: 5, fireRate: 6, sparkRate: 4 },
};

function _resolveStage(durability) {
  for (const s of STAGES) {
    if (durability >= s.min) return s.name;
  }
  return 'wreck';
}

export class DamageModel {
  constructor(opts = {}) {
    this._max        = opts.max        ?? 100;
    this._startDura  = opts.durability ?? this._max;
    this._listeners  = {};
    this.reset();
  }

  // ── Event emitter ─────────────────────────────────────────────────────────

  on(event, cb) {
    (this._listeners[event] ??= []).push(cb);
    return this;
  }

  off(event, cb) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(fn => fn !== cb);
    return this;
  }

  _emit(event, payload) {
    for (const cb of (this._listeners[event] ?? [])) cb(payload);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  takeDamage(amount, source = 'unknown') {
    if (this._durability <= 0) return; // already wrecked — no-op

    const prev      = this._durability;
    this._durability = Math.max(0, prev - amount);

    this._emit('damage', { amount, source, durability: this._durability });
    this._updateStage();

    if (this._durability <= 0) {
      this._durability = 0;
      this._emit('wreck', { source });
    }
  }

  repair(amount) {
    if (this._durability <= 0) return; // wrecked cars need reset(), not repair()

    const prev       = this._durability;
    this._durability = Math.min(this._max, prev + amount);

    this._emit('repair', { amount, durability: this._durability });
    this._updateStage();
  }

  reset() {
    this._durability = Math.min(this._startDura, this._max);
    this._stage      = _resolveStage(this._durability);
  }

  /** Restore durability to an exact value (used to carry damage across
   *  scene restarts so a rest-stop pull-over doesn't silently full-heal
   *  a player who didn't buy REPAIR CAR). */
  setDurability(value) {
    const v = Math.max(0, Math.min(this._max, value ?? 0));
    this._durability = v;
    this._stage      = _resolveStage(this._durability);
  }

  /** Update the HP cap (used when the player swaps to a different
   *  vehicle at the dealership — each car has its own HP from the
   *  VEHICLES catalog).  Re-clamps current durability to the new cap. */
  setMax(value) {
    this._max = Math.max(1, value ?? this._max);
    this._durability = Math.min(this._durability, this._max);
    this._stage      = _resolveStage(this._durability);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getDurability()         { return this._durability; }
  getDurabilityFraction() { return this._durability / this._max; }
  getStage()              { return this._stage; }
  isWrecked()             { return this._durability <= 0; }

  getStageVisuals() {
    return { ...STAGE_VISUALS[this._stage] };
  }

  /** Returns repair cost in cents at perPoint rate (default $0.10/pt). */
  getRepairCost(perPoint = 10) {
    return (this._max - this._durability) * perPoint;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _updateStage() {
    const next = _resolveStage(this._durability);
    if (next !== this._stage) {
      const prev   = this._stage;
      this._stage  = next;
      this._emit('stageChange', { prev, next, durability: this._durability });
    }
  }
}
