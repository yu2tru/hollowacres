// Plot beds and crop plants (instanced per crop & stage). Plants visibly
// grow through stages; damage tints & flattens them; ruined plots show debris.
import * as THREE from 'three';
import { CROPS, PLANTABLE } from '../data/crops.js';
import { PLOT_SIZE } from '../data/layout.js';
import { heightAt } from '../sim/terrain.js';
import { plotOwned } from '../sim/farming.js';
import { tint, merge, shadeByHeight } from './geo-utils.js';
import { hash2 } from '../core/rng.js';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tp = new THREE.Vector3(), te = new THREE.Euler();
const col = new THREE.Color();

// Tapered, arching leaf blade. Starts at the origin pointing up (+y), arches
// toward +z by `arch`, then is tilted outward and turned to `rotY`.
function blade(len, w, color, rotY, tilt, y0 = 0, arch = 0.35, segs = 6, shape = 'blade') {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const width = shape === 'oval' ? w * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8 : w * (1 - t) ** 0.7 * (0.35 + 0.65 * Math.min(1, t * 4));
    const y = len * t * (1 - arch * t * 0.6), z = len * arch * t * t;
    const fold = width * 0.18; // slight V-fold along the midrib
    pos.push(-width / 2, y + fold, z, 0, y, z + fold * 0.3, width / 2, y + fold, z);
    if (i < segs) { const k = i * 3; idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.rotateX(tilt);
  g.rotateY(rotY);
  g.translate(0, y0, 0);
  return tint(g.toNonIndexed(), ...color, 0.18, Math.floor(rotY * 100 + y0 * 10));
}
const leaf = (w, h, color, rotY, tilt, y0 = 0) => blade(h, w, color, rotY, tilt, y0, 0.3, 5, 'oval');
function stalk(h, r, color, lean = 0, rot = 0) { const g = new THREE.CylinderGeometry(r * 0.6, r, h, 5); g.translate(0, h / 2, 0); if (lean) { g.rotateX(lean); g.rotateY(rot); } return tint(g, ...color); }
function ball(r, color, x, y, z, sy = 1) { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(1, sy, 1); g.translate(x, y, z); return tint(g, ...color, 0.1); }
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

const GREEN = [0.2, 0.36, 0.1], DGREEN = [0.13, 0.26, 0.07], YELLOW = [0.78, 0.66, 0.3], SPROUT = [0.3, 0.48, 0.14];

// geometry for crop at stage (1..4). Stage 0 = seeded (just soil).
function plantGeo(crop, stage) {
  const k = [0, 0.25, 0.55, 0.85, 1][stage];
  const parts = [];
  if (stage === 1) {
    for (let i = 0; i < 3; i++) parts.push(blade(0.12, 0.035, SPROUT, i * 2.1, 0.5, 0, 0.4, 3));
    return merge(parts);
  }
  switch (crop) {
    case 'wheat': {
      const c = stage >= 4 ? YELLOW : stage === 3 ? [0.62, 0.6, 0.26] : GREEN;
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39, r = Math.sqrt(rnd(i, 1)) * 0.2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = 0.95 * k * (0.85 + rnd(i, 2) * 0.3), lean = (rnd(i, 3) - 0.5) * 0.25;
        const s = stalk(h, 0.006, c, lean, a); s.translate(x, 0, z); parts.push(s);
        if (stage >= 3) {
          const head = ball(0.018, c, 0, 0, 0, 3.6); head.translate(0, h + 0.05, 0); head.rotateX(lean * 0.6); head.translate(x, 0, z);
          parts.push(head);
          for (let j = 0; j < 3; j++) { const aw = stalk(0.08, 0.0015, c, 0.25, j * 2.1); aw.translate(x, h + 0.08, z); parts.push(aw); }
        }
        if (i % 2 === 0) { const l = blade(0.32 * k, 0.025, stage >= 4 ? [0.68, 0.6, 0.3] : c, a, 0.7, 0.06, 0.5, 4); l.translate(x, 0, z); parts.push(l); }
      }
      break;
    }
    case 'corn': {
      const H = 2.3 * k;
      parts.push(stalk(H, 0.035, GREEN));
      for (let j = 1; j < 6; j++) parts.push(tint(new THREE.TorusGeometry(0.036, 0.008, 4, 8).rotateX(Math.PI / 2).translate(0, H * j / 6, 0), ...GREEN));
      for (let i = 0; i < 9; i++) parts.push(blade(0.85 * k + 0.15, 0.085, i % 2 ? GREEN : DGREEN, i * 2.6, 0.55 + (i % 3) * 0.15, H * (0.1 + i * 0.095), 0.55, 6));
      if (stage >= 3) {
        const tc = stage >= 4 ? [0.7, 0.6, 0.35] : [0.55, 0.6, 0.3];
        for (let j = 0; j < 7; j++) { const t = stalk(0.32, 0.005, tc, 0.35 + (j % 3) * 0.15, j * 0.9); t.translate(0, H, 0); parts.push(t); }
        parts.push(stalk(0.25, 0.012, tc).translate(0, H, 0));
        // ear in its husk, angled out from the stalk
        const ear = new THREE.Group();
        const husk = new THREE.SphereGeometry(0.05, 8, 6); husk.scale(1, 3.4, 1);
        const earGeo = tint(husk, ...(stage >= 4 ? [0.62, 0.62, 0.35] : [0.35, 0.55, 0.2]), 0.1);
        earGeo.rotateZ(-0.45); earGeo.translate(0.07, H * 0.55, 0);
        parts.push(earGeo);
        const silk = stalk(0.12, 0.006, [0.55, 0.38, 0.2], 0.6, 1.57); silk.translate(0.14, H * 0.55 + 0.14, 0); parts.push(silk);
      }
      break;
    }
    case 'potato': {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, r = 0.05 + (i % 3) * 0.06, h = 0.32 * k + 0.05;
        const st = stalk(h, 0.008, GREEN, 0.35, a); parts.push(st);
        for (let j = 0; j < 5; j++) {
          const l = leaf(0.07, 0.11, j % 2 ? GREEN : DGREEN, a + (j - 2) * 0.6, 1.0 + (j % 2) * 0.3);
          l.translate(Math.sin(a) * h * 0.35 * (0.4 + j * 0.15), h * (0.45 + j * 0.12), Math.cos(a) * h * 0.35 * (0.4 + j * 0.15));
          parts.push(l);
        }
      }
      if (stage === 3) for (let i = 0; i < 5; i++) parts.push(ball(0.018, i % 2 ? [0.85, 0.82, 0.9] : [0.7, 0.6, 0.85], Math.cos(i * 1.6) * 0.14, 0.38 * k, Math.sin(i * 1.6) * 0.14));
      if (stage >= 4) for (let i = 0; i < 4; i++) parts.push(ball(0.055, [0.55, 0.45, 0.3], Math.cos(i * 1.7) * 0.18, 0.025, Math.sin(i * 1.7) * 0.18, 0.75));
      break;
    }
    case 'tomato': {
      const Hc = 1.05;
      for (let j = 0; j < 3; j++) parts.push(tint(new THREE.TorusGeometry(0.16 + j * 0.03, 0.004, 4, 16).rotateX(Math.PI / 2).translate(0, 0.35 + j * 0.3, 0), 0.55, 0.57, 0.6));
      for (let j = 0; j < 3; j++) { const leg = stalk(Hc, 0.004, [0.55, 0.57, 0.6], -0.08, j * 2.09); leg.translate(Math.sin(j * 2.09) * 0.17, 0, Math.cos(j * 2.09) * 0.17); parts.push(leg); }
      parts.push(stalk(1.0 * k, 0.012, [0.3, 0.42, 0.18]));
      for (let i = 0; i < 12; i++) parts.push(leaf(0.09, 0.2 * (0.6 + k * 0.4), i % 2 ? GREEN : DGREEN, i * 1.3, 1.1, 0.1 + i * 0.075 * k));
      if (stage >= 3) for (let i = 0; i < 7; i++) {
        const cy2 = 0.3 + (i % 3) * 0.22, a = i * 1.9;
        parts.push(ball(0.04 + (i % 2) * 0.008, stage >= 4 ? (i % 4 === 3 ? [0.9, 0.45, 0.1] : [0.82, 0.1, 0.07]) : [0.45, 0.62, 0.2], Math.cos(a) * 0.13, cy2, Math.sin(a) * 0.13));
      }
      break;
    }
    case 'strawberry': {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        const pet = stalk(0.14 * (0.5 + k * 0.5), 0.004, GREEN, 0.7, a); parts.push(pet);
        const tx = Math.sin(a) * 0.09, ty = 0.11 * (0.5 + k * 0.5), tz = Math.cos(a) * 0.09;
        for (let j = -1; j <= 1; j++) { const l = leaf(0.06, 0.08, DGREEN, a + j * 0.7, 1.35); l.translate(tx, ty, tz); parts.push(l); }
      }
      if (stage === 3) for (let i = 0; i < 4; i++) parts.push(ball(0.016, [0.95, 0.95, 0.88], Math.cos(i * 1.6) * 0.12, 0.1, Math.sin(i * 1.6) * 0.12, 0.5));
      if (stage >= 3) for (let i = 0; i < 6; i++) {
        const b2 = new THREE.ConeGeometry(0.025, 0.05, 7); b2.rotateX(Math.PI); b2.translate(Math.cos(i * 1.2 + 0.5) * 0.17, 0.035, Math.sin(i * 1.2 + 0.5) * 0.17);
        parts.push(tint(b2, ...(stage >= 4 ? [0.85, 0.07, 0.12] : [0.85, 0.9, 0.7]), 0.08));
      }
      break;
    }
    case 'pumpkin': {
      const vine = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, 0.03, -0.4), new THREE.Vector3(-0.2, 0.05, 0.1), new THREE.Vector3(0.15, 0.04, 0.05), new THREE.Vector3(0.45, 0.03, 0.45)]), 16, 0.012, 5);
      parts.push(tint(vine, ...GREEN));
      for (let i = 0; i < 8; i++) {
        const t = i / 7, x = -0.5 + t * 0.95, z = -0.4 + t * 0.85 + Math.sin(t * 6) * 0.1;
        const l = leaf(0.32 * k + 0.06, 0.3 * k + 0.06, i % 2 ? GREEN : DGREEN, i * 1.4, 1.25); l.translate(x, 0.04 + (i % 2) * 0.05, z); parts.push(l);
      }
      if (stage >= 3) {
        const r = stage >= 4 ? 0.32 : 0.18;
        const c = stage >= 4 ? [0.92, 0.45, 0.08] : [0.45, 0.55, 0.2];
        const g = new THREE.SphereGeometry(r, 18, 12); g.scale(1.15, 0.78, 1.15);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 - 0.07 * Math.abs(Math.sin(a * 5)); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
        g.computeVertexNormals();
        g.translate(0.15, r * 0.75, 0.1);
        parts.push(tint(g, ...c, 0.08));
        parts.push(stalk(0.08, 0.02, [0.35, 0.3, 0.15], 0.3, 0).translate(0.15, r * 1.5, 0.1));
      }
      break;
    }
  }
  const geo = merge(parts);
  shadeByHeight(geo, 0, 1.2, 0.6, 1.15);
  return geo;
}

