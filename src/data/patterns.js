// Breathing patterns. Each phase is [kind, seconds]. kind ∈ inhale | inhale2 | hold | exhale | rest.
export const PATTERNS = [
  {
    id: 'coherent', name: 'Coherent', tag: '5.5 · 5.5',
    desc: 'Even, wave-like breathing at ~5.5 breaths a minute. Balances the nervous system; the best all-rounder.',
    phases: [['inhale', 5.5], ['exhale', 5.5]],
  },
  {
    id: 'extended', name: 'Long exhale', tag: '4 · 6',
    desc: 'Longer out-breath than in-breath. Gently switches on the rest-and-digest response.',
    phases: [['inhale', 4], ['exhale', 6]],
  },
  {
    id: 'box', name: 'Box', tag: '4 · 4 · 4 · 4',
    desc: 'Four equal sides. Steadying and focusing — used by athletes and first responders under pressure.',
    phases: [['inhale', 4], ['hold', 4], ['exhale', 4], ['rest', 4]],
  },
  {
    id: '478', name: '4-7-8', tag: '4 · 7 · 8',
    desc: 'Deeply relaxing, often used to fall asleep. The long hold can feel intense at first — go easy.',
    phases: [['inhale', 4], ['hold', 7], ['exhale', 8]],
  },
  {
    id: 'sigh', name: 'Physiological sigh', tag: '2 + 1 · 6',
    desc: 'Double inhale through the nose, long sigh out. The fastest known way to offload stress in real time.',
    phases: [['inhale', 2.5], ['inhale2', 1.2], ['exhale', 6.5], ['rest', 1.3]],
  },
  {
    id: 'trance', name: 'Deep trance', tag: '6 · 2 · 8 · 2',
    desc: 'Slow and spacious with soft pauses at the edges. Invites a dreamy, absorbed state.',
    phases: [['inhale', 6], ['hold', 2], ['exhale', 8], ['rest', 2]],
  },
  {
    id: 'energise', name: 'Wake up', tag: '3 · 3',
    desc: 'Brisker, balanced rhythm for a gentle lift without the jitters.',
    phases: [['inhale', 3], ['exhale', 3]],
  },
  {
    id: 'free', name: 'Free', tag: 'no pacing',
    desc: 'No guidance — just sound and visuals. Breathe however feels natural.',
    phases: [],
  },
  {
    id: 'custom', name: 'Custom', tag: 'yours',
    desc: 'Set your own counts for each part of the breath.',
    phases: null, // built from prefs.custom
  },
];

export function resolvePattern(id, custom) {
  const p = PATTERNS.find((x) => x.id === id) || PATTERNS[0];
  if (p.id !== 'custom') return p;
  const phases = [];
  if (custom.inhale > 0) phases.push(['inhale', custom.inhale]);
  if (custom.hold > 0) phases.push(['hold', custom.hold]);
  if (custom.exhale > 0) phases.push(['exhale', custom.exhale]);
  if (custom.rest > 0) phases.push(['rest', custom.rest]);
  const tag = [custom.inhale, custom.hold, custom.exhale, custom.rest].filter((n) => n > 0).join(' · ');
  return { ...p, tag, phases: phases.length ? phases : [['inhale', 4], ['exhale', 6]] };
}
