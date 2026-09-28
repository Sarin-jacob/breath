import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { prefs, setPrefs, onPrefs, summary } from './core/store.js';
import { Session } from './core/session.js';
import { Renderer } from './visual/renderer.js';
import { audio } from './audio/engine.js';
import { voice } from './audio/voice.js';
import { getSoundscape } from './audio/soundscapes.js';
import { manifest, packUrls, cachedCount, saveOffline, assetUrl } from './audio/assets.js';
import { resolvePattern } from './data/patterns.js';
import { PHASE_LABEL } from './data/phrases.js';
import { runOnboarding } from './ui/onboarding.js';
import { openSettings, openSoundPicker, openPatternPicker, openGuidancePicker, openDurationPicker, fmtDuration, GUIDANCE } from './ui/panels.js';
import { $, actions, esc, icon, toast, fmtTime, closeSheet } from './ui/dom.js';

const app = document.getElementById('app');
const renderer = new Renderer(document.getElementById('scene'));
let session = null;
let view = 'home';
let installEvent = null;

// ------------------------------------------------------------------ appearance

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
function applyLook() {
  const hue = prefs.hue ?? getSoundscape(prefs.sound.scape).hue;
  renderer.setHue(hue);
  renderer.setTheme(prefs.theme);
  renderer.reduced = prefs.motion === 'reduced' || (prefs.motion === 'auto' && reducedQuery.matches);
  document.documentElement.style.setProperty('--accent-h', hue);
}

// ------------------------------------------------------------------ home

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still awake' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Rest well';
}

function renderHome() {
  view = 'home';
  renderer.dim = 0;
  const pat = resolvePattern(prefs.pattern, prefs.custom);
  const scape = getSoundscape(prefs.sound.scape);
  const guide = GUIDANCE.find((g) => g.id === prefs.guidance);
  const st = summary();
  const chip = (action, label, value) => `
    <button data-action="${action}" class="min-w-0 text-left rounded-2xl px-3.5 py-2.5 bg-white/5 hover:bg-white/10 transition">
      <span class="block text-[10px] uppercase tracking-[0.18em] text-white/40">${label}</span>
      <span class="block text-sm truncate mt-0.5">${esc(value)}</span>
    </button>`;
  app.innerHTML = `
    <div class="absolute inset-0 flex flex-col">
      <header class="flex items-center justify-between px-5 safe-top pb-2">
        <span class="font-serif text-2xl font-light tracking-[0.12em] pt-1">Breath</span>
        <div class="flex items-center gap-1">
          <span id="offline-chip" class="${navigator.onLine ? 'hidden' : 'inline-flex'} items-center gap-1.5 rounded-full px-3 py-1 text-xs bg-white/10 text-white/70">${icon.offline} Offline</span>
          <button id="install-btn" data-action="install" class="${installEvent ? '' : 'hidden'} p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10" aria-label="Install app" title="Install app">${icon.install}</button>
          <button data-action="settings" class="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10" aria-label="Settings">${icon.gear}</button>
        </div>
      </header>
      <div class="flex-1 flex flex-col items-center justify-start pt-[6vh] pointer-events-none fade-enter">
        <h1 class="font-serif font-light text-4xl sm:text-5xl tracking-wide text-white/90">${greeting()}</h1>
        <p class="font-serif italic text-lg text-white/50 mt-1">Take a slow breath with me.</p>
      </div>
      <div class="px-4 safe-bottom fade-enter">
        <div class="mx-auto w-full max-w-md glass rounded-[28px] p-4">
          <div class="grid grid-cols-2 gap-2">
            ${chip('patterns', 'Breath', `${pat.name} · ${pat.tag}`)}
            ${chip('sounds', 'Sound', scape.name)}
            ${chip('guidance', 'Guide', guide?.name || 'Both')}
            ${chip('duration', 'Time', fmtDuration(prefs.duration))}
          </div>
          <button data-action="begin" class="mt-3 w-full rounded-full bg-white text-black py-4 text-lg font-medium tracking-wide hover:bg-white/90 active:scale-[0.99] transition">Begin</button>
          <p class="text-center text-xs text-white/40 mt-3">${st.count ? `${st.streak ? `${st.streak}-day streak · ` : ''}${st.minutes} mindful minute${st.minutes === 1 ? '' : 's'}` : 'Your first session awaits'}</p>
        </div>
      </div>
    </div>`;
}

