// Bundled audio (voice packs + recorded ambience) described by public/audio/manifest.json.
const BASE = new URL('audio/', document.baseURI);
const MEDIA_CACHE = 'breath-media';

let manifestP;
export function manifest() {
  manifestP ||= fetch(new URL('manifest.json', BASE))
    .then((r) => r.json())
    .catch(() => ({ voices: [], ambience: [] }));
  return manifestP;
}

export const assetUrl = (rel) => new URL(rel, BASE).href;

export async function voicePack(id) {
  const m = await manifest();
  return m.voices.find((v) => v.id === id) || m.voices[0];
}

export const packUrls = (pack) => Object.values(pack?.clips || {}).flat().map(assetUrl);

const decoded = new Map();
export async function decode(ctx, url) {
  if (!decoded.has(url)) {
    decoded.set(url, fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((b) => ctx.decodeAudioData(b))
      .catch((e) => { decoded.delete(url); throw e; }));
  }
  return decoded.get(url);
}

/** How many of these urls are already in the offline cache. */
export async function cachedCount(urls) {
  if (!('caches' in window)) return 0;
  const c = await caches.open(MEDIA_CACHE);
  const hits = await Promise.all(urls.map((u) => c.match(u)));
  return hits.filter(Boolean).length;
}

/** Download urls into the offline cache (the service worker serves them from there). */
export async function saveOffline(urls, onProgress = () => {}) {
  if (!('caches' in window)) throw new Error('Offline storage is not supported in this browser');
  const c = await caches.open(MEDIA_CACHE);
  let done = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      if (!(await c.match(u))) {
        const r = await fetch(u, { cache: 'no-cache' });
        if (r.ok) await c.put(u, r);
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

export async function removeOffline(urls) {
  if (!('caches' in window)) return;
  const c = await caches.open(MEDIA_CACHE);
  await Promise.all(urls.map((u) => c.delete(u)));
}

export async function storageInfo() {
  const est = (await navigator.storage?.estimate?.()) || {};
  return { used: est.usage || 0, quota: est.quota || 0 };
}

export async function persistStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export const fmtBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
