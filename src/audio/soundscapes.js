import * as tonal from './synth/tonal.js';
import * as nature from './synth/nature.js';
import * as beats from './synth/beats.js';

export const GENERATORS = { ...tonal, ...nature, ...beats };
delete GENERATORS.strikeBowl;
delete GENERATORS.BEATS;

// Layer: { gen, label, level, on, params? }. Users can toggle layers per soundscape.
export const SOUNDSCAPES = [
  {
    id: 'drone', name: 'Deep Drone', icon: '◎', hue: 250,
    desc: 'Warm, slowly shifting harmonic pads that never repeat.',
    feels: 'Like floating in a warm, dark ocean. Neutral and endless — the safest place to start.',
    suits: 'Anyone · sleep · long sits',
    layers: [
      { gen: 'drone', label: 'Harmonic pad', level: 1, on: true },
      { gen: 'bowls', label: 'Singing bowls', level: 0.6, on: false },
      { gen: 'rain', label: 'Soft rain', level: 0.5, on: false },
    ],
  },
  {
    id: 'mantra', name: 'Mantra · Om', icon: 'ॐ', hue: 30,
    desc: 'A chanted “Om” rising from a tanpura drone, with temple singing bowls.',
    feels: 'Sacred and grounding, like sitting in an ancient stone temple. The chant flows on your out-breath.',
    suits: 'Spiritual practice · grounding · focus',
    layers: [
      { gen: 'om', label: 'Om chant', level: 1, on: true },
      { gen: 'tanpura', label: 'Tanpura', level: 0.8, on: true },
      { gen: 'bowls', label: 'Singing bowls', level: 0.5, on: true },
    ],
  },
  {
    id: 'bowls', name: 'Singing Bowls', icon: '◡', hue: 45,
    desc: 'Tibetan-style bowls struck softly, their overtones shimmering for a long time.',
    feels: 'Clear, bright and spacious. Each strike invites you back to the present moment.',
    suits: 'Clarity · resetting · short breaks',
    layers: [
      { gen: 'bowls', label: 'Singing bowls', level: 1, on: true },
      { gen: 'drone', label: 'Warm pad', level: 0.35, on: true },
      { gen: 'stream', label: 'Stream', level: 0.5, on: false },
    ],
  },
  {
    id: 'lofi', name: 'Lo-fi', icon: '♫', hue: 330,
    desc: 'Mellow jazzy keys, dusty vinyl and a lazy, swung beat.',
    feels: 'A rainy afternoon, headphones on, tea in hand. Relaxed but awake — great for calm focus.',
    suits: 'Focus · study · people who find silence uneasy',
    layers: [
      { gen: 'lofi', label: 'Keys & beat', level: 1, on: true },
      { gen: 'rain', label: 'Rain at the window', level: 0.35, on: true },
    ],
  },
  {
    id: 'rain', name: 'Rainfall', icon: '☂', hue: 210,
    desc: 'Steady rain on leaves and rooftops, with a low rumble.',
    feels: 'Cosy and sheltered. Masks noise and quiets a busy mind.',
    suits: 'Sleep · anxiety · noisy places',
    layers: [
      { gen: 'rain', label: 'Rain', level: 1, on: true },
      { gen: 'wind', label: 'Wind', level: 0.35, on: false },
      { gen: 'drone', label: 'Warm pad', level: 0.3, on: false },
    ],
  },
  {
    id: 'ocean', name: 'Ocean', icon: '≈', hue: 190,
    desc: 'Waves build as you breathe in and break as you breathe out.',
    feels: 'Your breath becomes the tide. Deeply rhythmic and naturally trance-inducing.',
    suits: 'Breath-sync · trance · sleep',
    layers: [
      { gen: 'ocean', label: 'Waves', level: 1, on: true },
      { gen: 'wind', label: 'Sea breeze', level: 0.3, on: true },
      { gen: 'birds', label: 'Gulls & birds', level: 0.4, on: false },
    ],
  },
  {
    id: 'forest', name: 'Forest Stream', icon: '❦', hue: 130,
    desc: 'A babbling brook, birdsong and wind through the trees.',
    feels: 'Fresh, green and alive. Like sitting on a mossy rock by the water.',
    suits: 'Mornings · uplift · nature lovers',
    layers: [
      { gen: 'stream', label: 'Stream', level: 1, on: true },
      { gen: 'birds', label: 'Birdsong', level: 0.7, on: true },
      { gen: 'wind', label: 'Leaves in the wind', level: 0.35, on: true },
    ],
  },
  {
    id: 'fire', name: 'Campfire', icon: '▲', hue: 18,
    desc: 'Crackling wood and the low roar of a fire, a little night wind.',
    feels: 'Warm, primal and safe. Hypnotic to stare into.',
    suits: 'Evenings · comfort · cold days',
    layers: [
      { gen: 'fire', label: 'Fire', level: 1, on: true },
      { gen: 'wind', label: 'Night wind', level: 0.25, on: true },
      { gen: 'drone', label: 'Warm pad', level: 0.25, on: false },
    ],
  },
  {
    id: 'metal', name: 'Dark / Metal Ambient', icon: '⛧', hue: 0,
    desc: 'Crushing, slow, distorted power chords and a sub-bass drone that bloom with your breath.',
    feels: 'Heavy, dark and immersive — like standing inside a cathedral-sized amp. Calm through weight, not softness.',
    suits: 'Metalheads · restless minds · people who find “soft” music irritating',
    layers: [
      { gen: 'metal', label: 'Doom chords & drums', level: 1, on: true },
      { gen: 'rain', label: 'Storm rain', level: 0.4, on: false },
      { gen: 'drone', label: 'Dark pad', level: 0.4, on: false },
    ],
  },
  {
    id: 'brainwave', name: 'Brainwave', icon: '∿', hue: 280,
    desc: 'Binaural and isochronic beats that gently invite theta, alpha or delta rhythms. Headphones recommended.',
    feels: 'A soft hum with a subtle pulse. Minimal and trance-like — some people find it deeply absorbing.',
    suits: 'Trance · deep meditation · headphone users',
    note: 'Avoid if you have epilepsy or a seizure disorder. Never use while driving.',
    params: { band: ['theta', 'alpha', 'delta'] },
    layers: [
      { gen: 'binaural', label: 'Beat tones', level: 1, on: true },
      { gen: 'noise', label: 'Pink noise bed', level: 0.35, on: true, params: { color: 'pink' } },
      { gen: 'drone', label: 'Warm pad', level: 0.35, on: false },
    ],
  },
  {
    id: 'noise', name: 'Pure Noise', icon: '░', hue: 220,
    desc: 'Brown, pink or white noise — a steady, featureless wash.',
    feels: 'Blank and soothing. Brown is deep like a distant waterfall; pink is softer rain; white is bright static.',
    suits: 'ADHD · tinnitus · sleep · masking',
    params: { color: ['brown', 'pink', 'white'] },
    layers: [{ gen: 'noise', label: 'Noise', level: 1, on: true }],
  },
  {
    id: 'silence', name: 'Silence', icon: '○', hue: 240,
    desc: 'No background sound — only your chosen cues.',
    feels: 'Pure and simple. Just you and the breath.',
    suits: 'Minimalists · quiet rooms',
    layers: [],
  },
  {
    id: 'mine', name: 'My Music', icon: '♪', hue: 300,
    desc: 'Your own tracks, imported from this device and kept offline.',
    feels: 'Whatever moves you — your favourite album, a recorded mantra, a playlist.',
    suits: 'Anyone with a favourite',
    layers: [],
  },
];

export const getSoundscape = (id) => SOUNDSCAPES.find((s) => s.id === id) || SOUNDSCAPES[0];
