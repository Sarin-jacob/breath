// Tonal instruments: drone pads, Om chant, tanpura, singing bowls, binaural / isochronic beats.
// Every instrument: (ctx, o) => { stop(fade), breath?(ev) }
//   o = { out, wet, clock, rng, intensity, brightness, synced, level }
//   ev = { time, kind, dur, from, to }  (from/to = lung fullness 0..1)
import { filter, gain, glide, layerBus, lfo, mtof, osc, panner, pluckBuffer, noiseSource } from './util.js';

// Everything is tuned around C# (Om is traditionally chanted near 136 Hz ≈ C#3).
const ROOT = 37; // C#2

export function drone(ctx, o) {
  const L = layerBus(ctx, o.out, 0.32 * o.level);
  const lpBase = 350 + 1600 * o.brightness;
  const lp = L.keep(filter(ctx, 'lowpass', lpBase, 0.6));
  const send = gain(ctx, 0.55);
  lp.connect(L.bus);
  lp.connect(send).connect(o.wet);
  L.keep(send);
  L.keep(lfo(ctx, 0.021, lpBase * 0.25, lp.frequency));

  const chords = [
    [0, 7, 12, 16, 19, 24],
    [0, 7, 14, 17, 21, 26],
    [-3, 4, 12, 16, 19, 23],
    [2, 9, 14, 17, 21, 24],
    [0, 7, 12, 19, 23, 28],
  ];
  const voices = chords[0].map((iv, i) => {
    const f = mtof(ROOT + 12 + iv);
    const g = L.keep(gain(ctx, 0));
    const p = L.keep(panner(ctx, (i / (chords[0].length - 1)) * 1.4 - 0.7));
    const oscs = [-6, 6].map((cents) => {
      const x = L.keep(osc(ctx, i < 2 ? 'sawtooth' : 'triangle', f, cents + o.rng.range(-3, 3)));
      x.connect(g);
      x.start();
      return x;
    });
    g.connect(p).connect(lp);
    // Each voice breathes at its own slow rate → endless shimmering movement.
    g.gain.value = (i < 2 ? 0.16 : 0.1) * (1 - i * 0.08);
    L.keep(lfo(ctx, o.rng.range(0.03, 0.09), g.gain.value * 0.6, g.gain));
    return { oscs };
  });

  let ci = 0;
  L.onStop(
    o.clock.every((t) => {
      if (t > ctx.currentTime + 1) {
        ci = (ci + 1 + Math.floor(o.rng() * (chords.length - 1))) % chords.length;
        voices.forEach((v, i) => v.oscs.forEach((x) => glide(x.frequency, mtof(ROOT + 12 + chords[ci][i]), t, 2.5)));
      }
      return o.rng.range(16, 26);
    }),
  );

  return {
    stop: L.stop,
    breath(ev) {
      glide(lp.frequency, lpBase * (0.75 + ev.to * 0.9), ev.time, ev.dur / 3);
    },
  };
}

// Formants (Hz, relative gain) for a low male chant.
const VOWELS = {
  a: [[700, 1], [1150, 0.5], [2600, 0.18]],
  o: [[450, 1], [800, 0.45], [2600, 0.1]],
  u: [[325, 1], [700, 0.25], [2500, 0.06]],
  m: [[260, 0.8], [900, 0.02], [2500, 0.01]],
};

