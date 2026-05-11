/*
 * INTEGRATION CONTRACT:
 *   Each tick: const result = physics.update(dt, { throttle, steer, brake, offRoad, curve, speedMultipliers })
 *   dt is seconds (Phaser delta / 1000). steer is -1..1, throttle/brake are 0..1.
 *   curve is the current road segment's curve value (signed float). offRoad is bool.
 *   speedMultipliers = { top: 1.0, accel: 1.0 } (drug modifiers). Returns { speed, lateralVel,
 *   steerAngle, drifting, lean, slipAngle } — speed/lateralVel in game units/s.
 */

import { clamp, lerp } from '../utils/Helpers.js'

export class CarPhysics {
  /**
   * opts:
   *   maxSpeed    — top speed in game units/s; 27000 ≈ 180 mph
   *   accel       — acceleration rate (units/s²)
   *   brake       — braking decel rate (units/s²)
   *   decel       — natural coast decel (units/s²)
   *   turnSpeed   — peak lateral steer velocity (game units/s)
   *   weight      — weight scalar; higher = less responsive drift
   */
  constructor(opts = {}) {
    this.maxSpeed   = opts.maxSpeed   ?? 27000
    this.accel      = opts.accel      ?? 195
    this.brake      = opts.brake      ?? 340
    this.decel      = opts.decel      ?? 76
    this.turnSpeed  = opts.turnSpeed  ?? 2.8
    this.weight     = opts.weight     ?? 1.0

    // runtime state
    this._speed        = 0       // current forward speed (units/s)
    this._lateralVel   = 0       // sideways drift velocity (units/s)
    this._steerVel     = 0       // momentum-smoothed steer value
    this._steerAngle   = 0       // smoothed visual steer angle (rad)
    this._drifting     = false
    this._maxSpeedMult = 1.0     // external override (drug boost)
  }

  // ── External controls ────────────────────────────────────────────────────

  /** Drugs that boost top speed call this (e.g. cocaine) */
  setMaxSpeedMultiplier(m) {
    this._maxSpeedMult = m
  }

  /** Collision side-shove — lateralVel is in game units/s */
  applyImpulse(lateralVel) {
    this._lateralVel += lateralVel
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getSpeed()           { return this._speed       }
  getLateralVelocity() { return this._lateralVel  }
  isDrifting()         { return this._drifting     }

  // ── Main update ──────────────────────────────────────────────────────────

  /**
   * update(dt, input) → { speed, lateralVel, steerAngle, drifting, lean, slipAngle }
   *
   * input.throttle       0..1
   * input.steer          -1..1  (negative = left)
   * input.brake          0..1
   * input.offRoad        bool
   * input.curve          road segment curve value (signed float)
   * input.speedMultipliers  { top: 1.0, accel: 1.0 }
   */
  update(dt, input = {}) {
    const {
      throttle         = 0,
      steer            = 0,
      brake            = 0,
      offRoad          = false,
      curve            = 0,
      speedMultipliers = {},
    } = input

    const topMult   = (speedMultipliers.top   ?? 1.0) * this._maxSpeedMult
    const accelMult = speedMultipliers.accel  ?? 1.0
    const maxSpd    = this.maxSpeed * topMult

    // ── Forward speed ──────────────────────────────────────────────────────
    if (brake > 0) {
      this._speed = Math.max(0, this._speed - this.brake * brake * dt * 60)
    } else if (throttle > 0) {
      this._speed = Math.min(maxSpd, this._speed + this.accel * accelMult * throttle * dt * 60)
    } else {
      this._speed = Math.max(0, this._speed - this.decel * dt * 60)
    }

    // ── Off-road speed cap ─────────────────────────────────────────────────
    // Only clamps deep off-road (mirrors GameScene depth calc using lateral position
    // supplied by the caller via offRoad + depth implicitly through offRoad bool).
    if (offRoad) {
      const offRoadMax = maxSpd * 0.15
      if (this._speed > offRoadMax) {
        this._speed = lerp(this._speed, offRoadMax, 0.06)
      }
    }

    // ── Grip / weight transfer ─────────────────────────────────────────────
    // At >60 % of max speed, lateral traction starts slipping.
    const speedRatio = this._speed / Math.max(maxSpd, 1)
    let grip = 1.0
    if (speedRatio > 0.6) {
      grip = clamp(1 - (speedRatio - 0.6) * 1.0 / this.weight, 0.4, 1.0)
    }

    // ── Steering with momentum ─────────────────────────────────────────────
    // Ramp toward target in ~0.12 s, bleed off in ~0.45 s (identical to GameScene)
    const steerTarget = steer * this.turnSpeed
    if (steer !== 0) {
      this._steerVel = lerp(this._steerVel, steerTarget, 1 - Math.pow(0.01, dt / 0.12))
    } else {
      this._steerVel = lerp(this._steerVel, 0, 1 - Math.pow(0.01, dt / 0.45))
    }

    // Drift reduces steer effectiveness
    const steerEffect = this._drifting ? 0.5 : 1.0
    this._steerAngle  = this._steerVel * steerEffect

    // ── Lateral velocity (oversteer / drift accumulation) ──────────────────
    // Accumulates when grip falls below 1 and there is meaningful steer input.
    if (grip < 1.0 && Math.abs(steer) > 0.5) {
      this._lateralVel += steer * this._speed * (1 - grip) * dt * 0.6
    }

    // Curve centrifugal push
    this._lateralVel += curve * this._speed * 0.0015 * dt

    // Dampen lateral vel — friction bleeds it back to zero
    const lateralDamp = clamp(1 - dt * (this._drifting ? 1.8 : 4.0), 0, 1)
    this._lateralVel *= lateralDamp

    // ── Drift detection ────────────────────────────────────────────────────
    this._drifting = Math.abs(this._lateralVel) > 800

    // ── Slip angle (rad) ───────────────────────────────────────────────────
    // Approximation: atan2 of lateral velocity vs forward speed.
    const slipAngle = this._speed > 10
      ? Math.atan2(this._lateralVel * 0.001, this._speed * 0.001)
      : 0

    // ── Visual lean ────────────────────────────────────────────────────────
    // Normalised -1..1 from steer velocity; small extra lift at high speed.
    const leanBase    = clamp(this._steerVel / (this.turnSpeed || 1), -1, 1)
    const speedLift   = clamp((speedRatio - 0.7) * 0.3, 0, 0.15)
    const lean        = leanBase * (1 + speedLift)

    return {
      speed:      this._speed,
      lateralVel: this._lateralVel,
      steerAngle: this._steerAngle,
      drifting:   this._drifting,
      lean:       clamp(lean, -1, 1),
      slipAngle,
    }
  }
}
