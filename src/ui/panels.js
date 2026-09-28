// Pickers (sound, pattern, guidance, duration) and the full settings sheet.
import { prefs, setPrefs, exportPrefs, importPrefs, resetPrefs, summary } from '../core/store.js';
import { SOUNDSCAPES, getSoundscape } from '../audio/soundscapes.js';
import { PATTERNS, resolvePattern } from '../data/patterns.js';
import { THEMES } from '../visual/renderer.js';
import { audio } from '../audio/engine.js';
import { voice } from '../audio/voice.js';
import { manifest, packUrls, assetUrl, cachedCount, saveOffline, removeOffline, storageInfo, fmtBytes, persistStorage, decode } from '../audio/assets.js';
import { db } from '../core/db.js';
import { esc, sheet, toggle, slider, segmented, section, bindSliders, actions, icon, toast } from './dom.js';

const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((a, k) => (a[k] ||= {}), o);
  target[last] = v;
}

/** Wire generic inputs (name = pref path) + segmented buttons inside a sheet body. */
function bindForm(body, api, { rerenderOn = [] } = {}) {
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.name || t.dataset.skip != null) return;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.dataset.num != null ? +t.value : t.value;
    setPrefs((p) => setPath(p, t.name, v));
    if (rerenderOn.some((r) => t.name.startsWith(r))) api.rerender();
  });
  // Ranges apply live while dragging.
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.type === 'range' && t.name && t.dataset.skip == null) setPrefs((p) => setPath(p, t.name, +t.value));
  });
}

// ------------------------------------------------------------------ guidance

export const GUIDANCE = [
  { id: 'visual', name: 'Visual', icon: '◉', desc: 'Watch the light grow and shrink. Silent guidance — the sound stays pure ambience.' },
  { id: 'audio', name: 'Audio', icon: '◌', desc: 'Close your eyes. A calm voice (or soft tones) guides each breath; the screen dims.' },
  { id: 'both', name: 'Both', icon: '◎', desc: 'Visual and spoken guidance together. Easiest while you are learning a pattern.' },
];

export function applyGuidance(mode) {
  setPrefs((p) => {
    p.guidance = mode;
    if (mode === 'visual') Object.assign(p.cues, { voice: false, tone: false, label: true, ring: true });
    if (mode === 'audio') Object.assign(p.cues, { voice: true, label: true });
    if (mode === 'both') Object.assign(p.cues, { voice: true, label: true, ring: true });
    if (mode !== 'visual' && p.voice.source === 'off') p.voice.source = 'auto';
  });
}

export function guidanceCards(current, action = 'guidance') {
  return `<div class="grid gap-3">${GUIDANCE.map((g) => `
    <button data-action="${action}" data-id="${g.id}" class="text-left rounded-2xl p-4 transition flex gap-4 items-start ${current === g.id ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
      <span class="text-3xl leading-none w-9 text-center text-accent">${g.icon}</span>
      <span><span class="block font-medium">${g.name}</span><span class="block text-sm text-white/55 mt-1 leading-snug">${g.desc}</span></span>
    </button>`).join('')}</div>`;
}

export function openGuidancePicker() {
  sheet({
    title: 'How to be guided',
    render(body, api) {
      body.innerHTML = guidanceCards(prefs.guidance) + `<p class="text-xs text-white/40 mt-4">Fine-tune every cue (voice, tones, counting, vibration) in Settings.</p>`;
      actions(body, { guidance: (b) => { applyGuidance(b.dataset.id); api.rerender(); } });
    },
  });
}

// ------------------------------------------------------------------ sounds

