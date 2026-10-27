// First-person hands & held items, rendered in their own scene so they never
// clip into walls. Procedural animation for bob, sway, recoil, swings, reloads.
import * as THREE from 'three';
import { CROPS } from '../data/crops.js';
import { glowTexture } from './textures.js';

const S = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);

export class ViewModel {
  constructor(M) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.dir = new THREE.DirectionalLight(0xffffff, 1);
    this.dir.position.set(0.3, 1, 0.5);
    this.fill = new THREE.PointLight(0xfff0dd, 0, 2, 2);
    this.fill.position.set(-0.2, 0.1, -0.3);
    this.scene.add(this.hemi, this.dir, this.fill, this.camera);
    this.root = new THREE.Group();
    this.camera.add(this.root);
    const skin = S(0xc9a084, 0.7), steel = S(0x50555a, 0.35, 0.85), dark = S(0x1d1e20, 0.5, 0.6), wood = S(0x5a3d25, 0.65);
    const sleeve = M.flannel;
    this.items = {};
    // right arm base
    const arm = new THREE.Group();
    add(arm, cyl(0.045, 0.055, 0.5), sleeve, 0, -0.05, 0.22, Math.PI / 2 - 0.3);
    add(arm, box(0.075, 0.09, 0.11), skin, 0, 0.0, -0.05);
    this.arm = arm;
    // left hand holding flashlight
    const left = new THREE.Group();
    add(left, cyl(0.045, 0.055, 0.5), sleeve, 0, -0.05, 0.22, Math.PI / 2 - 0.3);
    add(left, box(0.075, 0.09, 0.11), skin, 0, 0, -0.05);
    const fl = new THREE.Group();
    add(fl, cyl(0.022, 0.022, 0.2), dark, 0, 0, -0.1, Math.PI / 2);
    add(fl, cyl(0.034, 0.024, 0.06), dark, 0, 0, -0.22, Math.PI / 2);
    this.lens = new THREE.MeshBasicMaterial({ color: 0x222222 });
    add(fl, new THREE.CircleGeometry(0.03, 16), this.lens, 0, 0, -0.252, 0, Math.PI);
    left.add(fl);
    left.position.set(-0.2, -0.2, -0.32);
    left.rotation.set(0.05, 0.12, 0);
    this.left = left;
    this.root.add(left);

