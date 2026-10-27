// Visual representation of buildable / fixed structures, including damage
// states, lights, power cables and the build-mode ghost preview.
import * as THREE from 'three';
import { BUILDABLES } from '../data/buildables.js';
import { heightAt } from '../sim/terrain.js';
import { lightProps, generatorRunning } from '../sim/structures.js';
import { mergeList, bx, cy, mk, worldUV } from './build-helpers.js';
import { U } from './materials.js';
import { generatorModel } from './models.js';

const coneMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(1, 0.92, 0.78) }, uIntensity: { value: 0.18 }, uTime: U.uTime },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying float vV; varying vec3 vN; varying vec3 vView;
    void main(){ vV = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uIntensity, uTime; varying float vV; varying vec3 vN; varying vec3 vView;
    void main(){ float edge = pow(abs(dot(vN, vView)), 1.6); float fall = pow(vV, 1.4);
      float flick = 0.95 + 0.05 * sin(uTime * 13.0);
      gl_FragColor = vec4(uColor * uIntensity * edge * fall * flick, 1.0); }`,
});

export function makeCone(length, radius) {
  const g = new THREE.CylinderGeometry(0.15, radius, length, 24, 1, true);
  g.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(g, coneMat.clone());
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

let solarMat = null, solarBroken = null;
function solarMaterials() {
  if (solarMat) return [solarMat, solarBroken];
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1a33'; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    g.fillStyle = `rgb(${18 + (x * 7 + y * 3) % 10},${34 + (x * 5) % 12},${70 + (y * 9) % 16})`;
    g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
  }
  g.fillStyle = '#9aa4ad'; for (let x = 0; x <= 256; x += 64) g.fillRect(x - 1, 0, 2, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1); t.anisotropy = 8;
  solarMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.18, metalness: 0.35, envMapIntensity: 1.4 });
  solarBroken = new THREE.MeshStandardMaterial({ map: t, color: 0x6a6a6a, roughness: 0.6, metalness: 0.2 });
  return [solarMat, solarBroken];
}

// Build the mesh group for a structure type. Returns { group, parts }.
export function buildStructureMesh(type, M, level = 0, s = {}) {
  const g = new THREE.Group();
  const parts = {};
  switch (type) {
    case 'fence': {
      const len = s.len || 3.5;
      parts.posts = mk(mergeList([bx(0.14, 1.3, 0.14, -len / 2, 0.55, 0), bx(0.14, 1.3, 0.14, len / 2, 0.55, 0)]), M.woodDark);
      parts.rails = [0.35, 0.7, 1.05].map((y, i) => mk(worldUV(bx(len + 0.1, 0.12, 0.05, 0, y, 0.06), 1.4), M.wood));
      g.add(parts.posts, ...parts.rails);
      break;
    }
    case 'barricade': {
      const W = 3.2;
      parts.posts = mk(mergeList([bx(0.16, 1.7, 0.16, -W / 2 + 0.1, 0.75, -0.1), bx(0.16, 1.7, 0.16, W / 2 - 0.1, 0.75, -0.1), bx(0.16, 1.7, 0.16, 0, 0.75, -0.1)]), M.woodDark);
      parts.rails = [];
      for (let i = 0; i < 5; i++) parts.rails.push(mk(worldUV(bx(W, 0.24, 0.07, 0, 0.25 + i * 0.3, 0.02, 0, 0, (i % 2 ? 0.03 : -0.03)), 1.4), M.wood));
      parts.rails.push(mk(worldUV(bx(W * 1.05, 0.2, 0.07, 0, 0.8, 0.08, 0, 0, 0.42), 1.4), M.wood));
      if (level > 0) {
        parts.plates = [mk(worldUV(bx(1.5, 1.2, 0.04, -0.75, 0.7, 0.12), 1.2), M.metal), mk(worldUV(bx(1.5, 1.2, 0.04, 0.78, 0.75, 0.12, 0, 0, 0.04), 1.2), M.metal)];
        g.add(...parts.plates);
      }
      g.add(parts.posts, ...parts.rails);
      break;
    }
    case 'floodlight': {
      const pole = mk(mergeList([cy(0.09, 0.13, 5.2, 8, 0, 2.6, 0), bx(1.2, 0.1, 0.1, 0, 4.9, 0)]), M.woodDark);
      g.add(pole);
      parts.heads = [];
      const n = level > 0 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const head = new THREE.Group();
        head.position.set(n > 1 ? (i ? 0.45 : -0.45) : 0, 4.95, 0.12);
        head.add(mk(bx(0.42, 0.32, 0.26, 0, 0, 0), M.darkSteel));
        const lens = new THREE.MeshStandardMaterial({ color: 0xbbbbaa, emissive: 0xfff1d6, emissiveIntensity: 0, roughness: 0.2 });
        head.add(mk(bx(0.36, 0.26, 0.02, 0, 0, 0.14), lens, false, false));
        head.userData.lens = lens;
        head.rotation.x = 0.75; // aim down & forward (+z)
        g.add(head);
        parts.heads.push(head);
      }
      g.add(mk(bx(0.25, 0.3, 0.15, 0, 1.6, -0.12), M.darkSteel)); // junction box
      const L = level > 0 ? BUILDABLES.floodlight.upgrade.light : BUILDABLES.floodlight.light;
      const aimD = L.radius * 0.55;
      const len = Math.hypot(aimD, 4.9);
      const cone = makeCone(len, L.radius * 0.42);
      cone.position.set(0, 4.95, 0.15);
      cone.rotation.x = -Math.atan2(aimD, 4.9);
      g.add(cone);
      parts.cone = cone;
      break;
    }
    case 'pole': {
      g.add(mk(mergeList([cy(0.11, 0.15, 6.2, 8, 0, 3.1, 0), bx(1.4, 0.12, 0.12, 0, 5.8, 0)]), M.woodDark));
      g.add(mk(mergeList([cy(0.04, 0.05, 0.14, 8, -0.6, 5.93, 0), cy(0.04, 0.05, 0.14, 8, 0.6, 5.93, 0)]), M.white));
      break;
    }
    case 'generator': {
      const m = generatorModel(M);
      g.add(m.group);
      parts.body = m.body; parts.panel = m.panel;
      break;
    }
    case 'camera': {
      g.add(mk(cy(0.05, 0.06, 3.4, 8, 0, 1.7, 0), M.steel));
      parts.head = new THREE.Group();
      parts.head.position.set(0, 3.35, 0.05);
      parts.head.add(mk(bx(0.18, 0.16, 0.36, 0, 0, 0.12), M.white));
      parts.head.add(mk(cy(0.05, 0.05, 0.05, 10, 0, 0, 0.32, Math.PI / 2), M.black));
      const led = new THREE.MeshBasicMaterial({ color: 0x330000 });
      parts.head.add(mk(new THREE.SphereGeometry(0.018, 6, 4).translate(0.06, 0.05, 0.31), led, false, false));
      parts.led = led;
      parts.head.rotation.x = 0.28;
      g.add(parts.head);
      break;
    }
    case 'trap': {
      g.add(mk(cy(0.32, 0.34, 0.04, 16, 0, 0.02, 0), M.darkSteel));
      parts.jaws = [];
      for (const sgn of [-1, 1]) {
        const jaw = new THREE.Group();
        const ring = new THREE.TorusGeometry(0.3, 0.025, 6, 16, Math.PI);
        ring.rotateX(Math.PI / 2);
        jaw.add(mk(ring, M.steel));
        for (let i = 1; i < 8; i++) {
          const a = (i / 8) * Math.PI;
          jaw.add(mk(new THREE.ConeGeometry(0.02, 0.07, 4).translate(Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3 * 0), M.steel));
        }
        jaw.rotation.y = sgn > 0 ? 0 : Math.PI;
        jaw.position.y = 0.05;
        g.add(jaw);
        parts.jaws.push(jaw);
      }
      g.add(mk(cy(0.008, 0.008, 1.0, 3, 0.4, 0.02, 0, 0, Math.PI / 2), M.steel, false));
      break;
    }
    case 'scarecrow': {
      g.add(mk(mergeList([cy(0.05, 0.06, 2.3, 6, 0, 1.15, 0), bx(1.5, 0.07, 0.07, 0, 1.65, 0)]), M.woodDark));
      g.add(mk(mergeList([bx(0.55, 0.7, 0.28, 0, 1.4, 0), bx(1.3, 0.22, 0.24, 0, 1.65, 0)]), M.flannel));
      const burlap = new THREE.MeshStandardMaterial({ color: 0x9b8458, roughness: 1 });
      g.add(mk(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.15, 1).translate(0, 2.05, 0), burlap));
      g.add(mk(mergeList([cy(0.3, 0.3, 0.03, 12, 0, 2.22, 0), cy(0.13, 0.16, 0.2, 10, 0, 2.33, 0)]), M.hay));
      g.add(mk(mergeList([cy(0.0, 0.07, 0.3, 5, 0.72, 1.58, 0, 0, 0.4), cy(0.0, 0.07, 0.3, 5, -0.72, 1.58, 0, 0, -0.4), cy(0.0, 0.08, 0.35, 5, 0, 0.95, 0)]), M.hay));
      break;
    }
    case 'sprinkler': {
      g.add(mk(mergeList([cy(0.03, 0.03, 0.5, 6, 0, 0.25, 0), cy(0.05, 0.04, 0.08, 8, 0, 0.52, 0)]), M.steel));
      g.add(mk(cy(0.14, 0.14, 0.04, 10, 0, 0.02, 0), M.darkSteel));
      break;
    }
    case 'decoy': {
      g.add(mk(bx(0.45, 0.3, 0.22, 0, 0.18, 0), M.paintGreen));
      g.add(mk(cy(0.008, 0.008, 0.9, 3, 0.15, 0.75, 0, 0, 0.15), M.steel));
      const dial = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffaa33, emissiveIntensity: 0 });
      g.add(mk(bx(0.18, 0.08, 0.02, -0.08, 0.22, 0.115), dial, false));
      parts.dial = dial;
      break;
    }
    case 'chimes': {
      g.add(mk(mergeList([cy(0.05, 0.06, 2.6, 6, 0, 1.3, 0), bx(0.9, 0.07, 0.07, 0, 2.5, 0)]), M.woodDark));
      parts.tubes = [];
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Group(); t.position.set(-0.35 + i * 0.23, 2.46, 0);
        t.add(mk(cy(0.02, 0.02, 0.45 + i * 0.1, 8, 0, -0.3 - i * 0.05, 0), M.ironRust, false));
        g.add(t); parts.tubes.push(t);
      }
      break;
    }
    case 'gate': {
      const len = s.len || 6;
      parts.leaves = [];
      for (const sgn of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sgn * len / 2, 0, 0);
        const w = len / 2 - 0.08, dir = -sgn;
        const leaf = new THREE.Group();
        leaf.add(mk(mergeList([bx(w, 0.12, 0.07, dir * w / 2, 0.35, 0), bx(w, 0.12, 0.07, dir * w / 2, 0.85, 0), bx(w, 0.12, 0.07, dir * w / 2, 1.35, 0),
          bx(0.1, 1.3, 0.08, dir * 0.08, 0.85, 0), bx(0.1, 1.3, 0.08, dir * (w - 0.05), 0.85, 0),
          bx(Math.hypot(w, 1.0), 0.1, 0.06, dir * w / 2, 0.85, 0.02, 0, 0, dir * Math.atan2(1.0, w))]), M.wood));
        pivot.add(leaf);
        pivot.userData.sgn = sgn;
        g.add(pivot);
        parts.leaves.push(pivot);
      }
      break;
    }
    case 'coop': {
      const W = 4, D = 3, Hh = 2.0;
      parts.body = new THREE.Group();
      parts.body.add(mk(worldUV(bx(W, Hh, D, 0, Hh / 2 + 0.3, 0), 1.6), M.wood));
      for (const [x, z] of [[-W / 2 + 0.1, -D / 2 + 0.1], [W / 2 - 0.1, -D / 2 + 0.1], [-W / 2 + 0.1, D / 2 - 0.1], [W / 2 - 0.1, D / 2 - 0.1]]) parts.body.add(mk(bx(0.14, 0.4, 0.14, x, 0.2, z), M.woodDark));
      parts.roof = mk(worldUV(bx(W + 0.5, 0.08, D + 0.6, 0, Hh + 0.55, 0, 0.18), 1.5), M.metalRoof);
      parts.body.add(parts.roof);
      parts.body.add(mk(bx(0.6, 0.7, 0.05, 0.6, 0.75, D / 2 + 0.03), M.black, false));
      parts.body.add(mk(worldUV(bx(0.6, 0.05, 1.6, 0.6, 0.35, D / 2 + 0.7, -0.35), 1), M.woodDark));
      parts.body.add(mk(bx(1.2, 0.5, 0.6, -1.0, 1.0, D / 2 + 0.3), M.wood));
      g.add(parts.body);
      break;
    }
    case 'solar': {
      const len = s.len || 34, dep = 3.2;
      const [ok, broken] = solarMaterials();
      parts.panels = [];
      const n = Math.round(len / 4.25);
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + seg * (i + 0.5);
        g.add(mk(mergeList([bx(0.1, 1.1, 0.1, x, 0.55, -dep / 2 + 0.3), bx(0.1, 2.0, 0.1, x, 1.0, dep / 2 - 0.3), bx(0.08, 0.08, dep, x, 1.2, 0, 0.45)]), M.steel));
        const p = mk(bx(seg - 0.08, 0.05, dep, 0, 0, 0), ok);
        p.position.set(x, 1.35, 0);
        p.rotation.x = 0.45; // tilted toward the southern sun
        p.userData.base = { x, y: 1.35, rx: 0.45 };
        g.add(p);
        parts.panels.push(p);
      }
      parts.inverter = mk(bx(0.6, 0.8, 0.35, -len / 2 - 0.6, 0.5, 0), M.white);
      const led = new THREE.MeshBasicMaterial({ color: 0x113311 });
      g.add(parts.inverter, mk(bx(0.08, 0.08, 0.02, -len / 2 - 0.6, 0.75, 0.18), led, false, false));
      parts.led = led;
      parts.matOk = ok; parts.matBroken = broken;
      break;
    }
    case 'firepit': {
      const stones = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const st = new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.04, 0); st.translate(Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85);
        stones.push(st);
      }
      g.add(mk(mergeList(stones), M.stone));
      g.add(mk(mergeList([cy(0.08, 0.1, 1.1, 6, 0, 0.15, 0, 0, 1.4), cy(0.08, 0.1, 1.0, 6, 0, 0.18, 0, 1.4, 0.3)]), M.woodDark));
      const ember = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xff5a10, emissiveIntensity: 0, roughness: 1 });
      g.add(mk(new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2).translate(0, 0.05, 0), ember, false));
      parts.ember = ember;
      break;
    }
    case 'pump': {
      const iron = new THREE.MeshStandardMaterial({ color: 0x2b2f2c, roughness: 0.5, metalness: 0.7 });
      g.add(mk(worldUV(cy(0.75, 0.8, 0.16, 20, 0, 0.02, 0), 1), M.concrete));
      g.add(mk(mergeList([cy(0.16, 0.2, 0.12, 14, 0, 0.16, 0), cy(0.09, 0.11, 0.95, 12, 0, 0.65, 0), cy(0.11, 0.09, 0.12, 12, 0, 1.15, 0), cy(0.04, 0.05, 0.36, 8, 0, 0.92, 0.2, Math.PI / 2 - 0.35)]), iron));
      parts.handle = new THREE.Group(); parts.handle.position.set(0, 1.18, -0.06);
      parts.handle.add(mk(mergeList([bx(0.035, 0.035, 0.85, 0, 0.05, -0.38, -0.5), cy(0.03, 0.03, 0.14, 8, 0, 0.27, -0.75, 0, Math.PI / 2)]), iron));
      g.add(parts.handle);
      g.add(mk(cy(0.15, 0.12, 0.28, 14, 0.42, 0.17, 0.35), M.steel));
      break;
    }
    default: break;
  }
  return { group: g, parts };
}

export class StructuresView {
  constructor(scene, M, env) {
    this.scene = scene;
    this.M = M;
    this.env = env;
    this.items = new Map();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.wires = null;
  }

  sync(sim) {
    const seen = new Set();
    for (const s of sim.state.structures) {
      if (s.type === 'fence') continue;
      seen.add(s.id);
      let it = this.items.get(s.id);
      if (it && (it.level !== s.level)) { this.remove(s.id); it = null; }
      if (!it) it = this.add(s);
      this.applyState(it, s, sim);
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.remove(id);
    this.rebuildFences(sim);
  }

  // All fence segments share two instanced meshes (posts, rails).
  rebuildFences(sim) {
    const fences = sim.state.structures.filter((s) => s.type === 'fence');
    if (!this.fencePosts) {
      const cap = fences.length + 64;
      this.fencePosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.3, 0.14).translate(0, 0.55, 0), this.M.woodDark, cap * 2);
      const railGeo = worldUV(new THREE.BoxGeometry(3.5, 0.12, 0.05), 1.4); // textured at true length, scaled per segment
      this.fenceRails = new THREE.InstancedMesh(railGeo, this.M.wood, cap * 3);
      for (const m of [this.fencePosts, this.fenceRails]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.root.add(m); }
    }
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let np = 0, nr = 0;
    for (const f of fences) {
      const len = f.len || 3.5, r = f.hp / f.maxHp, dead = f.hp <= 0;
      const c = Math.cos(f.rot), sn = Math.sin(f.rot);
      const at = (lx, lz) => [f.x + lx * c + lz * sn, f.z - lx * sn + lz * c];
      for (const side of [-1, 1]) {
        const [x, z] = at(side * len / 2, 0);
        q.setFromEuler(e.set(0, f.rot, dead ? side * 0.5 : 0));
        p.set(x, heightAt(x, z) - (dead ? 0.4 : 0), z); sc.set(1, 1, 1);
        this.fencePosts.setMatrixAt(np++, M4.compose(p, q, sc));
      }
      [0.35, 0.7, 1.05].forEach((y, i) => {
        if (dead && i > 0) return;
        if (!dead && ((r < 0.35 && i !== 0) || (r < 0.7 && i === 2))) return;
        const [x, z] = at(0, 0.06);
        const g = heightAt(x, z);
        q.setFromEuler(e.set(dead ? 1.4 : 0, f.rot, !dead && r < 0.7 ? (i % 2 ? 0.08 : -0.06) * (1 - r) * 2 : dead ? 0.15 : 0));
        p.set(x, g + (dead ? 0.06 : y), z); sc.set((len + 0.1) / 3.5, 1, 1);
        this.fenceRails.setMatrixAt(nr++, M4.compose(p, q, sc));
      });
    }
    this.fencePosts.count = np; this.fenceRails.count = nr;
    this.fencePosts.instanceMatrix.needsUpdate = true; this.fenceRails.instanceMatrix.needsUpdate = true;
    this.fenceDirty = false;
  }

  add(s) {
    const { group, parts } = buildStructureMesh(s.type, this.M, s.level, s);
    group.position.set(s.x, heightAt(s.x, s.z), s.z);
    group.rotation.y = s.rot;
    this.root.add(group);
    const it = { s, group, parts, level: s.level, phase: Math.random() * 10 };
    this.items.set(s.id, it);
    return it;
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.root.remove(it.group);
    it.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.items.delete(id);
  }

  applyState(it, s, sim) {
    const r = s.maxHp ? s.hp / s.maxHp : 1;
    const g = it.group, p = it.parts;
    const destroyed = s.hp <= 0;
    g.rotation.set(0, s.rot, 0);
    g.position.y = heightAt(s.x, s.z);
    if (s.type === 'fence' || s.type === 'barricade') {
      const rails = p.rails || [];
      rails.forEach((m, i) => {
        const gone = destroyed ? i > 0 : (r < 0.35 && i % 2 === 0) || (r < 0.7 && i === rails.length - 1);
        m.visible = !gone;
        m.rotation.z = destroyed ? 0.0 : (r < 0.7 ? (i % 2 ? 0.08 : -0.06) * (1 - r) * 2 : 0);
        if (destroyed && i === 0) { m.position.y = -0.4; m.rotation.x = 1.4; }
        else if (!destroyed) { m.position.y = 0; m.rotation.x = 0; }
      });
      if (p.plates) p.plates.forEach((m, i) => { m.visible = !destroyed && (r > 0.4 || i === 0); });
      if (p.posts) p.posts.rotation.z = destroyed ? 0.5 : 0;
      if (p.posts) p.posts.position.y = destroyed ? -0.5 : 0;
    }
    if (s.type === 'floodlight') {
      g.rotation.z = destroyed ? 0.5 : 0;
      it.lit = !destroyed && s.powered && s.bulb !== false && s.on !== false;
    }
    if (s.type === 'generator') {
      g.rotation.z = destroyed ? 1.2 : 0;
      g.position.y += destroyed ? 0.3 : 0;
      it.running = !destroyed && generatorRunning(sim, s);
      if (p.panel) { p.panel.emissive.setHex(it.running ? 0x30ff60 : (s.fuel <= 0 ? 0xff3010 : 0x806010)); p.panel.emissiveIntensity = it.running ? 2 : 0.6; }
    }
    if (s.type === 'camera') {
      if (p.head) p.head.rotation.x = destroyed ? 1.4 : 0.28;
      it.powered = !destroyed && s.powered;
    }
    if (s.type === 'trap' && p.jaws) {
      p.jaws.forEach((j, i) => { j.rotation.x = s.armed ? 0 : (i ? -1.45 : 1.45); });
    }
    if (s.type === 'gate') { it.gateOpen = s.open || destroyed; it.gateBroken = destroyed; }
    if (s.type === 'coop' && p.body) { p.body.rotation.z = destroyed ? 0.35 : 0; p.roof.visible = !destroyed; p.body.position.y = destroyed ? -0.3 : 0; }
    if (s.type === 'solar' && p.panels) {
      p.panels.forEach((m, i) => {
        const b = m.userData.base;
        const wrecked = destroyed && (i % 3 !== 1);
        m.material = destroyed ? p.matBroken : p.matOk;
        m.rotation.set(wrecked ? b.rx + 0.6 * ((i % 2) ? 1 : -0.7) : b.rx, 0, wrecked ? 0.25 * ((i % 2) ? 1 : -1) : 0);
        m.position.y = wrecked ? b.y - 0.6 : b.y;
        m.visible = !(destroyed && i % 4 === 2);
      });
    }
    if (s.type === 'firepit' && p.ember) it.lit = !!s.lit;
    if (s.type === 'scarecrow') g.rotation.z = destroyed ? 1.45 : (r < 0.5 ? 0.25 : 0);
    if (s.type === 'chimes') g.rotation.z = destroyed ? 1.3 : 0;
    if (s.type === 'door') {
      if (s.building === 'farmhouse' && this.env.houseDoor) {
        it.doorTarget = destroyed ? 1.25 : s.open ? 1.55 : 0;
        it.doorBroken = destroyed;
      } else if (s.building === 'barn' && this.env.barnDoor) {
        it.barnOpen = s.open || destroyed;
        it.barnBroken = destroyed;
      }
    }
    it.damaged = r < 0.5 && !destroyed;
  }

  // per-frame animation
  update(dt, sim, time, nightAmt) {
    for (const it of this.items.values()) {
      const s = it.s, p = it.parts;
      if (s.type === 'floodlight') {
        const flick = s.flickerUntil && s.flickerUntil > sim.clockSeconds;
        let on = it.lit && !(flick && Math.random() < 0.5);
        const k = on ? 1 : 0;
        for (const h of p.heads) h.userData.lens.emissiveIntensity = k * 6;
        if (p.cone) { p.cone.visible = on && nightAmt > 0.15; p.cone.material.uniforms.uIntensity.value = 0.12 * nightAmt * (s.level ? 1.3 : 1); }
        it.on = on;
      }
      if (s.type === 'generator' && it.running && p.body) {
        p.body.position.x = Math.sin(time * 60) * 0.004;
        p.body.position.y = Math.cos(time * 53) * 0.003;
      }
      if (s.type === 'camera' && p.led) p.led.color.setHex(it.powered && Math.sin(time * 3 + it.phase) > 0 ? 0xff2010 : 0x220000);
      if (s.type === 'decoy' && p.dial) p.dial.emissiveIntensity = s.activeUntil > sim.clockSeconds ? 2 + Math.sin(time * 8) : 0;
      if (s.type === 'gate' && p.leaves) for (const l of p.leaves) {
        const want = it.gateOpen ? (l.userData.sgn < 0 ? 1.45 : -1.45) : 0;
        l.rotation.y += (want - l.rotation.y) * Math.min(1, dt * 2.5);
        l.rotation.z = it.gateBroken ? 0.2 * l.userData.sgn : 0;
      }
      if (s.type === 'solar' && p.led) p.led.color.setHex(s.hp <= 0 ? 0x220000 : (s.charge || 0) > 0.05 ? (Math.sin(time * 2) > 0 ? 0x33ff55 : 0x0b330f) : 0x553300);
      if (s.type === 'firepit' && p.ember) p.ember.emissiveIntensity = it.lit ? 2.5 + Math.sin(time * 9) * 0.6 + Math.sin(time * 23) * 0.3 : 0;
      if (s.type === 'chimes' && p.tubes) p.tubes.forEach((t, i) => { t.rotation.z = Math.sin(time * (1.3 + i * 0.2) + i) * 0.12 * (0.5 + U.uWind.value); });
      if (s.type === 'door') {
        if (s.building === 'farmhouse' && this.env.houseDoor) {
          const d = this.env.houseDoor;
          d.rotation.y += (it.doorTarget - d.rotation.y) * Math.min(1, dt * 6);
          d.rotation.z = it.doorBroken ? 0.25 : 0;
        } else if (s.building === 'barn' && this.env.barnDoor) {
          for (const leaf of this.env.barnDoor) {
            const tz = it.barnOpen ? leaf.userData.openZ : leaf.userData.closedZ;
            leaf.position.z += (tz - leaf.position.z) * Math.min(1, dt * 2.5);
            leaf.rotation.x = it.barnBroken ? (leaf.userData.closedZ > 0 ? 0.25 : -0.15) : 0;
          }
        }
      }
    }
  }

  // Catenary cables between connected network nodes and consumers.
  rebuildWires(sim) {
    if (this.wires) { this.root.remove(this.wires); this.wires.geometry.dispose(); }
    const pts = [];
    const top = (s) => {
      const y = heightAt(s.x, s.z);
      if (s.type === 'pole') return new THREE.Vector3(s.x, y + 5.85, s.z);
      if (s.type === 'generator') return new THREE.Vector3(s.x, y + 1.0, s.z);
      if (s.type === 'floodlight') return new THREE.Vector3(s.x, y + 4.7, s.z);
      if (s.type === 'camera') return new THREE.Vector3(s.x, y + 3.2, s.z);
      if (s.type === 'house') return new THREE.Vector3(s.x + 6, y + 3.6, s.z - 2);
      if (s.type === 'solar') return new THREE.Vector3(s.x - (s.len || 34) / 2 - 0.6, y + 0.9, s.z);
      return new THREE.Vector3(s.x, y + 2, s.z);
    };
    const sag = (a, b) => {
      const d = a.distanceTo(b);
      const n = Math.max(4, Math.ceil(d / 2));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = a.clone().lerp(b, t0); p0.y -= Math.sin(t0 * Math.PI) * d * 0.04;
        const p1 = a.clone().lerp(b, t1); p1.y -= Math.sin(t1 * Math.PI) * d * 0.04;
        pts.push(p0, p1);
      }
    };
    for (const net of sim.rt.networks || []) {
      const nodes = net.nodes.filter((n) => n.hp > 0 || n.type === 'generator' || n.type === 'solar');
      // spanning tree: connect each node to nearest earlier node
      for (let i = 1; i < nodes.length; i++) {
        let best = null, bd = Infinity;
        for (let j = 0; j < i; j++) { const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z); if (d < bd) { bd = d; best = nodes[j]; } }
        if (best && bd <= 26) sag(top(best), top(nodes[i]));
      }
      for (const c of net.consumers) {
        let best = null, bd = Infinity;
        for (const n of nodes) { const d = Math.hypot(n.x - c.x, n.z - c.z); if (d < bd) { bd = d; best = n; } }
        if (best && bd > 0.5) sag(top(best), top(c));
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.wires = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x0c0c0c }));
    this.root.add(this.wires);
  }
}

// Ghost preview for build mode
export class Ghost {
  constructor(scene, M) {
    this.scene = scene; this.M = M; this.type = null; this.group = null;
    this.okMat = new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, opacity: 0.38, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.38, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    this.ring.visible = false;
    scene.add(this.ring);
  }
  set(type) {
    if (this.type === type) return;
    if (this.group) this.scene.remove(this.group);
    this.type = type; this.group = null;
    if (!type) { this.ring.visible = false; return; }
    const { group } = buildStructureMesh(type, this.M, 0, {});
    group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.material = this.okMat; } });
    this.group = group;
    this.scene.add(group);
  }
  update(x, z, rot, ok) {
    if (!this.group) return;
    this.group.position.set(x, heightAt(x, z), z);
    this.group.rotation.y = rot;
    this.group.traverse((o) => { if (o.isMesh && o.material !== this.okMat && o.material !== this.badMat) return; if (o.isMesh) o.material = ok ? this.okMat : this.badMat; });
    const d = BUILDABLES[this.type];
    const rad = d.radius || d.range || (d.light && d.light.radius) || 0;
    this.ring.visible = rad > 0;
    if (rad) {
      const aim = this.type === 'floodlight' ? d.light.radius * 0.55 : 0;
      this.ring.position.set(x + Math.sin(rot) * aim, heightAt(x, z) + 0.15, z + Math.cos(rot) * aim);
      this.ring.scale.setScalar(rad);
    }
  }
}
