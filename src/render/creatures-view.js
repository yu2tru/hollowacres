// Procedurally built & animated creature rigs. Each type has a distinct
// silhouette and gait; the simulation drives state, this only presents it.
import * as THREE from 'three';
import { U } from './materials.js';
import { noiseDisplace } from './geo-utils.js';

const skinMat = (color, rough = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
const eyeMat = () => new THREE.MeshBasicMaterial({ color: 0x000000 });

function limb(len, r0, r1, mat, seg = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
function joint(parent, x, y, z) { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; }
function part(geo, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }

// --- Gnawer: low, hairless, long-jawed pack hunter
function buildGnawer() {
  const root = new THREE.Group();
  const skin = skinMat(0x8f7f78, 0.42);
  const dark = skinMat(0x3a2e2a, 0.6);
  const body = joint(root, 0, 0.55, 0);
  const torso = new THREE.SphereGeometry(0.34, 14, 10); torso.scale(0.85, 0.75, 1.9); noiseDisplace(torso, 0.04, 3, 4);
  part(torso, skin, body);
  // spine ridge
  for (let i = 0; i < 7; i++) part(new THREE.ConeGeometry(0.03, 0.09, 4), dark, body, 0, 0.26 - Math.abs(i - 3) * 0.015, -0.45 + i * 0.15);
  const neck = joint(body, 0, 0.08, 0.6);
  const head = joint(neck, 0, 0, 0.12);
  const skull = new THREE.SphereGeometry(0.16, 12, 8); skull.scale(0.9, 0.8, 2.1);
  part(skull, skin, head, 0, 0, 0.2);
  const jaw = joint(head, 0, -0.07, 0.05);
  part(new THREE.BoxGeometry(0.16, 0.05, 0.48).translate(0, 0, 0.22), skin, jaw);
  for (let i = 0; i < 6; i++) {
    part(new THREE.ConeGeometry(0.012, 0.06, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8d0b0 }), head, (i % 2 ? 0.06 : -0.06), -0.06, 0.12 + Math.floor(i / 2) * 0.12);
    part(new THREE.ConeGeometry(0.012, 0.06, 4), new THREE.MeshStandardMaterial({ color: 0xd8d0b0 }), jaw, (i % 2 ? 0.06 : -0.06), 0.03, 0.12 + Math.floor(i / 2) * 0.12);
  }
  const eyes = eyeMat();
  part(new THREE.SphereGeometry(0.022, 6, 4), eyes, head, 0.09, 0.05, 0.22);
  part(new THREE.SphereGeometry(0.022, 6, 4), eyes, head, -0.09, 0.05, 0.22);
  const legs = [];
  for (const [x, z] of [[0.2, 0.42], [-0.2, 0.42], [0.2, -0.45], [-0.2, -0.45]]) {
    const hip = joint(body, x, -0.08, z);
    hip.add(limb(0.32, 0.07, 0.05, skin));
    const knee = joint(hip, 0, -0.32, 0);
    knee.add(limb(0.3, 0.045, 0.03, dark));
    legs.push({ hip, knee });
  }
  const tail = joint(body, 0, 0.05, -0.65);
  tail.add(limb(0.6, 0.04, 0.01, skin).rotateX(1.2));
  return { root, body, neck, head, jaw, legs, tail, eyes, height: 0.9 };
}

// --- Humanoid (Drifter / Pale)
function buildHumanoid(opts) {
  const { height = 1.75, thin = 1, skin = 0xb7aea0, clothes = 0x4a5a6a, pants = 0x2c3038, dress = false, armLen = 1 } = opts;
  const root = new THREE.Group();
  const s = height / 1.75;
  const skinM = skinMat(skin, 0.6), cloth = skinMat(clothes, 0.95), pant = skinMat(pants, 0.95);
  const hips = joint(root, 0, 0.95 * s, 0);
  const spine = joint(hips, 0, 0.05 * s, 0);
  const torsoG = new THREE.CylinderGeometry(0.2 * s * thin, 0.17 * s * thin, 0.62 * s, 10); torsoG.translate(0, 0.31 * s, 0); torsoG.scale(1, 1, 0.65);
  part(torsoG, cloth, spine);
  if (dress) {
    const skirt = new THREE.CylinderGeometry(0.18 * s, 0.38 * s, 0.75 * s, 12, 1, true); skirt.translate(0, -0.3 * s, 0);
    part(skirt, cloth, hips).material = new THREE.MeshStandardMaterial({ color: clothes, roughness: 0.95, side: THREE.DoubleSide });
  }
  const neck = joint(spine, 0, 0.64 * s, 0);
  neck.add(limb(0.1 * s, 0.05 * s, 0.05 * s, skinM).translateY(0.1 * s));
  const head = joint(neck, 0, 0.17 * s, 0);
  const hg = new THREE.SphereGeometry(0.11 * s, 12, 10); hg.scale(0.9, 1.15, 1);
  part(hg, skinM, head);
  const eyes = eyeMat();
  part(new THREE.SphereGeometry(0.018 * s, 6, 4), eyes, head, 0.04 * s, 0.02 * s, 0.09 * s);
  part(new THREE.SphereGeometry(0.018 * s, 6, 4), eyes, head, -0.04 * s, 0.02 * s, 0.09 * s);
  const arms = [];
  for (const sgn of [1, -1]) {
    const sh = joint(spine, sgn * 0.23 * s * thin, 0.56 * s, 0);
    sh.add(limb(0.3 * s * armLen, 0.055 * s, 0.045 * s, cloth));
    const el = joint(sh, 0, -0.3 * s * armLen, 0);
    el.add(limb(0.3 * s * armLen, 0.042 * s, 0.034 * s, skinM));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.14 * s * armLen, 0.03 * s).translate(0, -0.07 * s, 0), skinM);
    hand.position.y = -0.3 * s * armLen; el.add(hand);
    arms.push({ sh, el });
  }
  const legs = [];
  for (const sgn of [1, -1]) {
    const hip = joint(hips, sgn * 0.1 * s, 0, 0);
    hip.add(limb(0.46 * s, 0.075 * s, 0.06 * s, dress ? skinM : pant));
    const knee = joint(hip, 0, -0.46 * s, 0);
    knee.add(limb(0.45 * s, 0.058 * s, 0.045 * s, dress ? skinM : pant));
    part(new THREE.BoxGeometry(0.09 * s, 0.06 * s, 0.22 * s).translate(0, -0.47 * s, 0.05 * s), skinMat(0x241c16, 0.8), knee);
    legs.push({ hip, knee });
  }
  return { root, hips, spine, neck, head, arms, legs, eyes, height, s };
}

