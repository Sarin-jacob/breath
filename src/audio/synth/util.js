// Shared DSP helpers for the generative instruments.

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** Deterministic PRNG so recorded variants are reproducible by seed. */
export function rng(seed = Math.random() * 2 ** 32) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

const bufferCache = new WeakMap();
function cached(ctx, key, make) {
  let m = bufferCache.get(ctx);
  if (!m) bufferCache.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/** Stereo noise buffer (decorrelated channels). type: white | pink | brown */
export function noiseBuffer(ctx, type = 'white', seconds = 6) {
  return cached(ctx, `noise-${type}-${seconds}`, () => {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      // Crossfade the ends so the loop point is seamless.
      const xf = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < xf; i++) {
        const g = i / xf;
        d[i] = d[i] * g + d[len - xf + i] * (1 - g);
      }
    }
    return buf;
  });
}

export function noiseSource(ctx, type, seconds = 6) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, type, seconds);
  src.loop = true;
  src.loopEnd = src.buffer.duration - 0.05;
  // Random offset so layers using the same buffer don't phase.
  src.start(ctx.currentTime, Math.random() * (src.buffer.duration - 0.1));
  return src;
}

/** Algorithmic reverb impulse response. */
export function reverbIR(ctx, seconds = 5, decay = 2.2) {
  return cached(ctx, `ir-${seconds}-${decay}`, () => {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Darken the tail over time like real rooms.
        const k = 0.9 - 0.75 * t;
        lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
        d[i] = lp * (1 - t) ** decay * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  });
}

export function curve(fn, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
export const tanhCurve = (drive) => curve((x) => Math.tanh(x * drive) / Math.tanh(drive));

export function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

export function filter(ctx, type, freq, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  return f;
}

export function osc(ctx, type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

export function panner(ctx, pan) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }
  return gain(ctx, 1);
}

/** Slow LFO driving `param` by ±depth around its current value. */
export function lfo(ctx, freq, depth, param, type = 'sine') {
  const o = osc(ctx, type, freq);
  const g = gain(ctx, depth);
  o.connect(g).connect(param);
  o.start(ctx.currentTime + Math.random() * 0.1);
  return o;
}

/** Karplus–Strong plucked string rendered into a buffer (for tanpura / bass plucks). */
export function pluckBuffer(ctx, freq, seconds = 6, { bright = 0.5, buzz = 0.25, decay = 0.9985 } = {}) {
  const key = `pluck-${freq.toFixed(2)}-${seconds}-${bright}-${buzz}-${decay}`;
  return cached(ctx, key, () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      prev = prev + (w - prev) * (0.2 + bright * 0.8);
      line[i] = prev;
    }
    let idx = 0;
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      const a = line[idx];
      const b = line[(idx + 1) % N];
      let y = (a + b) * 0.5 * decay;
      // "Jawari" buzz: a compressive (energy-removing, so stable) cubic term regenerates
      // upper harmonics, like the curved bridge of a tanpura.
      y -= buzz * 0.08 * y * y * y;
      line[idx] = y;
      idx = (idx + 1) % N;
      lastOut = lastOut * 0.3 + y * 0.7;
      d[i] = lastOut;
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.8 / peak;
    return buf;
  });
}

/**
 * Event scheduler that works for both realtime and OfflineAudioContext rendering.
 * task(time) schedules audio at `time` and returns seconds until it should run again (or null to end).
 */
export function createClock(ctx, { offline = false, lookahead = 4 } = {}) {
  const tasks = new Set();
  let timer = null;
  const pump = () => {
    const horizon = ctx.currentTime + lookahead;
    for (const t of tasks) {
      while (t.next < horizon) {
        const dt = t.fn(t.next);
        if (dt == null) { tasks.delete(t); break; }
        t.next += Math.max(0.01, dt);
      }
    }
  };
  return {
    offline,
    every(fn, startAt = ctx.currentTime + 0.05) {
      const t = { fn, next: startAt };
      tasks.add(t);
      if (offline) return () => tasks.delete(t);
      if (!timer) timer = setInterval(pump, 200);
      pump();
      return () => tasks.delete(t);
    },
    /** Offline: run all tasks up to `until` seconds. */
    flush(until) {
      for (const t of tasks) {
        while (t.next < until) {
          const dt = t.fn(t.next);
          if (dt == null) break;
          t.next += Math.max(0.01, dt);
        }
      }
    },
    dispose() {
      tasks.clear();
      clearInterval(timer);
      timer = null;
    },
  };
}

/** Schedule a smooth approach to `value` beginning at `time`. */
export function glide(param, value, time, tau) {
  param.setTargetAtTime(value, time, Math.max(0.005, tau));
}

/** Common layer wrapper: a bus with fade-in, and a stop() that fades and cleans up. */
export function layerBus(ctx, out, level, fadeIn = 3) {
  const bus = gain(ctx, 0);
  bus.connect(out);
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.gain.setTargetAtTime(level, ctx.currentTime, fadeIn / 3);
  const nodes = [];
  const cleanups = [];
  return {
    bus,
    keep(...n) { nodes.push(...n); return n[0]; },
    onStop(fn) { cleanups.push(fn); },
    stop(fade = 2) {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.setTargetAtTime(0, now, fade / 4);
      cleanups.forEach((f) => f());
      setTimeout(() => {
        for (const n of nodes) { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} }
        try { bus.disconnect(); } catch {}
      }, fade * 1000 + 200);
    },
  };
}
