/**
 * HapticSystem — best-effort device vibration for rumble-strip and off-road
 * feedback.  Tries (in order):
 *   1. Capacitor Haptics plugin (iOS / Android native via @capacitor/haptics
 *      — only present if installed; falls through cleanly if not).
 *   2. navigator.vibrate (Android web + some desktop; iOS Safari ignores it).
 *
 * Calls are throttled per intensity tier so 60-Hz polling doesn't drown the
 * device in pulses.  Tier ordering matters: a pending light pulse is
 * superseded by a heavy pulse fired in the same window.
 */
export class HapticSystem {
  constructor() {
    this._lastFire   = 0;          // timestamp of last fired pulse (ms)
    this._lastTier   = 0;          // 0 none, 1 rumble, 2 offroad
    this._capacitor  = null;       // resolved lazily
    this._capLoaded  = false;
    this.enabled     = true;
  }

  setEnabled(on) { this.enabled = !!on; }

  /** Fire a haptic for the given tier:
   *    1 — rumble strip: short light buzz (~25 ms), at most every 90 ms
   *    2 — off-road dirt: longer pulse (~80 ms), at most every 140 ms
   *  Tier 0 is a no-op. */
  pulse(tier) {
    if (!this.enabled || !tier) return;
    const now = performance.now();
    // Per-tier throttle.  Heavier tier overrides a recent lighter one.
    const minGap = tier >= 2 ? 140 : 90;
    if (tier === this._lastTier && now - this._lastFire < minGap) return;
    if (tier <  this._lastTier && now - this._lastFire < minGap) return;
    this._lastFire = now;
    this._lastTier = tier;

    const ms = tier >= 2 ? 80 : 25;
    this._fire(ms, tier);
  }

  /** Two short pulses ~130 ms apart — mimics an incoming-text notification
   *  buzz.  Fired whenever a phone-text popup appears.  Honors the haptics
   *  setting and falls through cleanly when no vibration API is present
   *  (e.g. iOS Safari before the Capacitor wrap, or desktop). */
  notify() {
    if (!this.enabled) return;
    // Lazily resolve the Capacitor Haptics plugin (shared with _fire).
    if (!this._capLoaded) {
      this._capLoaded = true;
      try {
        const Cap = (typeof window !== 'undefined' && window.Capacitor) || null;
        this._capacitor = Cap?.Plugins?.Haptics ?? null;
      } catch { this._capacitor = null; }
    }
    if (this._capacitor?.impact) {
      // iOS native: two light impacts back-to-back = the "bzzt-bzzt" of a text.
      const tap = () => { try { this._capacitor.impact({ style: 'LIGHT' }); } catch {} };
      tap();
      setTimeout(tap, 130);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Web/Android: a two-buzz pattern (buzz 30 ms · pause 110 ms · buzz 30 ms).
      try { navigator.vibrate([30, 110, 30]); } catch {}
    }
  }

  _fire(ms, tier) {
    // Capacitor Haptics — preferred on iOS where navigator.vibrate is
    // ignored.  Lazily resolved; if the plugin isn't present we fall
    // through to navigator.vibrate.
    if (!this._capLoaded) {
      this._capLoaded = true;
      try {
        const Cap = (typeof window !== 'undefined' && window.Capacitor) || null;
        this._capacitor = Cap?.Plugins?.Haptics ?? null;
      } catch { this._capacitor = null; }
    }
    if (this._capacitor?.impact) {
      const style = tier >= 2 ? 'HEAVY' : 'LIGHT';
      try { this._capacitor.impact({ style }); } catch {}
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(ms); } catch {}
    }
  }
}
