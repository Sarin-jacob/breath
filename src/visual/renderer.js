// Canvas visuals. Every theme is driven by `level` (0 = empty lungs, 1 = full) so the picture
// itself is the breathing guide. Nothing ever flashes: all changes are slow and eased.

export const THEMES = [
  { id: 'aurora', name: 'Aurora Orb', desc: 'A glowing orb in drifting northern lights.' },
  { id: 'nebula', name: 'Nebula', desc: 'A galaxy of particles that gathers and expands.' },
  { id: 'mandala', name: 'Mandala', desc: 'Sacred geometry slowly blooming and turning.' },
  { id: 'horizon', name: 'Moonlit Sea', desc: 'The tide rises and falls under the moon.' },
  { id: 'tunnel', name: 'Hypnotic Tunnel', desc: 'Rings flowing outward on the in-breath, inward on the out-breath.' },
  { id: 'void', name: 'Void', desc: 'Pure black with a single thin ring. Easy on OLED and eyes.' },
];

const TAU = Math.PI * 2;

function glowSprite(hue, sat = 80, light = 60) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, `hsla(${hue},${sat}%,${light}%,1)`);
  grd.addColorStop(0.25, `hsla(${hue},${sat}%,${light}%,0.55)`);
  grd.addColorStop(0.6, `hsla(${hue},${sat}%,${light * 0.8}%,0.12)`);
  grd.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return c;
}

