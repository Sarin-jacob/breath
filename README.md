# Breath

A calm, captivating breathing and meditation app. It's a static PWA that installs to your home screen and works fully offline.

- **Guided breathing:** Coherent, Long exhale, Box, 4-7-8, Physiological sigh, Deep trance, Wake up, Free, or Custom
- **Guidance your way:** visual, audio or both. Options include on-screen words, a progress ring, a countdown, natural recorded voices, device text-to-speech, your own recorded voice, tones and vibration.
- **Soundscapes generated live on the device** (they never loop): Deep Drone, Mantra/Om (chant flows on the out-breath, with tanpura and singing bowls), Singing Bowls, Lo-fi, Rainfall, Ocean (waves build as you breathe in), Forest Stream, Campfire, Dark/Metal Ambient, Brainwave (binaural/isochronic), Pure Noise, Silence, and **My Music** (import your own files). Each one describes what it feels like and who it suits. Layers, intensity, tone and breath-sync are all adjustable.
- **Trance visuals:** Aurora Orb, Nebula, Mandala, Moonlit Sea, Hypnotic Tunnel, Void. Nothing ever flashes, and they respect reduced motion.
- **Background play:** audio is routed through a media element with Media Session lock-screen controls. Cues are scheduled ahead on the audio clock, so they stay in time when the screen is off. Wake lock is optional.
- All preferences and stats are stored on the device (localStorage / IndexedDB).

## Scripts

```bash
npm install
npm run dev       # app at http://localhost:5173, studio at http://localhost:5173/dev/
npm run build     # production build in dist/
npm run preview   # serve the build (test offline / install)
npm run deploy    # build and push dist/ to the gh-pages branch
npm run voices    # (re)generate every voice pack with neural TTS
npm run voices aria guy   # only these presets
```

`npm run deploy` needs a GitHub remote (`git remote add origin …`). Then set **Settings → Pages → Branch: gh-pages**. The build uses relative paths, so it works at `https://<user>.github.io/breath/`.

## Breath Studio (dev only)

`npm run dev` then open `/dev/`. The studio is never shipped.

- **Voice packs:** audition every clip, try any Microsoft Edge neural voice with custom rate and pitch, and generate or rebuild packs. Each pack contains every cue from `src/data/phrases.js`, with several phrasings per cue that the app rotates through.
- **Recorded ambience:** listen to any soundscape live, adjust layers, intensity, tone and seed, then **record** seamless MP3 loops (rendered offline, with a pre-roll so there's no fade-in). You can save several variants per soundscape. In the app, *Sound → Playback → Recorded loop* plays them. They use less battery and are more reliable in the background on phones.

Files go to `public/audio/`, and `public/audio/manifest.json` indexes them. Voice TTS needs an internet connection while generating. The app only plays the saved files.

## Offline strategy

- The app shell, fonts and icons are precached by Workbox on the first visit.
- Generated soundscapes need no files at all.
- The selected voice pack (and recorded loop, if used) is cached automatically in the background. *Settings → Offline* can save everything.
- Voice fallback order: recorded clips → device TTS → soft tones.

## Structure

```
src/
  audio/synth/     instruments: tonal (drone, om, tanpura, bowls, binaural), nature, beats (lofi, metal)
  audio/           engine (graph, background, loops), soundscapes catalogue, voice, assets/cache
  core/            breath engine (timing model), session (scheduling, cues, media session), store, db
  visual/          canvas renderer + themes
  ui/              home/session (main.js), onboarding, settings & pickers
dev/               Breath Studio
scripts/           voice generation, dev-server API, icon generator
```

## Care

Breathe gently and never strain. Don't use breathwork or brainwave audio while driving or in water. If you have a seizure, heart or lung condition, or are pregnant, choose soft patterns and check with your doctor.
