// Fixed-size pools of real lights assigned each frame to the nearest active
// sources (floodlights, windows, flares, muzzle flash). Fixed counts avoid
// shader recompiles.
import * as THREE from 'three';
import { heightAt } from '../sim/terrain.js';
import { lightProps } from '../sim/structures.js';

export class LightPool {
  constructor(scene, quality) {
    this.spotCount = { low: 3, medium: 5, high: 7, epic: 9 }[quality] ?? 5;
    this.spots = [];
    for (let i = 0; i < this.spotCount; i++) {
      const s = new THREE.SpotLight(0xfff1dc, 0, 50, 0.9, 0.55, 1.6);
      s.castShadow = quality === 'epic' && i < 2;
      if (s.castShadow) { s.shadow.mapSize.set(512, 512); s.shadow.bias = -0.0006; s.shadow.camera.near = 0.5; }
      scene.add(s, s.target);
      this.spots.push(s);
    }
    this.points = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PointLight(0xffb060, 0, 14, 1.7);
      scene.add(p);
      this.points.push(p);
    }
    this.muzzle = new THREE.PointLight(0xffb070, 0, 18, 2);
    scene.add(this.muzzle);
    this.muzzleT = 0;
  }

  update(sim, structView, env, camPos, nightAmt, dt, extras = {}) {
    // floodlights: nearest lit ones
    const lit = [];
    for (const it of structView.items.values()) {
      if (it.s.type !== 'floodlight' || !it.on) continue;
      const d = Math.hypot(it.s.x - camPos.x, it.s.z - camPos.z);
      lit.push({ it, d });
    }
    lit.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.spots.length; i++) {
      const sp = this.spots[i];
      const e = lit[i];
      if (!e || e.d > 140) { sp.intensity = 0; continue; }
      const s = e.it.s;
      const L = lightProps(s);
      const y = heightAt(s.x, s.z);
      sp.position.set(s.x + Math.sin(s.rot) * 0.15, y + 4.95, s.z + Math.cos(s.rot) * 0.15);
      const aim = L.radius * 0.55;
      sp.target.position.set(s.x + Math.sin(s.rot) * aim, heightAt(s.x + Math.sin(s.rot) * aim, s.z + Math.cos(s.rot) * aim), s.z + Math.cos(s.rot) * aim);
      sp.angle = 0.75 + (s.level ? 0.12 : 0);
      sp.distance = L.radius * 3.2;
      sp.intensity = (s.level ? 950 : 600) * Math.max(0.15, nightAmt);
      sp.color.setHex(s.level ? 0xfff6ea : 0xffe7c4);
    }
    // windows/porch/barn + flares
    const pts = [];
    if (sim.rt.housePowered) for (const l of env.lamps) if (l.kind !== 'barn') pts.push({ pos: l.pos, color: 0xffb35e, int: l.kind === 'porch' ? 9 : 14, dist: l.kind === 'porch' ? 12 : 11 });
    for (const l of env.lamps) if (l.kind === 'barn') pts.push({ pos: l.pos, color: 0xffa040, int: 6, dist: 9 });
    for (const f of sim.state.structures) if (f.type === 'firepit' && f.lit) {
      const t = sim.clockSeconds;
      pts.push({ pos: new THREE.Vector3(f.x, heightAt(f.x, f.z) + 0.9, f.z), color: 0xff8a36, int: 16 + Math.sin(t * 11) * 2.5 + Math.sin(t * 27) * 1.5, dist: 16 });
    }
    for (const f of sim.rt.flares) {
      const age = sim.clockSeconds - f.born;
      pts.push({ pos: new THREE.Vector3(f.x, heightAt(f.x, f.z) + 0.4, f.z), color: 0xff3a22, int: (22 + Math.sin(age * 23) * 4 + Math.sin(age * 7) * 3), dist: 22 });
    }
    pts.sort((a, b) => a.pos.distanceTo(camPos) - b.pos.distanceTo(camPos));
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i], e = pts[i];
      if (!e) { p.intensity = 0; continue; }
      p.position.copy(e.pos); p.color.setHex(e.color); p.distance = e.dist;
      p.intensity = e.int * Math.max(0.2, nightAmt);
    }
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzle.intensity = this.muzzleT > 0 ? 40 : 0;
  }

  muzzleFlash(pos) { this.muzzle.position.copy(pos); this.muzzleT = 0.05; }
}
