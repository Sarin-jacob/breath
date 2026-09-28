// Nature textures synthesized from noise: rain, ocean, wind, stream, birds, fire, plain noise.
import { filter, gain, glide, layerBus, lfo, noiseSource, osc, panner } from './util.js';

const cache = new WeakMap();
function bakedBuffer(ctx, key, seconds, fill) {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  if (!m.has(key)) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    fill(buf, ctx.sampleRate, len);
    m.set(key, buf);
  }
  return m.get(key);
}

function loopBuffer(ctx, buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(ctx.currentTime, Math.random() * buf.duration);
  return s;
}

export function rain(ctx, o) {
  const L = layerBus(ctx, o.out, 0.55 * o.level, 4);
  // Wash: pink noise shaped into the familiar hiss.
  const wash = L.keep(noiseSource(ctx, 'pink'));
  const hp = L.keep(filter(ctx, 'highpass', 500));
  const lp = L.keep(filter(ctx, 'lowpass', 3500 + 6000 * o.brightness));
  const washG = L.keep(gain(ctx, 0.45 + o.intensity * 0.5));
  wash.connect(hp).connect(lp).connect(washG).connect(L.bus);
  L.keep(lfo(ctx, 0.05, 0.12, washG.gain));
  // Rumble: rain on a roof.
  const rum = L.keep(noiseSource(ctx, 'brown'));
  const rlp = L.keep(filter(ctx, 'lowpass', 220));
  rum.connect(rlp).connect(L.keep(gain(ctx, 0.25 + 0.3 * o.intensity))).connect(L.bus);
  // Individual droplets baked into a loop.
  const drops = bakedBuffer(ctx, 'drops', 9, (buf, sr, len) => {
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const n = 1400;
      for (let k = 0; k < n; k++) {
        const at = Math.floor(Math.random() * (len - sr * 0.05));
        const f = 1800 + Math.random() * 5200;
        const dec = 0.004 + Math.random() * 0.018;
        const amp = Math.random() ** 3 * 0.35;
        const dur = Math.floor(sr * dec * 5);
        for (let i = 0; i < dur; i++) {
          const t = i / sr;
          d[at + i] += Math.sin(2 * Math.PI * f * t * (1 + t * 30)) * Math.exp(-t / dec) * amp;
        }
      }
    }
  });
  const dropSrc = L.keep(loopBuffer(ctx, drops));
  const dropG = L.keep(gain(ctx, 0.2 + 0.5 * o.intensity));
  dropSrc.connect(dropG).connect(L.bus);
  dropG.connect(o.wet);
  return { stop: L.stop };
}

export function ocean(ctx, o) {
  const L = layerBus(ctx, o.out, 0.8 * o.level, 4);
  const body = L.keep(noiseSource(ctx, 'brown'));
  const surf = L.keep(noiseSource(ctx, 'pink'));
  const bodyLp = L.keep(filter(ctx, 'lowpass', 300));
  const bodyG = L.keep(gain(ctx, 0.15));
  const surfBp = L.keep(filter(ctx, 'bandpass', 800, 0.5));
  const surfG = L.keep(gain(ctx, 0.02));
  const pan = L.keep(panner(ctx, 0));
  body.connect(bodyLp).connect(bodyG).connect(pan);
  surf.connect(surfBp).connect(surfG).connect(pan);
  pan.connect(L.bus);
  surfG.connect(o.wet);
  const top = 1200 + 3500 * o.brightness;
  const size = 0.6 + 0.6 * o.intensity;

  // A wave: builds (rise), breaks, and hisses back out (fall).
  function wave(t, rise, fall, strength = 1) {
    const s = strength * size;
    glide(bodyG.gain, 0.55 * s, t, rise / 2.2);
    glide(bodyLp.frequency, 500 + top * 0.3 * s, t, rise / 2.2);
    glide(surfG.gain, 0.05 * s, t, rise / 2);
    glide(surfBp.frequency, 700, t, rise / 2);
    // Break + wash back.
    const b = t + rise;
    glide(surfG.gain, 0.42 * s, b, 0.35);
    glide(surfBp.frequency, top, b, 0.4);
    glide(bodyG.gain, 0.3 * s, b + 0.3, fall / 3);
    glide(bodyLp.frequency, 280, b + 0.5, fall / 3);
    glide(surfG.gain, 0.015, b + 0.8, fall / 3.5);
    glide(surfBp.frequency, 1800, b + 0.8, fall / 3);
    if (pan.pan) glide(pan.pan, o.rng.range(-0.4, 0.4), t, rise);
  }
  if (!o.synced) {
    L.onStop(o.clock.every((t) => {
      const rise = o.rng.range(3.5, 6);
      const fall = o.rng.range(4, 7);
      wave(t, rise, fall, o.rng.range(0.7, 1.1));
      return rise + fall;
    }, ctx.currentTime + 0.2));
  }
  return {
    stop: L.stop,
    breath(ev) {
      // The sea breathes with you: the wave builds on the in-breath and breaks as you let go.
      if (ev.kind === 'inhale') wave(ev.time, ev.dur, 5, 0.8 + ev.dur / 20);
    },
  };
}

export function wind(ctx, o) {
  const L = layerBus(ctx, o.out, 2.5 * o.level, 5);
  const layers = [-0.6, 0.6].map((p) => {
    const n = L.keep(noiseSource(ctx, 'pink'));
    const bp = L.keep(filter(ctx, 'bandpass', 500, 1.6));
    const g = L.keep(gain(ctx, 0.35));
    n.connect(bp).connect(g).connect(L.keep(panner(ctx, p))).connect(L.bus);
    return { bp, g };
  });
  const base = 300 + 700 * o.brightness;
  L.onStop(o.clock.every((t) => {
    for (const w of layers) {
      glide(w.bp.frequency, base * o.rng.range(0.6, 2.2), t, o.rng.range(1, 3));
      glide(w.g.gain, o.rng.range(0.1, 0.5) * (0.6 + o.intensity), t, o.rng.range(1, 3));
    }
    return o.rng.range(2, 5);
  }));
  return { stop: L.stop };
}

