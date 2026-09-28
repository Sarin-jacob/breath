// Renders the app icon (a glowing orb) to PNG without any native deps.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '../public/icons');
fs.mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function orb(orbR, rounded) {
  return (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy);
    // background: deep indigo radial
    let r = mix(22, 5, Math.min(1, d * 1.6)), g = mix(18, 6, Math.min(1, d * 1.6)), b = mix(60, 15, Math.min(1, d * 1.6));
    // halo
    const halo = Math.exp(-((d / (orbR * 1.8)) ** 2)) * 0.45;
    r += 120 * halo; g += 100 * halo; b += 230 * halo;
    // orb body with highlight
    if (d < orbR) {
      const t = d / orbR;
      const hl = Math.max(0, 1 - Math.hypot(dx + orbR * 0.3, dy + orbR * 0.35) / (orbR * 1.1));
      const edge = Math.min(1, (1 - t) * 8);
      r = mix(r, mix(150, 240, hl), edge * 0.9);
      g = mix(g, mix(130, 235, hl), edge * 0.9);
      b = mix(b, mix(245, 255, hl), edge * 0.9);
    }
    let a = 255;
    if (rounded) {
      const q = 0.22, ax = Math.max(0, Math.abs(dx) - (0.5 - q)), ay = Math.max(0, Math.abs(dy) - (0.5 - q));
      const cd = Math.hypot(ax, ay) - q;
      a = 255 * Math.min(1, Math.max(0, -cd * 250));
    }
    return [clamp(r), clamp(g), clamp(b), a];
  };
}
fs.writeFileSync(path.join(out, 'icon-192.png'), png(192, orb(0.2, true)));
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512, orb(0.2, true)));
fs.writeFileSync(path.join(out, 'icon-512-maskable.png'), png(512, orb(0.16, false)));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), png(180, orb(0.2, false)));
fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><radialGradient id="bg" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#161240"/><stop offset="1" stop-color="#05060f"/></radialGradient>
<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9d8cff" stop-opacity=".7"/><stop offset="1" stop-color="#9d8cff" stop-opacity="0"/></radialGradient>
<radialGradient id="orb" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#f4f1ff"/><stop offset=".5" stop-color="#a99bff"/><stop offset="1" stop-color="#5a48d8"/></radialGradient></defs>
<rect width="64" height="64" rx="14" fill="url(#bg)"/><circle cx="32" cy="32" r="28" fill="url(#halo)"/><circle cx="32" cy="32" r="13" fill="url(#orb)"/></svg>
`);
console.log('icons written');
