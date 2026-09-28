// Rhythmic styles: lo-fi hip-hop and dark / doom-metal ambient.
import { filter, gain, glide, layerBus, lfo, mtof, noiseBuffer, osc, panner, tanhCurve } from './util.js';

function noiseHit(ctx, dest, t, { type = 'white', hp = 0, bp = 0, lp = 0, q = 1, dur = 0.1, amp = 0.3 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, type, 6);
  let node = s;
  if (hp) node = node.connect(filter(ctx, 'highpass', hp, q));
  if (bp) node = node.connect(filter(ctx, 'bandpass', bp, q));
  if (lp) node = node.connect(filter(ctx, 'lowpass', lp, q));
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  node.connect(g).connect(dest);
  s.start(t, Math.random() * 5);
  s.stop(t + dur + 0.05);
}

function kick(ctx, dest, t, amp = 0.8, low = 42, high = 140, len = 0.5) {
  const x = osc(ctx, 'sine', high);
  x.frequency.setValueAtTime(high, t);
  x.frequency.exponentialRampToValueAtTime(low, t + 0.12);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  x.connect(g).connect(dest);
  x.start(t);
  x.stop(t + len + 0.05);
}

// Warm electric piano: 2-operator FM with a fast-decaying modulation index (Rhodes-like tine).
function ep(ctx, dest, t, midi, vel, len, wobble) {
  const f = mtof(midi);
  const car = osc(ctx, 'sine', f);
  const mod = osc(ctx, 'sine', f);
  const idx = gain(ctx, 0);
  idx.gain.setValueAtTime(f * 2.2 * vel, t);
  idx.gain.setTargetAtTime(f * 0.3, t, 0.25);
  mod.connect(idx).connect(car.frequency);
  wobble.connect(car.detune);
  wobble.connect(mod.detune);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.008);
  g.gain.setTargetAtTime(0.045 * vel, t + 0.01, 0.4);
  g.gain.setTargetAtTime(0, t + len, 0.25);
  car.connect(g).connect(dest);
  const end = t + len + 1.5;
  car.start(t); mod.start(t);
  car.stop(end); mod.stop(end);
  setTimeout(() => { try { wobble.disconnect(car.detune); wobble.disconnect(mod.detune); } catch {} }, (end - ctx.currentTime + 0.5) * 1000);
}

export function lofi(ctx, o) {
  const L = layerBus(ctx, o.out, 0.75 * o.level, 2);
  const bpm = 68 + o.intensity * 12;
  const step = 60 / bpm / 4;
  const swing = 0.14;
  const tone = L.keep(filter(ctx, 'lowpass', 1800 + 3200 * o.brightness, 0.4));
  const tape = L.keep(ctx.createWaveShaper());
  tape.curve = tanhCurve(1.6);
  tone.connect(tape).connect(L.bus);
  const keys = L.keep(gain(ctx, 1));
  const drums = L.keep(gain(ctx, o.intensity < 0.2 ? 0 : 0.5 + o.intensity * 0.5));
  keys.connect(tone);
  keys.connect(L.keep(gain(ctx, 0.35))).connect(o.wet);
  drums.connect(tone);
  // Tape wow shared by all keys.
  const wobble = L.keep(gain(ctx, 7));
  const wob = L.keep(osc(ctx, 'sine', 0.35));
  wob.connect(wobble);
  wob.start();

  // Vinyl: hiss + random crackles.
  const vinylBuf = (() => {
    const len = ctx.sampleRate * 5;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.012;
      for (let k = 0; k < 90; k++) {
        const at = Math.floor(Math.random() * (len - 60));
        const a = Math.random() ** 2 * 0.5;
        for (let i = 0; i < 30; i++) d[at + i] += (Math.random() * 2 - 1) * a * (1 - i / 30);
      }
    }
    return b;
  })();
  const vinyl = L.keep(ctx.createBufferSource());
  vinyl.buffer = vinylBuf;
  vinyl.loop = true;
  vinyl.connect(L.keep(filter(ctx, 'bandpass', 3000, 0.4))).connect(L.keep(gain(ctx, 0.9))).connect(L.bus);
  vinyl.start();

  // ii–V–I–vi in D with lush 7th/9th voicings.
  const prog = [
    { bass: 40, notes: [52, 55, 59, 62, 64] }, // Em9
    { bass: 45, notes: [52, 55, 57, 61, 64] }, // A13sus-ish
    { bass: 38, notes: [54, 57, 61, 64, 66] }, // Dmaj9
    { bass: 47, notes: [50, 54, 57, 62, 66] }, // Bm11
  ];
  const penta = [62, 64, 66, 69, 71, 74, 76, 78];
  const kickPat = [1, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0.8, 0, 0, 0, 0, 0];
  const snarePat = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.25];
  let s = 0;
  L.onStop(o.clock.every((t) => {
    const bar = Math.floor(s / 16) % prog.length;
    const i = s % 16;
    const tt = t + (i % 2 ? swing * step : 0) + o.rng.range(0, 0.008);
    const ch = prog[bar];
    if (i === 0 || (i === 11 && o.rng.chance(0.35))) {
      const vel = i === 0 ? o.rng.range(0.8, 1) : 0.55;
      ch.notes.forEach((n, k) => ep(ctx, keys, tt + k * 0.018, n, vel * (1 - k * 0.08), step * (i === 0 ? 11 : 5), wobble));
    }
    if (i === 0 || i === 10) {
      // Round sub bass.
      const b = osc(ctx, 'triangle', mtof(ch.bass));
      const bg = gain(ctx, 0);
      bg.gain.setValueAtTime(0, tt);
      bg.gain.linearRampToValueAtTime(0.28, tt + 0.02);
      bg.gain.setTargetAtTime(0, tt + step * 5, 0.15);
      b.connect(bg).connect(tone);
      b.start(tt); b.stop(tt + step * 8);
    }
    if (o.rng.chance(0.06 + o.intensity * 0.06) && i % 2 === 0) {
      ep(ctx, keys, tt, o.rng.pick(penta) + 12, o.rng.range(0.3, 0.55), step * 3, wobble);
    }
    if (drums.gain.value > 0) {
      if (kickPat[i] && (kickPat[i] === 1 || o.rng.chance(0.7))) kick(ctx, drums, tt, 0.7 * kickPat[i]);
      if (snarePat[i]) {
        noiseHit(ctx, drums, tt, { type: 'pink', bp: 1800, q: 0.8, dur: 0.22, amp: 0.32 * snarePat[i] });
        noiseHit(ctx, o.wet, tt, { type: 'pink', bp: 1500, q: 0.8, dur: 0.3, amp: 0.1 * snarePat[i] });
      }
      if (i % 2 === 0 || o.rng.chance(0.2)) {
        noiseHit(ctx, drums, tt, { hp: 7000, dur: i % 4 === 2 ? 0.08 : 0.035, amp: (i % 4 === 2 ? 0.1 : 0.06) * o.rng.range(0.6, 1) });
      }
    }
    s++;
    return step;
  }, ctx.currentTime + 0.3));

  const base = tone.frequency.value;
  return {
    stop: L.stop,
    breath(ev) {
      glide(tone.frequency, base * (0.8 + ev.to * 0.45), ev.time, ev.dur / 3);
    },
  };
}

