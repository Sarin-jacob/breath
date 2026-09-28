// Default voice packs the dev tool / `npm run voices` generate with neural TTS.
// rate/pitch are SSML prosody values; slow and slightly low reads as calmer.
export const VOICE_PRESETS = [
  { id: 'aria', label: 'Aria', desc: 'Soft, warm American female', voice: 'en-US-AriaNeural', rate: '-24%', pitch: '-4%' },
  { id: 'guy', label: 'Guy', desc: 'Deep, grounded American male', voice: 'en-US-GuyNeural', rate: '-22%', pitch: '-10%' },
  { id: 'sonia', label: 'Sonia', desc: 'Gentle British female', voice: 'en-GB-SoniaNeural', rate: '-22%', pitch: '-3%' },
  { id: 'ryan', label: 'Ryan', desc: 'Calm British male', voice: 'en-GB-RyanNeural', rate: '-22%', pitch: '-8%' },
  { id: 'neerja', label: 'Neerja', desc: 'Serene Indian English female', voice: 'en-IN-NeerjaNeural', rate: '-22%', pitch: '-2%' },
  { id: 'natasha', label: 'Natasha', desc: 'Airy Australian female', voice: 'en-AU-NatashaNeural', rate: '-22%', pitch: '-4%' },
];
