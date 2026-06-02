// INTEGRATION CONTRACT:
//   Construct once in BootScene after SaveSystem; register as registry 'stats'.
//   Lives alongside Wallet — Wallet owns the live currency (score), this owns
//   the lifetime/career counters that feed the stats menu + leaderboards.
//
//   Hot-path methods (addMiles / addDriveTime / recordEarn) mutate IN MEMORY
//   only — they do NOT hit localStorage.  Call flush() at safe checkpoints
//   (rest-stop enter/exit, trip end, game over) to persist.  NEVER flush()
//   per frame.
//
//   Per-trip ("this trip") values live on `.session`, reset by tripStart().
//   Lifetime values live in the persisted `stats` bucket (SaveSystem.global).
//
//   CUSTOM (sandbox) mode: tripStart({ranked:false}) marks the run unranked.
//   Unranked runs record NOTHING except totalGameplaySec (so the only thing
//   sandbox time contributes to is total-time-in-game).  Every other method
//   early-returns when the session is unranked.
//
//   Lazy sub-records: per-drug / per-weapon / per-vehicle / per-rest-stop
//   entries are created on first event, so this never hardcodes the rosters
//   and won't drift when a drug/vehicle/stop is added or renamed.

const SCHEMA_VERSION = 2;

/** Fresh canonical shape.  Factory (not a const) so every call gets its
 *  own objects — no shared references leaking between merges/resets. */
function defaultStats() {
  return {
    schemaVersion: SCHEMA_VERSION,

    lifetime: {
      npcHits:              0,   // NPC cars hit, all runs
      damageTaken:          0,   // cumulative HP lost
      driveTimeSec:         0,   // RANKED time on the road (excludes pitstops)
      miles:                0,   // lifetime odometer (ranked)
      tripsStarted:         0,
      tripsCompleted:       0,
      wrecks:               0,   // times the car was totaled
      earnedGross:          0,   // every dollar ever earned (score credits)
      spentTotal:           0,   // every dollar ever spent
      drugsCollectedTotal:  0,
      weaponsCollectedTotal:0,
    },

    // How each dollar was earned, by source, + how much of it came from the
    // active score multiplier (final - base, summed).
    earned: {
      bySource:       {},   // { distance, npcHit, pickup, hitchhiker, combo, restStopBonus, ... }
      fromMultiplier: 0,
    },

    // How each dollar was spent, by category.
    spent: {
      drugs:       {},   // { <drugId>: $ }
      drugsTotal:  0,
      weapons:     {},   // { <weaponType>: $ }
      weaponsTotal:0,
      vehicles:    0,
      accessories: 0,
      services:    0,    // repair, coffee, snooze, sex worker, etc.
    },

    drugs:   { collected: {} },   // { <drugId>: count }
    weapons: { collected: {} },   // { <weaponType>: count }

    perVehicle: {},   // { <vehicleId>: { miles, driveTimeSec, npcHits, wrecks } }
    restStops:  {},   // { <stopId>:   { visits, totalTimeSec } }
    totalPitstopSec: 0,

    // ── Encounter tallies ───────────────────────────────────────────────
    // Hitchhikers: good vs bad (neutral = total - good - bad).
    hitchhikers: { total: 0, good: 0, bad: 0 },
    // Sex workers slept with; `bribes` = the 10% "she had dirt" star-cap roll.
    sexWorkers:  { total: 0, bribes: 0 },
    // Times robbed + total cash taken (hitchhiker robs + gas-pump robbery).
    robberies:   { count: 0, amount: 0 },

    // Total time spent in gameplay across ALL modes (incl. custom/sandbox).
    // lifetime.driveTimeSec counts only ranked runs, so the difference here
    // is sandbox time.
    totalGameplaySec: 0,

    // Headline leaderboard / personal-best metrics (ranked only).
    records: {
      bestScore:                  0,
      fastestCompletionSec:       null,   // null = no full run completed yet
      mostMilesRun:               0,
      longestNoDamageStreakMiles: 0,
      topSpeed:                   0,
    },
  };
}

