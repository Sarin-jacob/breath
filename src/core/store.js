// Preferences live in localStorage; everything stays on this device.
const KEY = 'breath.prefs.v1';
const STATS_KEY = 'breath.stats.v1';

export const DEFAULTS = {
  onboarded: false,
  guidance: 'both', // visual | audio | both
  cues: {
    label: true, // on-screen text
    ring: true, // progress ring
    countdown: false, // seconds shown on screen
    voice: true, // spoken cues
    count: false, // spoken counting
    tone: false, // soft tones at phase changes
    haptic: false, // vibration (Android)
    intro: true, // welcome / closing words
  },
  voice: {
    source: 'auto', // auto | clips | tts | off
    pack: 'aria',
    ttsVoice: '', // SpeechSynthesisVoice.voiceURI
    rate: 0.85,
    pitch: 0.9,
    volume: 0.85,
  },
  toneStyle: 'glide', // glide | bell | soft
  sound: {
    scape: 'drone',
    mode: 'live', // live (generative) | recorded (baked loops, lighter on battery)
    variant: '', // recorded variant id
    layers: {}, // { [scapeId]: { [gen]: boolean } }
    params: {}, // { [scapeId]: { band: 'theta' } }
    volume: 0.7,
    intensity: 0.5,
    brightness: 0.5,
    breathSync: true,
    track: '', // imported track id for "My Music"
  },
  pattern: 'coherent',
  custom: { inhale: 4, hold: 2, exhale: 6, rest: 0 },
  duration: 10, // minutes, 0 = open-ended
  theme: 'aurora',
  hue: null, // null = follow the soundscape's colour
  motion: 'auto', // auto | full | reduced
  background: true,
  wakeLock: true,
};

const clone = (x) => JSON.parse(JSON.stringify(x));

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function safeSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

const listeners = new Set();
export const prefs = merge(clone(DEFAULTS), safeGet(KEY) || {});

/** Update prefs with a mutator or a partial object; persists and notifies. */
export function setPrefs(update) {
  if (typeof update === 'function') update(prefs);
  else Object.assign(prefs, merge(prefs, update));
  safeSet(KEY, prefs);
  listeners.forEach((fn) => fn(prefs));
}

export const onPrefs = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function resetPrefs() {
  for (const k of Object.keys(prefs)) delete prefs[k];
  Object.assign(prefs, clone(DEFAULTS));
  safeSet(KEY, prefs);
  listeners.forEach((fn) => fn(prefs));
}

export function exportPrefs() {
  return JSON.stringify({ prefs, stats: getStats() }, null, 2);
}

export function importPrefs(text) {
  const data = JSON.parse(text);
  if (data.prefs) setPrefs((p) => Object.assign(p, merge(clone(DEFAULTS), data.prefs)));
  if (data.stats) safeSet(STATS_KEY, data.stats);
}

// ---- Stats ----
export function getStats() {
  return safeGet(STATS_KEY) || { sessions: [] };
}

export function logSession(seconds, meta) {
  if (seconds < 30) return;
  const s = getStats();
  s.sessions.push({ at: Date.now(), seconds: Math.round(seconds), ...meta });
  if (s.sessions.length > 1000) s.sessions.splice(0, s.sessions.length - 1000);
  safeSet(STATS_KEY, s);
}

export function summary() {
  const { sessions } = getStats();
  const days = new Set(sessions.map((x) => new Date(x.at).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet keeps yesterday's streak
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const minutes = Math.round(sessions.reduce((a, x) => a + x.seconds, 0) / 60);
  return { count: sessions.length, minutes, streak };
}
