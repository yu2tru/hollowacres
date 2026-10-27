// Trees (near detailed + far simplified LOD), bushes, rocks and grass.
import * as THREE from 'three';
import { getVegetation, forestDensity } from '../sim/vegetation.js';
import { heightAt, distToDriveway, distToPaths, isInPond } from '../sim/terrain.js';
import { FIELDS, PLOT_PITCH, BUILDINGS, ROAD, LANDMARKS } from '../data/layout.js';
import { tint, shadeByHeight, noiseDisplace, merge, cyl, lin } from './geo-utils.js';
import { hash2 } from '../core/rng.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();

function cardGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  return g;
}

function pineGeometry(detail) {
  const H = 12;
  const trunk = cyl(0.1, 0.32, H, detail ? 8 : 5, 0, H / 2, 0);
  if (!detail) {
    const parts = [tint(trunk, 0.24, 0.18, 0.13)];
    for (let i = 0; i < 4; i++) {
      const y = 3 + i * 2.2, r = 3.1 - i * 0.62;
      const c = new THREE.ConeGeometry(r, 3.4, 6, 1, true);
      c.translate(0, y + 1.5, 0);
      noiseDisplace(c, 0.25, i + 1, 1.1);
      tint(c, 0.09, 0.15, 0.08, 0.25, i + 3);
      shadeByHeight(c, 2, 12, 0.55, 1.15);
      parts.push(c);
    }
    return { far: merge(parts) };
  }
  const cards = [];
  const layers = 8;
  for (let l = 0; l < layers; l++) {
    const y = 2.6 + l * 1.15;
    const r = 3.2 * (1 - l / (layers + 1.2)) + 0.4;
    const n = 7 - Math.floor(l / 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + l * 0.7;
      const g = cardGeo(r * 1.15, 1.8);
      g.translate(r * 0.55, 0, 0);
      g.rotateX(-Math.PI / 2 * 0.25);
      g.rotateZ(-0.35); // droop
      g.rotateY(a);
      g.translate(0, y, 0);
      cards.push(g);
    }
  }
  const top = cardGeo(1.4, 2.2); top.translate(0, H - 0.6, 0);
  const top2 = top.clone().rotateY(Math.PI / 2);
  cards.push(top, top2);
  const crown = merge(cards.map((g) => tint(g, 1, 1, 1)));
  shadeByHeight(crown, 2, 12, 0.6, 1.15);
  return { trunk: trunk, crown };
}

function oakGeometry(detail) {
  const parts = [];
  const trunk = cyl(0.22, 0.42, 5, detail ? 9 : 5, 0, 2.5, 0);
  const branches = [];
  for (let i = 0; i < 4; i++) {
    const b = cyl(0.07, 0.16, 3.2, 5, 0, 1.6, 0);
    b.rotateZ(0.7 + (i % 2) * 0.2);
    b.rotateY((i / 4) * Math.PI * 2 + 0.4);
    b.translate(0, 3.6 + (i % 2) * 0.6, 0);
    branches.push(b);
  }
  const wood = merge([trunk, ...branches]);
  const centers = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, r = i === 0 ? 0 : 2.0 + (i % 3) * 0.5;
    centers.push([Math.cos(a) * r, 6.2 + (i % 4) * 0.7 - (r > 2.2 ? 0.6 : 0), Math.sin(a) * r]);
  }
  if (!detail) {
    const blobs = centers.slice(0, 6).map(([x, y, z], i) => {
      const s = new THREE.IcosahedronGeometry(2.3 - (i % 3) * 0.3, 0);
      noiseDisplace(s, 0.3, i + 2, 1.4);
      s.translate(x, y, z);
      return tint(s, 0.15, 0.21, 0.08, 0.3, i + 5);
    });
    const crown = merge(blobs);
    shadeByHeight(crown, 4, 9, 0.55, 1.2);
    return { far: merge([tint(cyl(0.22, 0.42, 5, 5, 0, 2.5, 0), 0.25, 0.2, 0.15), crown]) };
  }
  const cards = [];
  centers.forEach(([x, y, z], i) => {
    for (let k = 0; k < 4; k++) {
      const g = cardGeo(3.2, 3.2);
      g.rotateY((k / 4) * Math.PI + i);
      g.rotateX((k % 2 ? 0.5 : -0.4));
      g.translate(x, y, z);
      cards.push(g);
    }
  });
  const crown = merge(cards.map((g) => tint(g, 1, 1, 1)));
  shadeByHeight(crown, 4, 9, 0.6, 1.15);
  return { trunk: wood, crown };
}