    const mk = (id, build) => { const g = new THREE.Group(); build(g); g.visible = false; this.root.add(g); this.items[id] = g; return g; };
    mk('shovel', (g) => {
      g.add(arm.clone());
      add(g, cyl(0.016, 0.016, 1.1), wood, 0, 0.05, -0.25, -1.15);
      add(g, box(0.2, 0.012, 0.24), steel, 0, 0.32, -0.72, -1.15 + Math.PI / 2 - 0.2);
    });
    mk('revolver', (g) => {
      g.add(arm.clone());
      add(g, box(0.035, 0.09, 0.05), wood, 0, -0.01, -0.06, 0.25);
      add(g, box(0.04, 0.05, 0.11), steel, 0, 0.045, -0.12);
      add(g, cyl(0.026, 0.026, 0.05, 8), steel, 0, 0.045, -0.12, Math.PI / 2);
      add(g, cyl(0.011, 0.011, 0.17), steel, 0, 0.06, -0.24, Math.PI / 2);
      add(g, box(0.006, 0.012, 0.006), steel, 0, 0.075, -0.32);
      this.muzzleRev = new THREE.Object3D(); this.muzzleRev.position.set(0, 0.06, -0.34); g.add(this.muzzleRev);
    });
    mk('shotgun', (g) => {
      g.add(arm.clone());
      add(g, box(0.045, 0.08, 0.3), wood, 0, 0.0, 0.08, 0.15);
      add(g, box(0.05, 0.07, 0.22), dark, 0, 0.04, -0.15);
      add(g, cyl(0.014, 0.014, 0.55), dark, 0, 0.065, -0.5, Math.PI / 2);
      add(g, cyl(0.012, 0.012, 0.45), dark, 0, 0.035, -0.45, Math.PI / 2);
      this.pump = add(g, cyl(0.022, 0.022, 0.16), wood, 0, 0.035, -0.4, Math.PI / 2);
      const lh = add(g, box(0.075, 0.09, 0.11), skin, -0.02, 0.0, -0.4);
      this.pumpHand = lh;
      this.tapeLight = new THREE.Group();
      add(this.tapeLight, cyl(0.018, 0.018, 0.12), dark, 0, 0, 0, Math.PI / 2);
      add(this.tapeLight, new THREE.CircleGeometry(0.018, 12), this.lens, 0, 0, -0.061, 0, Math.PI);
      this.tapeLight.position.set(0, 0.0, -0.62); g.add(this.tapeLight);
      this.muzzleSg = new THREE.Object3D(); this.muzzleSg.position.set(0, 0.065, -0.79); g.add(this.muzzleSg);
    });
    mk('can', (g) => {
      g.add(arm.clone());
      const galv = S(0x8e959a, 0.35, 0.8);
      this.canBody = new THREE.Group();
      add(this.canBody, cyl(0.1, 0.11, 0.2, 16), galv, 0, -0.1, -0.08);
      add(this.canBody, cyl(0.012, 0.02, 0.32, 8), galv, 0.0, -0.02, -0.28, 1.0);
      add(this.canBody, new THREE.TorusGeometry(0.08, 0.01, 6, 12, Math.PI), galv, 0, 0.02, -0.05, 0, Math.PI / 2);
      g.add(this.canBody);
    });
    mk('seeds', (g) => {
      g.add(arm.clone());
      const burlap = S(0x9b8458, 1);
      add(g, new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1.3, 0.8), burlap, 0.02, -0.06, -0.12);
      this.seedLabel = S(0xffffff, 0.8);
      add(g, box(0.07, 0.05, 0.005), this.seedLabel, 0.02, -0.05, -0.05);
    });
    mk('hammer', (g) => {
      g.add(arm.clone());
      add(g, cyl(0.012, 0.014, 0.3), wood, 0, 0.1, -0.05, 0.3);
      add(g, box(0.035, 0.035, 0.13), steel, 0, 0.24, -0.1, 0, 0, Math.PI / 2);
    });
    mk('flare', (g) => {
      g.add(arm.clone());
      add(g, cyl(0.018, 0.018, 0.22), S(0xb3201a, 0.5), 0, 0.06, -0.06, 0.3);
      add(g, cyl(0.02, 0.02, 0.03), S(0x222222), 0, 0.17, -0.09, 0.3);
    });
    mk('medkit', (g) => {
      g.add(arm.clone());
      add(g, box(0.16, 0.11, 0.06), S(0xe8e4dc, 0.6), 0, 0.0, -0.1);
      add(g, box(0.05, 0.015, 0.062), S(0xb01a10), 0, 0.0, -0.1);
      add(g, box(0.015, 0.05, 0.062), S(0xb01a10), 0, 0.0, -0.1);
    });
    mk('fertilizer', (g) => {
      g.add(arm.clone());
      add(g, box(0.14, 0.2, 0.07), S(0x3a6a3a, 0.8), 0, 0.0, -0.1);
    });
    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(64, 1.2), color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.flash.scale.setScalar(0.25); this.flash.visible = false;
    this.root.add(this.flash);

    this.current = null;
    this.t = 0; this.bob = 0; this.swayX = 0; this.swayY = 0;
    this.anim = { recoil: 0, reload: 0, swing: 0, use: 0, equip: 1, throw: 0, flash: 0, hammer: 0 };
    this.root.scale.setScalar(0.72);
    this.root.position.set(0.24, -0.25, -0.5);
  }

  setTool(id) {
    if (this.current === id) return;
    for (const [k, g] of Object.entries(this.items)) g.visible = k === id;
    this.current = id;
    this.anim.equip = 1;
  }

  setSeed(cropId) {
    if (this.seedLabel && CROPS[cropId]) this.seedLabel.color.setRGB(...CROPS[cropId].color);
  }

  trigger(kind) {
    const a = this.anim;
    if (kind === 'fire') { a.recoil = 1; a.flash = 0.06; }
    else if (kind === 'reload') a.reload = 1;
    else if (kind === 'swing') a.swing = 1;
    else if (kind === 'use') a.use = 1;
    else if (kind === 'throw') a.throw = 1;
    else if (kind === 'hammer') a.hammer = 1;
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  update(dt, s) {
    // s: { speed, grounded, sprint, lookDX, lookDY, flashlight, aiming, reloading, battery, light }
    this.t += dt;
    const a = this.anim;
    for (const k of Object.keys(a)) a[k] = Math.max(0, a[k] - dt * ({ recoil: 6, reload: 0.5, swing: 3, use: 2.5, equip: 3.5, throw: 2.5, flash: 1, hammer: 4 }[k]));
    const moving = s.grounded ? Math.min(1, s.speed / 3.6) : 0;
    this.bob += dt * (s.sprint ? 13 : 9) * (moving > 0.05 ? 1 : 0);
    const bobAmt = s.reduceMotion ? 0.3 : 1;
    const bx = Math.sin(this.bob) * 0.012 * moving * bobAmt * (s.sprint ? 1.8 : 1);
    const by = -Math.abs(Math.cos(this.bob)) * 0.012 * moving * bobAmt * (s.sprint ? 1.8 : 1);
    this.swayX += (-s.lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (s.lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 8);
    const aim = s.aiming && (this.current === 'revolver' || this.current === 'shotgun');
    const base = aim ? (this.current === 'shotgun' ? [0.0, -0.115, -0.36] : [0.0, -0.105, -0.4]) : [0.24, -0.25, -0.5];
    const p = this.root.position;
    const sprintTilt = s.sprint ? 1 : 0;
    p.x += (base[0] + bx + this.swayX - p.x) * Math.min(1, dt * 14);
    p.y += (base[1] + by + this.swayY - a.equip * 0.25 - a.reload * 0.12 - sprintTilt * 0.04 - p.y) * Math.min(1, dt * 14);
    p.z += (base[2] + a.recoil * 0.06 - p.z) * Math.min(1, dt * 20);
    const r = this.root.rotation;
    let rx = a.recoil * 0.35 + a.reload * 0.6 - sprintTilt * 0.25;
    let ry = sprintTilt * 0.5;
    let rz = a.reload * 0.4;
    if (this.current === 'shovel') { rx += -Math.sin(a.swing * Math.PI) * 1.1; ry += Math.sin(a.swing * Math.PI) * 0.6; }
    if (this.current === 'hammer') rx += -Math.sin(a.hammer * Math.PI) * 0.9;
    if (this.current === 'can') rz += -a.use * 0.0, rx += a.use * 0.5;
    if (this.current === 'seeds' || this.current === 'fertilizer') rx += -Math.sin(a.use * Math.PI) * 0.6;
    if (this.current === 'flare') rx += -Math.sin(a.throw * Math.PI) * 1.4;
    r.x += (rx - r.x) * Math.min(1, dt * 16);
    r.y += (ry - r.y) * Math.min(1, dt * 10);
    r.z += (rz - r.z) * Math.min(1, dt * 10);
    if (this.pump) this.pump.position.z = -0.4 + a.recoil * 0.06 * 0 + Math.sin(Math.min(1, a.recoil * 1.3) * Math.PI) * 0.06;
    if (this.pumpHand) this.pumpHand.position.z = (this.pump?.position.z ?? -0.4);
    // muzzle flash
    const muzzle = this.current === 'revolver' ? this.muzzleRev : this.current === 'shotgun' ? this.muzzleSg : null;
    if (muzzle && a.flash > 0.0) {
      this.flash.visible = true;
      const wp = new THREE.Vector3(); muzzle.getWorldPosition(wp); this.root.worldToLocal(wp);
      this.flash.position.copy(wp);
      this.flash.material.rotation = Math.random() * 6;
      this.flash.scale.setScalar(this.current === 'shotgun' ? 0.38 : 0.26);
    } else this.flash.visible = false;
    // flashlight hand
    const showLeft = s.flashlight && this.current !== 'shotgun';
    this.left.visible = showLeft || (s.flashlightAnim > 0);
    this.left.position.y = -0.2 - (showLeft ? 0 : 0.3);
    this.lens.color.setHex(s.flashlight ? 0xfff6e0 : 0x222222);
    if (this.tapeLight) this.tapeLight.visible = s.flashlight;
    // lighting of the hands follows the world
    this.hemi.intensity = s.ambient * 1.4 + 0.04;
    this.hemi.color.copy(s.hemiColor || this.hemi.color);
    this.dir.intensity = s.sun;
    this.fill.intensity = s.flashlight ? 0.6 : 0;
    this.fill.distance = 1.5;
  }
}
