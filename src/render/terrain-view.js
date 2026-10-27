// Terrain mesh with a splat-mapped ground material (grass / dirt / gravel /
// mud / forest litter) driven by a painted mask texture.
import * as THREE from 'three';
import { heightAt, distToDriveway } from '../sim/terrain.js';
import { forestDensity } from '../sim/vegetation.js';
import { FIELDS, PLOT_PITCH, ROAD, BUILDINGS, POND, LANDMARKS, FIXTURES, PEN, FIREPIT, COMPOUND } from '../data/layout.js';
import { U } from './materials.js';
import { fbmTile } from './textures.js';

export const MASK_HALF = 340;

function paintMask(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const s = size / (MASK_HALF * 2);
  const X = (x) => (x + MASK_HALF) * s, Z = (z) => (z + MASK_HALF) * s;
  ctx.fillStyle = 'rgb(0,0,0)';
  ctx.fillRect(0, 0, size, size);
  ctx.filter = `blur(${Math.max(1, size / 1024)}px)`;
  ctx.globalCompositeOperation = 'lighter';
  // R: dirt - fields, paths, yard
  ctx.fillStyle = 'rgb(255,0,0)';
  for (const f of FIELDS) {
    ctx.fillRect(X(f.x0 - 1.2), Z(f.z0 - 1.2), (f.cols * PLOT_PITCH + 2.4) * s, (f.rows * PLOT_PITCH + 2.4) * s);
  }
  ctx.strokeStyle = 'rgba(200,0,0,1)';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6 * s;
  for (const p of ROAD.paths) {
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke();
  }
  // packed dirt around buildings, courtyard and work yards
  const blob = (x, z, r, a = 0.7) => {
    const g = ctx.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * s);
    g.addColorStop(0, `rgba(255,0,0,${a})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(x), Z(z), r * s, 0, Math.PI * 2); ctx.fill();
  };
  const rect = (x0, z0, x1, z1, col) => { ctx.fillStyle = col; ctx.fillRect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s); };
  const H = BUILDINGS.farmhouse, Bn = BUILDINGS.barn;
  blob(FIREPIT.x, FIREPIT.z, 12, 0.8);
  blob(H.x - 1, H.z + 8, 7, 0.6);
  blob(Bn.x - Bn.w / 2 - 5, Bn.z, 8, 0.8);
  rect(36, 4.5, 54, 13, 'rgba(255,0,0,0.65)');
  rect(PEN.x0, PEN.z0, PEN.x1, PEN.z1, 'rgba(255,0,0,0.35)');
  blob(PEN.coop.x, PEN.coop.z + 2, 5, 0.6);
  rect(3, 21, 59, 56, 'rgba(255,0,0,0.42)');
  for (const l of LANDMARKS) blob(l.x, l.z, l.r * 0.8, 0.45);
  // G: gravel - county road and driveway (with tire track dirt)
  ctx.strokeStyle = 'rgb(0,255,0)';
  ctx.lineWidth = ROAD.county.width * s;
  ctx.beginPath(); ctx.moveTo(0, Z(ROAD.county.z)); ctx.lineTo(size, Z(ROAD.county.z)); ctx.stroke();
  ctx.lineWidth = ROAD.drivewayWidth * s;
  ctx.beginPath(); ROAD.driveway.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke();
  // stone path from the porch, gravel generator yard
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath(); ROAD.paths[0].forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke();
  ctx.fillStyle = 'rgba(0,255,0,0.85)'; ctx.fillRect(X(31.5), Z(-56.5), 28 * s, 31 * s);
  // B: mud - around pump, pond edge, low spots
  const mud = (x, z, r, a) => {
    const g = ctx.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * s);
    g.addColorStop(0, `rgba(0,0,255,${a})`); g.addColorStop(1, 'rgba(0,0,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(x), Z(z), r * s, 0, Math.PI * 2); ctx.fill();
  };
  mud(FIXTURES.well.x, FIXTURES.well.z, 2.6, 0.9);
  mud(POND.x, POND.z, POND.r + 4, 1);
  mud(BUILDINGS.barn.x - BUILDINGS.barn.w / 2 - 3, BUILDINGS.barn.z, 4, 0.6);
  mud(COMPOUND.gate.x, COMPOUND.z1 - 2, 3.5, 0.6); mud(PEN.coop.x + 2, PEN.coop.z + 3, 3, 0.5);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  // tire tracks on the driveway (dirt ruts)
  ctx.strokeStyle = 'rgba(255,0,0,0.6)';
  ctx.lineWidth = 0.45 * s;
  for (const off of [-0.85, 0.85]) {
    ctx.beginPath();
    ROAD.driveway.forEach((q, i) => (i ? ctx.lineTo(X(q.x + off), Z(q.z)) : ctx.moveTo(X(q.x + off), Z(q.z))));
    ctx.stroke();
  }
  // A channel: forest litter, computed coarse then upscaled
  const img = ctx.getImageData(0, 0, size, size);
  const fs = 192;
  const forest = new Float32Array(fs * fs);
  for (let y = 0; y < fs; y++) for (let x = 0; x < fs; x++) {
    const wx = (x / fs) * MASK_HALF * 2 - MASK_HALF, wz = (y / fs) * MASK_HALF * 2 - MASK_HALF;
    forest[y * fs + x] = forestDensity(wx, wz);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * fs - 0.5, fy = (y / size) * fs - 0.5;
    const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy));
    const x1 = Math.min(fs - 1, x0 + 1), y1 = Math.min(fs - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const v = (forest[y0 * fs + x0] * (1 - tx) + forest[y0 * fs + x1] * tx) * (1 - ty) + (forest[y1 * fs + x0] * (1 - tx) + forest[y1 * fs + x1] * tx) * ty;
    const i = (y * size + x) * 4;
    img.data[i + 3] = 255 - Math.min(255, v * 255); // stored inverted (alpha 0 is premultiplied badly)
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = false;
  tex.flipY = false; // canvas row 0 is world -z; shader samples with v = (z + half) / size
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function macroNoiseTex() {
  const S = 256;
  const n = fbmTile(S, 4, 5, 300), m = fbmTile(S, 16, 3, 301);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { img.data[i * 4] = n[i] * 255; img.data[i * 4 + 1] = m[i] * 255; img.data[i * 4 + 2] = 128; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createTerrain(mats, quality) {
  const segs = quality === 'low' ? 220 : quality === 'medium' ? 300 : 380;
  const size = MASK_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  // world-scaled UVs for detail texture tiling
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3.5, pos.getZ(i) / 3.5);
  geo.computeVertexNormals();

  const T = mats.tex;
  const mask = paintMask(quality === 'low' ? 1024 : 2048);
  const macro = macroNoiseTex();
  const mat = new THREE.MeshStandardMaterial({
    map: T.grass.map, normalMap: T.grass.normalMap, roughness: 1, metalness: 0,
  });
  mat.normalScale.set(0.9, 0.9);
  const uniforms = {
    tDirt: { value: T.dirt.map }, tGravel: { value: T.gravel.map }, tMask: { value: mask }, tMacro: { value: macro },
    tDirtN: { value: T.dirt.normalMap }, tGravelN: { value: T.gravel.normalMap },
    uMaskHalf: { value: MASK_HALF }, uWet: U.uWet,
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D tDirt, tGravel, tMask, tMacro, tDirtN, tGravelN;
        uniform float uMaskHalf, uWet;
        vec4 gMask; float gSlope; vec2 gMacro;`)
      .replace('#include <map_fragment>', `
        vec2 muv = (vWPos.xz + uMaskHalf) / (uMaskHalf * 2.0);
        gMask = texture2D(tMask, muv);
        float forestF = 1.0 - gMask.a;
        gMacro = texture2D(tMacro, vWPos.xz / 160.0).rg;
        vec2 duv = vMapUv;
        vec3 grass = texture2D(map, duv).rgb;
        vec3 grassFar = texture2D(map, duv * 0.21).rgb;
        grass = mix(grass, grassFar, 0.35);
        // macro tint: patches of dry & lush grass
        grass *= mix(vec3(0.82, 0.88, 0.8), vec3(1.12, 1.04, 0.86), gMacro.x);
        vec3 litter = mix(grass * vec3(0.7, 0.62, 0.5), vec3(0.2, 0.15, 0.1), 0.55 + gMacro.y * 0.3);
        vec3 dirt = texture2D(tDirt, duv * 0.8).rgb;
        vec3 gravel = texture2D(tGravel, duv * 1.3).rgb;
        vec3 mud = dirt * vec3(0.55, 0.5, 0.46);
        gSlope = 1.0 - vNormal.y;
        vec3 col = mix(grass, litter, clamp(forestF * 1.2, 0.0, 1.0));
        float dirtW = smoothstep(0.15, 0.7, gMask.r + (gMacro.y - 0.5) * 0.35);
        col = mix(col, dirt, dirtW);
        col = mix(col, gravel, smoothstep(0.2, 0.6, gMask.g));
        col = mix(col, mud, smoothstep(0.15, 0.7, gMask.b));
        diffuseColor.rgb *= col;
        diffuseColor.rgb *= 1.0 - uWet * 0.3;`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        roughnessFactor = mix(0.95, 0.85, smoothstep(0.2, 0.6, gMask.g));
        roughnessFactor = mix(roughnessFactor, 0.5, smoothstep(0.2, 0.7, gMask.b));
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 dN = texture2D(tDirtN, vNormalMapUv * 0.8).xyz * 2.0 - 1.0;
        vec3 gN = texture2D(tGravelN, vNormalMapUv * 1.3).xyz * 2.0 - 1.0;
        mapN = mix(mapN, dN, smoothstep(0.15, 0.7, gMask.r));
        mapN = mix(mapN, gN, smoothstep(0.2, 0.6, gMask.g));
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  // Outer hills beyond the detailed terrain
  const ring = new THREE.RingGeometry(MASK_HALF * 0.98, 1600, 96, 12);
  ring.rotateX(-Math.PI / 2);
  const rp = ring.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i);
    const r = Math.hypot(x, z);
    const h = heightAt(x * Math.min(1, MASK_HALF / r * 0.999), z * Math.min(1, MASK_HALF / r * 0.999));
    const t = Math.min(1, (r - MASK_HALF) / 600);
    const ridge = (Math.sin(Math.atan2(x, z) * 5) * 0.5 + Math.sin(Math.atan2(x, z) * 13 + 1) * 0.3 + 0.8) * 60;
    rp.setY(i, h * (1 - t) + ridge * t + t * 30);
  }
  ring.computeVertexNormals();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x24301c, roughness: 1 });
  const ringMesh = new THREE.Mesh(ring, ringMat);
  ringMesh.name = 'hills';
  return { mesh, ringMesh, mask };
}

export function createPond(mats) {
  const geo = new THREE.CircleGeometry(POND.r + 2.5, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b2a26, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.6 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWP;')
      .replace('#include <normal_fragment_maps>', `
        float rx = sin(vWP.x * 1.7 + uTime * 1.3) * 0.5 + sin(vWP.x * 3.1 - vWP.z * 2.3 + uTime * 2.1) * 0.3;
        float rz = cos(vWP.z * 1.9 - uTime * 1.1) * 0.5 + cos(vWP.z * 2.7 + vWP.x * 1.9 + uTime * 1.7) * 0.3;
        normal = normalize(normal + vec3(rx, 0.0, rz) * 0.04);`);
  };
  const m = new THREE.Mesh(geo, mat);
  m.position.set(POND.x, POND.waterY, POND.z);
  m.name = 'pond';
  return m;
}
