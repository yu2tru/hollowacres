import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Box-projected world-scale UVs so textures keep a consistent texel density.
export function worldUV(geo, scale = 2, offset = [0, 0, 0]) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function mergeList(list) {
  const prepared = list.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k);
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    return q;
  });
  return mergeGeometries(prepared, false);
}

export function bx(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cy(rt, rb, h, seg = 12, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function mk(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

// A wall (local: x along length, y up from 0, z thickness) with rectangular openings.
export function wallGeo(len, h, t, openings = []) {
  const parts = [];
  const ops = [...openings].sort((a, b) => a.offset - b.offset);
  let cursor = -len / 2;
  for (const o of ops) {
    const l = o.offset - o.width / 2, r = o.offset + o.width / 2;
    if (l > cursor + 0.01) parts.push(bx(l - cursor, h, t, (cursor + l) / 2, h / 2, 0));
    if (o.bottom > 0.01) parts.push(bx(o.width, o.bottom, t, o.offset, o.bottom / 2, 0));
    if (o.top < h - 0.01) parts.push(bx(o.width, h - o.top, t, o.offset, (h + o.top) / 2, 0));
    cursor = r;
  }
  if (cursor < len / 2 - 0.01) parts.push(bx(len / 2 - cursor, h, t, (cursor + len / 2) / 2, h / 2, 0));
  return mergeList(parts);
}

export function textTexture(lines, { w = 512, h = 256, bg = '#e8e1cc', fg = '#2a2420', font = 'bold 64px Georgia', weathered = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (weathered) {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '60,50,40' : '255,255,240'},${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 30, Math.random() * 4);
    }
  }
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.6))));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