// ------------------------------------------------------------------ session

let idleTimer;
function wake() {
  app.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (view === 'session' && !session?.paused) idleTimer = setTimeout(() => app.classList.add('is-idle'), 3500);
}

async function begin() {
  closeSheet();
  audio.stopPreview();
  applyLook();
  session = new Session(prefs);
  view = 'session';
  const pat = session.pattern;
  app.innerHTML = `
    <div class="absolute inset-0 flex flex-col" data-action="wake">
      <header class="idle-hide flex items-center justify-between px-5 safe-top text-sm text-white/60">
        <span>${esc(pat.name)}${pat.phases.length ? ` · ${esc(pat.tag)}` : ''}</span>
        <span id="remaining" class="tabular-nums"></span>
      </header>
      <div class="flex-1"></div>
      <div class="absolute inset-x-0 top-[72%] text-center pointer-events-none px-4">
        <div id="phase" class="phase-label font-serif font-light text-4xl sm:text-5xl tracking-[0.08em] text-white/90 ${prefs.cues.label ? '' : 'hidden'}"></div>
        <div id="count" class="font-serif text-2xl text-white/45 mt-2 tabular-nums h-8 ${prefs.cues.countdown ? '' : 'invisible'}"></div>
      </div>
      <footer class="idle-hide px-4 safe-bottom">
        <div class="mx-auto flex items-center justify-center gap-4">
          <button data-action="sounds" class="p-3.5 rounded-full glass text-white/80 hover:text-white" aria-label="Sound">${icon.sound}</button>
          <button id="toggle" data-action="toggle" class="p-5 rounded-full bg-white/90 text-black hover:bg-white" aria-label="Pause">${icon.pause}</button>
          <button data-action="stop" class="p-3.5 rounded-full glass text-white/80 hover:text-white" aria-label="End session">${icon.stop}</button>
        </div>
        <div class="mx-auto max-w-xs mt-4 flex items-center gap-3 text-white/50">
          ${icon.sound}<input type="range" id="vol" min="0" max="1" step="0.01" value="${prefs.sound.volume}" style="--fill:${prefs.sound.volume * 100}%" aria-label="Volume">
        </div>
      </footer>
    </div>`;
  const vol = $('#vol');
  vol.addEventListener('input', () => {
    vol.style.setProperty('--fill', vol.value * 100 + '%');
    setPrefs((p) => (p.sound.volume = +vol.value));
  });
  session.addEventListener('change', () => {
    $('#toggle').innerHTML = session.paused ? icon.play : icon.pause;
    wake();
  });
  session.addEventListener('end', (e) => renderEnd(e.detail));
  lastLabel = null;
  wake();
  try {
    await session.start();
  } catch (e) {
    console.error(e);
    toast('Audio could not start — visuals only');
  }
  window.__breath = { session, audio };
}

