// Dev-server-only API backing the /dev/ studio page. Never included in the build.
import { generateVoicePack, listEdgeVoices, readManifest, removeAsset, saveAmbience, synth } from './lib/voicegen.js';

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const json = (res, data, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

export function devTools() {
  let voiceCache;
  return {
    name: 'breath-dev-tools',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/__dev/')) return next();
        const url = new URL(req.url, 'http://x');
        try {
          switch (`${req.method} ${url.pathname}`) {
            case 'GET /__dev/manifest':
              return json(res, await readManifest());
            case 'GET /__dev/edge-voices':
              voiceCache ||= await listEdgeVoices();
              return json(res, voiceCache);
            case 'POST /__dev/tts': {
              const { text, voice, rate, pitch } = JSON.parse(await readBody(req));
              const mp3 = await synth(text, { voice, rate, pitch });
              res.setHeader('Content-Type', 'audio/mpeg');
              return res.end(mp3);
            }
            case 'POST /__dev/voice-pack': {
              const preset = JSON.parse(await readBody(req));
              return json(res, await generateVoicePack(preset));
            }
            case 'POST /__dev/ambience': {
              const meta = Object.fromEntries(url.searchParams);
              return json(res, await saveAmbience(meta, await readBody(req)));
            }
            case 'DELETE /__dev/asset':
              return json(res, await removeAsset(url.searchParams.get('kind'), url.searchParams.get('id')));
            default:
              return json(res, { error: 'not found' }, 404);
          }
        } catch (e) {
          console.error('[dev-tools]', e);
          return json(res, { error: e.message }, 500);
        }
      });
    },
  };
}