function deadGeometry(detail) {
  const parts = [cyl(0.1, 0.3, 8, detail ? 7 : 5, 0, 4, 0)];
  for (let i = 0; i < 6; i++) {
    const b = cyl(0.03, 0.09, 2.6, 4, 0, 1.3, 0);
    b.rotateZ(0.6 + (i % 3) * 0.25);
    b.rotateY(i * 1.9);
    b.translate(0, 3 + i * 0.75, 0);
    parts.push(b);
  }
  const g = merge(parts);
  return detail ? { trunk: g } : { far: tint(g, 0.2, 0.18, 0.16) };
}

export class Vegetation {
  constructor(scene, mats, quality) {
    this.scene = scene;
    this.mats = mats;
    this.data = getVegetation();
    this.quality = quality;
    this.nearR = { low: 45, medium: 60, high: 75, epic: 95 }[quality] || 60;
    this.lastCenter = new THREE.Vector3(1e9, 0, 0);
    this.group = new THREE.Group();
    scene.add(this.group);
    const kinds = { pine: pineGeometry, oak: oakGeometry, dead: deadGeometry };
    this.kinds = {};
    const farCount = {};
    for (const t of this.data.trees) farCount[t.kind] = (farCount[t.kind] || 0) + 1;
    for (const [k, fn] of Object.entries(kinds)) {
      const near = fn(true), far = fn(false);
      const capN = 1600;
      const entry = { list: this.data.trees.filter((t) => t.kind === k) };
      entry.trunk = new THREE.InstancedMesh(near.trunk, k === 'dead' ? mats.barkWind : mats.barkWind, capN);
      entry.trunk.castShadow = true; entry.trunk.receiveShadow = true;
      if (near.crown) {
        entry.crown = new THREE.InstancedMesh(near.crown, k === 'pine' ? mats.needles : mats.leaves, capN);
        entry.crown.castShadow = true; entry.crown.receiveShadow = true;
        entry.crown.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capN * 3), 3);
      }
      entry.far = new THREE.InstancedMesh(far.far, mats.foliageFar, farCount[k] || 1);
      entry.far.castShadow = quality === 'epic';
      entry.far.receiveShadow = true;
      for (const m of [entry.trunk, entry.crown, entry.far]) if (m) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
      this.kinds[k] = entry;
    }
    this.buildBushes();
    this.buildRocks();
    this.grass = new GrassField(scene, mats, quality);
  }

  matrixFor(t) {
    const y = heightAt(t.x, t.z) - 0.15;
    tmpQ.setFromEuler(tmpE.set((hash2(t.x | 0, t.z | 0, 3) - 0.5) * 0.06, t.rot, (hash2(t.x | 0, t.z | 0, 4) - 0.5) * 0.06));
    tmpS.setScalar(t.scale);
    tmpP.set(t.x, y, t.z);
    return tmpM.compose(tmpP, tmpQ, tmpS);
  }

  update(camPos, force = false) {
    if (!force && camPos.distanceTo(this.lastCenter) < 10) { this.grass.update(camPos); return; }
    this.lastCenter.copy(camPos);
    const R2 = this.nearR * this.nearR;
    const col = new THREE.Color();
    for (const [k, e] of Object.entries(this.kinds)) {
      let n = 0, f = 0;
      for (const t of e.list) {
        const d2 = (t.x - camPos.x) ** 2 + (t.z - camPos.z) ** 2;
        const m = this.matrixFor(t);
        if (d2 < R2 && n < 1600) {
          e.trunk.setMatrixAt(n, m);
          if (e.crown) {
            const h = hash2(t.x | 0, t.z | 0, 9);
            col.setRGB(0.8 + h * 0.4, 0.85 + h * 0.3, 0.75 + h * 0.3);
            if (k === 'oak' && hash2(t.x | 0, t.z | 0, 10) > 0.75) col.setRGB(1.5, 1.05, 0.55); // autumn turning
            e.crown.setMatrixAt(n, m); e.crown.setColorAt(n, col);
          }
          n++;
        } else {
          if (this.quality === 'low' && d2 > 200 * 200 && hash2(t.x | 0, t.z | 0, 2) > 0.5) continue;
          e.far.setMatrixAt(f++, m);
        }
      }
      e.trunk.count = n; e.trunk.instanceMatrix.needsUpdate = true;
      if (e.crown) { e.crown.count = n; e.crown.instanceMatrix.needsUpdate = true; e.crown.instanceColor.needsUpdate = true; }
      e.far.count = f; e.far.instanceMatrix.needsUpdate = true;
    }
    this.grass.update(camPos, true);
  }

  buildBushes() {
    const list = this.data.bushes;
    const cards = [];
    for (let i = 0; i < 7; i++) {
      const g = cardGeo(1.4, 1.2);
      g.rotateY(i * 0.9); g.rotateX((i % 2 ? 0.3 : -0.3));
      g.translate(Math.cos(i * 2.1) * 0.35, 0.55 + (i % 3) * 0.15, Math.sin(i * 2.1) * 0.35);
      cards.push(tint(g, 1, 1, 1));
    }
    const geo = merge(cards);
    shadeByHeight(geo, 0, 1.2, 0.5, 1.1);
    const m = new THREE.InstancedMesh(geo, this.mats.leaves, list.length);
    const col = new THREE.Color();
    list.forEach((b, i) => {
      tmpQ.setFromEuler(tmpE.set(0, b.rot, 0));
      tmpS.setScalar(b.scale); tmpP.set(b.x, heightAt(b.x, b.z) - 0.1, b.z);
      m.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      const h = hash2(i, 1, 5);
      m.setColorAt(i, col.setRGB(0.7 + h * 0.5, 0.75 + h * 0.3, 0.6 + h * 0.2));
    });
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
  }

  buildRocks() {
    const list = this.data.rocks;
    const g = new THREE.DodecahedronGeometry(0.8, 1);
    noiseDisplace(g, 0.18, 4, 2.2);
    g.scale(1, 0.6, 1.2);
    const m = new THREE.InstancedMesh(g, this.mats.stone, list.length);
    list.forEach((r, i) => {
      tmpQ.setFromEuler(tmpE.set(0.2, r.rot, 0.1));
      tmpS.setScalar(r.scale); tmpP.set(r.x, heightAt(r.x, r.z) - r.scale * 0.15, r.z);
      m.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    });
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
  }
}

