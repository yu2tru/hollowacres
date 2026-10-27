// Plot beds and crop plants (instanced per crop & stage). Plants visibly
// grow through stages; damage tints & flattens them; ruined plots show debris.
import * as THREE from 'three';
import { CROPS } from '../data/crops.js';
import { PLOT_SIZE } from '../data/layout.js';
import { heightAt } from '../sim/terrain.js';
import { plotOwned } from '../sim/farming.js';
import { tint, merge, shadeByHeight } from './geo-utils.js';
import { hash2 } from '../core/rng.js';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tp = new THREE.Vector3(), te = new THREE.Euler();
const col = new THREE.Color();

function leaf(w, h, color, rotY, tilt, y0 = 0) {
  const g = new THREE.PlaneGeometry(w, h, 1, 2);
  g.translate(0, h / 2, 0);
  // bend leaf outward
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setZ(i, p.getZ(i) + t * t * h * 0.35); }
  g.rotateX(-tilt);
  g.rotateY(rotY);
  g.translate(0, y0, 0);
  return tint(g, ...color, 0.15, Math.floor(rotY * 100));
}
function stalk(h, r, color) { const g = new THREE.CylinderGeometry(r * 0.6, r, h, 5); g.translate(0, h / 2, 0); return tint(g, ...color); }
function ball(r, color, x, y, z, sy = 1) { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(1, sy, 1); g.translate(x, y, z); return tint(g, ...color, 0.1); }

const GREEN = [0.2, 0.36, 0.1], DGREEN = [0.13, 0.26, 0.07], YELLOW = [0.78, 0.66, 0.3], SPROUT = [0.3, 0.48, 0.14];

// geometry for crop at stage (1..4). Stage 0 = seeded (just soil).
function plantGeo(crop, stage) {
  const k = [0, 0.25, 0.55, 0.85, 1][stage];
  const parts = [];
  if (stage === 1) {
    for (let i = 0; i < 3; i++) parts.push(leaf(0.05, 0.12, SPROUT, i * 2.1, 0.5));
    return merge(parts);
  }
  switch (crop) {
    case 'wheat': {
      const c = stage >= 4 ? YELLOW : stage === 3 ? [0.55, 0.55, 0.22] : GREEN;
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7, r = (i % 3) * 0.06;
        const s = stalk(0.9 * k, 0.008, c); s.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
        parts.push(s);
        if (stage >= 3) { const h = ball(0.025, c, Math.cos(a) * r, 0.9 * k, Math.sin(a) * r, 3.2); parts.push(h); }
        parts.push(leaf(0.03, 0.4 * k, c, a, 0.4, 0.05));
      }
      break;
    }
    case 'corn': {
      const H = 2.3 * k;
      parts.push(stalk(H, 0.035, GREEN));
      for (let i = 0; i < 7; i++) parts.push(leaf(0.09, 0.75 * k, i % 2 ? GREEN : DGREEN, i * 2.4, 0.9, H * (0.15 + i * 0.11)));
      if (stage >= 3) {
        parts.push(stalk(0.25, 0.02, YELLOW).translate(0, H, 0));
        const cob = ball(0.055, stage >= 4 ? [0.9, 0.78, 0.3] : [0.4, 0.55, 0.2], 0.07, H * 0.55, 0, 3);
        parts.push(cob);
      }
      break;
    }
    case 'potato': {
      for (let i = 0; i < 9; i++) parts.push(leaf(0.16 * (0.6 + k * 0.4), 0.38 * k, i % 2 ? GREEN : DGREEN, i * 0.7, 0.6 + (i % 3) * 0.2));
      if (stage >= 4) for (let i = 0; i < 3; i++) parts.push(ball(0.05, [0.5, 0.42, 0.28], Math.cos(i * 2) * 0.15, 0.02, Math.sin(i * 2) * 0.15));
      if (stage === 3) for (let i = 0; i < 4; i++) parts.push(ball(0.02, [0.85, 0.82, 0.9], Math.cos(i * 1.6) * 0.12, 0.33 * k, Math.sin(i * 1.6) * 0.12));
      break;
    }
    case 'tomato': {
      parts.push(stalk(1.2 * Math.min(1, k + 0.2), 0.012, [0.45, 0.36, 0.22])); // stake
      for (let i = 0; i < 10; i++) parts.push(leaf(0.14, 0.3 * k, i % 2 ? GREEN : DGREEN, i * 1.3, 1.0, 0.1 + i * 0.09 * k));
      if (stage >= 3) for (let i = 0; i < 6; i++) parts.push(ball(0.045, stage >= 4 ? [0.85, 0.12, 0.08] : [0.45, 0.6, 0.2], Math.cos(i * 1.9) * 0.16, 0.35 + (i % 3) * 0.2, Math.sin(i * 1.9) * 0.16));
      break;
    }
    case 'strawberry': {
      for (let i = 0; i < 8; i++) parts.push(leaf(0.1, 0.18 * (0.5 + k * 0.5), DGREEN, i * 0.8, 1.0));
      if (stage >= 3) for (let i = 0; i < 5; i++) parts.push(ball(0.025, stage >= 4 ? [0.85, 0.08, 0.12] : [0.85, 0.9, 0.7], Math.cos(i * 1.3) * 0.13, 0.03, Math.sin(i * 1.3) * 0.13, 1.3));
      break;
    }
    case 'pumpkin': {
      for (let i = 0; i < 9; i++) parts.push(leaf(0.3 * k + 0.05, 0.4 * k + 0.05, i % 2 ? GREEN : DGREEN, i * 0.7, 1.25, 0.02));
      if (stage >= 3) {
        const r = stage >= 4 ? 0.32 : 0.18;
        const c = stage >= 4 ? [0.92, 0.45, 0.08] : [0.45, 0.55, 0.2];
        const g = new THREE.SphereGeometry(r, 16, 10); g.scale(1.15, 0.78, 1.15);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 - 0.07 * Math.abs(Math.sin(a * 5)); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
        g.computeVertexNormals();
        g.translate(0.15, r * 0.75, 0.1);
        parts.push(tint(g, ...c, 0.08));
        parts.push(stalk(0.08, 0.02, [0.35, 0.3, 0.15]).translate(0.15, r * 1.5, 0.1));
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
    for (const id of Object.keys(CROPS)) {
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
