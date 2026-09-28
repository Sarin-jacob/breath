#!/usr/bin/env node
// Usage: npm run voices            → generate every preset pack
//        npm run voices aria guy   → only these presets
import { VOICE_PRESETS } from '../src/data/voice-presets.js';
import { generateVoicePack } from './lib/voicegen.js';

const wanted = process.argv.slice(2);
const presets = wanted.length ? VOICE_PRESETS.filter((p) => wanted.includes(p.id)) : VOICE_PRESETS;
if (!presets.length) {
  console.error(`No presets match. Available: ${VOICE_PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

for (const preset of presets) {
  process.stdout.write(`${preset.id.padEnd(10)} `);
  try {
    const entry = await generateVoicePack(preset, {
      onProgress: (done, total) => process.stdout.write(`\r${preset.id.padEnd(10)} ${done}/${total}`),
    });
    console.log(`  ✓ ${(entry.bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
    process.exitCode = 1;
  }
}
process.exit();