function renderEnd({ elapsed }) {
  view = 'end';
  renderer.dim = 0;
  app.classList.remove('is-idle');
  const st = summary();
  const mins = Math.max(1, Math.round(elapsed / 60));
  app.innerHTML = `
    <div class="absolute inset-0 flex items-center justify-center px-4">
      <div class="text-center fade-enter">
        <div class="font-serif font-light text-5xl sm:text-6xl">Welcome back.</div>
        <p class="font-serif italic text-xl text-white/60 mt-3">${elapsed < 30 ? 'Every breath counts.' : `You breathed mindfully for ${mins} minute${mins === 1 ? '' : 's'}.`}</p>
        ${st.streak > 1 ? `<p class="text-sm text-white/45 mt-6">${st.streak} days in a row. Beautiful.</p>` : ''}
        <div class="mt-10 flex justify-center gap-3">
          <button data-action="home" class="rounded-full px-7 py-3 glass hover:bg-white/10">Done</button>
          <button data-action="begin" class="rounded-full px-7 py-3 bg-white text-black hover:bg-white/90">Again</button>
        </div>
      </div>
    </div>`;
  session = null;
}

// ------------------------------------------------------------------ render loop

let lastLabel = null;
let lastT = performance.now() / 1000;
function loop() {
  requestAnimationFrame(loop);
  if (document.hidden) return;
  const t = performance.now() / 1000;
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  let state;
  if (session?.engine && view === 'session') {
    const now = session.now();
    if (now < session.engine.t0) state = { kind: 'lead', level: 0.08, p: 0, remaining: session.engine.t0 - now };
    else state = session.state();
    // Eyes-closed mode: with audio-only guidance the screen gently dims.
    renderer.dim = prefs.guidance === 'audio' && state.elapsed > 8 ? 0.72 : 0;
    updateSessionUi(state);
  } else {
    // Idle: a slow 12s breath so the home screen itself is calming.
    const p = (t % 12) / 12;
    state = { kind: 'idle', level: 0.5 - 0.5 * Math.cos(p * Math.PI * 2), p };
  }
  renderer.frame(state, t, dt);
  if (session && view === 'session' && prefs.cues.ring && state.kind !== 'free' && state.kind !== 'lead') drawRing(state);
}

function drawRing(state) {
  const c = renderer.ctx;
  const { w, h, m, scale } = renderer;
  const r = m * 0.34;
  c.globalCompositeOperation = 'source-over';
  c.lineWidth = 1.5 * scale;
  c.globalAlpha = 0.12 * (1 - renderer.dimNow);
  c.strokeStyle = '#fff';
  c.beginPath();
  c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 0.55 * (1 - renderer.dimNow);
  c.strokeStyle = `hsl(${renderer.hueNow + 20},80%,80%)`;
  c.beginPath();
  c.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.p);
  c.stroke();
  c.globalAlpha = 1;
}

function updateSessionUi(state) {
  const label = $('#phase');
  if (!label) return;
  const key = state.kind === 'lead' ? 'lead' : state.kind;
  if (key !== lastLabel) {
    lastLabel = key;
    const text = key === 'lead' ? 'Settle in' : key === 'free' ? '' : PHASE_LABEL[key] || '';
    label.style.opacity = 0;
    setTimeout(() => { label.textContent = text; label.style.opacity = 1; }, 450);
  }
  const count = $('#count');
  if (prefs.cues.countdown && state.remaining != null && state.kind !== 'free') count.textContent = Math.max(1, Math.ceil(state.remaining));
  const rem = $('#remaining');
  if (rem && session) rem.textContent = session.endAt === Infinity ? '∞' : fmtTime(session.remaining());
}

// ------------------------------------------------------------------ live prefs