// --- grass ------------------------------------------------------------------
function grassClump() {
  const pos = [], col = [];
  const blades = 9;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b;
    const r = 0.06 + (b % 3) * 0.08;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.16 + ((b * 37) % 10) / 10 * 0.2;
    const w = 0.035;
    const lean = 0.12 + (b % 4) * 0.05;
    const dx = Math.cos(a + 1.3) * w, dz = Math.sin(a + 1.3) * w;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const p0 = [bx - dx, 0, bz - dz], p1 = [bx + dx, 0, bz + dz];
    const p2 = [bx - dx * 0.6 + lx * 0.4, h * 0.55, bz - dz * 0.6 + lz * 0.4], p3 = [bx + dx * 0.6 + lx * 0.4, h * 0.55, bz + dz * 0.6 + lz * 0.4];
    const p4 = [bx + lx, h, bz + lz];
    const c0 = [0.1, 0.13, 0.05], c1 = [0.25, 0.3, 0.12], c2 = [0.45, 0.47, 0.22];
    const L = (c) => c.map(lin);
    const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...L(ca), ...L(cb), ...L(cc)); };
    tri(p0, p1, p3, c0, c0, c1); tri(p0, p3, p2, c0, c1, c1); tri(p2, p3, p4, c1, c1, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // grass normals mostly up for soft lighting
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3); }
  g.normalizeNormals();
  return g;
}