/** Fresh per-trip session block.  Reset on tripStart(). */
function emptySession() {
  return {
    ranked:              true,   // false in custom/sandbox mode
    vehicleId:           null,
    npcHits:             0,
    damageTaken:         0,
    earnedThisTrip:      0,
    spentThisTrip:       0,
    drugsCollected:      0,
    weaponsCollected:    0,
    miles:               0,
    tripTimeSec:         0,
    pitstopSec:          0,
    noDamageStreakMiles: 0,   // miles since last damage taken (this run)
    topSpeed:            0,
    hitchhikers:         0,
    hitchhikersGood:     0,
    hitchhikersBad:      0,
    sexWorkers:          0,
    sexWorkerBribes:     0,
    robberies:           0,
    robbedAmount:        0,
  };
}

/** Deep-merge `src` over a fresh `base`: base supplies missing keys (schema
 *  evolution), src supplies real values.  Plain objects recurse; everything
 *  else (numbers, arrays, null) is taken from src when present. */
function deepFill(base, src) {
  if (src == null || typeof src !== 'object' || Array.isArray(src)) return base;
  for (const k of Object.keys(src)) {
    const sv = src[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)
        && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      deepFill(base[k], sv);
    } else {
      base[k] = sv;
    }
  }
  return base;
}

export class StatsTracker {
  constructor(saveSystem) {
    this._save = saveSystem;

    // Build the canonical shape, fill it with whatever was persisted, and
    // write it back once so the on-disk save always carries the full schema.
    const merged = deepFill(defaultStats(), this._save.get('stats', {}));
    merged.schemaVersion = SCHEMA_VERSION;
    this._save.set('stats', merged);     // persists once (full shape)

    // Live reference into the save's global bucket — hot-path mutations land
    // here directly; flush() pushes the whole save to localStorage.
    this.stats   = this._save.get('stats');
    this.session = emptySession();
  }

  // ── Small helpers ───────────────────────────────────────────────────────

  /** True for normal/scored runs; false in custom/sandbox.  Gates every
   *  recorder except addDriveTime's totalGameplaySec. */
  get ranked() { return this.session.ranked !== false; }

  _bump(obj, key, by = 1) { obj[key] = (obj[key] ?? 0) + by; }

  _vehicle(id) {
    const vid = id ?? this.session.vehicleId;
    if (!vid) return null;
    return (this.stats.perVehicle[vid] ??=
      { miles: 0, driveTimeSec: 0, npcHits: 0, wrecks: 0 });
  }

  _stop(id) {
    return (this.stats.restStops[id] ??= { visits: 0, totalTimeSec: 0 });
  }

  // ── Trip lifecycle ────────────────────────────────────────────────────────

  /** New run begins.  Resets per-trip counters and binds the active vehicle.
   *  Pass { ranked:false } for custom/sandbox so only totalGameplaySec moves. */
  tripStart(vehicleId = null, { ranked = true } = {}) {
    this.session = emptySession();
    this.session.ranked    = ranked;
    this.session.vehicleId = vehicleId;
    if (ranked) this._bump(this.stats.lifetime, 'tripsStarted');
    this.flush();
  }

  setVehicle(vehicleId) { this.session.vehicleId = vehicleId; }

  /** Run reached Pullman (full completion).  Updates completion records and
   *  returns the trip summary so the leaderboard layer can build a record. */
  tripComplete({ score = 0, miles = 0, timeSec = 0 } = {}) {
    if (this.ranked) {
      const lt = this.stats.lifetime, rec = this.stats.records;
      this._bump(lt, 'tripsCompleted');
      if (score > rec.bestScore) rec.bestScore = score;
      if (miles > rec.mostMilesRun) rec.mostMilesRun = miles;
      if (timeSec > 0 && (rec.fastestCompletionSec == null || timeSec < rec.fastestCompletionSec)) {
        rec.fastestCompletionSec = timeSec;
      }
    }
    this.flush();
    return this.summarize({ score, miles, timeSec, completed: true });
  }

  /** Run ended without completing (wreck / busted / quit).  Still folds the
   *  best-score record in; returns the summary for an incomplete-run record. */
  tripEnd({ score = 0, miles = 0, timeSec = 0 } = {}) {
    if (this.ranked) {
      const rec = this.stats.records;
      if (score > rec.bestScore) rec.bestScore = score;
      if (miles > rec.mostMilesRun) rec.mostMilesRun = miles;
    }
    this.flush();
    return this.summarize({ score, miles, timeSec, completed: false });
  }

