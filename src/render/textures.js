// Procedural PBR texture generation (albedo, normal, roughness) on canvases.
// All textures tile seamlessly. Generated once at load, cached.
import * as THREE from 'three';
import { hash2 } from '../core/rng.js';

function tileNoise(size, period, seed) {
  // tileable value noise sampled at `period` cells across the texture
  const out = new Float32Array(size * size);
  const cell = size / period;
  for (let y = 0; y < size; y++) {
    const fy = y / cell, yi = Math.floor(fy), yf = fy - yi;
    const v = yf * yf * (3 - 2 * yf);
    for (let x = 0; x < size; x++) {
      const fx = x / cell, xi = Math.floor(fx), xf = fx - xi;
      const u = xf * xf * (3 - 2 * xf);
      const x0 = xi % period, x1 = (xi + 1) % period, y0 = yi % period, y1 = (yi + 1) % period;
      const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
      out[y * size + x] = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
  }
  return out;
}

export function fbmTile(size, basePeriod, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, period, seed + o * 31);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= gain; period *= 2;
    if (period > size) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function makeTex(size, fill, { srgb = true, repeat = true } = {}) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function normalFromHeight(h, size, strength) {
  return (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  };
}

function build(size, heightFn, colorFn, roughFn, normalStrength = 2) {
  const h = new Float32Array(size * size);
  const col = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    h[i] = heightFn(x, y, i);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const c = colorFn(x, y, i, h[i]);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    rough[i] = roughFn(x, y, i, h[i]);
  }
  const map = makeTex(size, (d) => {
    for (let i = 0; i < size * size; i++) {
      d[i * 4] = Math.min(255, col[i * 3] * 255); d[i * 4 + 1] = Math.min(255, col[i * 3 + 1] * 255); d[i * 4 + 2] = Math.min(255, col[i * 3 + 2] * 255); d[i * 4 + 3] = 255;
    }
  });
  const normalMap = makeTex(size, normalFromHeight(h, size, normalStrength * size / 256), { srgb: false });
  const roughnessMap = makeTex(size, (d) => {
    for (let i = 0; i < size * size; i++) { const r = Math.min(255, rough[i] * 255); d[i * 4] = r; d[i * 4 + 1] = r; d[i * 4 + 2] = r; d[i * 4 + 3] = 255; }
  }, { srgb: false });
  return { map, normalMap, roughnessMap };
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function generateTextures(quality = 'high') {
  const S = quality === 'low' ? 256 : quality === 'medium' ? 512 : 512;
  const T = {};
  // --- ground: grass ---
  {
    const n1 = fbmTile(S, 8, 5, 11), n2 = fbmTile(S, 32, 3, 12), n3 = fbmTile(S, 4, 3, 13);
    T.grass = build(S, (x, y, i) => n2[i] * 0.6 + n1[i] * 0.4,
      (x, y, i, h) => {
        const dry = clamp01((n3[i] - 0.45) * 2.5);
        let c = mix([0.2, 0.27, 0.09], [0.36, 0.4, 0.16], n1[i]);
        c = mix(c, [0.45, 0.4, 0.22], dry * 0.55);
        const blade = n2[i] > 0.62 ? 1.12 : n2[i] < 0.35 ? 0.82 : 1;
        return c.map((v) => v * blade);
      }, (x, y, i) => 0.82 + n2[i] * 0.15, 2.2);
  }
  // --- dirt (tilled soil / paths) ---
  {
    const n1 = fbmTile(S, 8, 5, 21), n2 = fbmTile(S, 48, 2, 22), pebbles = fbmTile(S, 128, 1, 23);
    T.dirt = build(S, (x, y, i) => n1[i] * 0.6 + n2[i] * 0.3 + (pebbles[i] > 0.86 ? 0.2 : 0),
      (x, y, i) => {
        let c = mix([0.25, 0.18, 0.12], [0.38, 0.29, 0.2], n1[i]);
        if (pebbles[i] > 0.86) c = mix(c, [0.42, 0.38, 0.32], 0.45);
        return c;
      }, (x, y, i) => 0.88 + n2[i] * 0.1, 2.5);
  }
  // --- gravel ---
  {
    const n1 = fbmTile(S, 64, 2, 31), n2 = fbmTile(S, 128, 1, 32), n3 = fbmTile(S, 8, 3, 33);
    T.gravel = build(S, (x, y, i) => Math.pow(n1[i], 1.5) + n2[i] * 0.3,
      (x, y, i) => {
        const g = 0.27 + n2[i] * 0.16 + (n1[i] - 0.5) * 0.18;
        return mix([g, g * 0.96, g * 0.9], [0.3, 0.25, 0.19], clamp01(n3[i] - 0.3) * 0.7);
      }, (x, y, i) => 0.75 + n1[i] * 0.2, 4);
  }
  // --- wood planks (house siding, painted white, weathered) ---
  {
    const grain = fbmTile(S, 4, 4, 41), n = fbmTile(S, 16, 4, 42), peel = fbmTile(S, 32, 3, 43);
    const boards = 8;
    T.siding = build(S, (x, y, i) => {
      const by = (y % (S / boards)) / (S / boards);
      const lip = by < 0.06 ? -0.4 : by * 0.25;
      return lip + grain[i] * 0.1 + (peel[i] > 0.8 ? -0.05 : 0);
    }, (x, y, i) => {
      const by = (y % (S / boards)) / (S / boards);
      let c = [0.86, 0.85, 0.8];
      c = mix(c, [0.7, 0.68, 0.62], n[i] * 0.35);
      if (peel[i] > 0.8) c = mix(c, mix([0.62, 0.55, 0.45], [0.5, 0.43, 0.34], grain[i]), 0.7);
      if (by < 0.06) c = c.map((v) => v * 0.55);
      return c;
    }, (x, y, i) => (peel[i] > 0.8 ? 0.88 : 0.72), 3);
  }
  // --- barn boards (red, board & batten, weathered) ---
  {
    const grainY = fbmTile(S, 2, 3, 51), n = fbmTile(S, 16, 4, 52), streak = fbmTile(S, 32, 3, 53);
    const boards = 10;
    T.barn = build(S, (x, y, i) => {
      const bx = (x % (S / boards)) / (S / boards);
      const batten = bx < 0.14 ? 0.5 : 0;
      return batten + grainY[(i + x * 7) % (S * S)] * 0.15 + streak[i] * 0.1;
    }, (x, y, i) => {
      const bx = (x % (S / boards)) / (S / boards);
      let c = mix([0.42, 0.1, 0.07], [0.55, 0.16, 0.1], n[i]);
      c = mix(c, [0.35, 0.28, 0.22], clamp01((streak[i] - 0.55) * 3) * 0.7); // worn to bare wood
      if (bx > 0.13 && bx < 0.155) c = c.map((v) => v * 0.5);
      return c;
    }, (x, y, i) => 0.85 + n[i] * 0.1, 3);
  }
  // --- raw weathered wood (sheds, fences, barricades, porch) ---
  {
    const g = fbmTile(S, 3, 4, 61), n = fbmTile(S, 16, 4, 62), knots = fbmTile(S, 32, 1, 63);
    const boards = 6;
    T.wood = build(S, (x, y, i) => {
      const by = (y % (S / boards)) / (S / boards);
      return (by < 0.04 ? -0.5 : 0) + g[(y * S + ((x * 3) % S))] * 0.3 + (knots[i] > 0.93 ? -0.2 : 0);
    }, (x, y, i) => {
      const by = (y % (S / boards)) / (S / boards);
      let c = mix([0.36, 0.3, 0.24], [0.55, 0.49, 0.41], n[i]);
      c = mix(c, [0.3, 0.3, 0.29], g[i] * 0.4);
      if (knots[i] > 0.93) c = c.map((v) => v * 0.8);
      if (by < 0.04) c = c.map((v) => v * 0.4);
      return c;
    }, (x, y, i) => 0.88, 3);
  }
  // --- roof shingles ---
  {
    const n = fbmTile(S, 16, 4, 71), m = fbmTile(S, 64, 2, 72);
    const rows = 16;
    T.shingles = build(S, (x, y, i) => {
      const r = Math.floor(y / (S / rows));
      const off = (r % 2) * (S / 16);
      const sx = ((x + off) % (S / 8)) / (S / 8);
      const sy = (y % (S / rows)) / (S / rows);
      return sy * 0.6 + (sx < 0.05 ? -0.4 : 0) + m[i] * 0.2;
    }, (x, y, i) => {
      const r = Math.floor(y / (S / rows));
      const tone = hash2(r, Math.floor((x + (r % 2) * (S / 16)) / (S / 8)), 7) * 0.12;
      let c = mix([0.17, 0.17, 0.18], [0.27, 0.26, 0.25], n[i] * 0.6 + tone);
      c = mix(c, [0.24, 0.27, 0.16], clamp01((m[i] - 0.65) * 3) * 0.5); // moss
      return c;
    }, (x, y, i) => 0.9, 3);
  }
  // --- corrugated metal (rusty) ---
  {
    const n = fbmTile(S, 8, 5, 81), streak = fbmTile(S, 4, 4, 82);
    const ribs = 16;
    T.metal = build(S, (x, y, i) => Math.sin((x / S) * ribs * Math.PI * 2) * 0.5 + n[i] * 0.1, (x, y, i) => {
      const rust = clamp01((n[i] + streak[(y * S + x) % (S * S)] * 0.5 - 0.95) * 2.5);
      return mix([0.55, 0.57, 0.58], [0.42, 0.26, 0.15], rust * 0.8);
    }, (x, y, i) => {
      const rust = clamp01((n[i] - 0.65) * 3);
      return 0.42 + rust * 0.45;
    }, 6);
    T.metal.metalness = true;
  }
  // --- bark ---
  {
    const n = fbmTile(S, 6, 5, 91), v = fbmTile(S, 2, 4, 92);
    T.bark = build(S, (x, y, i) => {
      const vv = v[(y * S + ((x * 5) % S))];
      return Math.abs(Math.sin((x / S) * 24 + vv * 6)) * 0.7 + n[i] * 0.3;
    }, (x, y, i, h) => mix([0.16, 0.13, 0.1], [0.36, 0.31, 0.26], h * 0.8 + n[i] * 0.2), () => 0.92, 5);
  }
  // --- stone / foundation ---
  {
    const n = fbmTile(S, 8, 5, 101), cells = fbmTile(S, 6, 2, 102), lich = fbmTile(S, 16, 3, 103);
    T.stone = build(S, (x, y, i) => n[i] * 0.7 + Math.abs(cells[i] - 0.5) * 0.6, (x, y, i) => {
      let c = mix([0.36, 0.35, 0.33], [0.55, 0.54, 0.5], n[i]);
      c = mix(c, [0.45, 0.47, 0.33], clamp01((lich[i] - 0.62) * 4) * 0.5);
      return c;
    }, (x, y, i) => 0.85 + n[i] * 0.1, 4);
  }
  // --- concrete ---
  {
    const n = fbmTile(S, 16, 5, 111), s = fbmTile(S, 64, 2, 112);
    T.concrete = build(S, (x, y, i) => n[i] * 0.3 + s[i] * 0.2, (x, y, i) => {
      const g = 0.5 + (n[i] - 0.5) * 0.25 - (s[i] > 0.75 ? 0.08 : 0);
      return [g, g * 0.99, g * 0.96];
    }, (x, y, i) => 0.9, 1.5);
  }
  // --- tilled soil (rows) for plot beds ---
  {
    const n = fbmTile(S, 16, 5, 121), clod = fbmTile(S, 32, 2, 122);
    const rows = 6;
    T.soil = build(S, (x, y, i) => Math.sin((x / S) * rows * Math.PI * 2) * 0.35 + n[i] * 0.3 + clod[i] * 0.25,
      (x, y, i, h) => mix([0.16, 0.11, 0.07], [0.33, 0.24, 0.16], clamp01(h * 0.8 + 0.1)), (x, y, i) => 0.95, 4);
  }
  // --- interior wallpaper ---
  {
    const n = fbmTile(S, 16, 4, 131);
    T.wallpaper = build(S, (x, y, i) => n[i] * 0.05, (x, y, i) => {
      const stripe = Math.floor((x / S) * 12) % 2 === 0 ? 1 : 0.92;
      return mix([0.55, 0.5, 0.38], [0.42, 0.38, 0.28], n[i] * 0.6).map((v) => v * stripe);
    }, () => 0.85, 0.5);
  }
  // --- plaid flannel (sleeves) ---
  {
    const n = fbmTile(S, 32, 2, 141);
    T.flannel = build(S, (x, y, i) => n[i] * 0.1, (x, y) => {
      const a = (Math.floor(x / (S / 8)) % 2), b = (Math.floor(y / (S / 8)) % 2);
      const thin = (x % (S / 8) < 3) || (y % (S / 8) < 3);
      let c = a && b ? [0.42, 0.08, 0.07] : a || b ? [0.3, 0.08, 0.07] : [0.12, 0.08, 0.07];
      if (thin) c = [0.18, 0.16, 0.12];
      return c;
    }, () => 0.95, 0.6);
  }
  return T;
}

// Leaf-cluster alpha texture for tree crowns (not tileable)
export function leafTexture(size = 256, seed = 5, palette = [[0.16, 0.24, 0.08], [0.32, 0.38, 0.12]]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * size * 0.42;
    const x = size / 2 + Math.cos(a) * r, y = size / 2 + Math.sin(a) * r;
    const t = rnd();
    const c = mix(palette[0], palette[1], t);
    ctx.fillStyle = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.035, size * 0.016, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Small soft radial sprite (glows, particles)
export function glowTexture(size = 64, falloff = 2.2) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.pow(Math.max(0, 1 - d), falloff);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  return t;
}