export function metal(ctx, o) {
  // Slow, huge, distorted power chords that bloom and ring out — heavy yet hypnotic.
  const L = layerBus(ctx, o.out, 0.5 * o.level, 3);
  const drive = L.keep(ctx.createWaveShaper());
  drive.curve = tanhCurve(8 + o.intensity * 22);
  drive.oversample = '2x';
  const pre = L.keep(gain(ctx, 1));
  const hp = L.keep(filter(ctx, 'highpass', 70));
  const cab = L.keep(filter(ctx, 'lowpass', 1400 + 2600 * o.brightness, 0.9));
  const scoop = L.keep(filter(ctx, 'peaking', 750, 1));
  scoop.gain.value = -6;
  const post = L.keep(gain(ctx, 0.35));
  pre.connect(drive).connect(hp).connect(scoop).connect(cab).connect(post);
  post.connect(L.bus);
  post.connect(L.keep(gain(ctx, 0.6))).connect(o.wet);
  const drums = L.keep(gain(ctx, o.intensity < 0.35 ? 0 : 0.8));
  drums.connect(L.bus);
  drums.connect(L.keep(gain(ctx, 0.8))).connect(o.wet);
  // Deep sub drone beneath everything.
  const sub = L.keep(osc(ctx, 'sine', mtof(26)));
  const subG = L.keep(gain(ctx, 0.2));
  sub.connect(subG).connect(L.bus);
  sub.start();

  // D – F – C – Bb (dark, doom-ish), low drop-D tuning.
  const roots = [38, 41, 36, 34];
  const bar = 60 / 48 * 4; // 48 bpm
  let n = 0;
  let current = null;
  function chord(t, root, len) {
    const g = gain(ctx, 0);
    g.connect(pre);
    const notes = [root, root + 7, root + 12];
    const oscs = notes.flatMap((m) => [-9, 9].map((c) => osc(ctx, 'sawtooth', mtof(m), c + o.rng.range(-3, 3))));
    oscs.forEach((x) => { x.connect(g); x.start(t); x.stop(t + len + 4); });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.9);
    g.gain.setTargetAtTime(0.32, t + 1, 1.5);
    g.gain.setTargetAtTime(0, t + len, 0.9);
    glide(sub.frequency, mtof(root - 12), t, 0.3);
    current = g;
  }
  L.onStop(o.clock.every((t) => {
    const root = roots[n % roots.length];
    chord(t, root, bar * 2);
    if (drums.gain.value > 0) {
      for (let b = 0; b < 8; b += 2) {
        const bt = t + b * (bar / 4);
        kick(ctx, drums, bt, 0.9, 38, 110, 0.9);
        if (b % 4 === 2) noiseHit(ctx, drums, bt, { type: 'pink', bp: 220, q: 1.2, dur: 0.8, amp: 0.4 });
      }
      if (n % 4 === 0) noiseHit(ctx, drums, t, { hp: 3500, dur: 3.5, amp: 0.05 });
    }
    n++;
    return bar * 2;
  }, ctx.currentTime + 0.2));

  const cabBase = cab.frequency.value;
  return {
    stop: L.stop,
    breath(ev) {
      glide(cab.frequency, cabBase * (0.55 + ev.to * 0.8), ev.time, ev.dur / 3);
      glide(post.gain, 0.24 + ev.to * 0.16, ev.time, ev.dur / 3);
    },
  };
}
