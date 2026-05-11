// INTEGRATION CONTRACT:
// 1. Caller calls addCop(copAIInstance, stateObj) when a cop spawns; stateObj must have {segIdx, state}.
// 2. Caller calls update(dt, player, stars) each game tick; player must have {segIdx, lateralPos, speed}.
// 3. Caller reads each cop's role via getRole(cop) after update(); CopAI then executes that role.
// 4. Caller calls removeCop(cop) on despawn and clear() on full fleet reset (e.g. arrest / disguise).

const PIT_COOLDOWN   = 2.0;   // seconds a 'recovering' cop is excluded from assignment
const PIT_MIN_SPEED  = 8000;  // player speed threshold to assign 'pit'
const BLOCK_MIN_SPEED = 12000; // player speed threshold to assign 'block'

export class CopFleet {
  constructor() {
    /** @type {Map<object, {state: object, role: string, pitCooldown: number}>} */
    this._cops = new Map();
  }

  // ── Public mutations ────────────────────────────────────────────────────────

  addCop(cop, copState) {
    if (!this._cops.has(cop)) {
      this._cops.set(cop, { state: copState, role: 'pursue', pitCooldown: 0 });
    }
  }

  removeCop(cop) {
    this._cops.delete(cop);
  }

  clear() {
    this._cops.clear();
  }

  // ── Main tick ───────────────────────────────────────────────────────────────

  /**
   * @param {number} dt           seconds since last frame
   * @param {{segIdx:number, lateralPos:number, speed:number}} player
   * @param {number} stars        0–5 wanted level
   */
  update(dt, player, stars) {
    if (this._cops.size === 0) return;

    // 1. Tick pit-recovery cooldowns.
    for (const entry of this._cops.values()) {
      if (entry.state.state === 'recovering') {
        entry.pitCooldown = Math.max(entry.pitCooldown, PIT_COOLDOWN);
      }
      if (entry.pitCooldown > 0) {
        entry.pitCooldown -= dt;
      }
    }

    // 2. Sort cops by distance to player (ascending = closest first).
    const sorted = [...this._cops.entries()]
      .filter(([, entry]) => entry.pitCooldown <= 0)   // exclude recovering cops
      .sort(([, a], [, b]) => {
        const dA = Math.abs((a.state.segIdx ?? 0) - player.segIdx);
        const dB = Math.abs((b.state.segIdx ?? 0) - player.segIdx);
        return dA - dB;
      });

    // Cops that are still on cooldown keep their last role as 'pursue' quietly.
    for (const [cop, entry] of this._cops.entries()) {
      if (entry.pitCooldown > 0) entry.role = 'pursue';
    }

    const count   = sorted.length;
    const speed   = player.speed ?? 0;
    const canPit   = speed > PIT_MIN_SPEED;
    const canBlock = speed > BLOCK_MIN_SPEED;
    const highWanted = stars >= 4;
    const maxWanted  = stars >= 5;

    if (count === 0) return;

    // ── Role assignment by fleet size ──────────────────────────────────────

    if (count === 1) {
      this._assign(sorted[0], 'pursue');

    } else if (count === 2) {
      // closer = ram, other = pursue
      this._assign(sorted[0], 'ram');
      this._assign(sorted[1], 'pursue');

    } else if (count === 3) {
      // closest = ram, second = pit (if conditions allow), third = pursue
      this._assign(sorted[0], 'ram');
      this._assign(sorted[1], canPit ? 'pit' : 'pursue');
      this._assign(sorted[2], 'pursue');

    } else {
      // 4+ cops: 1 ram, 1 pit, 1 block, rest pursue — modulated by wanted level.
      let idx = 0;
      this._assign(sorted[idx++], 'ram');

      if (highWanted && count > 4) {
        // Extra ram at 4+ stars: second-closest also rams
        this._assign(sorted[idx++], 'ram');
      }

      // Pit slot
      if (canPit && idx < count) {
        this._assign(sorted[idx++], 'pit');
      }

      // Block slot — placed ahead; CopAI handles path-clear check on its end
      if (canBlock && idx < count) {
        this._assign(sorted[idx++], 'block');
      }

      // At 5 stars, every other remaining cop tries pit
      let altPit = false;
      for (; idx < count; idx++) {
        if (maxWanted && canPit && altPit) {
          this._assign(sorted[idx], 'pit');
        } else {
          this._assign(sorted[idx], 'pursue');
        }
        altPit = !altPit;
      }
    }
  }

  // ── Public queries ──────────────────────────────────────────────────────────

  /**
   * @param {object} cop  CopAI instance
   * @returns {'pursue'|'ram'|'pit'|'block'}
   */
  getRole(cop) {
    return this._cops.get(cop)?.role ?? 'pursue';
  }

  /** @returns {number} */
  getCount() {
    return this._cops.size;
  }

  /**
   * @returns {{cop:object, state:object, role:string}[]}
   */
  getActive() {
    const out = [];
    for (const [cop, entry] of this._cops.entries()) {
      out.push({ cop, state: entry.state, role: entry.role });
    }
    return out;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _assign([cop], role) {
    const entry = this._cops.get(cop);
    if (entry) entry.role = role;
  }
}

/*
ROLE ASSIGNMENT HEURISTIC (80 words):
CopFleet sorts all active, non-recovering cops by segment-index distance to the
player each tick. With one cop it pursues; two cops split ram/pursue by
proximity. Three cops add a pit attempt for the second-closest. Four or more get
dedicated ram, pit (speed > 8000), and block (speed > 12000) slots, with
remaining units pursuing. At four-plus stars a second ram is added; at five
stars every other surplus cop attempts pit, maximising aggressive interdiction
pressure on high-speed, high-wanted targets.
*/
