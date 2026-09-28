// Breath Studio — dev-only tool (npm run dev → /dev/).
//  • Voices: generate cue packs with neural text-to-speech, audition every clip, add custom voices.
//  • Ambience: audition generative soundscapes, render seamless recorded loop variants to MP3.
// Saved files land in public/audio and are listed in public/audio/manifest.json.
import '../src/style.css';
import { Mp3Encoder } from '@breezystack/lamejs';
import { SOUNDSCAPES, getSoundscape } from '../src/audio/soundscapes.js';
import { buildScape } from '../src/audio/engine.js';
import { createClock } from '../src/audio/synth/util.js';
import { PHRASES } from '../src/data/phrases.js';
import { VOICE_PRESETS } from '../src/data/voice-presets.js';
import { esc, fmtBytes } from './helpers.js';

const root = document.getElementById('studio');
const api = async (path, opts = {}) => {
  const r = await fetch(`/__dev/${path}`, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.blob();
};

let tab = 'voices';
let man = { voices: [], ambience: [] };
let edgeVoices = null;
let busy = '';
const player = new Audio();

const state = {
  scape: 'drone',
  layers: {},
  params: {},
  intensity: 0.5,
  brightness: 0.5,
  duration: 60,
  seed: 1,
  label: '',
  rendered: null, // { blob, url, meta }
  custom: { id: '', label: '', desc: '', voice: 'en-US-AvaNeural', rate: '-22%', pitch: '-4%' },
  sample: 'Breathe in… and breathe out.',
};

async function refresh() {
  man = await api('manifest');
  render();
}

function btn(action, label, extra = '', cls = 'bg-white/10 hover:bg-white/20') {
  return `<button data-a="${action}" ${extra} class="rounded-full px-3.5 py-1.5 text-sm ${cls} disabled:opacity-40" ${busy ? 'disabled' : ''}>${label}</button>`;
}

function render() {
  root.innerHTML = `
    <header class="flex items-end justify-between mb-8">
      <div><h1 class="font-serif text-5xl font-light">Breath Studio</h1>
        <p class="text-white/50 text-sm mt-1">Dev-only. Generates the bundled audio in <code>public/audio</code>.</p></div>
      <a href="/" class="text-sm text-white/60 hover:text-white">Open app →</a>
    </header>
    <nav class="flex gap-2 mb-6">
      ${[['voices', 'Voice packs'], ['ambience', 'Recorded ambience']].map(([id, l]) => `<button data-a="tab" data-id="${id}" class="rounded-full px-4 py-2 text-sm ${tab === id ? 'bg-white text-black' : 'bg-white/10'}">${l}</button>`).join('')}
    </nav>
    ${busy ? `<div class="glass rounded-2xl px-4 py-3 mb-6 text-sm">⏳ ${esc(busy)}</div>` : ''}
    ${tab === 'voices' ? voicesView() : ambienceView()}`;
}

// ------------------------------------------------------------------ voices

function voicesView() {
  const installed = new Set(man.voices.map((v) => v.id));
  const c = state.custom;
  const enVoices = (edgeVoices || []).filter((v) => v.Locale.startsWith('en-'));
  return `
  <section class="glass rounded-3xl p-6 mb-6">
    <h2 class="text-lg mb-1">Installed packs</h2>
    <p class="text-xs text-white/45 mb-4">Each pack = ${Object.values(PHRASES).flat().length} clips (${Object.keys(PHRASES).length} cues, several phrasings each; the app rotates variants).</p>
    <div class="grid gap-3">
      ${man.voices.map((v) => `<details class="rounded-2xl bg-white/5 p-4">
        <summary class="flex items-center gap-3 cursor-pointer">
          <span class="flex-1"><b>${esc(v.label)}</b> <span class="text-white/45 text-sm">${esc(v.voice)} · rate ${esc(v.rate)} · pitch ${esc(v.pitch)} · ${fmtBytes(v.bytes)}</span></span>
          ${btn('regen', 'Regenerate', `data-id="${v.id}"`)} ${btn('del-voice', 'Delete', `data-id="${v.id}"`, 'bg-red-500/20 hover:bg-red-500/40')}
        </summary>
        <div class="grid sm:grid-cols-2 gap-1 mt-3">
          ${Object.entries(v.clips).flatMap(([k, files]) => files.map((f, i) => `
            <button data-a="play" data-src="/audio/${f}" class="text-left text-sm rounded-lg px-3 py-1.5 hover:bg-white/10">▶ <span class="text-white/45">${k}</span> ${esc(PHRASES[k]?.[i] || '')}</button>`)).join('')}
        </div></details>`).join('') || '<p class="text-white/40 text-sm">None yet.</p>'}
    </div>
  </section>
  <section class="glass rounded-3xl p-6 mb-6">
    <h2 class="text-lg mb-3">Presets</h2>
    <div class="grid sm:grid-cols-2 gap-2">
      ${VOICE_PRESETS.map((p) => `<div class="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
        <span class="flex-1"><b>${esc(p.label)}</b> <span class="text-xs text-white/45">${esc(p.desc)}</span></span>
        ${btn('try', 'Try', `data-voice="${p.voice}" data-rate="${p.rate}" data-pitch="${p.pitch}"`)}
        ${btn('gen-preset', installed.has(p.id) ? 'Rebuild' : 'Generate', `data-id="${p.id}"`, installed.has(p.id) ? 'bg-white/10' : 'bg-white text-black')}
      </div>`).join('')}
    </div>
  </section>
  <section class="glass rounded-3xl p-6">
    <h2 class="text-lg mb-3">Custom voice</h2>
    <div class="grid sm:grid-cols-2 gap-3 text-sm">
      <label>Edge neural voice
        ${edgeVoices ? `<select data-f="voice" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2">${enVoices.map((v) => `<option ${v.ShortName === c.voice ? 'selected' : ''} value="${v.ShortName}">${v.ShortName} · ${v.Gender}</option>`).join('')}</select>`
          : `<div class="mt-1 flex gap-2"><input data-f="voice" value="${esc(c.voice)}" class="flex-1 rounded-xl bg-white/10 px-3 py-2">${btn('load-voices', 'Load list')}</div>`}
      </label>
      <label>Pack id (a–z, 0–9)<input data-f="id" value="${esc(c.id)}" placeholder="e.g. ava" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
      <label>Label<input data-f="label" value="${esc(c.label)}" placeholder="Ava" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
      <label>Description<input data-f="desc" value="${esc(c.desc)}" placeholder="Bright, friendly American female" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
      <label>Rate<input data-f="rate" value="${esc(c.rate)}" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
      <label>Pitch<input data-f="pitch" value="${esc(c.pitch)}" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
      <label class="sm:col-span-2">Test phrase<input data-f="sample" value="${esc(state.sample)}" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2"></label>
    </div>
    <div class="flex gap-2 mt-4">${btn('try-custom', 'Listen')} ${btn('gen-custom', 'Generate pack', '', 'bg-white text-black')}</div>
  </section>`;
}

// ------------------------------------------------------------------ ambience

let live = null;

function ambienceView() {
  const s = getSoundscape(state.scape);
  const lay = state.layers[s.id] || {};
  const variants = man.ambience.filter((a) => a.soundscape === s.id);
  const r = state.rendered;
  return `
  <section class="glass rounded-3xl p-6 mb-6">
    <div class="flex flex-wrap gap-2 mb-5">
      ${SOUNDSCAPES.filter((x) => x.layers.length).map((x) => `<button data-a="scape" data-id="${x.id}" class="rounded-full px-3 py-1.5 text-sm ${x.id === s.id ? 'bg-white text-black' : 'bg-white/10'}">${x.icon} ${esc(x.name)} <span class="opacity-50">${man.ambience.filter((a) => a.soundscape === x.id).length || ''}</span></button>`).join('')}
    </div>
    <p class="text-sm text-white/55 mb-4">${esc(s.desc)}</p>
    <div class="grid sm:grid-cols-2 gap-6">
      <div>
        <h3 class="text-xs uppercase tracking-widest text-white/40 mb-2">Layers</h3>
        ${s.layers.map((l) => `<label class="flex items-center gap-2 py-1 text-sm"><input type="checkbox" data-layer="${l.gen}" ${(lay[l.gen] ?? l.on) ? 'checked' : ''}> ${esc(l.label)}</label>`).join('')}
        ${s.params ? Object.entries(s.params).map(([k, opts]) => `<label class="block text-sm mt-3">${k}
          <select data-param="${k}" class="ml-2 rounded-lg bg-white/10 px-2 py-1">${opts.map((o) => `<option ${state.params[s.id]?.[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('') : ''}
      </div>
      <div class="text-sm grid gap-2">
        <label>Intensity ${state.intensity}<input type="range" min="0" max="1" step="0.05" data-f2="intensity" value="${state.intensity}"></label>
        <label>Brightness ${state.brightness}<input type="range" min="0" max="1" step="0.05" data-f2="brightness" value="${state.brightness}"></label>
        <label>Loop length (s)<input type="number" min="20" max="300" data-f2="duration" value="${state.duration}" class="ml-2 w-24 rounded-lg bg-white/10 px-2 py-1"></label>
        <label>Seed<input type="number" data-f2="seed" value="${state.seed}" class="ml-2 w-24 rounded-lg bg-white/10 px-2 py-1"></label>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mt-5">
      ${btn('live', live ? '■ Stop listening' : '▶ Listen live')}
      ${btn('render', '● Record loop', '', 'bg-white text-black')}
      ${btn('render3', 'Record 3 variants', '', 'bg-white/10')}
    </div>
    ${r ? `<div class="mt-5 rounded-2xl bg-white/5 p-4">
      <div class="text-sm mb-2">Take: seed ${r.meta.seed} · ${r.meta.duration}s · ${fmtBytes(r.blob.size)} <span class="text-white/40">(audition the loop point: it plays twice, crossfaded)</span></div>
      <audio controls src="${r.url}" class="w-full"></audio>
      <div class="flex gap-2 mt-3 items-center">
        <input data-f="label" placeholder="Label, e.g. Night rain" value="${esc(state.label)}" class="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm">
        ${btn('save-amb', 'Save variant', '', 'bg-white text-black')} ${btn('discard', 'Discard')}
      </div></div>` : ''}
  </section>
  <section class="glass rounded-3xl p-6">
    <h2 class="text-lg mb-3">Saved variants · ${esc(s.name)}</h2>
    ${variants.map((a) => `<div class="flex items-center gap-3 py-2 border-b border-white/5 text-sm">
      <button data-a="play" data-src="/audio/${a.file}" class="rounded-full px-3 py-1 bg-white/10">▶</button>
      <span class="flex-1">${esc(a.label)} <span class="text-white/40">${a.id} · ${Math.round(a.duration)}s · ${fmtBytes(a.bytes)}</span></span>
      ${btn('del-amb', 'Delete', `data-id="${a.id}"`, 'bg-red-500/20 hover:bg-red-500/40')}</div>`).join('') || '<p class="text-white/40 text-sm">No recorded variants yet. The app plays these when “Recorded loop” is chosen (lighter on battery, best for background play on phones).</p>'}
  </section>`;
}

function scapeOpts(seed) {
  const s = getSoundscape(state.scape);
  return { scapeId: s.id, layersOn: state.layers[s.id], params: state.params[s.id], intensity: state.intensity, brightness: state.brightness, synced: false, seed };
}

async function toggleLive() {
  if (live) { live.scape.stop(1); live.clock.dispose(); setTimeout(() => live?.ctx.close(), 1500); live = null; return render(); }
  const ctx = new AudioContext();
  const clock = createClock(ctx);
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(ctx.destination);
  live = { ctx, clock, scape: buildScape(ctx, out, { ...scapeOpts(state.seed), clock }) };
  render();
}

/** Render offline with pre-roll (skips the fade-in) and a tail for the runtime crossfade. */
async function renderLoop(seed) {
  const PRE = 5, XF = 3, SR = 44100;
  const total = PRE + state.duration + XF;
  const ctx = new OfflineAudioContext(2, SR * total, SR);
  const clock = createClock(ctx, { offline: true });
  const bus = ctx.createGain();
  bus.gain.value = 0.8;
  bus.connect(ctx.destination);
  // Gentle limiter so nothing clips in the file.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; comp.ratio.value = 8; comp.attack.value = 0.01; comp.release.value = 0.3;
  bus.disconnect(); bus.connect(comp).connect(ctx.destination);
  buildScape(ctx, bus, { ...scapeOpts(seed), clock });
  clock.flush(total);
  const buf = await ctx.startRendering();
  const start = PRE * SR;
  const L = buf.getChannelData(0).subarray(start);
  const R = buf.getChannelData(1).subarray(start);
  const mp3 = encodeMp3(L, R, SR);
  // Audition blob: two passes crossfaded exactly like the app, so the loop point can be judged.
  const audition = await auditionBlob(L, R, SR, XF);
  return { blob: mp3, url: URL.createObjectURL(audition), meta: { seed, duration: state.duration + XF } };
}

function encodeMp3(L, R, sr) {
  const enc = new Mp3Encoder(2, sr, 112);
  const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) o[i] = Math.max(-1, Math.min(1, f[i])) * 32767; return o; };
  const li = toI16(L), ri = toI16(R);
  const parts = [];
  for (let i = 0; i < li.length; i += 1152) parts.push(enc.encodeBuffer(li.subarray(i, i + 1152), ri.subarray(i, i + 1152)));
  parts.push(enc.flush());
  return new Blob(parts, { type: 'audio/mpeg' });
}

async function auditionBlob(L, R, sr, xf) {
  const len = L.length, x = xf * sr, total = len * 2 - x;
  const outL = new Float32Array(total), outR = new Float32Array(total);
  for (let i = 0; i < len; i++) {
    const gOut = i >= len - x ? Math.cos(((i - (len - x)) / x) * Math.PI / 2) : 1;
    outL[i] += L[i] * gOut; outR[i] += R[i] * gOut;
    const j = i + len - x;
    const gIn = i < x ? Math.sin((i / x) * Math.PI / 2) : 1;
    outL[j] += L[i] * gIn; outR[j] += R[i] * gIn;
  }
  return encodeMp3(outL, outR, sr);
}

async function saveTake(take, label) {
  const s = getSoundscape(state.scape);
  const n = man.ambience.filter((a) => a.soundscape === s.id).length + 1;
  let id = `${s.id}-${n}`;
  while (man.ambience.some((a) => a.id === id)) id = `${s.id}-${Math.random().toString(36).slice(2, 5)}`;
  const q = new URLSearchParams({ id, soundscape: s.id, label: label || `${s.name} ${n}`, duration: take.meta.duration });
  await api(`ambience?${q}`, { method: 'POST', body: take.blob });
}

async function work(msg, fn) {
  busy = msg;
  render();
  try { await fn(); } catch (e) { alert(e.message); }
  busy = '';
  await refresh();
}

async function tts(voiceName, rate, pitch, text) {
  const blob = await api('tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: voiceName, rate, pitch }) });
  player.src = URL.createObjectURL(blob);
  player.play();
}

// ------------------------------------------------------------------ events

root.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  const d = b.dataset;
  if (a === 'tab') { tab = d.id; render(); }
  if (a === 'play') { player.src = d.src; player.play(); }
  if (a === 'try') work('Synthesizing…', () => tts(d.voice, d.rate, d.pitch, state.sample));
  if (a === 'try-custom') work('Synthesizing…', () => tts(state.custom.voice, state.custom.rate, state.custom.pitch, state.sample));
  if (a === 'load-voices') work('Loading voice list…', async () => { edgeVoices = await api('edge-voices'); });
  if (a === 'gen-preset' || a === 'regen') {
    const preset = VOICE_PRESETS.find((p) => p.id === d.id) || man.voices.find((v) => v.id === d.id);
    work(`Generating ${preset.label} pack (~30s)…`, () => api('voice-pack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preset) }));
  }
  if (a === 'gen-custom') {
    const c = state.custom;
    if (!c.id) return alert('Give the pack an id');
    work(`Generating ${c.id} pack…`, () => api('voice-pack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...c, label: c.label || c.id }) }));
  }
  if (a === 'del-voice' && confirm(`Delete voice pack ${d.id}?`)) work('Deleting…', () => api(`asset?kind=voice&id=${d.id}`, { method: 'DELETE' }));
  if (a === 'del-amb' && confirm(`Delete ${d.id}?`)) work('Deleting…', () => api(`asset?kind=ambience&id=${d.id}`, { method: 'DELETE' }));
  if (a === 'scape') { if (live) await toggleLive(); state.scape = d.id; state.rendered = null; render(); }
  if (a === 'live') toggleLive();
  if (a === 'render') work(`Rendering ${state.duration}s loop…`, async () => { state.rendered = await renderLoop(state.seed); });
  if (a === 'render3') {
    work('Rendering 3 variants…', async () => {
      for (let i = 0; i < 3; i++) {
        busy = `Rendering variant ${i + 1}/3…`; render();
        await saveTake(await renderLoop(state.seed + i), '');
      }
      state.seed += 3;
    });
  }
  if (a === 'save-amb') work('Saving…', async () => { await saveTake(state.rendered, state.label); state.rendered = null; state.label = ''; state.seed++; });
  if (a === 'discard') { state.rendered = null; render(); }
});

root.addEventListener('change', (e) => {
  const t = e.target;
  const s = getSoundscape(state.scape);
  if (t.dataset.layer) (state.layers[s.id] ||= {})[t.dataset.layer] = t.checked;
  if (t.dataset.param) (state.params[s.id] ||= {})[t.dataset.param] = t.value;
  if (t.dataset.f2) state[t.dataset.f2] = +t.value;
  if (t.dataset.f === 'sample') state.sample = t.value;
  else if (t.dataset.f === 'label') state.label = t.value;
  else if (t.dataset.f) state.custom[t.dataset.f] = t.value;
  if (t.dataset.layer || t.dataset.param || t.dataset.f2) {
    if (live) { toggleLive(); toggleLive(); }
    render();
  }
});

refresh();
