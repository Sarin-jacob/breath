// Audio graph, soundscape playback, cue tones and background-play plumbing.
import { GENERATORS, getSoundscape } from './soundscapes.js';
import { createClock, gain, osc, reverbIR, rng, filter } from './synth/util.js';
import { strikeBowl } from './synth/tonal.js';
import { assetUrl, decode, manifest } from './assets.js';
import { db } from '../core/db.js';

/**
 * Build a soundscape's layers into `out`. Used live and by the dev studio's offline recorder.
 * opts: { scapeId, layersOn, params, intensity, brightness, synced, clock, seed }
 */
export function buildScape(ctx, out, opts) {
  const scape = getSoundscape(opts.scapeId);
  const wet = gain(ctx, 0.9);
  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx, 6, 2.4);
  const wetOut = gain(ctx, 0.55);
  wet.connect(conv).connect(wetOut).connect(out);
  const r = rng(opts.seed);
  const layers = scape.layers
    .filter((l) => (opts.layersOn?.[l.gen] ?? l.on))
    .map((l) =>
      GENERATORS[l.gen](ctx, {
        out,
        wet,
        clock: opts.clock,
        rng: r,
        level: l.level,
        intensity: opts.intensity,
        brightness: opts.brightness,
        synced: opts.synced,
        params: { ...l.params, ...opts.params },
      }),
    );
  return {
    breath: (ev) => layers.forEach((l) => l.breath?.(ev)),
    stop(fade = 2) {
      layers.forEach((l) => l.stop(fade));
      setTimeout(() => { try { wetOut.disconnect(); wet.disconnect(); } catch {} }, fade * 1000 + 6000);
    },
  };
}

/** Plays an AudioBuffer as an endless loop with overlapping equal-power crossfades. */
function loopPlayer(ctx, out, buffer, clock, xfade = 3) {
  const bus = gain(ctx, 0);
  bus.connect(out);
  bus.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  const len = buffer.duration;
  xfade = Math.min(xfade, len / 3);
  const sources = new Set();
  let first = true;
  const cancel = clock.every((t) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = gain(ctx, 0);
    const n = 32;
    const fadeIn = new Float32Array(n).map((_, i) => Math.sin(((i / (n - 1)) * Math.PI) / 2));
    const fadeOut = new Float32Array(n).map((_, i) => Math.cos(((i / (n - 1)) * Math.PI) / 2));
    if (first) g.gain.setValueAtTime(1, t);
    else g.gain.setValueCurveAtTime(fadeIn, t, xfade);
    g.gain.setValueCurveAtTime(fadeOut, t + len - xfade, xfade);
    src.connect(g).connect(bus);
    src.start(t);
    src.stop(t + len);
    sources.add(src);
    src.onended = () => { sources.delete(src); g.disconnect(); };
    first = false;
    return len - xfade;
  });
  return {
    breath() {},
    stop(fade = 2) {
      cancel();
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
      setTimeout(() => { sources.forEach((s) => { try { s.stop(); } catch {} }); bus.disconnect(); }, fade * 1000 + 200);
    },
  };
}

class AudioEngine {
  ctx = null;
  scape = null;
  mediaEl = null;
  background = false;

