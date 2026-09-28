// Every spoken cue. Each key can have several variants; the app rotates through them
// so guidance never feels robotic. Shared by the app (TTS fallback) and the voice generator.
export const PHRASES = {
  inhale: ['Breathe in', 'Inhale, slowly', 'Draw the breath in'],
  inhale2: ['And a little more', 'Top it up'],
  hold: ['Hold', 'Hold gently', 'Stay here'],
  exhale: ['Breathe out', 'Let it go', 'Exhale, slowly'],
  rest: ['Rest', 'Pause', 'Be still'],
  welcome: [
    'Welcome. Find a comfortable position, and let your body grow heavy.',
    'Welcome. Let your shoulders soften, and your jaw relax.',
  ],
  begin: ['Let us begin.', 'Follow the breath.'],
  settle: [
    'Let your thoughts drift by, like clouds.',
    'Nothing to do. Nowhere to be.',
    'Notice the breath, and let everything else soften.',
  ],
  end: [
    'Gently, come back. Your session is complete.',
    'Slowly return. Wiggle your fingers. Well done.',
  ],
  one: ['One'], two: ['Two'], three: ['Three'], four: ['Four'], five: ['Five'],
  six: ['Six'], seven: ['Seven'], eight: ['Eight'], nine: ['Nine'], ten: ['Ten'],
};

export const NUMBER_KEYS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Text shown on screen for each breath phase.
export const PHASE_LABEL = {
  inhale: 'Breathe in',
  inhale2: 'A little more',
  hold: 'Hold',
  exhale: 'Breathe out',
  rest: 'Rest',
};
