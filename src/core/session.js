// A running meditation: ties the breath engine to audio, voice, tones, haptics,
// media-session controls, wake lock and stats.
import { BreathEngine } from './breath-engine.js';
import { resolvePattern } from '../data/patterns.js';
import { NUMBER_KEYS } from '../data/phrases.js';
import { audio } from '../audio/engine.js';
import { voice } from '../audio/voice.js';
import { getSoundscape } from '../audio/soundscapes.js';
import { logSession } from './store.js';

const LOOKAHEAD = 6; // seconds of cues scheduled ahead (survives background timer throttling)
const HAPTIC = { inhale: [40, 60, 40], inhale2: [30], hold: [15], exhale: [120], rest: [10] };

export class Session extends EventTarget {
  constructor(prefs) {
    super();
    this.prefs = prefs;
    this.pattern = resolvePattern(prefs.pattern, prefs.custom);
    this.timers = new Set();
    this.ended = false;
  }

  async start() {
    const p = this.prefs;
    const hasAudio = await audio.ensure({ background: p.background });
    audio.setVolumes({ music: p.sound.volume, voice: p.voice.volume, cues: 0.5 });
    const wantsVoice = p.cues.voice && p.guidance !== 'visual';
    this.voiceMode = wantsVoice ? await voice.prepare(p.voice) : 'off';
    // Voice requested but nothing can speak → soft tones instead, so audio guidance never goes silent.
    this.toneFallback = wantsVoice && this.voiceMode === 'off';

    const intro = p.cues.intro && this.voiceMode !== 'off';
    audio.owner = this;
    const lead = intro ? 7.5 : 2.5;
    const now = audio.now();
    this.engine = new BreathEngine(this.pattern, now + lead);
    this.startedAt = now;
    this.endAt = p.duration > 0 ? now + lead + p.duration * 60 : Infinity;
    this.scheduledUntil = now;

    if (hasAudio) await audio.playScape(p.sound, { synced: this.pattern.phases.length > 0 });
    if (intro) {
      voice.say('welcome', now + 0.8, p.voice);
      voice.say('begin', now + lead - 2, p.voice);
    }
    if (this.pattern.phases.length) this.settleAt = now + lead + 75;

    this.pump = this.pump.bind(this);
    this.interval = setInterval(this.pump, 250);
    this.pump();
    this.setupMediaSession();
    this.acquireWakeLock();
    this.onVis = () => { if (document.visibilityState === 'visible') this.acquireWakeLock(); };
    document.addEventListener('visibilitychange', this.onVis);
  }

  now() { return audio.now(); }
  state() { return this.engine.stateAt(this.now()); }
  get paused() { return !!this.engine?.paused; }

  remaining() {
    if (this.endAt === Infinity) return Infinity;
    return Math.max(0, this.endAt - this.now());
  }

  pump() {
    if (this.ended || this.paused) return;
    const now = this.now();
    const until = Math.min(now + LOOKAHEAD, this.endAt);
    const p = this.prefs;
    for (const ev of this.engine.eventsBetween(this.scheduledUntil, until)) {
      audio.breath(ev);
      this.cue(ev);
    }
    // One gentle reminder a little way in, when the mind tends to wander.
    if (this.settleAt && now + LOOKAHEAD > this.settleAt && this.voiceMode !== 'off' && p.cues.intro) {
      const ev = this.engine.eventsBetween(this.settleAt, this.settleAt + 30).find((e) => e.kind === 'exhale' && e.dur >= 4);
      if (ev) voice.say('settle', ev.time + 1.6, p.voice);
      this.settleAt = null;
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, until);
    if (now >= this.endAt) this.finish(true);
  }

  cue(ev) {
    const p = this.prefs;
    const audible = p.guidance !== 'visual';
    let spoke = false;
    if (audible && this.voiceMode !== 'off') {
      spoke = voice.say(ev.kind, ev.time, p.voice);
      if (p.cues.count && ev.dur >= 3) {
        for (let k = 2; k <= Math.min(10, Math.floor(ev.dur)); k++) voice.say(NUMBER_KEYS[k - 1], ev.time + k - 1, p.voice);
      }
    }
    if (audible && (p.cues.tone || (this.toneFallback && !spoke))) audio.tone(ev.kind, ev.time, ev.dur, p.toneStyle);
    if (p.cues.haptic && navigator.vibrate) {
      this.later(ev.time, () => navigator.vibrate(HAPTIC[ev.kind] || [20]));
    }
    this.dispatchEvent(new CustomEvent('phase', { detail: ev }));
  }

  later(time, fn) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, Math.max(0, (time - this.now()) * 1000));
    this.timers.add(id);
  }

  clearScheduled() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    voice.cancel();
  }

  pause() {
    if (this.paused || this.ended) return;
    this.engine.pause(this.now());
    this.clearScheduled();
    audio.suspend();
    this.pausedWall = performance.now();
    if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
    this.dispatchEvent(new Event('change'));
  }

  async resume() {
    if (!this.paused || this.ended) return;
    await audio.ensure();
    const now = this.now();
    // The audio clock stands still while suspended, so any drift here is tiny; shift the end with it.
    const drift = now - this.engine.pausedAt;
    this.engine.resume(now);
    this.endAt += drift;
    if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
    this.pump();
    this.dispatchEvent(new Event('change'));
  }

  toggle() { this.paused ? this.resume() : this.pause(); }

  /** End the session. natural = timer ran out (plays closing words + bell). */
  async finish(natural = false) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.interval);
    this.clearScheduled();
    const now = this.now();
    const elapsed = this.engine.elapsed(now);
    if (natural) {
      if (this.voiceMode !== 'off' && this.prefs.cues.intro) voice.say('end', now + 0.6, this.prefs.voice);
      audio.bell(now + 0.2);
      audio.stopScape(9);
    } else {
      audio.stopScape(2.5);
    }
    logSession(elapsed, { pattern: this.pattern.id, scape: this.prefs.sound.scape });
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVis);
    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none';
      for (const a of ['play', 'pause', 'stop']) try { navigator.mediaSession.setActionHandler(a, null); } catch {}
    }
    // Let the closing bell ring out, then release the audio device unless a new session started.
    setTimeout(() => { if (audio.owner === this) audio.suspend(); }, 12000);
    this.dispatchEvent(new CustomEvent('end', { detail: { elapsed, natural } }));
  }

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const scape = getSoundscape(this.prefs.sound.scape);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${this.pattern.name} breathing`,
      artist: scape.name,
      album: 'Breath',
      artwork: [
        { src: new URL('icons/icon-192.png', document.baseURI).href, sizes: '192x192', type: 'image/png' },
        { src: new URL('icons/icon-512.png', document.baseURI).href, sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = 'playing';
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} };
    set('play', () => this.resume());
    set('pause', () => this.pause());
    set('stop', () => this.finish(false));
  }

  async acquireWakeLock() {
    if (!this.prefs.wakeLock || !('wakeLock' in navigator) || this.ended) return;
    try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }

  releaseWakeLock() {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}