const LAYOUT = { wheat: 3, corn: 2, potato: 2, tomato: 2, strawberry: 2, pumpkin: 1 }; // n x n per plot

export class CropsView {
  constructor(scene, M, sim) {
    this.scene = scene; this.M = M; this.sim = sim;
    this.root = new THREE.Group();
    scene.add(this.root);
    const plots = sim.state.plots;
    this.plotIndex = new Map(plots.map((p, i) => [p.id, i]));
    // beds
    const bedGeo = new THREE.BoxGeometry(PLOT_SIZE, 0.22, PLOT_SIZE, 1, 1, 1);
    const uv = bedGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.8, uv.getY(i) * 0.8);
    this.beds = new THREE.InstancedMesh(bedGeo, M.soil, plots.length);
    this.beds.receiveShadow = true;
    this.beds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(plots.length * 3), 3);
    this.root.add(this.beds);
    // plant meshes per crop/stage
    this.meshes = {};
    for (const id of PLANTABLE) {
      const per = LAYOUT[id] * LAYOUT[id];
      for (let st = 1; st <= 4; st++) {
        const m = new THREE.InstancedMesh(plantGeo(id, st), M.plant, plots.length * per);
        m.castShadow = st >= 2; m.receiveShadow = true; m.count = 0;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(plots.length * per * 3), 3);
        m.frustumCulled = false;
        this.root.add(m);
        this.meshes[`${id}_${st}`] = m;
      }
    }
    // ruined debris
    const deb = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.CylinderGeometry(0.01, 0.015, 0.6, 4); g.rotateZ(Math.PI / 2 - 0.1); g.rotateY(i * 1.7);
      g.translate(Math.cos(i * 2.3) * 0.7, 0.04, Math.sin(i * 2.3) * 0.7); deb.push(tint(g, 0.32, 0.26, 0.14, 0.3, i));
    }
    for (let i = 0; i < 5; i++) deb.push(tint(new THREE.SphereGeometry(0.12, 6, 4).scale(1.4, 0.3, 1).translate(Math.cos(i * 1.4) * 0.6, 0.02, Math.sin(i * 1.4) * 0.6), 0.22, 0.16, 0.09));
    this.debris = new THREE.InstancedMesh(merge(deb), M.plant, plots.length);
    this.debris.count = 0;
    this.root.add(this.debris);
    this.dirty = true;
    sim.events.on('plotChanged', () => { this.dirty = true; });
    sim.events.on('parcelBought', () => { this.dirty = true; });
  }

  rebuild() {
    this.dirty = false;
    const st = this.sim.state;
    const counts = {};
    for (const k of Object.keys(this.meshes)) counts[k] = 0;
    let dn = 0;
    st.plots.forEach((p, i) => {
      const owned = plotOwned(st, p);
      const y = heightAt(p.x, p.z);
      tp.set(p.x, owned ? y + 0.02 : y - 0.12, p.z);
      ts.set(1, owned ? 1 : 0.4, 1);
      tq.identity();
      this.beds.setMatrixAt(i, tm.compose(tp, tq, ts));
      const wet = p.moisture > 0 ? 0.62 + (1 - p.moisture) * 0.15 : 1;
      col.setRGB(wet * (owned ? 1 : 0.85), wet * (owned ? 1 : 0.9), wet * (owned ? 1 : 0.8));
      if (p.fert) col.multiplyScalar(0.85);
      this.beds.setColorAt(i, col);
      if (!owned) return;
      if (p.dead) {
        tp.set(p.x, y + 0.12, p.z); tq.setFromEuler(te.set(0, hash2(i, 3, 1) * 6, 0)); ts.set(1, 1, 1);
        this.debris.setMatrixAt(dn++, tm.compose(tp, tq, ts));
        return;
      }
      if (!p.crop || p.stage < 1) return;
      const key = `${p.crop}_${p.stage}`;
      const m = this.meshes[key];
      const n = LAYOUT[p.crop];
      const step = PLOT_SIZE / n;
      const dmg = 1 - p.health;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const hx = hash2(i * 7 + a, b, 11), hz = hash2(i * 7 + a, b, 12);
        const x = p.x - PLOT_SIZE / 2 + step * (a + 0.5) + (hx - 0.5) * step * 0.3;
        const z = p.z - PLOT_SIZE / 2 + step * (b + 0.5) + (hz - 0.5) * step * 0.3;
        const tilt = dmg * 0.9 * (hash2(i, a + b, 5) - 0.3);
        tq.setFromEuler(te.set(tilt, hash2(i, a * 3 + b, 7) * 6.28, dmg * 0.6 * (hz - 0.5)));
        const sc = (0.85 + hx * 0.3) * (1 - dmg * 0.35);
        ts.set(sc, sc * (1 - dmg * 0.45), sc);
        tp.set(x, y + 0.12, z);
        const idx = counts[key]++;
        m.setMatrixAt(idx, tm.compose(tp, tq, ts));
        const thirst = p.moisture <= 0 ? 0.25 : 0;
        col.setRGB(1 + dmg * 0.3 + thirst * 0.4, 1 - dmg * 0.35, 1 - dmg * 0.6 - thirst * 0.3);
        m.setColorAt(idx, col);
      }
    });
    this.beds.instanceMatrix.needsUpdate = true; this.beds.instanceColor.needsUpdate = true;
    for (const [k, m] of Object.entries(this.meshes)) {
      m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.debris.count = dn; this.debris.instanceMatrix.needsUpdate = true;
  }

  update() { if (this.dirty) this.rebuild(); }
}