export function stream(ctx, o) {
  // The classic "babbling brook": resonant filters whose frequency is modulated by noise.
  const L = layerBus(ctx, o.out, 1.5 * o.level, 4);
  for (let i = 0; i < 4; i++) {
    const src = L.keep(noiseSource(ctx, 'brown'));
    const mod = L.keep(noiseSource(ctx, 'brown'));
    const modLp = L.keep(filter(ctx, 'lowpass', 14 + i * 4));
    const modG = L.keep(gain(ctx, 900 + 500 * o.brightness));
    const rbp = L.keep(filter(ctx, 'bandpass', 700 + i * 350, 18));
    mod.connect(modLp).connect(modG).connect(rbp.frequency);
    const g = L.keep(gain(ctx, 0.9 + o.intensity));
    src.connect(rbp).connect(g).connect(L.keep(panner(ctx, (i / 3) * 1.2 - 0.6))).connect(L.bus);
  }
  const hiss = L.keep(noiseSource(ctx, 'pink'));
  hiss.connect(L.keep(filter(ctx, 'highpass', 2500))).connect(L.keep(gain(ctx, 0.04))).connect(L.bus);
  return { stop: L.stop };
}

export function birds(ctx, o) {
  const L = layerBus(ctx, o.out, 1.4 * o.level, 1);
  const send = L.keep(gain(ctx, 0.8));
  const bus = L.keep(gain(ctx, 1));
  bus.connect(L.bus);
  bus.connect(send).connect(o.wet);
  // A few "species", each a little chirp motif.
  const species = [0, 1, 2].map(() => ({
    base: o.rng.range(2200, 4800),
    sweep: o.rng.range(-0.5, 0.7),
    notes: 2 + Math.floor(o.rng() * 5),
    gap: o.rng.range(0.06, 0.16),
    len: o.rng.range(0.05, 0.13),
    pan: o.rng.range(-0.8, 0.8),
  }));
  function chirp(t, s) {
    const p = panner(ctx, s.pan);
    p.connect(bus);
    for (let n = 0; n < s.notes; n++) {
      const tt = t + n * (s.len + s.gap);
      const f = s.base * (1 + o.rng.range(-0.08, 0.08));
      const x = osc(ctx, 'sine', f);
      x.frequency.setValueAtTime(f, tt);
      x.frequency.exponentialRampToValueAtTime(f * (1 + s.sweep), tt + s.len);
      const fm = osc(ctx, 'sine', o.rng.range(30, 70));
      const fmG = gain(ctx, f * 0.05);
      fm.connect(fmG).connect(x.frequency);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(0.09, tt + s.len * 0.25);
      g.gain.linearRampToValueAtTime(0, tt + s.len);
      x.connect(g).connect(p);
      x.start(tt); fm.start(tt);
      x.stop(tt + s.len + 0.05); fm.stop(tt + s.len + 0.05);
    }
  }
  L.onStop(o.clock.every((t) => {
    chirp(t, o.rng.pick(species));
    return o.rng.range(1.5, 7) / (0.4 + o.intensity);
  }, ctx.currentTime + 1));
  return { stop: L.stop };
}

export function fire(ctx, o) {
  const L = layerBus(ctx, o.out, 0.55 * o.level, 3);
  const roar = L.keep(noiseSource(ctx, 'brown'));
  const rlp = L.keep(filter(ctx, 'lowpass', 400));
  const rg = L.keep(gain(ctx, 0.35));
  roar.connect(rlp).connect(rg).connect(L.bus);
  L.keep(lfo(ctx, 0.3, 0.12, rg.gain));
  const crackles = bakedBuffer(ctx, 'crackle', 7, (buf, sr, len) => {
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let k = 0; k < 260; k++) {
        const at = Math.floor(Math.random() * (len - sr * 0.02));
        const amp = Math.random() ** 2 * 0.9;
        const n = Math.floor(sr * (0.0008 + Math.random() * 0.004));
        // Pops often come in quick clusters.
        const burst = Math.random() < 0.3 ? 3 : 1;
        for (let b = 0; b < burst; b++) {
          const off = at + Math.floor(b * sr * Math.random() * 0.03);
          for (let i = 0; i < n && off + i < len; i++) d[off + i] += (Math.random() * 2 - 1) * amp * (1 - i / n);
        }
      }
    }
  });
  const cr = L.keep(loopBuffer(ctx, crackles));
  const chp = L.keep(filter(ctx, 'highpass', 900 - 400 * o.brightness));
  cr.connect(chp).connect(L.keep(gain(ctx, 0.25 + 0.4 * o.intensity))).connect(L.bus);
  return { stop: L.stop };
}

export function noise(ctx, o) {
  const type = o.params?.color || 'brown';
  const L = layerBus(ctx, o.out, (type === 'white' ? 0.18 : type === 'pink' ? 0.4 : 0.7) * o.level, 3);
  const n = L.keep(noiseSource(ctx, type, 10));
  const lp = L.keep(filter(ctx, 'lowpass', 600 + 12000 * o.brightness ** 2));
  n.connect(lp).connect(L.bus);
  return {
    stop: L.stop,
    breath(ev) {
      // Very subtle swell so even plain noise feels alive.
      glide(L.bus.gain, (type === 'white' ? 0.18 : type === 'pink' ? 0.4 : 0.7) * o.level * (0.85 + ev.to * 0.2), ev.time, ev.dur / 3);
    },
  };
}