  /** Snapshot of the current trip — feeds "this trip" UI and run records. */
  summarize(extra = {}) {
    return {
      ranked:           this.session.ranked,
      vehicleId:        this.session.vehicleId,
      npcHits:          this.session.npcHits,
      damageTaken:      this.session.damageTaken,
      earned:           this.session.earnedThisTrip,
      spent:            this.session.spentThisTrip,
      drugsCollected:   this.session.drugsCollected,
      weaponsCollected: this.session.weaponsCollected,
      miles:            this.session.miles,
      driveTimeSec:     this.session.tripTimeSec,
      pitstopSec:       this.session.pitstopSec,
      topSpeed:         this.session.topSpeed,
      hitchhikers:      this.session.hitchhikers,
      hitchhikersGood:  this.session.hitchhikersGood,
      hitchhikersBad:   this.session.hitchhikersBad,
      sexWorkers:       this.session.sexWorkers,
      sexWorkerBribes:  this.session.sexWorkerBribes,
      robberies:        this.session.robberies,
      robbedAmount:     this.session.robbedAmount,
      ...extra,
    };
  }

  // ── Collisions / damage ─────────────────────────────────────────────────

  recordNpcHit(n = 1) {
    if (!this.ranked) return;
    this._bump(this.stats.lifetime, 'npcHits', n);
    this._bump(this.session, 'npcHits', n);
    const v = this._vehicle(); if (v) this._bump(v, 'npcHits', n);
  }

  recordDamage(amount) {
    if (!this.ranked || !(amount > 0)) return;
    this._bump(this.stats.lifetime, 'damageTaken', amount);
    this._bump(this.session, 'damageTaken', amount);
    this.session.noDamageStreakMiles = 0;   // streak broken
  }

  recordWreck() {
    if (!this.ranked) return;
    this._bump(this.stats.lifetime, 'wrecks');
    const v = this._vehicle(); if (v) this._bump(v, 'wrecks');
  }

  // ── Collectibles ──────────────────────────────────────────────────────────

  recordDrugCollected(drugId, n = 1) {
    if (!this.ranked) return;
    this._bump(this.stats.drugs.collected, drugId, n);
    this._bump(this.stats.lifetime, 'drugsCollectedTotal', n);
    this._bump(this.session, 'drugsCollected', n);
  }

  recordWeaponCollected(type, n = 1) {
    if (!this.ranked) return;
    this._bump(this.stats.weapons.collected, type, n);
    this._bump(this.stats.lifetime, 'weaponsCollectedTotal', n);
    this._bump(this.session, 'weaponsCollected', n);
  }

  // ── Encounters ────────────────────────────────────────────────────────────

  /** Hitchhiker picked up.  kind ∈ 'good' | 'bad' | 'neutral'
   *  (neutral = "nothing happened"; counts toward total only). */
  recordHitchhiker(kind = 'neutral') {
    if (!this.ranked) return;
    this._bump(this.stats.hitchhikers, 'total');
    this._bump(this.session, 'hitchhikers');
    if (kind === 'good')      { this._bump(this.stats.hitchhikers, 'good'); this._bump(this.session, 'hitchhikersGood'); }
    else if (kind === 'bad')  { this._bump(this.stats.hitchhikers, 'bad');  this._bump(this.session, 'hitchhikersBad'); }
  }

  /** Sex worker slept with.  `bribed` = the 10% "she had dirt" star-cap roll. */
  recordSexWorker(bribed = false) {
    if (!this.ranked) return;
    this._bump(this.stats.sexWorkers, 'total');
    this._bump(this.session, 'sexWorkers');
    if (bribed) {
      this._bump(this.stats.sexWorkers, 'bribes');
      this._bump(this.session, 'sexWorkerBribes');
    }
  }

  /** Player robbed of `amount` cash (hitchhiker rob, armed robbery, pump). */
  recordRobbery(amount = 0) {
    if (!this.ranked) return;
    this._bump(this.stats.robberies, 'count');
    this._bump(this.session, 'robberies');
    if (amount > 0) {
      this._bump(this.stats.robberies, 'amount', amount);
      this._bump(this.session, 'robbedAmount', amount);
    }
  }

  // ── Money in/out ────────────────────────────────────────────────────────