export function soundCards(selected, { compact = false } = {}) {
  return `<div class="grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}">${SOUNDSCAPES.map((s) => `
    <div class="rounded-2xl p-4 transition relative ${selected === s.id ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/[0.08]'}" style="--accent-h:${s.hue}">
      <button data-action="pick-sound" data-id="${s.id}" class="absolute inset-0 rounded-2xl" aria-label="Choose ${esc(s.name)}"></button>
      <div class="flex items-start gap-3 pointer-events-none">
        <span class="text-2xl leading-none w-8 text-center text-accent mt-0.5">${s.icon}</span>
        <div class="min-w-0 flex-1">
          <div class="font-medium">${esc(s.name)}</div>
          <div class="text-sm text-white/60 mt-1 leading-snug">${esc(s.desc)}</div>
          <div class="text-sm text-white/45 italic font-serif text-[15px] mt-2 leading-snug">${esc(s.feels)}</div>
          <div class="text-[11px] uppercase tracking-wider text-accent/80 mt-2" style="color:hsl(${s.hue} 70% 72% / .8)">${esc(s.suits)}</div>
          ${s.note ? `<div class="text-xs text-amber-200/70 mt-2">⚠ ${esc(s.note)}</div>` : ''}
        </div>
      </div>
      ${s.id !== 'silence' && s.id !== 'mine' ? `<button data-action="preview-sound" data-id="${s.id}" class="relative mt-3 ml-11 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20">${icon.play}<span>Preview</span></button>` : ''}
    </div>`).join('')}</div>`;
}

let previewing = null;
export function previewSound(id, btn) {
  if (previewing === id) {
    audio.stopPreview();
    previewing = null;
    btn?.querySelector('span') && (btn.querySelector('span').textContent = 'Preview');
    return;
  }
  previewing = id;
  document.querySelectorAll('[data-action="preview-sound"] span').forEach((s) => (s.textContent = 'Preview'));
  if (btn) btn.querySelector('span').textContent = 'Playing…';
  audio.ensure().then(() => {
    audio.setVolumes({ music: prefs.sound.volume });
    audio.preview({ ...prefs.sound, scape: id, mode: 'live' }, 10);
  });
  clearTimeout(previewSound.t);
  previewSound.t = setTimeout(() => {
    previewing = null;
    if (btn) btn.querySelector('span').textContent = 'Preview';
  }, 10000);
}

export function openSoundPicker() {
  sheet({
    title: 'Soundscape',
    wide: true,
    onClose: () => { if (previewing) { audio.stopPreview(); previewing = null; } },
    render(body, api) {
      body.innerHTML = `<p class="text-sm text-white/50 mb-4">Every sound is generated live on your device, so it never loops the same way twice. Tap preview to listen.</p>` + soundCards(prefs.sound.scape);
      actions(body, {
        'pick-sound': (b) => {
          setPrefs((p) => (p.sound.scape = b.dataset.id));
          if (b.dataset.id === 'mine') { api.close(); openSettings('music'); return; }
          api.rerender();
        },
        'preview-sound': (b) => previewSound(b.dataset.id, b),
      });
    },
  });
}

// ------------------------------------------------------------------ patterns

export function patternCards(selected) {
  return `<div class="grid gap-2">${PATTERNS.map((p) => {
    const r = resolvePattern(p.id, prefs.custom);
    return `<button data-action="pick-pattern" data-id="${p.id}" class="text-left rounded-2xl p-4 transition ${selected === p.id ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
      <span class="flex items-baseline justify-between gap-3"><span class="font-medium">${esc(p.name)}</span><span class="text-xs tabular-nums text-white/50">${esc(r.tag)}</span></span>
      <span class="block text-sm text-white/55 mt-1 leading-snug">${esc(p.desc)}</span>
    </button>`;
  }).join('')}</div>`;
}

const customSliders = () => `<div class="mt-4 rounded-2xl bg-white/5 p-4">
  ${['inhale', 'hold', 'exhale', 'rest'].map((k) => slider(`custom.${k}`, prefs.custom[k], { min: 0, max: k === 'inhale' || k === 'exhale' ? 12 : 10, step: 0.5, label: { inhale: 'Breathe in', hold: 'Hold (full)', exhale: 'Breathe out', rest: 'Rest (empty)' }[k], fmt: (v) => (v ? v + 's' : 'off') })).join('')}
</div>`;

export function openPatternPicker() {
  sheet({
    title: 'Breathing pattern',
    render(body, api) {
      body.innerHTML = patternCards(prefs.pattern) + (prefs.pattern === 'custom' ? customSliders() : '');
      bindSliders(body, { 'custom.inhale': fmtS, 'custom.hold': fmtS, 'custom.exhale': fmtS, 'custom.rest': fmtS });
      bindForm(body, api);
      actions(body, { 'pick-pattern': (b) => { setPrefs((p) => (p.pattern = b.dataset.id)); api.rerender(); } });
    },
  });
}
const fmtS = (v) => (v ? v + 's' : 'off');

