// Pure timing model of a breathing pattern. Given absolute clock time → current phase, progress
// and lung "fullness" (0..1). Also lists upcoming phase changes so audio can be scheduled ahead
// (which keeps cues accurate even when the tab is in the background).

const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));

export class BreathEngine {
  constructor(pattern, startAt) {
    this.t0 = startAt;
    this.pausedAt = null;
    let level = 0;
    this.phases = pattern.phases.map(([kind, dur], i, arr) => {
      const from = level;
      let to = level;
      if (kind === 'inhale') to = arr[i + 1]?.[0] === 'inhale2' ? 0.78 : 1;
      else if (kind === 'inhale2') to = 1;
      else if (kind === 'exhale') to = 0;
      level = to;
      return { kind, dur, from, to };
    });
    this.cycle = this.phases.reduce((a, p) => a + p.dur, 0);
    this.free = this.phases.length === 0;
  }

  pause(now) { if (this.pausedAt == null) this.pausedAt = now; }
  resume(now) {
    if (this.pausedAt == null) return;
    this.t0 += now - this.pausedAt;
    this.pausedAt = null;
  }
  get paused() { return this.pausedAt != null; }

  elapsed(now) {
    return Math.max(0, (this.pausedAt ?? now) - this.t0);
  }

  stateAt(now) {
    const e = this.elapsed(now);
    if (this.free) {
      // Gentle ambient pulse, no guidance.
      return { kind: 'free', index: -1, p: 0, dur: 0, remaining: 0, level: 0.5 + 0.5 * Math.sin((e / 12) * Math.PI * 2), cycleIndex: 0, elapsed: e };
    }
    const cycleIndex = Math.floor(e / this.cycle);
    let t = e - cycleIndex * this.cycle;
    for (let i = 0; i < this.phases.length; i++) {
      const ph = this.phases[i];
      if (t < ph.dur || i === this.phases.length - 1) {
        const p = Math.min(1, t / ph.dur);
        return {
          kind: ph.kind, index: i, p, dur: ph.dur, remaining: ph.dur - t,
          level: ph.from + (ph.to - ph.from) * ease(p), cycleIndex, elapsed: e,
        };
      }
      t -= ph.dur;
    }
  }

  /** Phase starts with absolute time in [a, b). */
  eventsBetween(a, b) {
    if (this.free || this.paused) return [];
    const out = [];
    const ea = a - this.t0;
    const eb = b - this.t0;
    let c = Math.max(0, Math.floor(ea / this.cycle));
    for (; c * this.cycle < eb; c++) {
      let t = c * this.cycle;
      for (const ph of this.phases) {
        if (t >= ea && t < eb) out.push({ time: this.t0 + t, kind: ph.kind, dur: ph.dur, from: ph.from, to: ph.to, cycle: c });
        t += ph.dur;
      }
    }
    return out;
  }

  /** Absolute time at which the cycle containing `now` ends (for graceful stops). */
  cycleEnd(now) {
    if (this.free) return now;
    const e = this.elapsed(now);
    return this.t0 + Math.ceil(e / this.cycle) * this.cycle;
  }
}
