// Chickens: small procedural birds driven by sim.rt.chickens.
import * as THREE from 'three';
import { heightAt } from '../sim/terrain.js';

function buildHen(white) {
  const g = new THREE.Group();
  const feather = new THREE.MeshStandardMaterial({ color: white ? 0xe9e4d8 : 0x8a5a32, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3241a, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd6a028, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.9, 1.3), feather);
  body.position.y = 0.24; body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 6).rotateX(-0.9), feather);
  tail.position.set(0, 0.32, -0.2);
  const neck = new THREE.Group(); neck.position.set(0, 0.3, 0.14);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), feather); head.position.set(0, 0.1, 0.04);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.07), red); comb.position.set(0, 0.18, 0.05);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 5).rotateX(Math.PI / 2), yellow); beak.position.set(0, 0.09, 0.12);
  neck.add(head, comb, beak);
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4).translate(0, -0.07, 0), yellow);
    l.position.set(s * 0.05, 0.15, 0); legs.push(l); g.add(l);
  }
  g.add(body, tail, neck);
  return { g, neck, body, legs };
}

export class AnimalsView {
  constructor(scene) {
    this.scene = scene;
    this.hens = [];
    this.root = new THREE.Group();
    scene.add(this.root);
  }
  update(sim, dt, t) {
    const list = sim.rt.chickens || [];
    while (this.hens.length < list.length) { const h = buildHen(this.hens.length % 3 !== 2); this.root.add(h.g); this.hens.push(h); }
    while (this.hens.length > list.length) this.root.remove(this.hens.pop().g);
    list.forEach((c, i) => {
      const h = this.hens[i];
      h.g.visible = !c.inside;
      if (c.inside) return;
      h.g.position.set(c.x, heightAt(c.x, c.z), c.z);
      h.g.rotation.y = c.yaw;
      const ph = t * 12 + i;
      h.neck.rotation.x = c.peck > 0 ? 0.9 + Math.sin(t * 14 + i) * 0.4 : (c.moving ? Math.sin(ph) * 0.25 : Math.sin(t * 0.8 + i) * 0.1);
      h.body.position.y = 0.24 + (c.moving ? Math.abs(Math.sin(ph)) * 0.02 : 0);
      h.legs.forEach((l, k) => { l.rotation.x = c.moving ? Math.sin(ph + k * Math.PI) * 0.6 : 0; });
    });
  }
}