// ------------------------------------------------------------------ duration

export const DURATIONS = [3, 5, 10, 15, 20, 30, 45, 0];
export const fmtDuration = (d) => (d ? `${d} min` : 'Open');

export function openDurationPicker() {
  sheet({
    title: 'Session length',
    render(body, api) {
      body.innerHTML = `<div class="grid grid-cols-4 gap-2">${DURATIONS.map((d) => `
        <button data-action="dur" data-v="${d}" class="rounded-2xl py-4 text-center transition ${prefs.duration === d ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
          <span class="block font-serif text-2xl">${d || '∞'}</span><span class="block text-[11px] text-white/50">${d ? 'min' : 'open'}</span>
        </button>`).join('')}</div>
        <p class="text-xs text-white/40 mt-4">Open sessions continue until you stop them. Timed sessions end with a soft bell.</p>`;
      actions(body, { dur: (b) => { setPrefs((p) => (p.duration = +b.dataset.v)); api.rerender(); setTimeout(api.close, 250); } });
    },
  });
}

// ------------------------------------------------------------------ voice packs

async function voicePackCards() {
  const m = await manifest();
  if (!m.voices.length) return '<p class="text-sm text-white/45">No recorded voice packs are bundled. Device text-to-speech will be used.</p>';
  return `<div class="grid grid-cols-2 gap-2">${m.voices.map((v) => `
    <div class="relative rounded-2xl p-3 transition ${prefs.voice.pack === v.id && prefs.voice.source !== 'tts' && prefs.voice.source !== 'mine' ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
      <button class="absolute inset-0 rounded-2xl" data-action="pick-pack" data-id="${v.id}" aria-label="Use ${esc(v.label)}"></button>
      <div class="font-medium text-sm pointer-events-none">${esc(v.label)}</div>
      <div class="text-xs text-white/50 leading-snug pointer-events-none">${esc(v.desc)}</div>
      <button class="relative mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20" data-action="hear-pack" data-id="${v.id}">${icon.play} Hear</button>
    </div>`).join('')}</div>`;
}

async function hearPack(id) {
  await audio.ensure();
  audio.setVolumes({ voice: prefs.voice.volume });
  const m = await manifest();
  const pack = m.voices.find((v) => v.id === id);
  if (!pack) return;
  try {
    const buf = await decode(audio.ctx, assetUrl(pack.clips.inhale[0]));
    const buf2 = await decode(audio.ctx, assetUrl(pack.clips.exhale[0]));
    const t = audio.now() + 0.05;
    audio.playBuffer(buf, t);
    audio.playBuffer(buf2, t + buf.duration + 1.2);
  } catch {
    toast('This voice is not available offline yet');
  }
}

function hearTts() {
  if (!('speechSynthesis' in window)) return toast('Text-to-speech is not supported here');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Breathe in… and breathe out.');
  const v = speechSynthesis.getVoices().find((x) => x.voiceURI === prefs.voice.ttsVoice);
  if (v) u.voice = v;
  u.rate = prefs.voice.rate;
  u.pitch = prefs.voice.pitch;
  u.volume = prefs.voice.volume;
  speechSynthesis.speak(u);
}

// ------------------------------------------------------------------ my voice (recordings)

const RECORD_KEYS = [
  ['inhale', 'Breathe in'], ['hold', 'Hold'], ['exhale', 'Breathe out'], ['rest', 'Rest'],
  ['inhale2', 'And a little more'], ['welcome', 'Welcome…'], ['begin', 'Let us begin'], ['end', 'Session complete'],
];
let recorder = null;

async function myVoiceSection() {
  const recs = await db.all('recordings').catch(() => []);
  const have = new Set(recs.map((r) => r.key.split('#')[0]));
  return `<p class="text-xs text-white/45 mb-3 leading-relaxed">Record the cues in your own voice — or a loved one’s. Then choose <b>My voice</b> as the voice source. Anything you skip uses the default voice.</p>
    <div class="grid gap-2">${RECORD_KEYS.map(([k, label]) => `
      <div class="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
        <span class="flex-1 text-sm">${esc(label)} ${have.has(k) ? `<span class="text-accent ml-1 inline-block align-middle">${icon.check}</span>` : ''}</span>
        ${have.has(k) ? `<button class="rounded-full p-2 hover:bg-white/10" data-action="rec-play" data-key="${k}" aria-label="Play">${icon.play}</button>
          <button class="rounded-full p-2 hover:bg-white/10 text-white/60" data-action="rec-del" data-key="${k}" aria-label="Delete">${icon.trash}</button>` : ''}
        <button class="rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${recorder?.key === k ? 'bg-red-500/80' : 'bg-white/10 hover:bg-white/20'}" data-action="rec" data-key="${k}">${icon.mic} ${recorder?.key === k ? 'Stop' : have.has(k) ? 'Redo' : 'Record'}</button>
      </div>`).join('')}</div>`;
}

