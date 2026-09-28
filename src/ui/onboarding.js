// First-run journey: guidance → sound → voice → pattern. Everything is changeable later.
import { prefs, setPrefs } from '../core/store.js';
import { audio } from '../audio/engine.js';
import { manifest, assetUrl, decode } from '../audio/assets.js';
import { guidanceCards, applyGuidance, soundCards, previewSound, patternCards } from './panels.js';
import { actions, esc, icon } from './dom.js';

export function runOnboarding(root, { onDone }) {
  let step = 0;
  const steps = ['welcome', 'guidance', 'sound', 'voice', 'pattern', 'ready'];
  const visible = () => steps.filter((s) => s !== 'voice' || prefs.guidance !== 'visual');

  async function render() {
    const list = visible();
    const id = list[step];
    let content = '';
    if (id === 'welcome') {
      content = `<div class="text-center py-6">
        <h1 class="font-serif font-light text-6xl sm:text-7xl tracking-wide">Breath</h1>
        <p class="font-serif italic text-xl text-white/60 mt-3">A quiet place for your mind.</p>
        <p class="text-sm text-white/50 mt-8 max-w-sm mx-auto leading-relaxed">Let’s tune it to you — how you like to be guided and what you like to hear. It takes a minute, and everything stays on this device.</p>
        <div class="mt-10 flex flex-col items-center gap-3">
          <button data-action="next" class="rounded-full bg-white text-black px-8 py-3.5 font-medium hover:bg-white/90 transition">Tune it to me</button>
          <button data-action="skip" class="text-sm text-white/50 hover:text-white py-2">Skip — use gentle defaults</button>
        </div></div>`;
    } else if (id === 'guidance') {
      content = head('How would you like to be guided?', 'You can always mix these later — voice, tones, visuals and even vibration.') + guidanceCards(prefs.guidance);
    } else if (id === 'sound') {
      content = head('What would you like to hear?', 'Each is generated live and never repeats. Preview a few — there’s no wrong answer.') + soundCards(prefs.sound.scape, { compact: true });
    } else if (id === 'voice') {
      const m = await manifest();
      content = head('Choose a voice', 'Tap to hear. It will say “breathe in”, “hold” and “breathe out”.')
        + `<div class="grid grid-cols-2 gap-2">${m.voices.map((v) => `
          <button data-action="voice" data-id="${v.id}" class="text-left rounded-2xl p-4 transition ${prefs.voice.pack === v.id && prefs.voice.source === 'auto' ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
            <span class="block font-medium">${esc(v.label)}</span><span class="block text-xs text-white/50 mt-0.5">${esc(v.desc)}</span></button>`).join('')}
          <button data-action="voice" data-id="tones" class="text-left rounded-2xl p-4 transition ${prefs.voice.source === 'off' ? 'bg-accent-soft ring-accent' : 'bg-white/5 hover:bg-white/10'}">
            <span class="block font-medium">No voice</span><span class="block text-xs text-white/50 mt-0.5">Soft rising and falling tones instead</span></button>
        </div>`;
    } else if (id === 'pattern') {
      content = head('Pick a rhythm', 'Coherent breathing is a lovely place to start.') + patternCards(prefs.pattern).replace(/<button data-action="pick-pattern" data-id="custom"[\s\S]*?<\/button>/, '');
    } else if (id === 'ready') {
      content = `<div class="text-center py-8">
        <div class="font-serif font-light text-5xl">You’re ready.</div>
        <p class="text-white/55 mt-4 max-w-sm mx-auto leading-relaxed">Sit or lie comfortably. Let your shoulders drop.<br>When you press begin, simply follow.</p>
        <p class="text-xs text-white/40 mt-6">Tip: add Breath to your home screen — it works with no connection at all.</p>
        <div class="mt-10 flex flex-col items-center gap-3">
          <button data-action="begin" class="rounded-full bg-white text-black px-10 py-3.5 font-medium hover:bg-white/90 transition">Begin my first session</button>
          <button data-action="finish" class="text-sm text-white/50 hover:text-white py-2">Not now</button>
        </div></div>`;
    }
    const showNav = id !== 'welcome' && id !== 'ready';
    root.innerHTML = `<div class="absolute inset-0 overflow-y-auto scroll-thin">
      <div class="min-h-full flex flex-col items-center justify-center px-4 py-10 safe-top safe-bottom">
        <div class="w-full max-w-lg">
          ${showNav ? `<div class="flex justify-center gap-1.5 mb-6">${list.slice(1, -1).map((_, i) => `<span class="h-1 rounded-full transition-all ${i + 1 === step ? 'w-8 bg-white/80' : 'w-3 bg-white/20'}"></span>`).join('')}</div>` : ''}
          <div class="glass rounded-[28px] p-6 sm:p-8 fade-enter">${content}</div>
          ${showNav ? `<div class="flex justify-between items-center mt-5 px-1">
            <button data-action="back" class="inline-flex items-center gap-1 text-sm text-white/55 hover:text-white py-2">${icon.back} Back</button>
            <button data-action="next" class="rounded-full bg-white text-black px-7 py-3 font-medium hover:bg-white/90 transition">Continue</button>
          </div>` : ''}
        </div>
      </div></div>`;
  }

  const head = (t, sub) => `<h2 class="font-serif font-light text-3xl sm:text-4xl leading-tight">${t}</h2><p class="text-sm text-white/50 mt-2 mb-5 leading-relaxed">${sub}</p>`;

  const finish = (begin) => {
    audio.stopPreview();
    setPrefs({ onboarded: true });
    onDone(begin);
  };

  async function hear(id) {
    await audio.ensure();
    const m = await manifest();
    const pack = m.voices.find((v) => v.id === id);
    if (!pack) return;
    audio.setVolumes({ voice: prefs.voice.volume });
    try {
      let t = audio.now() + 0.05;
      for (const key of ['inhale', 'hold', 'exhale']) {
        const buf = await decode(audio.ctx, assetUrl(pack.clips[key][0]));
        audio.playBuffer(buf, t);
        t += buf.duration + 0.9;
      }
    } catch {}
  }

  actions(root, {
    next: () => { audio.stopPreview(); step = Math.min(step + 1, visible().length - 1); render(); },
    back: () => { audio.stopPreview(); step = Math.max(0, step - 1); render(); },
    skip: () => finish(false),
    finish: () => finish(false),
    begin: () => finish(true),
    guidance: (b) => { applyGuidance(b.dataset.id); render(); },
    'pick-sound': (b) => { setPrefs((p) => (p.sound.scape = b.dataset.id)); render(); },
    'preview-sound': (b) => previewSound(b.dataset.id, b),
    voice: (b) => {
      const id = b.dataset.id;
      if (id === 'tones') setPrefs((p) => { p.voice.source = 'off'; p.cues.voice = false; p.cues.tone = true; });
      else { setPrefs((p) => { p.voice.source = 'auto'; p.voice.pack = id; p.cues.voice = true; }); hear(id); }
      render();
    },
    'pick-pattern': (b) => { setPrefs((p) => (p.pattern = b.dataset.id)); render(); },
  });
  render();
}

