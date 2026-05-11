// INTEGRATION CONTRACT:
// ctx.self / ctx.player carry { segIdx, lateralPos, speed } in road-segment units.
// Caller applies throttleCmd/brakeCmd to cop.speed each frame (accel/decel physics),
// steerCmd (-1..1) drives cop.laneOffset toward player or block position,
// and wantsBump=true triggers the existing cop-collision box check in GameScene.

// ─── Tiny event emitter ──────────────────────────────────────────────────────
class Emitter {
  constructor() { this._listeners = {}; }
  on(evt, cb)   { (this._listeners[evt] ??= []).push(cb); return this; }
  off(evt, cb)  { this._listeners[evt] = (this._listeners[evt] ?? []).filter(f => f !== cb); }
  emit(evt, ...args) { (this._listeners[evt] ?? []).forEach(cb => cb(...args)); }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const RAM_ENGAGE_DIST   =  150;   // seg units: start hard-accel for ram
const RAM_BUMP_DIST     =   30;   // seg units: assert wantsBump
const PIT_LATERAL_SWING =  0.4;   // lane units: how far to swing for PIT
const PIT_SNAP_SPEED    =  0.9;   // fraction of swing completed per second
const RECOVER_TIME      =  1.5;   // seconds in recovering state
const BLOCK_OVERSHOOT   =  120;   // seg units ahead of player to park block cop
const SWAT_HP_BONUS     =    2;   // extra hp for swat variant

// ─── State labels (internal) ──────────────────────────────────────────────────
const S_PURSUING  = 'pursuing';
const S_RAMMING   = 'ramming';
const S_PITING    = 'piting';
const S_BLOCKING  = 'blocking';
const S_RECOVERING= 'recovering';
const S_DISABLED  = 'disabled';

// ─── CopAI ────────────────────────────────────────────────────────────────────
export class CopAI {
  constructor(opts = {}) {
    const { variant = 'cruiser', baseSpeed = 1800, hp } = opts;

    this.variant   = variant;
    this.baseSpeed = baseSpeed;
    this.hp        = hp ?? (variant === 'swat' ? 3 + SWAT_HP_BONUS : 3);
    this.maxHp     = this.hp;

    this._state       = S_PURSUING;
    this._recoverTimer= 0;
    this._pitPhase    = 'swing';   // 'swing' | 'hold' | 'snap'
    this._pitTimer    = 0;
    this._pitSide     = 1;         // +1 or -1
    this._pitTargetLateral = 0;

    this._emitter = new Emitter();
  }

  // ─── Public event API ───────────────────────────────────────────────────────
  on(event, cb) { this._emitter.on(event, cb); return this; }

  // ─── State query ────────────────────────────────────────────────────────────
  getState()    { return this._state; }
  isDisabled()  { return this._state === S_DISABLED; }

  // ─── Damage ─────────────────────────────────────────────────────────────────
  takeDamage(amount = 1, source = null) {
    if (this._state === S_DISABLED) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp     = 0;
      this._state = S_DISABLED;
      this._emitter.emit('disabled', { source });
    }
  }

  // ─── Main update ────────────────────────────────────────────────────────────
  update(dt, ctx) {
    if (this._state === S_DISABLED) {
      return { throttleCmd: 0, brakeCmd: 1, steerCmd: 0, action: 'idle', wantsBump: false };
    }

    const { self, player, role, pathClear } = ctx;
    const segDist   = player.segIdx - self.segIdx;   // positive = player is ahead
    const latDelta  = player.lateralPos - self.lateralPos;

    // External role may push us into certain states
    this._applyRole(role, segDist, player);

    // Run current state
    switch (this._state) {
      case S_PURSUING:  return this._doPursue(dt, segDist, latDelta, pathClear);
      case S_RAMMING:   return this._doRam(dt, segDist, latDelta);
      case S_PITING:    return this._doPit(dt, segDist, latDelta, player);
      case S_BLOCKING:  return this._doBlock(dt, segDist, latDelta);
      case S_RECOVERING:return this._doRecover(dt);
      default:          return this._idle();
    }
  }

  // ─── Role-to-state mapping ───────────────────────────────────────────────────
  _applyRole(role, segDist, player) {
    if (this._state === S_RECOVERING || this._state === S_DISABLED) return;

    switch (role) {
      case 'ram':
        if (this._state !== S_RAMMING) this._state = S_RAMMING;
        break;
      case 'pit':
        if (this._state !== S_PITING) this._beginPit(player);
        break;
      case 'block':
        if (this._state !== S_BLOCKING) this._state = S_BLOCKING;
        break;
      case 'pursue':
      default:
        if (this._state !== S_PURSUING && this._state !== S_RAMMING) {
          this._state = S_PURSUING;
        }
        break;
    }
  }