async function toggleRecord(key, rerender) {
  if (recorder) {
    const r = recorder;
    recorder = null;
    r.rec.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      await db.put('recordings', { key: `${key}#0`, blob });
      voice.packId = null; // force reload
      rerender();
    };
    recorder = { key, rec };
    rec.start();
    rerender();
  } catch {
    toast('Microphone permission is needed to record');
  }
}

async function playRecording(key) {
  const r = await db.get('recordings', `${key}#0`);
  if (!r) return;
  await audio.ensure();
  const buf = await audio.ctx.decodeAudioData(await r.blob.arrayBuffer());
  audio.playBuffer(buf, audio.now());
}

// ------------------------------------------------------------------ my music

async function musicSection() {
  const tracks = await db.all('tracks').catch(() => []);
  return `<p class="text-xs text-white/45 mb-3 leading-relaxed">Import audio files from this device. They are stored privately in the browser and work offline. Select <b>My Music</b> as the soundscape to use them.</p>
    <div class="grid gap-2 mb-3">${tracks.map((t) => `
      <div class="flex items-center gap-2 rounded-xl px-3 py-2 ${prefs.sound.track === t.id ? 'bg-accent-soft ring-accent' : 'bg-white/5'}">
        <button class="flex-1 text-left text-sm truncate" data-action="track-pick" data-id="${t.id}">${esc(t.name)} <span class="text-white/40 text-xs">${fmtBytes(t.size)}</span></button>
        <button class="rounded-full p-2 hover:bg-white/10 text-white/60" data-action="track-del" data-id="${t.id}" aria-label="Remove">${icon.trash}</button>
      </div>`).join('') || '<p class="text-sm text-white/40">No tracks yet.</p>'}</div>
    <label class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm bg-white/10 hover:bg-white/20 cursor-pointer">
      ${icon.install} Import audio files<input type="file" accept="audio/*" multiple class="hidden" data-skip data-import-tracks>
    </label>`;
}

// ------------------------------------------------------------------ offline

async function offlineSection() {
  const m = await manifest();
  const packs = await Promise.all(m.voices.map(async (v) => {
    const urls = packUrls(v);
    return { v, urls, have: await cachedCount(urls) };
  }));
  const amb = m.ambience;
  const ambUrls = amb.map((a) => assetUrl(a.file));
  const ambHave = await cachedCount(ambUrls);
  const ambBytes = amb.reduce((s, a) => s + a.bytes, 0);
  const { used, quota } = await storageInfo();
  return `<p class="text-xs text-white/45 mb-3 leading-relaxed">The app, visuals and every generated sound always work offline. Recorded voices and ambience download on first use — or save them now.</p>
    <div class="grid gap-2">
      ${packs.map(({ v, urls, have }) => `
        <div class="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <span class="flex-1 text-sm">${esc(v.label)} voice <span class="text-white/40 text-xs">${fmtBytes(v.bytes)}</span></span>
          ${have >= urls.length ? `<span class="text-xs text-accent inline-flex items-center gap-1">${icon.check} Saved</span>
            <button class="text-xs text-white/40 hover:text-white" data-action="off-remove" data-kind="voice" data-id="${v.id}">Remove</button>`
          : `<button class="rounded-full px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20" data-action="off-save" data-kind="voice" data-id="${v.id}">Save${have ? ` (${have}/${urls.length})` : ''}</button>`}
        </div>`).join('')}
      ${amb.length ? `<div class="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <span class="flex-1 text-sm">Recorded ambience (${amb.length}) <span class="text-white/40 text-xs">${fmtBytes(ambBytes)}</span></span>
          ${ambHave >= amb.length ? `<span class="text-xs text-accent inline-flex items-center gap-1">${icon.check} Saved</span>` : `<button class="rounded-full px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20" data-action="off-save" data-kind="ambience">Save</button>`}
        </div>` : ''}
    </div>
    <div class="flex items-center justify-between mt-3 text-xs text-white/40">
      <span>Using ${fmtBytes(used)}${quota ? ` of ${fmtBytes(quota)}` : ''}</span>
      <button class="rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white" data-action="off-all">Save everything</button>
    </div>`;
}

