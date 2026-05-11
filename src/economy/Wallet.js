// INTEGRATION CONTRACT:
// Reads/writes saveSystem.profile.money (integer cents).
// Emits 'change' on every successful transaction; 'insufficient_funds' on failed spend.
// Transaction log is in-memory only (capped at 100), balance is persisted via SaveSystem.save().

const LOG_CAP = 100;

export class Wallet {
  constructor(saveSystem) {
    this._save = saveSystem;
    this._log = [];
    this._listeners = { change: [], insufficient_funds: [] };

    // Ensure money field is a valid integer on init.
    if (typeof this._save.profile.money !== 'number' || !Number.isInteger(this._save.profile.money)) {
      this._save.profile.money = 0;
      this._save.save();
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getBalance() {
    return this._save.profile.money;
  }

  canAfford(amount) {
    return this.getBalance() >= amount;
  }

  getLog(limit = 20) {
    const start = Math.max(0, this._log.length - limit);
    return this._log.slice(start);
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  add(amount, source = 'unknown') {
    if (!Number.isInteger(amount) || amount <= 0) {
      console.warn('[Wallet] add() requires a positive integer amount:', amount);
      return;
    }
    this._save.profile.money += amount;
    this._save.save();
    this._record(amount, source);
    this._emit('change', { balance: this.getBalance(), delta: amount, source });
  }

  spend(amount, reason = 'unknown') {
    if (!Number.isInteger(amount) || amount <= 0) {
      console.warn('[Wallet] spend() requires a positive integer amount:', amount);
      return false;
    }
    if (!this.canAfford(amount)) {
      this._emit('insufficient_funds', { balance: this.getBalance(), needed: amount, reason });
      return false;
    }
    this._save.profile.money -= amount;
    this._save.save();
    this._record(-amount, reason);
    this._emit('change', { balance: this.getBalance(), delta: -amount, source: reason });
    return true;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  on(event, cb) {
    if (!this._listeners[event]) {
      console.warn('[Wallet] Unknown event:', event);
      return;
    }
    this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _record(amount, source) {
    const entry = {
      amount,
      source,
      ts: Date.now(),
      balanceAfter: this.getBalance(),
    };
    this._log.push(entry);
    if (this._log.length > LOG_CAP) {
      this._log.splice(0, this._log.length - LOG_CAP);
    }
  }

  _emit(event, data) {
    const handlers = this._listeners[event];
    if (!handlers) return;
    for (const cb of handlers) {
      try { cb(data); } catch (e) { console.error('[Wallet] Event handler error:', e); }
    }
  }
}