export function om(ctx, o) {
  const L = layerBus(ctx, o.out, 0.5 * o.level);
  const send = L.keep(gain(ctx, 0.9));
  const dryLp = L.keep(filter(ctx, 'lowpass', 2200 + 2000 * o.brightness));
  dryLp.connect(L.bus);
  dryLp.connect(send).connect(o.wet);

  // A small "choir": three voices, slightly detuned, each through its own formant bank.
  const f0 = 136.1; // C#3-ish, the traditional Om pitch
  const singers = [0, -9, 7].map((cents, si) => {
    const src = L.keep(osc(ctx, 'sawtooth', si === 2 ? f0 / 2 : f0, cents));
    L.keep(lfo(ctx, 4.6 + si * 0.4, 4, src.detune)); // vibrato
    L.keep(lfo(ctx, 0.13 + si * 0.05, 6, src.detune)); // slow drift
    const env = L.keep(gain(ctx, 0));
    const pan = L.keep(panner(ctx, [-0.35, 0.35, 0][si]));
    const bands = VOWELS.m.map(([f, a]) => {
      const bp = L.keep(filter(ctx, 'bandpass', f, 9));
      const g = L.keep(gain(ctx, a));
      src.connect(bp).connect(g).connect(env);
      return { bp, g };
    });
    // A little breath noise for realism.
    const breathy = L.keep(noiseSource(ctx, 'pink'));
    const bn = L.keep(filter(ctx, 'bandpass', 900, 1));
    const bg = L.keep(gain(ctx, 0.05));
    breathy.connect(bn).connect(bg).connect(env);
    src.start();
    env.connect(pan).connect(dryLp);
    return { env, bands, amp: si === 2 ? 0.55 : 0.4 };
  });

  // Tanpura-ish sub drone underneath so silence between chants isn't empty.
  const sub = L.keep(osc(ctx, 'sine', f0 / 2));
  const subG = L.keep(gain(ctx, 0.12 * (0.5 + o.intensity)));
  sub.connect(subG).connect(L.bus);
  sub.start();

  function chant(t, dur) {
    // "Aaa—ooo—uuu—mmm": open vowel to closed hum across the exhale.
    const seq = [['a', 0], ['o', 0.22], ['u', 0.42], ['m', 0.62]];
    for (const s of singers) {
      const tt = t + o.rng.range(0, 0.12);
      s.env.gain.setTargetAtTime(s.amp, tt, 0.35);
      s.env.gain.setTargetAtTime(0, tt + dur * 0.92, dur * 0.05);
      for (const [v, at] of seq) {
        VOWELS[v].forEach(([f, a], i) => {
          glide(s.bands[i].bp.frequency, f, tt + at * dur, dur * 0.07);
          glide(s.bands[i].g.gain, a, tt + at * dur, dur * 0.07);
        });
      }
    }
  }

  if (!o.synced) {
    L.onStop(o.clock.every((t) => { chant(t, 7.5); return 10; }, ctx.currentTime + 1.5));
  }
  return {
    stop: L.stop,
    breath(ev) {
      if (ev.kind === 'exhale' && ev.dur >= 2.5) chant(ev.time + 0.1, ev.dur);
    },
  };
}

export function tanpura(ctx, o) {
  const L = layerBus(ctx, o.out, 0.42 * o.level);
  const send = L.keep(gain(ctx, 0.6));
  const tone = L.keep(filter(ctx, 'lowpass', 2500 + 3500 * o.brightness));
  tone.connect(L.bus);
  tone.connect(send).connect(o.wet);
  // Pa – Sa – Sa – (low) Sa, the classic four-string cycle.
  const notes = [ROOT + 19, ROOT + 24, ROOT + 24, ROOT + 12].map(mtof);
  const bufs = notes.map((f) => pluckBuffer(ctx, f, 7, { bright: 0.35 + o.brightness * 0.4, buzz: 0.6 }));
  const pans = [-0.4, 0.15, 0.3, -0.1];
  let i = 0;
  const cycle = 5.2 - o.intensity * 1.4;
  L.onStop(
    o.clock.every((t) => {
      const src = ctx.createBufferSource();
      src.buffer = bufs[i];
      const g = gain(ctx, i === 3 ? 0.9 : 0.7);
      src.connect(g).connect(panner(ctx, pans[i])).connect(tone);
      src.start(t + o.rng.range(0, 0.04));
      i = (i + 1) % 4;
      return i === 0 ? cycle * 0.4 : cycle * 0.2;
    }, ctx.currentTime + 0.3),
  );
  return { stop: L.stop };
}

