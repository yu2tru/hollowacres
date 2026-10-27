import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// sRGB-authored colour component -> linear (vertex colours are linear in three.js)
export const lin = (v) => Math.pow(Math.max(0, v), 2.2);

// Paint a solid vertex colour onto a geometry (adds/overwrites `color`).
// Colours are given in sRGB (as picked by eye) and stored linear.
export function tint(geo, r, g, b, jitter = 0, seed = 1) {
  r = lin(r); g = lin(g); b = lin(b);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    const j = 1 + ((s / 2147483647) - 0.5) * jitter;
    c[i * 3] = r * j; c[i * 3 + 1] = g * j; c[i * 3 + 2] = b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Vertical gradient (darker at bottom) multiplied into existing colour.
export function shadeByHeight(geo, y0, y1, lo = 0.55, hi = 1.1) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = lo + (hi - lo) * t;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}

export function noiseDisplace(geo, amount, seed = 1, freq = 1.3) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * freq * 3.1 + seed) * Math.cos(z * freq * 2.7 + seed * 1.3) + Math.sin(y * freq * 2.3 + seed * 0.7) * 0.6;
    const len = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + (x / len) * n * amount, y + (y / len) * n * amount * 0.6, z + (z / len) * n * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

export function merge(list) {
  const prepared = list.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    // ensure consistent attributes
    if (!q.attributes.color) tint(q, 1, 1, 1);
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (!q.attributes.normal) q.computeVertexNormals();
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) q.deleteAttribute(k);
    return q;
  });
  return mergeGeometries(prepared, false);
}

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}