function grainPattern(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.theme = 'aurora';
    this.hue = 250;
    this.hueNow = 250;
    this.reduced = false;
    this.dim = 0;
    this.dimNow = 0;
    this.sprites = new Map();
    this.ripples = [];
    this.lastKind = null;
    this.tunnelPhase = 0;
    this.grain = grainPattern(this.ctx);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth;
    const h = innerHeight;
    // Cap the pixel count so big screens / weak GPUs stay smooth.
    const scale = Math.min(dpr, Math.sqrt(2.4e6 / (w * h)));
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.m = Math.min(this.w, this.h);
    this.scale = scale;
    this.particles = null;
    this.motes = null;
  }

  setTheme(id) { if (id !== this.theme) { this.theme = id; this.particles = null; } }
  setHue(h) { this.hue = h; }

  sprite(h, s, l) {
    const key = `${Math.round(h) % 360}-${s}-${l}`;
    if (!this.sprites.has(key)) {
      if (this.sprites.size > 80) this.sprites.clear();
      this.sprites.set(key, glowSprite(Math.round(h) % 360, s, l));
    }
    return this.sprites.get(key);
  }

  drawGlow(x, y, r, h, alpha, s = 80, l = 60) {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.drawImage(this.sprite(h, s, l), x - r, y - r, r * 2, r * 2);
  }

  /** state: { level, kind, p }  t: seconds */
  frame(state, t, dt) {
    const c = this.ctx;
    const speed = this.reduced ? 0.35 : 1;
    const T = t * speed;
    // Hue eases toward target and leans slightly cooler on the in-breath, warmer on the out.
    let dh = this.hue - this.hueNow;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    this.hueNow = (this.hueNow + dh * Math.min(1, dt * 0.8) + 360) % 360;
    this.dimNow += (this.dim - this.dimNow) * Math.min(1, dt * 1.5);
    const hue = this.hueNow + (state.level - 0.5) * 16;

    if (state.kind !== this.lastKind) {
      if ((state.kind === 'inhale' || state.kind === 'exhale') && !this.reduced) this.ripples.push({ born: t, kind: state.kind });
      this.lastKind = state.kind;
    }
    this.ripples = this.ripples.filter((r) => t - r.born < 7);

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    (this[this.theme] || this.aurora).call(this, c, state, T, hue, t);

    // Film grain for depth and to hide gradient banding.
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.05;
    c.fillStyle = this.grain;
    c.fillRect(0, 0, this.w, this.h); // static grain: texture without shimmer
    c.globalCompositeOperation = 'source-over';
    if (this.dimNow > 0.01) {
      c.globalAlpha = this.dimNow;
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.w, this.h);
    }
    c.globalAlpha = 1;
  }

  background(c, hue, l = 4) {
    const g = c.createRadialGradient(this.w / 2, this.h * 0.45, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, `hsl(${hue},45%,${l + 3}%)`);
    g.addColorStop(1, `hsl(${hue + 20},50%,${l * 0.35}%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
  }

  motesLayer(c, T, hue, n = 50) {
    if (!this.motes) {
      this.motes = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.8, v: 0.004 + Math.random() * 0.01, ph: Math.random() * TAU }));
    }
    c.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const y = ((m.y - T * m.v) % 1 + 1) % 1;
      const x = m.x + Math.sin(T * 0.1 + m.ph) * 0.02;
      const a = 0.25 + 0.25 * Math.sin(T * 0.4 + m.ph);
      this.drawGlow(x * this.w, y * this.h, m.s * 6 * this.scale, hue + 30, a * 0.5, 60, 75);
    }
  }

  ripplesLayer(c, cx, cy, r0, hue, t) {
    c.globalCompositeOperation = 'lighter';
    for (const r of this.ripples) {
      const age = (t - r.born) / 7;
      const rr = r.kind === 'inhale' ? r0 * (1 + age * 2.2) : r0 * (1 + (1 - age) * 0.6);
      c.globalAlpha = (1 - age) ** 2 * 0.22;
      c.strokeStyle = `hsl(${hue + 20},70%,75%)`;
      c.lineWidth = 1.2 * this.scale;
      c.beginPath();
      c.arc(cx, cy, rr, 0, TAU);
      c.stroke();
    }
  }

  orb(c, cx, cy, r, hue, level) {
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(cx, cy, r * 3.2, hue, 0.35 + level * 0.25);
    this.drawGlow(cx, cy, r * 1.9, hue + 25, 0.45 + level * 0.2, 70, 65);
    c.globalCompositeOperation = 'source-over';
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
    g.addColorStop(0, `hsla(${hue + 40},90%,92%,0.95)`);
    g.addColorStop(0.45, `hsla(${hue + 10},75%,68%,0.75)`);
    g.addColorStop(0.85, `hsla(${hue - 15},70%,42%,0.45)`);
    g.addColorStop(1, `hsla(${hue - 20},70%,30%,0)`);
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();
  }

  // ---------------- Themes ----------------

  aurora(c, s, T, hue, t) {
    this.background(c, hue);
    const { w, h, m } = this;
    c.globalCompositeOperation = 'lighter';
    const blobs = [
      [0.07, 0.05, 0.32, 0.22, 0, 0],
      [0.05, 0.08, 0.36, 0.2, 2.1, 50],
      [0.04, 0.06, 0.3, 0.28, 4.2, -40],
      [0.06, 0.04, 0.4, 0.18, 1.3, 90],
    ];
    for (const [a, b, rx, ry, ph, dh] of blobs) {
      const x = w / 2 + Math.cos(T * a + ph) * w * rx;
      const y = h / 2 + Math.sin(T * b + ph * 1.3) * h * ry;
      this.drawGlow(x, y, m * (0.55 + 0.15 * s.level), hue + dh, 0.2 + 0.08 * s.level, 70, 45);
    }
    this.motesLayer(c, T, hue);
    const r = m * (0.13 + 0.13 * s.level);
    this.ripplesLayer(c, w / 2, h / 2, r, hue, t);
    this.orb(c, w / 2, h / 2, r, hue, s.level);
  }

  nebula(c, s, T, hue) {
    const { w, h, m } = this;
    // Trails: fade the previous frame instead of clearing.
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = this.reduced ? 0.5 : 0.2;
    c.fillStyle = `hsl(${hue},45%,3%)`;
    c.fillRect(0, 0, w, h);
    if (!this.particles) {
      const n = Math.round(Math.min(1400, (w * h) / 1400));
      this.particles = Array.from({ length: n }, () => {
        const rf = Math.random() ** 0.7;
        return { a: Math.random() * TAU, rf, v: (0.03 + Math.random() * 0.05) / (0.3 + rf), s: 0.6 + Math.random() * 1.6, dh: (rf - 0.5) * 90 + (Math.random() - 0.5) * 30, ph: Math.random() * TAU };
      });
    }
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(w / 2, h / 2, m * (0.25 + 0.2 * s.level), hue, 0.35);
    const R = m * 0.46 * (0.28 + 0.72 * s.level);
    const sz = this.scale;
    for (const p of this.particles) {
      const a = p.a + T * p.v;
      // Spiral arms: angle bends with radius.
      const arm = a + p.rf * 2.4;
      const rr = R * p.rf + Math.sin(T * 0.3 + p.ph) * m * 0.01;
      const x = w / 2 + Math.cos(arm) * rr;
      const y = h / 2 + Math.sin(arm) * rr * 0.92;
      c.globalAlpha = 0.35 + 0.4 * (1 - p.rf);
      c.fillStyle = `hsl(${hue + p.dh},80%,${60 + 25 * (1 - p.rf)}%)`;
      c.fillRect(x, y, p.s * sz, p.s * sz);
    }
    this.drawGlow(w / 2, h / 2, m * 0.05 * (1 + s.level), hue + 40, 0.9, 60, 85);
  }

  mandala(c, s, T, hue, t) {
    this.background(c, hue, 3);
    const { w, h, m } = this;
    const cx = w / 2;
    const cy = h / 2;
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(cx, cy, m * 0.5, hue, 0.25 + 0.15 * s.level, 60, 40);
    const rings = [
      [8, 0.07, 0.06, 1],
      [12, 0.13, 0.08, -1],
      [16, 0.2, 0.09, 1],
      [24, 0.28, 0.08, -1],
      [36, 0.36, 0.06, 1],
    ];
    const open = 0.55 + 0.6 * s.level;
    c.lineWidth = 1.1 * this.scale;
    rings.forEach(([n, rad, len, dir], k) => {
      const R = m * rad * (0.72 + 0.4 * s.level);
      const L = m * len * open;
      const rot = T * 0.03 * dir * (1 + k * 0.2);
      const hh = hue + k * 18;
      c.strokeStyle = `hsla(${hh},80%,72%,${0.5 - k * 0.05})`;
      c.fillStyle = `hsla(${hh},80%,60%,0.05)`;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        const wdt = (TAU / n) * 0.5 * (0.7 + 0.3 * s.level);
        const x0 = cx + Math.cos(a) * R;
        const y0 = cy + Math.sin(a) * R;
        const x1 = cx + Math.cos(a) * (R + L);
        const y1 = cy + Math.sin(a) * (R + L);
        c.moveTo(x0, y0);
        c.quadraticCurveTo(cx + Math.cos(a - wdt) * (R + L * 0.6), cy + Math.sin(a - wdt) * (R + L * 0.6), x1, y1);
        c.quadraticCurveTo(cx + Math.cos(a + wdt) * (R + L * 0.6), cy + Math.sin(a + wdt) * (R + L * 0.6), x0, y0);
      }
      c.fill();
      c.stroke();
      c.globalAlpha = 0.18;
      c.beginPath();
      c.arc(cx, cy, R, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
    });
    this.ripplesLayer(c, cx, cy, m * 0.08, hue, t);
    this.drawGlow(cx, cy, m * 0.06 * (1 + s.level), hue + 40, 0.9, 70, 80);
  }

  horizon(c, s, T, hue) {
    const { w, h, m } = this;
    const hy = h * 0.6;
    const sky = c.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, `hsl(${hue + 10},55%,3%)`);
    sky.addColorStop(0.7, `hsl(${hue},45%,9%)`);
    sky.addColorStop(1, `hsl(${hue - 25},55%,${16 + 6 * s.level}%)`);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, hy + 1);
    // Stars.
    if (!this.particles) {
      this.particles = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random() ** 1.5 * 0.55, s: Math.random() * 1.4 + 0.3, ph: Math.random() * TAU }));
    }
    c.fillStyle = '#fff';
    for (const st of this.particles) {
      c.globalAlpha = 0.25 + 0.3 * Math.sin(T * 0.3 + st.ph) ** 2;
      c.fillRect(st.x * w, st.y * h, st.s * this.scale, st.s * this.scale);
    }
    // Moon.
    const mx = w * 0.5;
    const my = h * 0.26;
    const mr = m * 0.055;
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(mx, my, mr * 7, hue + 20, 0.25 + 0.2 * s.level, 40, 60);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = `hsl(${hue + 30},40%,90%)`;
    c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.fill();
    // Sea.
    const sea = c.createLinearGradient(0, hy, 0, h);
    sea.addColorStop(0, `hsl(${hue - 10},50%,10%)`);
    sea.addColorStop(1, `hsl(${hue},55%,2%)`);
    c.fillStyle = sea;
    c.fillRect(0, hy, w, h - hy);
    // Moon path shimmer.
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const yy = hy + ((i / 40) ** 1.4) * (h - hy);
      const spread = 0.03 + (i / 40) * 0.12;
      const xx = mx + Math.sin(T * 0.8 + i * 1.7) * w * spread * 0.5;
      c.globalAlpha = 0.25 * (1 - i / 40) * (0.6 + 0.4 * Math.sin(T + i));
      c.fillStyle = `hsl(${hue + 30},50%,80%)`;
      c.fillRect(xx - w * spread * 0.3, yy, w * spread * 0.6, 1.5 * this.scale);
    }
    // Wave lines: the tide rises with the in-breath.
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = 1 * this.scale;
    const lines = 22;
    for (let j = 1; j <= lines; j++) {
      const k = j / lines;
      const base = hy + k ** 1.7 * (h - hy);
      const tide = -s.level * h * 0.045 * k;
      const amp = (2 + k * 14) * this.scale;
      c.strokeStyle = `hsla(${hue},60%,${55 + 15 * s.level}%,${0.08 + 0.2 * (1 - k)})`;
      c.beginPath();
      for (let x = 0; x <= w; x += 12 * this.scale) {
        const y = base + tide + Math.sin(x / (w * 0.08 * (0.5 + k)) + T * (0.5 + k * 0.4) + j) * amp;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  tunnel(c, s, T, hue) {
    this.background(c, hue, 2);
    const { w, h, m } = this;
    const cx = w / 2;
    const cy = h / 2;
    // Flow direction follows the breath: out on inhale, in on exhale.
    const dir = s.kind === 'inhale' || s.kind === 'inhale2' ? 1 : s.kind === 'exhale' ? -1 : 0.08;
    const target = dir * 0.12 * (this.reduced ? 0.3 : 1);
    this.tunnelV = (this.tunnelV ?? 0) + (target - (this.tunnelV ?? 0)) * 0.03;
    this.tunnelPhase = (this.tunnelPhase + this.tunnelV / 60 + 1) % 1;
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(cx, cy, m * (0.2 + 0.15 * s.level), hue + 30, 0.5, 70, 55);
    const n = 18;
    c.lineWidth = 1.4 * this.scale;
    for (let i = 0; i < n; i++) {
      const z = ((i / n + this.tunnelPhase) % 1);
      const r = m * 0.02 + (z ** 2.2) * Math.max(w, h) * 0.8;
      const a = Math.sin(z * Math.PI) * 0.45;
      c.strokeStyle = `hsla(${hue + z * 60},70%,65%,${a})`;
      c.beginPath();
      // Slightly polygonal, slowly twisting rings.
      const sides = 64;
      const tw = T * 0.05 + z * 2;
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * TAU;
        const wob = 1 + 0.03 * Math.sin(ang * 6 + tw);
        const x = cx + Math.cos(ang + tw * 0.2) * r * wob;
        const y = cy + Math.sin(ang + tw * 0.2) * r * wob;
        k ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    this.drawGlow(cx, cy, m * 0.04 * (1 + s.level), hue + 40, 0.8, 60, 85);
  }

  void(c, s, T, hue, t) {
    const { w, h, m } = this;
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    const r = m * (0.12 + 0.16 * s.level);
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(w / 2, h / 2, r * 1.6, hue, 0.08 + 0.06 * s.level, 50, 40);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.75;
    c.strokeStyle = `hsl(${hue + 20},35%,78%)`;
    c.lineWidth = 1.5 * this.scale;
    c.beginPath();
    c.arc(w / 2, h / 2, r, 0, TAU);
    c.stroke();
    this.ripplesLayer(c, w / 2, h / 2, r, hue, t);
  }
}