  // ─── State handlers ──────────────────────────────────────────────────────────

  _doPursue(dt, segDist, latDelta, pathClear) {
    // Transition: close enough → ramp into ram if path is clear
    if (segDist > 0 && segDist < RAM_ENGAGE_DIST && pathClear) {
      this._state = S_RAMMING;
      return this._doRam(dt, segDist, latDelta);
    }

    const steerCmd = this._steerToward(latDelta, 0.8);
    return {
      throttleCmd: 1.0,
      brakeCmd:    0,
      steerCmd,
      action:      'pursue',
      wantsBump:   false,
    };
  }

  _doRam(dt, segDist, latDelta) {
    // If we've overshot or player is behind us, fall back to pursue
    if (segDist <= 0 || segDist > RAM_ENGAGE_DIST * 1.8) {
      this._state = S_PURSUING;
      return this._idle();
    }

    const wantsBump = segDist < RAM_BUMP_DIST && Math.abs(latDelta) < 0.18;
    if (wantsBump) this._emitter.emit('bump', { type: 'ram' });

    const steerCmd = this._steerToward(latDelta, 1.0);
    return {
      throttleCmd: 1.0,
      brakeCmd:    0,
      steerCmd,
      action:      'ram',
      wantsBump,
    };
  }

  _beginPit(player) {
    this._state           = S_PITING;
    this._pitPhase        = 'swing';
    this._pitTimer        = 0;
    this._pitSide         = Math.random() < 0.5 ? 1 : -1;
    this._pitTargetLateral= player.lateralPos + this._pitSide * PIT_LATERAL_SWING;
  }

  _doPit(dt, segDist, latDelta, player) {
    this._pitTimer += dt;

    let steerCmd   = 0;
    let wantsBump  = false;
    let throttleCmd= 1.0;

    if (this._pitPhase === 'swing') {
      // Drift toward the offset target (opposite side of player)
      const pitDelta = this._pitTargetLateral - (player.lateralPos - latDelta); // cop's current lateral
      steerCmd = this._steerToward(pitDelta, 1.2);
      if (this._pitTimer > 0.6) { this._pitPhase = 'hold'; this._pitTimer = 0; }

    } else if (this._pitPhase === 'hold') {
      // Briefly hold, then snap into the player's rear quarter
      steerCmd = 0;
      if (this._pitTimer > 0.25) { this._pitPhase = 'snap'; this._pitTimer = 0; }

    } else { // snap
      // Snap laterally into player — snap toward player's lateralPos
      steerCmd    = this._steerToward(latDelta, 1.5);
      throttleCmd = 1.0;

      const close = segDist < RAM_BUMP_DIST * 1.4 && Math.abs(latDelta) < 0.28;
      if (close) {
        wantsBump = true;
        this._emitter.emit('bump', { type: 'pit' });
        this._emitter.emit('pit_complete');
        this._enterRecover();
      } else if (this._pitTimer > 1.2) {
        // PIT attempt timed out — recover and try again later
        this._enterRecover();
      }
    }

    return { throttleCmd, brakeCmd: 0, steerCmd, action: 'pit', wantsBump };
  }

  _doBlock(dt, segDist, latDelta) {
    // Block cop drives ahead of player and parks in the lane to obstruct
    // segDist is negative when cop is ahead of player
    const targetDist = -BLOCK_OVERSHOOT;
    if (segDist > targetDist) {
      // Still behind or not far enough ahead — throttle hard forward
      return {
        throttleCmd: 1.0,
        brakeCmd:    0,
        steerCmd:    this._steerToward(latDelta, 0.6),
        action:      'block',
        wantsBump:   false,
      };
    }
    // We are sufficiently far ahead — brake to hold position, drift toward center
    const steerToCenter = this._steerToward(-( /* cop lateral via -latDelta proxy */ latDelta) * 0.5, 0.4);
    return {
      throttleCmd: 0,
      brakeCmd:    0.8,
      steerCmd:    steerToCenter,
      action:      'block',
      wantsBump:   false,
    };
  }

  _doRecover(dt) {
    this._recoverTimer -= dt;
    if (this._recoverTimer <= 0) {
      this._state = S_PURSUING;
    }
    return {
      throttleCmd: 0.5,
      brakeCmd:    0,
      steerCmd:    0,
      action:      'idle',
      wantsBump:   false,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _enterRecover() {
    this._state        = S_RECOVERING;
    this._recoverTimer = RECOVER_TIME;
  }

  /** Map a lateral delta to a steer command clamped to [-1, 1]. */
  _steerToward(delta, gain = 1.0) {
    return Math.max(-1, Math.min(1, delta * gain));
  }

  _idle() {
    return { throttleCmd: 0, brakeCmd: 0, steerCmd: 0, action: 'idle', wantsBump: false };
  }
}
