// Pooled particle effects: dust, ichor, water, soil, sparks, smoke, flares.
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { heightAt } from '../sim/terrain.js';

const MAX = 1400;

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.mult = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const tex = glowTexture(32, 1.6);
    const mat = (blending) => new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 600 } },
      transparent: true, depthWrite: false, blending,
      vertexShader: `attribute float size; attribute vec4 aColor; varying vec4 vC; uniform float uScale;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    });
    this.points = new THREE.Points(geo, mat(THREE.NormalBlending));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    // separate additive system for glows/sparks
    const geo2 = geo.clone();
    this.pos2 = geo2.attributes.position.array; this.col2 = geo2.attributes.aColor.array; this.size2 = geo2.attributes.size.array;
    this.glow = new THREE.Points(geo2, mat(THREE.AdditiveBlending));
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 11;
    scene.add(this.glow);
    this.parts = [];
    this.glows = [];
    this.flares = new Map();
  }

  emit(kind, x, y, z, opts = {}) {
    const n = Math.ceil((opts.n || 10) * this.mult);
    for (let i = 0; i < n; i++) {
      const p = { x, y, z, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 0.1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 1, glow: false, grow: 0 };
      const rnd = (s) => (Math.random() - 0.5) * s;
      switch (kind) {
        case 'dust': Object.assign(p, { vx: rnd(1.5), vy: Math.random() * 1.2, vz: rnd(1.5), max: 0.9 + Math.random() * 0.6, size: 0.25, r: 0.5, g: 0.45, b: 0.38, a: 0.35, grav: -0.3, drag: 2, grow: 0.6 }); break;
        case 'soil': Object.assign(p, { vx: rnd(2), vy: 1.5 + Math.random() * 2, vz: rnd(2), max: 0.7, size: 0.06, r: 0.25, g: 0.18, b: 0.12, a: 1, grav: 9 }); break;
        case 'ichor': Object.assign(p, { vx: rnd(3) + (opts.dx || 0) * 2, vy: Math.random() * 2.5, vz: rnd(3) + (opts.dz || 0) * 2, max: 0.6, size: 0.07, r: 0.12, g: 0.1, b: 0.07, a: 1, grav: 9 }); break;
        case 'water': Object.assign(p, { vx: rnd(0.6) + (opts.dx || 0), vy: Math.random() * 0.5, vz: rnd(0.6) + (opts.dz || 0), max: 0.6, size: 0.04, r: 0.75, g: 0.85, b: 0.95, a: 0.7, grav: 9 }); break;
        case 'seed': Object.assign(p, { vx: rnd(1), vy: 0.5 + Math.random(), vz: rnd(1), max: 0.6, size: 0.03, r: 0.7, g: 0.6, b: 0.35, a: 1, grav: 9 }); break;
        case 'feather': Object.assign(p, { vx: rnd(1.8), vy: 0.8 + Math.random() * 1.6, vz: rnd(1.8), max: 1.6 + Math.random(), size: 0.06, r: 0.92, g: 0.88, b: 0.8, a: 1, grav: 1.2, drag: 2.2 }); break;
        case 'chaff': Object.assign(p, { vx: rnd(1.5), vy: 1 + Math.random() * 1.5, vz: rnd(1.5), max: 1.2, size: 0.05, r: 0.8, g: 0.7, b: 0.4, a: 1, grav: 2, drag: 1.5 }); break;
        case 'spark': Object.assign(p, { vx: rnd(4), vy: Math.random() * 3, vz: rnd(4), max: 0.5, size: 0.05, r: 1, g: 0.75, b: 0.35, a: 1, grav: 9, glow: true }); break;
        case 'smoke': Object.assign(p, { vx: rnd(0.3) + (opts.wind || 0), vy: 0.6 + Math.random() * 0.4, vz: rnd(0.3), max: 2.5, size: 0.3, r: 0.25, g: 0.25, b: 0.26, a: 0.25, grav: 0, drag: 0.5, grow: 0.8 }); break;
        case 'splinter': Object.assign(p, { vx: rnd(3), vy: 1 + Math.random() * 2.5, vz: rnd(3), max: 0.9, size: 0.06, r: 0.45, g: 0.36, b: 0.26, a: 1, grav: 9 }); break;
        case 'hollow': Object.assign(p, { vx: rnd(1.2), vy: Math.random() * 1.5, vz: rnd(1.2), max: 1.4, size: 0.18, r: 0.25, g: 0.35, b: 0.7, a: 0.5, grav: -0.5, glow: true, drag: 1.5 }); break;
        case 'fire': Object.assign(p, { x: x + rnd(0.6), z: z + rnd(0.6), vx: rnd(0.3), vy: 0.8 + Math.random() * 1.2, vz: rnd(0.3), max: 0.6 + Math.random() * 0.4, size: 0.22, r: 1, g: 0.45 + Math.random() * 0.2, b: 0.12, a: 0.85, grav: -0.6, glow: true, grow: -0.25, drag: 1 }); break;
        case 'flare': Object.assign(p, { vx: rnd(0.4), vy: 1 + Math.random(), vz: rnd(0.4), max: 0.9, size: 0.12, r: 1, g: 0.25, b: 0.15, a: 0.8, grav: -1, glow: true, grow: 0.3 }); break;
        case 'impact': Object.assign(p, { vx: rnd(2) + (opts.nx || 0) * 2, vy: Math.random() * 2, vz: rnd(2) + (opts.nz || 0) * 2, max: 0.5, size: 0.05, r: 0.55, g: 0.5, b: 0.42, a: 1, grav: 9 }); break;
      }
      p.life = p.max;
      (p.glow ? this.glows : this.parts).push(p);
    }
    if (this.parts.length > MAX) this.parts.splice(0, this.parts.length - MAX);
    if (this.glows.length > MAX) this.glows.splice(0, this.glows.length - MAX);
  }

  addFlare(id, x, z) { this.flares.set(id, { x, z, y: heightAt(x, z) + 0.1, t: 0 }); }
  removeFlare(id) { this.flares.delete(id); }

  update(dt, windX = 0) {
    for (const f of this.flares.values()) {
      f.t += dt;
      if (Math.random() < dt * 30 * this.mult) this.emit('flare', f.x, f.y + 0.05, f.z, { n: 1 });
      if (Math.random() < dt * 4 * this.mult) this.emit('smoke', f.x, f.y + 0.2, f.z, { n: 1, wind: windX });
    }
    const step = (list, pos, col, size, attr) => {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vy -= p.grav * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const g = heightAt(p.x, p.z);
        if (p.y < g && p.grav > 0) { p.y = g; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; }
      }
      for (const p of list) {
        if (n >= MAX) break;
        const k = p.life / p.max;
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        col[n * 4] = p.r; col[n * 4 + 1] = p.g; col[n * 4 + 2] = p.b; col[n * 4 + 3] = p.a * Math.min(1, k * 2);
        size[n] = p.size * (1 + (1 - k) * p.grow * 3);
        n++;
      }
      attr.geometry.setDrawRange(0, n);
      attr.geometry.attributes.position.needsUpdate = true;
      attr.geometry.attributes.aColor.needsUpdate = true;
      attr.geometry.attributes.size.needsUpdate = true;
    };
    step(this.parts, this.pos, this.col, this.size, this.points);
    step(this.glows, this.pos2, this.col2, this.size2, this.glow);
  }

  setScale(h) { this.points.material.uniforms.uScale.value = h * 0.6; this.glow.material.uniforms.uScale.value = h * 0.6; }
}
