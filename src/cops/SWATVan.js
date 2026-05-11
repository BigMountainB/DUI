// INTEGRATION CONTRACT:
//   Input:  update(dt, ctx) where ctx = {self:{position,laneOffset,speed}, player:{position,speed}, role, pathClear}
//   Output: {throttleCmd, brakeCmd, steerCmd, action, deployStrip:bool} — same shape as CopAI.update
//   Renderer: treat as a cop vehicle with color 0x111144 (dark navy); heavier = larger screenW multiplier
//   Events:  'disabled' when hp reaches 0, 'bump' on ramming contact, 'strip_deployed' on spike-strip drop

const SWAT_COLOR          = 0x111144;  // dark navy, distinguishes from patrol cruiser
const STRIP_COOLDOWN      = 8;         // seconds between strip deployments
const STRIP_LEAD_DIST     = 600;       // SWAT must lead player by this many units to deploy
const STRIP_MIN_SPEED     = 12000;     // player must exceed this speed for strip to deploy
const RAM_SPEED_THRESHOLD = 8000;      // minimum approach speed to attempt ramming
const DECELERATION_FORCE  = 0.85;      // throttle multiplier when braking to block
const MAX_STEER           = 0.04;      // lateral nudge per frame toward player lane

// Minimal event emitter — mirrors Helicopter.js, no external imports
class MiniEmitter {
  constructor() { this._handlers = {}; }
  on(ev, cb)     { (this._handlers[ev] ??= []).push(cb); }
  emit(ev, ...args) { (this._handlers[ev] ?? []).forEach(fn => fn(...args)); }
}

export class SWATVan extends MiniEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.baseSpeed - Top speed in world units/s (default 1500; slower than cruiser)
   * @param {number} opts.hp        - Hit points before disabled (default 5)
   */
  constructor(opts = {}) {
    super();
    this._baseSpeed     = opts.baseSpeed ?? 1500;
    this._hp            = opts.hp        ?? 5;
    this._maxHp         = this._hp;

    this._stripCooldown = 0;   // seconds remaining until next strip allowed
    this._disabled      = false;
    this._state         = 'pursuit';  // 'pursuit' | 'blocking' | 'ramming' | 'disabled'
  }

  // -------------------------------------------------------------------------
  //  Public API
  // -------------------------------------------------------------------------

  takeDamage(amount = 1) {
    if (this._disabled) return;
    this._hp = Math.max(0, this._hp - amount);
    this.emit('bump', { hp: this._hp, maxHp: this._maxHp });
    if (this._hp <= 0) {
      this._disabled = true;
      this._state    = 'disabled';
      this.emit('disabled');
    }
  }

  isDisabled() {
    return this._disabled;
  }

  getState() {
    return {
      state:        this._state,
      hp:           this._hp,
      maxHp:        this._maxHp,
      stripCooldown: this._stripCooldown,
      color:        SWAT_COLOR,
    };
  }

  // -------------------------------------------------------------------------
  //  Update — returns command object consumed by the physics/AI layer
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt  - Delta time in seconds
   * @param {object} ctx - { self:{position,laneOffset,speed}, player:{position,speed}, role, pathClear }
   * @returns {{ throttleCmd:number, brakeCmd:number, steerCmd:number, action:string, deployStrip:bool }}
   */
  update(dt, ctx) {
    if (this._disabled) {
      return { throttleCmd: 0, brakeCmd: 1, steerCmd: 0, action: 'disabled', deployStrip: false };
    }

    this._stripCooldown = Math.max(0, this._stripCooldown - dt);

    const { self, player } = ctx;
    const relPos     = self.position - player.position;  // positive = SWAT is ahead of player
    const playerFast = player.speed > STRIP_MIN_SPEED;

    // --- Decide action state ---
    const prevState = this._state;

    if (relPos > 200 && relPos < 2000) {
      // SWAT is moderately ahead — hold blocking position
      this._state = 'blocking';
    } else if (relPos < 0 && Math.abs(relPos) < RAM_SPEED_THRESHOLD * dt * 5) {
      // Player is ahead or pulling away — pursue hard
      this._state = 'pursuit';
    } else if (relPos < -100 && self.speed > player.speed * 0.9) {
      // Close behind player at speed — ramp into ramming
      this._state = 'ramming';
    } else {
      this._state = 'pursuit';
    }

    // --- Compute commands ---
    let throttleCmd = 0;
    let brakeCmd    = 0;
    let steerCmd    = 0;
    let action      = this._state;

    switch (this._state) {
      case 'pursuit': {
        // Chase at full base speed; SWAT is slower so don't overshoot with huge numbers
        const speedDelta = this._baseSpeed - self.speed;
        throttleCmd = speedDelta > 0 ? Math.min(1, speedDelta / this._baseSpeed) : 0;
        brakeCmd    = speedDelta < -200 ? Math.min(1, Math.abs(speedDelta) / this._baseSpeed) : 0;
        // Steer toward player's lane
        const latDiff = player.laneOffset !== undefined
          ? (player.laneOffset - self.laneOffset)
          : 0;
        steerCmd = Math.max(-MAX_STEER, Math.min(MAX_STEER, latDiff * 0.3));
        break;
      }
      case 'blocking': {
        // Match player speed, straddle center to widen roadblock
        const targetSpeed = player.speed * 0.95;
        throttleCmd = Math.max(0, (targetSpeed - self.speed) / this._baseSpeed) * DECELERATION_FORCE;
        brakeCmd    = self.speed > targetSpeed + 300 ? 0.4 : 0;
        steerCmd    = 0;  // hold current lane
        break;
      }
      case 'ramming': {
        // Accelerate hard into player's lane
        throttleCmd = 1;
        brakeCmd    = 0;
        const latDiff = player.laneOffset !== undefined
          ? (player.laneOffset - self.laneOffset)
          : 0;
        steerCmd = Math.max(-MAX_STEER * 1.5, Math.min(MAX_STEER * 1.5, latDiff * 0.6));
        break;
      }
    }

    // --- Spike-strip deployment check ---
    // Deploy when SWAT leads by STRIP_LEAD_DIST+ AND player is going fast AND cooldown clear
    const deployStrip = (
      relPos >= STRIP_LEAD_DIST &&
      playerFast               &&
      this._stripCooldown <= 0
    );

    if (deployStrip) {
      this._stripCooldown = STRIP_COOLDOWN;
      this.emit('strip_deployed', { position: self.position, laneOffset: self.laneOffset });
    }

    return { throttleCmd, brakeCmd, steerCmd, action, deployStrip };
  }
}