  get ready() { return !!this.ctx; }
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  /** Must be called from a user gesture the first time. */
  async ensure({ background = this.background } = {}) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      // iOS 16.4+: play even with the silent switch on and keep going when locked.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      this.ctx = new AC({ latencyHint: 'playback' });
      const c = this.ctx;
      this.clock = createClock(c, { lookahead: 4 });
      this.master = gain(c, 1);
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 8;
      this.limiter.ratio.value = 6;
      this.limiter.attack.value = 0.01;
      this.limiter.release.value = 0.3;
      this.master.connect(this.limiter);
      this.music = gain(c, 0.7);
      this.duckGain = gain(c, 1);
      this.cues = gain(c, 0.5);
      this.voice = gain(c, 0.85);
      this.music.connect(this.duckGain).connect(this.master);
      this.cues.connect(this.master);
      this.voice.connect(this.master);
      this.setBackground(background);
    }
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch {}
    }
    this.mediaEl?.play().catch(() => {});
    return true;
  }

  /**
   * Background mode routes the graph through a media element. That gives the OS a real "media
   * session" (lock-screen controls) and keeps audio alive with the screen off on most devices.
   */
  setBackground(on) {
    this.background = on;
    if (!this.ctx) return;
    try { this.limiter.disconnect(); } catch {}
    if (on && this.ctx.createMediaStreamDestination) {
      this.streamDest ||= this.ctx.createMediaStreamDestination();
      if (!this.mediaEl) {
        this.mediaEl = document.createElement('audio');
        this.mediaEl.setAttribute('playsinline', '');
        this.mediaEl.srcObject = this.streamDest.stream;
      }
      this.limiter.connect(this.streamDest);
      this.mediaEl.play().catch(() => {
        // Autoplay refused: fall back to direct output.
        try { this.limiter.disconnect(); } catch {}
        this.limiter.connect(this.ctx.destination);
      });
    } else {
      this.mediaEl?.pause();
      this.limiter.connect(this.ctx.destination);
    }
  }

  setVolumes({ music, voice, cues }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (music != null) this.music.gain.setTargetAtTime(music, t, 0.1);
    if (voice != null) this.voice.gain.setTargetAtTime(voice, t, 0.1);
    if (cues != null) this.cues.gain.setTargetAtTime(cues, t, 0.1);
  }

  async suspend() {
    this.mediaEl?.pause();
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  /** Start (or switch to) a soundscape. s = prefs.sound; synced = pattern paces the breath. */
  async playScape(s, { synced = true } = {}) {
    await this.ensure();
    this.stopScape(2.5);
    const scape = getSoundscape(s.scape);
    const token = (this.token = Symbol());
    if (scape.id === 'silence') return;
    if (scape.id === 'mine') {
      const track = s.track ? await db.get('tracks', s.track) : (await db.all('tracks'))[0];
      if (!track || token !== this.token) return;
      const buf = await this.ctx.decodeAudioData(await track.blob.arrayBuffer());
      if (token !== this.token) return;
      this.scape = loopPlayer(this.ctx, this.music, buf, this.clock, 4);
      return;
    }
    if (s.mode === 'recorded') {
      const m = await manifest();
      const options = m.ambience.filter((a) => a.soundscape === scape.id);
      const pick = options.find((a) => a.id === s.variant) || options[0];
      if (pick) {
        try {
          const buf = await decode(this.ctx, assetUrl(pick.file));
          if (token !== this.token) return;
          this.scape = loopPlayer(this.ctx, this.music, buf, this.clock, 3);
          return;
        } catch { /* not downloaded / offline → fall through to live synthesis */ }
      }
    }
    this.scape = buildScape(this.ctx, this.music, {
      scapeId: scape.id,
      layersOn: s.layers[scape.id],
      params: s.params[scape.id],
      intensity: s.intensity,
      brightness: s.brightness,
      synced: synced && s.breathSync,
      clock: this.clock,
    });
  }

  stopScape(fade = 2) {
    this.token = null;
    this.scape?.stop(fade);
    this.scape = null;
  }

  breath(ev) {
    this.scape?.breath(ev);
  }

  /** Short, non-intrusive preview of a soundscape (onboarding / settings). */
  async preview(s, seconds = 8) {
    await this.playScape(s, { synced: false });
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.stopScape(2), seconds * 1000);
  }

  stopPreview() {
    clearTimeout(this.previewTimer);
    this.stopScape(1);
  }

  /** Dip the music under speech. */
  duck(time, dur) {
    const g = this.duckGain.gain;
    g.setTargetAtTime(0.55, time - 0.05, 0.08);
    g.setTargetAtTime(1, time + dur, 0.4);
  }

  playBuffer(buffer, time, bus = this.voice) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(bus);
    src.start(Math.max(time, this.ctx.currentTime));
    return src;
  }

  /** Phase-change tone. style: glide | bell | soft */
  tone(kind, time, dur, style = 'glide') {
    const c = this.ctx;
    if (!c) return;
    const t = Math.max(time, c.currentTime);
    const up = kind === 'inhale' || kind === 'inhale2';
    const down = kind === 'exhale';
    if (style === 'bell') {
      const f = { inhale: 392, inhale2: 440, hold: 330, exhale: 262, rest: 196 }[kind] || 262;
      strikeBowl(c, this.cues, t, f, 0.5, 0.35);
      return;
    }
    const g = gain(c, 0);
    const lp = filter(c, 'lowpass', 1400);
    g.connect(lp).connect(this.cues);
    if (style === 'soft') {
      const x = osc(c, 'sine', up ? 660 : down ? 440 : 550);
      x.connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      x.start(t); x.stop(t + 0.4);
      return;
    }
    // Glide: a soft tone that rises through the in-breath and falls through the out-breath.
    const len = Math.min(dur * 0.9, up || down ? 3 : 0.8);
    const [f1, f2] = up ? [196, 294] : down ? [294, 196] : kind === 'hold' ? [262, 262] : [147, 147];
    for (const [type, mul, amp] of [['sine', 1, 0.22], ['triangle', 2, 0.04]]) {
      const x = osc(c, type, f1 * mul);
      x.frequency.setValueAtTime(f1 * mul, t);
      x.frequency.exponentialRampToValueAtTime(f2 * mul, t + len);
      const xg = gain(c, amp);
      x.connect(xg).connect(g);
      x.start(t); x.stop(t + len + 0.6);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + Math.min(0.4, len / 3));
    g.gain.setTargetAtTime(0, t + len * 0.7, len / 5);
  }

  bell(time, vel = 0.9) {
    if (!this.ctx) return;
    strikeBowl(this.ctx, this.cues, Math.max(time, this.ctx.currentTime), 277.2, vel, 1.2);
  }
}

export const audio = new AudioEngine();
