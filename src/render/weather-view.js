// Rain streaks around the camera and lightning timing.
import * as THREE from 'three';
import { WEATHER_TYPES } from '../sim/clock.js';

export class WeatherView {
  constructor(scene, quality) {
    this.count = { low: 1500, medium: 3000, high: 5000, epic: 7000 }[quality] || 3000;
    const pos = new Float32Array(this.count * 6);
    this.drops = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * 50;
      this.drops[i * 3 + 1] = Math.random() * 25;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0x9fb0c0, transparent: true, opacity: 0.0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.nextBolt = 8;
    this.pendingThunder = [];
  }

  update(dt, cam, weather, onBolt) {
    const def = WEATHER_TYPES[weather.current] || WEATHER_TYPES.clear;
    const prev = WEATHER_TYPES[weather.prev] || def;
    const b = Math.min(1, weather.blend ?? 1);
    const rain = prev.rain + (def.rain - prev.rain) * b;
    this.rain = rain;
    this.mat.opacity = rain * 0.35;
    this.lines.visible = rain > 0.02;
    if (this.lines.visible) {
      const active = Math.floor(this.count * Math.min(1, rain * 1.2));
      const pos = this.lines.geometry.attributes.position.array;
      const wind = 1.5 + def.wind * 4;
      for (let i = 0; i < this.count; i++) {
        let x = this.drops[i * 3], y = this.drops[i * 3 + 1], z = this.drops[i * 3 + 2];
        y -= dt * 22; x += dt * wind;
        if (y < -2) { y += 27; x = (Math.random() - 0.5) * 50; z = (Math.random() - 0.5) * 50; }
        this.drops[i * 3] = x; this.drops[i * 3 + 1] = y; this.drops[i * 3 + 2] = z;
        const o = i * 6;
        if (i >= active) { pos[o] = pos[o + 3] = 0; pos[o + 1] = pos[o + 4] = -999; pos[o + 2] = pos[o + 5] = 0; continue; }
        const wx = cam.x + x, wy = cam.y + y - 6, wz = cam.z + z;
        pos[o] = wx; pos[o + 1] = wy; pos[o + 2] = wz;
        pos[o + 3] = wx - wind * 0.04; pos[o + 4] = wy + 0.55; pos[o + 5] = wz;
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
    }
    // lightning during storms
    if (weather.current === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + Math.random() * 16;
        const dist = 300 + Math.random() * 1500;
        onBolt?.({ strength: Math.max(0.3, 1.2 - dist / 1800), dist });
      }
    }
  }
}