const BOWL_PARTIALS = [
  [1, 1, 16, 0.9],
  [2.71, 0.45, 11, 1.4],
  [5.12, 0.2, 6.5, 2.1],
  [8.3, 0.08, 3.8, 3.2],
  [12.1, 0.03, 2, 4],
];

export function strikeBowl(ctx, dest, t, f0, vel = 1, len = 1) {
  const out = gain(ctx, 0);
  out.connect(dest);
  // Soft mallet: quick swell, then long ring.
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.22 * vel, t + 0.025);
  const end = t + 18 * len + 1;
  for (const [ratio, amp, decay, beat] of BOWL_PARTIALS) {
    for (const side of [-1, 1]) {
      const x = osc(ctx, 'sine', f0 * ratio + (side * beat) / 2);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * 0.5, t + 0.01);
      g.gain.setTargetAtTime(0, t + 0.02, (decay * len) / 4.5);
      x.connect(g).connect(panner(ctx, side * 0.25)).connect(out);
      x.start(t);
      x.stop(end);
    }
  }
  setTimeout(() => out.disconnect(), (end - ctx.currentTime + 1) * 1000);
}

export function bowls(ctx, o) {
  const L = layerBus(ctx, o.out, 0.8 * o.level, 0.5);
  const send = L.keep(gain(ctx, 0.7));
  const tone = L.keep(filter(ctx, 'lowpass', 3000 + 6000 * o.brightness));
  tone.connect(L.bus);
  tone.connect(send).connect(o.wet);
  const notes = [ROOT + 24, ROOT + 31, ROOT + 36, ROOT + 28, ROOT + 33].map(mtof); // pentatonic around C#
  let last = -99;
  const strike = (t, vel) => {
    strikeBowl(ctx, tone, t, o.rng.pick(notes), vel, o.rng.range(0.8, 1.2));
    last = t;
  };
  if (!o.synced) {
    L.onStop(o.clock.every((t) => { strike(t, o.rng.range(0.6, 1)); return o.rng.range(11, 22) * (1.3 - o.intensity * 0.6); }, ctx.currentTime + 0.4));
  } else {
    strike(ctx.currentTime + 0.3, 0.8);
  }
  return {
    stop: L.stop,
    breath(ev) {
      const gap = 16 - o.intensity * 8;
      if (ev.kind === 'inhale' && ev.time - last >= gap) strike(ev.time, o.rng.range(0.6, 0.95));
    },
  };
}

// Brainwave presets: carrier offset between ears.
export const BEATS = { delta: 2.5, theta: 6, alpha: 10 };

export function binaural(ctx, o) {
  const L = layerBus(ctx, o.out, 0.28 * o.level, 5);
  const beat = BEATS[o.params?.band] ?? BEATS.theta;
  const carrier = 120 + 140 * o.brightness;
  const merger = L.keep(ctx.createChannelMerger(2));
  const left = L.keep(osc(ctx, 'sine', carrier));
  const right = L.keep(osc(ctx, 'sine', carrier + beat));
  const gl = L.keep(gain(ctx, 0.5));
  const gr = L.keep(gain(ctx, 0.5));
  left.connect(gl).connect(merger, 0, 0);
  right.connect(gr).connect(merger, 0, 1);
  merger.connect(L.bus);
  // Isochronic component: the same beat as a smooth pulse, audible without headphones.
  const iso = L.keep(osc(ctx, 'sine', carrier * 2));
  const isoAmp = L.keep(gain(ctx, 0));
  const isoDepth = L.keep(gain(ctx, 0.12 * o.intensity));
  const isoLfo = L.keep(osc(ctx, 'sine', beat));
  isoLfo.connect(isoDepth).connect(isoAmp.gain);
  iso.connect(isoAmp).connect(L.bus);
  isoAmp.gain.value = 0.12 * o.intensity;
  [left, right, iso, isoLfo].forEach((x) => x.start());
  return { stop: L.stop };
}