// --- Antlered: towering elk-thing with a skull face and branching antlers
function buildAntlered() {
  const root = new THREE.Group();
  const hide = skinMat(0x2a231d, 0.95), bone = skinMat(0xcfc6b2, 0.7), hoof = skinMat(0x111111, 0.6);
  const body = joint(root, 0, 1.75, 0);
  const torso = new THREE.SphereGeometry(0.6, 14, 10); torso.scale(0.95, 1.0, 2.0); noiseDisplace(torso, 0.07, 5, 2);
  part(torso, hide, body);
  const neck = joint(body, 0, 0.35, 0.95);
  neck.rotation.x = 0.6;
  neck.add(limb(0.9, 0.28, 0.18, hide).rotateX(Math.PI));
  const head = joint(neck, 0, 0.9, 0);
  const sk = new THREE.SphereGeometry(0.2, 10, 8); sk.scale(0.9, 0.9, 2.4);
  part(sk, bone, head, 0, 0, 0.3);
  const eyes = eyeMat();
  part(new THREE.SphereGeometry(0.04, 6, 4), eyes, head, 0.13, 0.07, 0.2);
  part(new THREE.SphereGeometry(0.04, 6, 4), eyes, head, -0.13, 0.07, 0.2);
  // antlers: recursive branches
  const antM = skinMat(0x3a3027, 0.9);
  const branch = (parent, len, r, depth, rx, rz) => {
    const j = new THREE.Group(); j.rotation.set(rx, 0, rz); parent.add(j);
    const m = limb(len, r, r * 0.6, antM, 5); m.rotation.x = Math.PI; m.position.y = 0; j.add(m);
    const tip = new THREE.Group(); tip.position.y = len; j.add(tip);
    if (depth > 0) {
      branch(tip, len * 0.7, r * 0.6, depth - 1, rx * 0.5 - 0.3, rz + 0.5);
      branch(tip, len * 0.65, r * 0.55, depth - 1, rx * 0.5 + 0.35, rz - 0.4);
    }
  };
  for (const sgn of [1, -1]) {
    const base = joint(head, sgn * 0.13, 0.15, 0.1);
    branch(base, 0.7, 0.06, 3, -0.4, sgn * 0.7);
  }
  const legs = [];
  for (const [x, z] of [[0.36, 0.85], [-0.36, 0.85], [0.36, -0.85], [-0.36, -0.85]]) {
    const hip = joint(body, x, -0.25, z);
    hip.add(limb(0.85, 0.16, 0.1, hide));
    const knee = joint(hip, 0, -0.85, 0);
    knee.add(limb(0.75, 0.08, 0.05, hide));
    part(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 6).translate(0, -0.78, 0), hoof, knee);
    legs.push({ hip, knee });
  }
  return { root, body, neck, head, legs, eyes, height: 3.4 };
}

