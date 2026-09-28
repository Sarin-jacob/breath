// Neural TTS → MP3 clips, used by both `npm run voices` and the /dev tool.
// Runs only on the developer machine; the shipped app just plays the saved files.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PHRASES } from '../../src/data/phrases.js';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');
const VOICES_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

export async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  } catch {
    return { version: 1, voices: [], ambience: [] };
  }
}

export async function writeManifest(m) {
  m.voices.sort((a, b) => a.label.localeCompare(b.label));
  m.ambience.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  await fs.writeFile(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  return m;
}

export async function listEdgeVoices() {
  const res = await fetch(VOICES_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`voice list HTTP ${res.status}`);
  return res.json();
}

const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

/** Synthesize one utterance, returning an MP3 Buffer. */
export async function synth(text, { voice, rate = '-20%', pitch = '0%' }) {
  const tts = new MsEdgeTTS();
  try {
    await withTimeout(tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3), 15000, 'connect');
    const { audioStream } = tts.toStream(escapeXml(text), { rate, pitch });
    const chunks = [];
    await withTimeout(
      (async () => { for await (const c of audioStream) chunks.push(c); })(),
      30000,
      'synthesis',
    );
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('empty audio');
    return buf;
  } finally {
    tts.close();
  }
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

/**
 * Generate a full voice pack (every phrase × every variant) and register it in the manifest.
 * preset: { id, label, desc, voice, rate, pitch }
 */
export async function generateVoicePack(preset, { onProgress = () => {}, phrases = PHRASES } = {}) {
  const id = preset.id.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  if (!id) throw new Error('invalid pack id');
  const dir = path.join(AUDIO_DIR, 'voice', id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const jobs = Object.entries(phrases).flatMap(([key, texts]) => texts.map((text, i) => ({ key, i, text })));
  const clips = {};
  let bytes = 0;
  let done = 0;
  // Small concurrency keeps the service happy.
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      let buf;
      for (let attempt = 0; ; attempt++) {
        try {
          buf = await synth(job.text, preset);
          break;
        } catch (e) {
          if (attempt >= 2) throw new Error(`"${job.text}": ${e.message}`);
        }
      }
      const file = `${job.key}-${job.i}.mp3`;
      await fs.writeFile(path.join(dir, file), buf);
      (clips[job.key] ||= [])[job.i] = `voice/${id}/${file}`;
      bytes += buf.length;
      onProgress(++done, jobs.length, job);
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const entry = {
    id,
    label: preset.label || id,
    desc: preset.desc || '',
    voice: preset.voice,
    rate: preset.rate,
    pitch: preset.pitch,
    bytes,
    clips,
  };
  const m = await readManifest();
  m.voices = m.voices.filter((v) => v.id !== id).concat(entry);
  await writeManifest(m);
  return entry;
}

export async function removeAsset(kind, id) {
  const m = await readManifest();
  if (kind === 'voice') {
    m.voices = m.voices.filter((v) => v.id !== id);
    await fs.rm(path.join(AUDIO_DIR, 'voice', id), { recursive: true, force: true });
  } else {
    const entry = m.ambience.find((a) => a.id === id);
    m.ambience = m.ambience.filter((a) => a.id !== id);
    if (entry) await fs.rm(path.join(AUDIO_DIR, entry.file), { force: true });
  }
  return writeManifest(m);
}

export async function saveAmbience({ id, soundscape, label, duration }, mp3) {
  id = id.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  if (!id) throw new Error('invalid ambience id');
  const file = `ambience/${id}.mp3`;
  await fs.mkdir(path.join(AUDIO_DIR, 'ambience'), { recursive: true });
  await fs.writeFile(path.join(AUDIO_DIR, file), mp3);
  const m = await readManifest();
  const entry = { id, soundscape, label, duration: Number(duration), bytes: mp3.length, file };
  m.ambience = m.ambience.filter((a) => a.id !== id).concat(entry);
  await writeManifest(m);
  return entry;
}