function grassAllowed(x, z) {
  for (const f of FIELDS) {
    if (x > f.x0 - 1.4 && z > f.z0 - 1.4 && x < f.x0 + f.cols * PLOT_PITCH + 1.4 && z < f.z0 + f.rows * PLOT_PITCH + 1.4) return 0;
  }
  if (distToDriveway(x, z) < 3) return 0;
  if (Math.abs(z - ROAD.county.z) < ROAD.county.width / 2 + 0.6) return 0;
  if (distToPaths(x, z) < 1.1) return 0.15;
  for (const b of Object.values(BUILDINGS)) {
    if (b.r) { if (Math.hypot(x - b.x, z - b.z) < b.r + 0.3) return 0; continue; }
    const pd = b.porch ? b.porch.depth : 0;
    if (Math.abs(x - b.x) < b.w / 2 + 0.4 && z > b.z - b.d / 2 - 0.4 && z < b.z + b.d / 2 + pd + 0.4) return 0;
  }
  if (Math.hypot(x - 2, z + 6) < 12) return 0.25; // packed yard
  if (Math.hypot(x - BUILDINGS.barn.x + 8, z - BUILDINGS.barn.z) < 7) return 0.2;
  if (isInPond(x, z, 3)) return 0;
  for (const l of LANDMARKS) if (Math.hypot(x - l.x, z - l.z) < l.r * 0.6) return 0.3;
  const fd = forestDensity(x, z);
  return 1 - fd * 0.75;
}

class GrassField {
  constructor(scene, mats, quality) {
    this.R = { low: 0, medium: 28, high: 38, epic: 50 }[quality] ?? 30;
    this.spacing = { low: 1, medium: 0.75, high: 0.6, epic: 0.5 }[quality] ?? 0.7;
    this.enabled = this.R > 0;
    this.last = new THREE.Vector3(1e9, 0, 0);
    if (!this.enabled) return;
    const cap = Math.ceil((Math.PI * this.R * this.R) / (this.spacing * this.spacing));
    this.mesh = new THREE.InstancedMesh(grassClump(), mats.grass, cap);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.cap = cap;
    scene.add(this.mesh);
  }
  update(camPos, force = false) {
    if (!this.enabled) return;
    if (!force && camPos.distanceTo(this.last) < 5) return;
    this.last.copy(camPos);
    const s = this.spacing, R = this.R;
    const x0 = Math.floor((camPos.x - R) / s), x1 = Math.ceil((camPos.x + R) / s);
    const z0 = Math.floor((camPos.z - R) / s), z1 = Math.ceil((camPos.z + R) / s);
    let n = 0;
    const col = new THREE.Color();
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const x = (gx + hash2(gx, gz, 1)) * s, z = (gz + hash2(gx, gz, 2)) * s;
      const d = Math.hypot(x - camPos.x, z - camPos.z);
      if (d > R) continue;
      const allow = grassAllowed(x, z);
      if (hash2(gx, gz, 3) > allow) continue;
      if (n >= this.cap) break;
      const edge = Math.min(1, (R - d) / (R * 0.25));
      const sc = (0.7 + hash2(gx, gz, 4) * 0.7) * edge * (0.6 + allow * 0.5);
      tmpQ.setFromEuler(tmpE.set(0, hash2(gx, gz, 5) * 6.28, 0));
      tmpS.set(sc, sc * (0.8 + hash2(gx, gz, 6) * 0.6), sc);
      tmpP.set(x, heightAt(x, z) - 0.02, z);
      this.mesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
      const dry = hash2(Math.floor(x / 9), Math.floor(z / 9), 7);
      col.setRGB(0.9 + dry * 0.5, 0.95 + dry * 0.15, 0.8);
      this.mesh.setColorAt(n, col);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