// --- The Hollow: a person-shaped absence
function buildHollow() {
  const root = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.1 }, uTime: U.uTime, uRim: { value: new THREE.Color(0.25, 0.4, 0.75) } },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime;
      void main(){ vec3 p = position; p += normal * sin(uTime*3.0 + position.y*6.0) * 0.02;
        vec4 mv = modelViewMatrix * vec4(p,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uOpacity, uTime; uniform vec3 uRim;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float flick = step(0.15, h(floor(vP*18.0) + floor(uTime*12.0)));
        vec3 col = mix(vec3(0.0), uRim, rim);
        float a = (0.85 + rim * 0.5) * uOpacity * flick;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0)); }`,
  });
  const body = joint(root, 0, 0, 0);
  const torso = new THREE.CylinderGeometry(0.22, 0.12, 1.1, 10); torso.translate(0, 1.25, 0);
  part(torso, mat, body).castShadow = false;
  const robe = new THREE.ConeGeometry(0.42, 1.4, 12, 1, true); robe.translate(0, 0.7, 0);
  part(robe, mat, body).castShadow = false;
  const head = joint(body, 0, 2.0, 0);
  part(new THREE.SphereGeometry(0.16, 12, 10).scale(1, 1.3, 1), mat, head).castShadow = false;
  const arms = [];
  for (const sgn of [1, -1]) {
    const sh = joint(body, sgn * 0.26, 1.75, 0);
    const a = limb(0.95, 0.05, 0.02, mat); a.castShadow = false; sh.add(a);
    sh.rotation.z = sgn * 0.15;
    arms.push({ sh });
  }
  return { root, body, head, arms, mat, height: 2.2 };
}

const CLOTHES = [
  { clothes: 0x3d5470, pants: 0x34445a }, // overalls
  { clothes: 0x6b5a7a, dress: true },     // church dress
  { clothes: 0x5a4632, pants: 0x2d2a26 }, // work jacket
  { clothes: 0x7a7468, pants: 0x3a3a36 }, // grey shirt
  { clothes: 0x4f5e48, dress: true },     // green dress
];

export class CreaturesView {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  create(c) {
    let rig;
    if (c.type === 'gnawer') rig = buildGnawer();
    else if (c.type === 'drifter') rig = buildHumanoid({ height: 1.65 + (c.id % 5) * 0.04, skin: 0x9d978c, thin: 0.95, ...CLOTHES[c.id % CLOTHES.length] });
    else if (c.type === 'pale') rig = buildHumanoid({ height: 2.85, thin: 0.72, skin: 0xe6e3dc, clothes: 0x6d7f94, pants: 0x6d7f94, armLen: 1.45 });
    else if (c.type === 'antlered') rig = buildAntlered();
    else rig = buildHollow();
    rig.phase = Math.random() * 10;
    rig.root.traverse((o) => { o.userData.creatureId = c.id; });
    this.root.add(rig.root);
    this.items.set(c.id, rig);
    return rig;
  }

  sync(sim) {
    const alive = new Set();
    for (const c of sim.creatures) {
      alive.add(c.id);
      if (!this.items.has(c.id)) this.create(c);
    }
    for (const [id, rig] of this.items) if (!alive.has(id)) { this.root.remove(rig.root); this.items.delete(id); }
  }

  update(sim, dt, opts = {}) {
    this.sync(sim);
    const t = sim.clockSeconds;
    for (const c of sim.creatures) {
      const rig = this.items.get(c.id);
      if (!rig) continue;
      const r = rig.root;
      const hidden = c.hiddenUntil && c.hiddenUntil > t;
      r.visible = !hidden;
      if (hidden) continue;
      r.position.set(c.x, c.y, c.z);
      r.rotation.y = c.yaw;
      // eyeshine
      if (rig.eyes) {
        const shine = c.inBeam ? 1 : (opts.night ? 0.12 : 0);
        const base = c.type === 'pale' ? [0.9, 0.9, 0.8] : c.type === 'gnawer' ? [1, 0.75, 0.3] : c.type === 'antlered' ? [0.9, 0.3, 0.15] : [0.6, 0.7, 0.6];
        rig.eyes.color.setRGB(base[0] * shine, base[1] * shine, base[2] * shine);
      }
      if (!c.alive) { this.animateDeath(rig, c, dt); continue; }
      r.rotation.x = 0; r.rotation.z = 0;
      const speed = c.speed || 0;
      if (c.type === 'pale' && c.observed) continue; // frozen mid-pose while watched
      rig.phase += dt * (speed * (c.type === 'gnawer' ? 3.2 : c.type === 'antlered' ? 1.2 : c.type === 'pale' ? 1.3 : 2.4) + 0.2);
      const ph = rig.phase;
      const amp = Math.min(1, speed / 2);
      if (c.type === 'gnawer') {
        rig.legs.forEach((l, i) => {
          const o = (i === 0 || i === 3) ? 0 : Math.PI;
          l.hip.rotation.x = Math.sin(ph + o) * 0.7 * amp;
          l.knee.rotation.x = Math.max(0, -Math.cos(ph + o)) * 0.9 * amp;
        });
        rig.body.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.05 * amp;
        const feeding = c.state === 'feed';
        rig.neck.rotation.x = feeding ? 0.7 + Math.sin(t * 9) * 0.15 : Math.sin(ph * 0.5) * 0.1;
        rig.jaw.rotation.x = feeding ? 0.25 + Math.sin(t * 14) * 0.2 : c.anim.attack * 0.6;
        rig.tail.rotation.y = Math.sin(t * 4 + rig.phase) * 0.3;
        rig.body.rotation.z = c.anim.hurt * 0.3;
      } else if (c.type === 'drifter' || c.type === 'pale') {
        const pale = c.type === 'pale';
        const limp = pale ? 0 : 0.35;
        rig.legs.forEach((l, i) => {
          const o = i ? Math.PI : 0;
          const swing = Math.sin(ph + o) * (pale ? 0.7 : 0.45) * amp * (i ? 1 - limp : 1);
          l.hip.rotation.x = swing;
          l.knee.rotation.x = Math.max(0, Math.sin(ph + o - 1.2)) * 0.8 * amp;
        });
        rig.hips.position.y = 0.95 * rig.s - Math.abs(Math.sin(ph)) * 0.03 * amp * (pale ? 3 : 1) - (pale ? 0 : 0.04);
        const atk = c.anim.attack;
        rig.arms.forEach((a, i) => {
          const sgn = i ? -1 : 1;
          if (pale) {
            a.sh.rotation.x = -atk * 2.2; a.sh.rotation.z = sgn * 0.08; a.el.rotation.x = -atk * 0.6;
          } else {
            a.sh.rotation.x = -atk * 2.6 + Math.sin(ph + (i ? 0 : Math.PI)) * 0.15 * amp - 0.1;
            a.sh.rotation.z = sgn * (0.12 + Math.sin(t * 0.7 + i) * 0.03);
            a.el.rotation.x = -0.25 - atk * 0.8;
          }
        });
        rig.spine.rotation.x = pale ? 0.05 : 0.28 + Math.sin(t * 0.5 + rig.phase) * 0.04;
        rig.neck.rotation.z = pale ? Math.sin(t * 0.3) * 0.05 + 0.25 : 0.35 + Math.sin(t * 0.9) * 0.05;
        rig.neck.rotation.x = pale ? 0.1 : 0.3;
        rig.spine.rotation.z = c.anim.hurt * 0.25;
        if (c.pinnedUntil > t) { rig.legs[0].hip.rotation.x = -0.2; rig.spine.rotation.x = 0.5 + Math.sin(t * 12) * 0.08; }
      } else if (c.type === 'antlered') {
        const run = c.state === 'charge';
        rig.legs.forEach((l, i) => {
          const o = run ? (i < 2 ? 0 : Math.PI * 0.5) + (i % 2) * 0.3 : (i === 0 || i === 3) ? 0 : Math.PI;
          l.hip.rotation.x = Math.sin(ph + o) * (run ? 0.8 : 0.4) * amp;
          l.knee.rotation.x = Math.max(0, Math.sin(ph + o - 1)) * 0.7 * amp;
        });
        const windup = c.state === 'windup';
        rig.neck.rotation.x = windup || run ? 1.25 : 0.6 + Math.sin(t * 0.4) * 0.05;
        rig.body.rotation.x = windup ? 0.08 : 0;
        if (windup) rig.legs[0].hip.rotation.x = Math.sin(t * 10) * 0.5;
        rig.body.position.y = 1.75 + Math.abs(Math.sin(ph)) * (run ? 0.12 : 0.04) * amp;
        if (c.stunUntil > t) { rig.neck.rotation.x = 0.95; rig.head.rotation.z = Math.sin(t * 5) * 0.2; } else rig.head.rotation.z = 0;
      } else if (c.type === 'hollow') {
        const vis = opts.cctv ? 1 : Math.min(1, c.visibility || 0.06);
        rig.mat.uniforms.uOpacity.value = vis;
        rig.body.position.y = Math.sin(t * 1.3 + rig.phase) * 0.08 + 0.1;
        rig.arms.forEach((a, i) => { a.sh.rotation.x = Math.sin(t * 0.8 + i) * 0.1 - (c.distToPlayer() < 6 ? 1.2 : 0); });
        rig.head.rotation.z = Math.sin(t * 2.1) * 0.3 + (c.beamT > 0 ? Math.sin(t * 40) * 0.2 : 0);
      }
    }
  }

  animateDeath(rig, c, dt) {
    const k = Math.min(1, c.deadT * 2.5);
    rig.root.rotation.z = k * 1.45;
    rig.root.position.y = c.y - Math.max(0, c.deadT - 6) * 0.25 + (c.type === 'antlered' ? -0.3 * k : 0);
  }

  // used by the CCTV view to fully reveal the Hollow
  setCCTV(sim, on) {
    for (const c of sim.creatures) {
      const rig = this.items.get(c.id);
      if (rig && rig.mat) rig.mat.uniforms.uOpacity.value = on ? 1 : Math.min(1, c.visibility || 0.06);
    }
  }
}
