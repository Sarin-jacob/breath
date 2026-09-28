// Spoken guidance. Resolution order: your own recordings → bundled neural-voice clips →
// the device's text-to-speech → (caller falls back to tones).
import { PHRASES } from '../data/phrases.js';
import { assetUrl, decode, voicePack } from './assets.js';
import { audio } from './engine.js';
import { db } from '../core/db.js';

const rotation = {};
const nextVariant = (key, n) => {
  rotation[key] = ((rotation[key] ?? Math.floor(Math.random() * n)) + 1) % n;
  return rotation[key];
};

class Voice {
  buffers = {}; // key → AudioBuffer[]
  packId = null;
  mode = 'off'; // what actually works right now: clips | tts | off
  timers = new Set();

  ttsAvailable() {
    return 'speechSynthesis' in window && speechSynthesis.getVoices().length > 0;
  }

  ttsVoices() {
    if (!('speechSynthesis' in window)) return Promise.resolve([]);
    const list = speechSynthesis.getVoices();
    if (list.length) return Promise.resolve(list);
    return new Promise((res) => {
      const done = () => res(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  /** Load clips for the chosen source. Returns the effective mode. */
  async prepare(v) {
    this.mode = 'off';
    if (v.source === 'off') return this.mode;
    if (v.source === 'auto' || v.source === 'clips' || v.source === 'mine') {
      const ok = await this.loadClips(v.source === 'mine' ? 'mine' : v.pack);
      if (ok) return (this.mode = 'clips');
    }
    if (v.source !== 'clips' && (await this.ttsVoices()).length) return (this.mode = 'tts');
    return this.mode;
  }

  async loadClips(packId) {
    if (this.packId === packId && Object.keys(this.buffers).length) return true;
    await audio.ensure();
    const buffers = {};
    try {
      if (packId === 'mine') {
        const recs = await db.all('recordings');
        if (!recs.length) return false;
        await Promise.all(recs.map(async (r) => {
          const [key] = r.key.split('#');
          (buffers[key] ||= []).push(await audio.ctx.decodeAudioData(await r.blob.arrayBuffer()));
        }));
        // Anything not recorded is filled from the default pack so nothing goes silent.
        const pack = await voicePack('aria');
        if (pack) await this.fill(buffers, pack, true);
      } else {
        const pack = await voicePack(packId);
        if (!pack) return false;
        await this.fill(buffers, pack, false);
      }
    } catch {
      return false; // e.g. offline and not downloaded yet
    }
    if (!buffers.inhale?.length) return false;
    this.buffers = buffers;
    this.packId = packId;
    return true;
  }

  async fill(buffers, pack, onlyMissing) {
    await Promise.all(Object.entries(pack.clips).map(async ([key, files]) => {
      if (onlyMissing && buffers[key]?.length) return;
      buffers[key] = await Promise.all(files.map((f) => decode(audio.ctx, assetUrl(f))));
    }));
  }

  /** Speak `key` at audio-clock `time`. Returns true if something will be heard. */
  say(key, time, v) {
    if (this.mode === 'clips') {
      const list = this.buffers[key];
      if (!list?.length) return false;
      const buf = list[nextVariant(key, list.length)];
      audio.playBuffer(buf, time);
      audio.duck(time, buf.duration);
      return true;
    }
    if (this.mode === 'tts') {
      const texts = PHRASES[key];
      if (!texts) return false;
      const text = texts[nextVariant(key, texts.length)];
      const delay = Math.max(0, (time - audio.now()) * 1000);
      const id = setTimeout(() => {
        this.timers.delete(id);
        const u = new SpeechSynthesisUtterance(text);
        const voice = speechSynthesis.getVoices().find((x) => x.voiceURI === v.ttsVoice);
        if (voice) u.voice = voice;
        u.rate = v.rate;
        u.pitch = v.pitch;
        u.volume = v.volume;
        audio.duck(audio.now(), Math.max(1, text.length / 12));
        speechSynthesis.speak(u);
      }, delay);
      this.timers.add(id);
      return true;
    }
    return false;
  }

  cancel() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}

export const voice = new Voice();