  /** A score/cash credit.  `base` is the pre-multiplier amount, if known, so
   *  we can attribute the bonus portion to the multiplier bucket. */
  recordEarn(amount, source = 'other', base = null) {
    if (!this.ranked || !(amount > 0)) return;
    this._bump(this.stats.lifetime, 'earnedGross', amount);
    this._bump(this.stats.earned.bySource, source, amount);
    this._bump(this.session, 'earnedThisTrip', amount);
    if (base != null && amount > base) {
      this._bump(this.stats.earned, 'fromMultiplier', amount - base);
    }
  }

  /** A cash debit.  category ∈ drugs|weapons|vehicles|accessories|services.
   *  subId is the drug/weapon id for the per-item breakdown. */
  recordSpend(amount, category, subId = null) {
    if (!this.ranked || !(amount > 0)) return;
    this._bump(this.stats.lifetime, 'spentTotal', amount);
    this._bump(this.session, 'spentThisTrip', amount);
    const sp = this.stats.spent;
    switch (category) {
      case 'drugs':
        if (subId) this._bump(sp.drugs, subId, amount);
        this._bump(sp, 'drugsTotal', amount);
        break;
      case 'weapons':
        if (subId) this._bump(sp.weapons, subId, amount);
        this._bump(sp, 'weaponsTotal', amount);
        break;
      case 'vehicles':    this._bump(sp, 'vehicles', amount);    break;
      case 'accessories': this._bump(sp, 'accessories', amount); break;
      default:            this._bump(sp, 'services', amount);    break;
    }
  }

  // ── Distance / time / speed (hot path — in-memory only) ───────────────────

  addMiles(deltaMiles, vehicleId = null) {
    if (!this.ranked || !(deltaMiles > 0)) return;
    this._bump(this.stats.lifetime, 'miles', deltaMiles);
    this._bump(this.session, 'miles', deltaMiles);
    const v = this._vehicle(vehicleId); if (v) this._bump(v, 'miles', deltaMiles);
    this.session.noDamageStreakMiles += deltaMiles;
    if (this.session.noDamageStreakMiles > this.stats.records.longestNoDamageStreakMiles) {
      this.stats.records.longestNoDamageStreakMiles = this.session.noDamageStreakMiles;
    }
  }

  /** Road time.  totalGameplaySec accrues for ALL modes (incl. sandbox);
   *  the ranked breakdown (lifetime + per-vehicle + this-trip) only for
   *  scored runs. */
  addDriveTime(deltaSec, vehicleId = null) {
    if (!(deltaSec > 0)) return;
    this._bump(this.stats, 'totalGameplaySec', deltaSec);
    if (!this.ranked) return;
    this._bump(this.stats.lifetime, 'driveTimeSec', deltaSec);
    this._bump(this.session, 'tripTimeSec', deltaSec);
    const v = this._vehicle(vehicleId); if (v) this._bump(v, 'driveTimeSec', deltaSec);
  }

  recordTopSpeed(speed) {
    if (!this.ranked) return;
    if (speed > this.session.topSpeed) this.session.topSpeed = speed;
    if (speed > this.stats.records.topSpeed) this.stats.records.topSpeed = speed;
  }

  // ── Rest stops ────────────────────────────────────────────────────────────

  restStopEnter(stopId) {
    if (!this.ranked) return;
    if (stopId != null) this._bump(this._stop(stopId), 'visits');
    this.flush();
  }

  /** Caller computes the dwell duration (exit ts - enter ts) and passes it. */
  restStopExit(stopId, durationSec) {
    if (!this.ranked) return;
    if (!(durationSec > 0)) { this.flush(); return; }
    if (stopId != null) this._bump(this._stop(stopId), 'totalTimeSec', durationSec);
    this._bump(this.stats, 'totalPitstopSec', durationSec);
    this._bump(this.session, 'pitstopSec', durationSec);
    this.flush();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /** Push the in-memory stats to localStorage.  Cheap (one JSON write) but
   *  not free — call at checkpoints, never per frame. */
  flush() { this._save.save(); }

  /** Wipe career stats (debug / full reset).  Leaderboard is separate. */
  reset() {
    this._save.set('stats', defaultStats());
    this.stats   = this._save.get('stats');
    this.session = emptySession();
  }
}