async function doSave(urls, rerender) {
  await persistStorage();
  try {
    await saveOffline(urls, (d, n) => toast(`Saving for offline… ${d}/${n}`, 1500));
    toast('Saved — available offline');
  } catch (e) {
    toast(navigator.onLine ? `Could not save: ${e.message}` : 'You are offline — connect once to download');
  }
  rerender();
}

// ------------------------------------------------------------------ settings

const TABS = [
  ['guide', 'Guidance'], ['voice', 'Voice'], ['sound', 'Sound'], ['breath', 'Breathing'],
  ['visual', 'Visuals'], ['device', 'Device'], ['music', 'My music'], ['offline', 'Offline'], ['data', 'Data'],
];

export function openSettings(tab = 'guide') {
  let current = tab;
  let voicesCache = null;
  const sheetApi = sheet({
    title: 'Settings',
    wide: true,
    onClose: () => { if (recorder) { recorder.rec.stop(); recorder = null; } },
    render: (b) => { b.innerHTML = '<div class="py-16 text-center text-white/30">…</div>'; },
  });
  const body = sheetApi.body;
  let renderToken;
  async function renderInto() {
    const token = (renderToken = Symbol());
    const content = await renderTab(current);
    if (token !== renderToken) return;
    const top = body.scrollTop;
    body.innerHTML = `
      <nav class="flex gap-1.5 overflow-x-auto scroll-thin -mx-6 px-6 pb-3" style="mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent)">
        ${TABS.map(([id, label]) => `<button data-action="tab" data-id="${id}" class="shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${id === current ? 'bg-white text-black' : 'bg-white/5 text-white/65 hover:text-white'}">${label}</button>`).join('')}
      </nav>
      <div>${content}</div>`;
    body.scrollTop = top;
  }
  sheetApi.rerender = renderInto;
  renderInto();
  bindSliders(body, sliderFmts);
  bindForm(body, sheetApi, { rerenderOn: ['guidance', 'voice.source', 'sound.mode', 'motion', 'hue', 'theme', 'toneStyle', 'sound.params'] });
  actions(body, {
    'set-guidance': (b) => { applyGuidance(b.dataset.id); renderInto(); },
    tab: (b) => { current = b.dataset.id; renderInto().then(() => (body.scrollTop = 0)); },
    seg: (b) => {
      const { name, value } = b.dataset;
      if (name === 'guidance') applyGuidance(value);
      else if (name === 'hue') setPrefs((p) => (p.hue = value === 'custom' ? getSoundscape(p.sound.scape).hue : null));
      else setPrefs((p) => setPath(p, name, value === 'null' ? null : isNaN(+value) || value === '' ? value : +value));
      renderInto();
    },
    'pick-pack': (b) => { setPrefs((p) => { p.voice.pack = b.dataset.id; if (p.voice.source === 'tts' || p.voice.source === 'off' || p.voice.source === 'mine') p.voice.source = 'auto'; }); renderInto(); },
    'hear-pack': (b) => hearPack(b.dataset.id),
    'hear-tts': hearTts,
    'open-sounds': () => openSoundPicker(),
    'open-patterns': () => openPatternPicker(),
    'preview-current': (b) => previewSound(prefs.sound.scape, b),
    'pick-theme': (b) => { setPrefs((p) => (p.theme = b.dataset.id)); renderInto(); },
    rec: (b) => toggleRecord(b.dataset.key, renderInto),
    'rec-play': (b) => playRecording(b.dataset.key),
    'rec-del': async (b) => { await db.del('recordings', `${b.dataset.key}#0`); voice.packId = null; renderInto(); },
    'track-pick': (b) => { setPrefs((p) => { p.sound.track = b.dataset.id; p.sound.scape = 'mine'; }); renderInto(); },
    'track-del': async (b) => { await db.del('tracks', b.dataset.id); if (prefs.sound.track === b.dataset.id) setPrefs((p) => (p.sound.track = '')); renderInto(); },
    'off-save': async (b) => {
      const m = await manifest();
      const urls = b.dataset.kind === 'voice' ? packUrls(m.voices.find((v) => v.id === b.dataset.id)) : m.ambience.map((a) => assetUrl(a.file));
      doSave(urls, renderInto);
    },
    'off-remove': async (b) => { const m = await manifest(); await removeOffline(packUrls(m.voices.find((v) => v.id === b.dataset.id))); renderInto(); },
    'off-all': async () => {
      const m = await manifest();
      doSave([...m.voices.flatMap(packUrls), ...m.ambience.map((a) => assetUrl(a.file))], renderInto);
    },
    export: () => {
      const blob = new Blob([exportPrefs()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `breath-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    reset: () => { if (confirm('Reset all settings to defaults? Your stats are kept.')) { resetPrefs(); setPrefs({ onboarded: true }); renderInto(); toast('Settings reset'); } },
    onboarding: () => { document.dispatchEvent(new Event('breath:onboarding')); },
  });
  body.addEventListener('change', async (e) => {
    if (e.target.matches('[data-import-tracks]')) {
      const files = [...e.target.files];
      for (const f of files) {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await db.put('tracks', { id, name: f.name.replace(/\.[^.]+$/, ''), size: f.size, type: f.type, blob: f });
        if (!prefs.sound.track) setPrefs((p) => (p.sound.track = id));
      }
      toast(`Imported ${files.length} track${files.length === 1 ? '' : 's'}`);
      renderInto();
    }
    if (e.target.matches('[data-import-settings]')) {
      try { importPrefs(await e.target.files[0].text()); toast('Settings imported'); renderInto(); } catch { toast('That file could not be read'); }
    }
  });

  async function renderTab(id) {
    const p = prefs;
    switch (id) {
      case 'guide':
        return section('Guidance mode', guidanceCards(p.guidance, 'set-guidance'))
          + section('On screen', toggle('cues.label', p.cues.label, 'Breath words', '“Breathe in”, “Hold”, “Breathe out”')
            + toggle('cues.ring', p.cues.ring, 'Progress ring', 'A thin ring tracing each phase')
            + toggle('cues.countdown', p.cues.countdown, 'Countdown', 'Seconds left in each phase'))
          + section('Sound cues', toggle('cues.voice', p.cues.voice, 'Spoken guidance', 'A calm voice names each phase')
            + toggle('cues.count', p.cues.count, 'Count out loud', 'Speaks “two, three, four…” during longer phases')
            + toggle('cues.intro', p.cues.intro, 'Welcome & closing words', 'A short settling-in and a gentle return')
            + toggle('cues.tone', p.cues.tone, 'Tones', 'A soft sound at each phase change — works with or instead of the voice')
            + `<div class="pt-2">${segmented('toneStyle', p.toneStyle, [['glide', 'Rising glide'], ['bell', 'Bowl'], ['soft', 'Soft tick']])}</div>`)
          + section('Touch', toggle('cues.haptic', p.cues.haptic, 'Vibration', 'Gentle pulses at each phase (Android). Great with the screen off.'));
      case 'voice': {
        voicesCache ||= await voice.ttsVoices();
        const tts = voicesCache.filter((v) => /^en/i.test(v.lang)).concat(voicesCache.filter((v) => !/^en/i.test(v.lang)));
        return section('Voice source', segmented('voice.source', p.voice.source, [['auto', 'Auto'], ['clips', 'Natural'], ['tts', 'Device'], ['mine', 'My voice'], ['off', 'Off']]),
          '<b>Auto</b> uses the natural recorded voice, then your device’s speech, then soft tones. <b>Device</b> uses your system text-to-speech.')
          + (p.voice.source !== 'tts' && p.voice.source !== 'mine' ? section('Natural voices', await voicePackCards()) : '')
          + (p.voice.source === 'tts' || p.voice.source === 'auto' ? section('Device voice', `
              <div class="flex gap-2 items-center"><select name="voice.ttsVoice" class="flex-1 min-w-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm">
                <option value="">System default</option>
                ${tts.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === p.voice.ttsVoice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})${v.localService ? '' : ' · online'}</option>`).join('')}
              </select><button class="rounded-full p-2.5 bg-white/10 hover:bg-white/20" data-action="hear-tts" aria-label="Hear">${icon.play}</button></div>
              ${slider('voice.rate', p.voice.rate, { min: 0.5, max: 1.3, step: 0.05, label: 'Speed', fmt: (v) => v.toFixed(2) + '×' })}
              ${slider('voice.pitch', p.voice.pitch, { min: 0.5, max: 1.5, step: 0.05, label: 'Pitch', fmt: (v) => v.toFixed(2) })}`,
              tts.length ? 'Voices marked “online” need a connection.' : 'No device voices found — natural voice or tones will be used.') : '')
          + (p.voice.source === 'mine' ? section('My voice', await myVoiceSection()) : '')
          + section('Volume', slider('voice.volume', p.voice.volume, { label: 'Voice volume' }));
      }
      case 'sound': {
        const s = getSoundscape(p.sound.scape);
        const m = await manifest();
        const variants = m.ambience.filter((a) => a.soundscape === s.id);
        const layerState = p.sound.layers[s.id] || {};
        return section('Soundscape', `
            <div class="flex items-center gap-3 rounded-2xl bg-white/5 p-4" style="--accent-h:${s.hue}">
              <span class="text-2xl text-accent w-8 text-center">${s.icon}</span>
              <span class="flex-1 min-w-0"><span class="block font-medium">${esc(s.name)}</span><span class="block text-xs text-white/50 truncate">${esc(s.desc)}</span></span>
              ${s.layers.length ? `<button class="rounded-full px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 inline-flex items-center gap-1" data-action="preview-current">${icon.play}<span>Preview</span></button>` : ''}
              <button class="rounded-full px-3 py-1.5 text-xs bg-white text-black" data-action="open-sounds">Change</button>
            </div>`)
          + (s.layers.length > 1 ? section('Layers', s.layers.map((l) => toggle(`sound.layers.${s.id}.${l.gen}`, layerState[l.gen] ?? l.on, l.label)).join(''), 'Mix and match — toggles apply live.') : '')
          + (s.params ? section('Character', Object.entries(s.params).map(([k, opts]) => segmented(`sound.params.${s.id}.${k}`, p.sound.params[s.id]?.[k] ?? opts[0], opts.map((o) => [o, o[0].toUpperCase() + o.slice(1)]))).join('')
              + (s.id === 'brainwave' ? '<p class="text-xs text-white/45 mt-2">Delta ≈ deep sleep · Theta ≈ dreamy trance · Alpha ≈ relaxed focus</p>' : '')) : '')
          + section('Mix', slider('sound.volume', p.sound.volume, { label: 'Volume' })
            + slider('sound.intensity', p.sound.intensity, { label: 'Intensity', fmt: (v) => (v < 0.34 ? 'Gentle' : v < 0.67 ? 'Medium' : 'Rich') })
            + slider('sound.brightness', p.sound.brightness, { label: 'Tone', fmt: (v) => (v < 0.34 ? 'Dark' : v < 0.67 ? 'Warm' : 'Bright') })
            + toggle('sound.breathSync', p.sound.breathSync, 'Breathe with the music', 'Waves, chants and filters swell with your in-breath'))
          + (variants.length ? section('Playback', segmented('sound.mode', p.sound.mode, [['live', 'Live generative'], ['recorded', 'Recorded loop']])
              + (p.sound.mode === 'recorded' ? `<select name="sound.variant" class="mt-3 w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm">${variants.map((v) => `<option value="${v.id}" ${v.id === p.sound.variant ? 'selected' : ''}>${esc(v.label)} · ${Math.round(v.duration)}s</option>`).join('')}</select>` : ''),
              'Recorded loops use less battery and play more reliably with the screen off; live sound is endless and follows your breath.') : '');
      }
      case 'breath':
        return section('Pattern', `<div class="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
            <span class="flex-1"><span class="block font-medium">${esc(resolvePattern(p.pattern, p.custom).name)}</span><span class="block text-xs text-white/50">${esc(resolvePattern(p.pattern, p.custom).tag)}</span></span>
            <button class="rounded-full px-3 py-1.5 text-xs bg-white text-black" data-action="open-patterns">Change</button></div>`)
          + section('Custom pattern', customSliders().replace('mt-4 ', ''), 'Used when the pattern is set to Custom.')
          + section('Session length', segmented('duration', p.duration, DURATIONS.map((d) => [d, d ? String(d) : '∞'])) + '<p class="text-xs text-white/40 mt-2">Minutes. ∞ keeps going until you stop.</p>');
      case 'visual':
        return section('Scene', `<div class="grid grid-cols-2 gap-2">${THEMES.map((t) => `
            <button data-action="pick-theme" data-id="${t.id}" class="text-left rounded-2xl p-3 transition ${p.theme === t.id ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
              <span class="block text-sm font-medium">${esc(t.name)}</span><span class="block text-xs text-white/50 leading-snug mt-0.5">${esc(t.desc)}</span></button>`).join('')}</div>`)
          + section('Colour', segmented('hue', p.hue == null ? 'null' : 'custom', [['null', 'Follow the sound'], ['custom', 'Choose']])
            + (p.hue != null ? `<div class="mt-3">${slider('hue', p.hue, { min: 0, max: 359, step: 1, label: 'Hue', fmt: (v) => `${v}°` })}</div>` : ''))
          + section('Motion', segmented('motion', p.motion, [['auto', 'System'], ['full', 'Full'], ['reduced', 'Reduced']]), 'Reduced slows everything down. Nothing ever flashes.');
      case 'device':
        return section('Background', toggle('background', p.background, 'Keep playing in the background', 'Continues with the screen off or in another app, with lock-screen controls.')
            + toggle('wakeLock', p.wakeLock, 'Keep the screen awake', 'While a session is running'),
            /iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone/iPad, background audio is limited by iOS. Add Breath to your Home Screen and use “Recorded loop” playback for the most reliable results.' : '')
          + section('Install', '<p class="text-sm text-white/55">Install Breath as an app from your browser menu (“Install app” or “Add to Home Screen”). It then opens full-screen and works with no connection.</p>');
      case 'music':
        return section('My music', await musicSection());
      case 'offline':
        return section('Offline', await offlineSection());
      case 'data': {
        const st = summary();
        return section('Your practice', `<div class="grid grid-cols-3 gap-2 text-center">
            ${[['Sessions', st.count], ['Minutes', st.minutes], ['Day streak', st.streak]].map(([l, v]) => `<div class="rounded-2xl bg-white/5 py-4"><div class="font-serif text-3xl">${v}</div><div class="text-[11px] uppercase tracking-wider text-white/45">${l}</div></div>`).join('')}
          </div>`)
          + section('Backup', `<div class="flex flex-wrap gap-2">
              <button class="rounded-full px-4 py-2 text-sm bg-white/10 hover:bg-white/20" data-action="export">Export settings</button>
              <label class="rounded-full px-4 py-2 text-sm bg-white/10 hover:bg-white/20 cursor-pointer">Import<input type="file" accept="application/json" class="hidden" data-skip data-import-settings></label>
              <button class="rounded-full px-4 py-2 text-sm bg-white/10 hover:bg-white/20" data-action="onboarding">Replay intro</button>
              <button class="rounded-full px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-red-200" data-action="reset">Reset</button>
            </div>`, 'Everything is stored only on this device.')
          + section('Care', '<p class="text-sm text-white/55 leading-relaxed">Breathe gently and never strain. If you feel dizzy, return to normal breathing. Don’t use breathwork or brainwave audio while driving or in water. If you are pregnant or have a heart, lung or seizure condition, choose soft patterns and check with your doctor.</p>');
      }
    }
    return '';
  }
}

const sliderFmts = {
  'sound.volume': (v) => Math.round(v * 100) + '%',
  'voice.volume': (v) => Math.round(v * 100) + '%',
  'sound.intensity': (v) => (v < 0.34 ? 'Gentle' : v < 0.67 ? 'Medium' : 'Rich'),
  'sound.brightness': (v) => (v < 0.34 ? 'Dark' : v < 0.67 ? 'Warm' : 'Bright'),
  'voice.rate': (v) => v.toFixed(2) + '×',
  'voice.pitch': (v) => v.toFixed(2),
  'custom.inhale': fmtS, 'custom.hold': fmtS, 'custom.exhale': fmtS, 'custom.rest': fmtS,
  hue: (v) => `${v}°`,
};