const soundSig = (p) => JSON.stringify([p.sound.scape, p.sound.layers[p.sound.scape], p.sound.params[p.sound.scape], p.sound.intensity, p.sound.brightness, p.sound.mode, p.sound.variant, p.sound.track, p.sound.breathSync]);
const voiceSig = (p) => JSON.stringify([p.voice.source, p.voice.pack, p.cues.voice, p.guidance]);
let lastSound = soundSig(prefs);
let lastVoice = voiceSig(prefs);
let soundTimer;
onPrefs((p) => {
  applyLook();
  audio.setVolumes({ music: p.sound.volume, voice: p.voice.volume });
  if (audio.ready && audio.background !== p.background) audio.setBackground(p.background);
  const s = soundSig(p);
  if (s !== lastSound) {
    lastSound = s;
    clearTimeout(soundTimer);
    if (session && !session.ended) {
      soundTimer = setTimeout(() => audio.playScape(p.sound, { synced: session.pattern.phases.length > 0 }), 450);
    }
  }
  const v = voiceSig(p);
  if (v !== lastVoice) {
    lastVoice = v;
    if (session && !session.ended) {
      voice.prepare(p.voice).then((mode) => {
        session.voiceMode = p.cues.voice && p.guidance !== 'visual' ? mode : 'off';
        session.toneFallback = p.cues.voice && p.guidance !== 'visual' && mode === 'off';
      });
    }
  }
  if (view === 'home' && !document.querySelector('#sheets .sheet')) renderHome();
  const phase = $('#phase');
  if (phase) phase.classList.toggle('hidden', !p.cues.label);
  const count = $('#count');
  if (count) count.classList.toggle('invisible', !p.cues.countdown);
});

// Refresh the home summary when a sheet closes.
new MutationObserver(() => {
  if (view === 'home' && !document.querySelector('#sheets .sheet')) renderHome();
}).observe(document.getElementById('sheets'), { childList: true });

// ------------------------------------------------------------------ events

actions(app, {
  begin,
  home: () => { renderHome(); },
  settings: () => openSettings(),
  sounds: () => openSoundPicker(),
  patterns: () => openPatternPicker(),
  guidance: () => openGuidancePicker(),
  duration: () => openDurationPicker(),
  toggle: () => session?.toggle(),
  stop: () => session?.finish(false),
  wake: (_, e) => { if (!e.target.closest('button,input')) wake(); },
  install: async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('#install-btn')?.classList.add('hidden');
  },
});
app.addEventListener('pointermove', () => view === 'session' && wake());

addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,textarea') || document.querySelector('#sheets .sheet')) return;
  if (view === 'session') {
    if (e.code === 'Space') { e.preventDefault(); session?.toggle(); }
    if (e.key === 'Escape') session?.finish(false);
    wake();
  } else if (view === 'home' && e.key === 'Enter') begin();
  if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
});

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  $('#install-btn')?.classList.remove('hidden');
});
const netChange = () => {
  const chip = $('#offline-chip');
  if (chip) { chip.classList.toggle('hidden', navigator.onLine); chip.classList.toggle('inline-flex', !navigator.onLine); }
  if (navigator.onLine) warmCache();
};
addEventListener('online', netChange);
addEventListener('offline', netChange);
document.addEventListener('breath:onboarding', () => { closeSheet(); startOnboarding(); });

// Quietly keep the chosen voice (and recorded loop, if used) available offline.
async function warmCache() {
  if (!navigator.onLine || !('caches' in window)) return;
  try {
    const m = await manifest();
    const pack = m.voices.find((v) => v.id === prefs.voice.pack) || m.voices[0];
    const urls = packUrls(pack);
    if (prefs.sound.mode === 'recorded') {
      const amb = m.ambience.find((a) => a.id === prefs.sound.variant) || m.ambience.find((a) => a.soundscape === prefs.sound.scape);
      if (amb) urls.push(assetUrl(amb.file));
    }
    if ((await cachedCount(urls)) < urls.length) await saveOffline(urls);
  } catch {}
}

// ------------------------------------------------------------------ boot

function startOnboarding() {
  view = 'onboarding';
  runOnboarding(app, {
    onDone: (go) => {
      warmCache();
      go ? begin() : renderHome();
    },
  });
}

applyLook();
reducedQuery.addEventListener?.('change', applyLook);
if (prefs.onboarded) renderHome();
else startOnboarding();
requestAnimationFrame(loop);
setTimeout(warmCache, 4000);

registerSW({
  immediate: true,
  onOfflineReady() { toast('Ready to work offline'); },
});
