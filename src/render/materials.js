// Shared material library. Materials get wind sway / wetness via
// onBeforeCompile hooks that read a few global uniforms.
import * as THREE from 'three';
import { generateTextures, leafTexture } from './textures.js';

export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.3 },
  uWet: { value: 0 },
};

let M = null;

function std(tex, opts = {}) {
  const params = { roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 0, color: opts.color ?? 0xffffff, ...opts.extra };
  if (tex) Object.assign(params, { map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap });
  const m = new THREE.MeshStandardMaterial(params);
  if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
  if (opts.wet !== false) addWetness(m);
  return m;
}

// Darkens albedo and lowers roughness when it's raining.
export function addWetness(mat, amount = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = U.uWet;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet * ${amount.toFixed(2)} * clamp(vNormal.y * 2.0 + 0.6, 0.0, 1.0));`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= 1.0 - uWet * 0.28 * ${amount.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => (mat.userData.cacheKey || '') + 'wet' + amount;
  return mat;
}

// Vertex sway for vegetation: displacement scales with local height.
export function addWind(mat, { strength = 1, heightScale = 0.15, instanced = true, flutter = 0 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wpos = vec3(0.0);
          ${instanced ? '#ifdef USE_INSTANCING\n wpos = instanceMatrix[3].xyz;\n #endif' : ''}
          wpos += (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
          float h = max(0.0, position.y) * ${heightScale.toFixed(3)};
          float ph = wpos.x * 0.21 + wpos.z * 0.17;
          float w = (0.35 + uWind * 1.2) * ${strength.toFixed(3)};
          float sway = sin(uTime * (1.1 + uWind) + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
          transformed.x += sway * h * h * w;
          transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.4 * h * h * w;
          ${flutter ? `transformed += normal * sin(uTime * 9.0 + position.x * 7.0 + position.z * 5.0 + ph) * ${flutter.toFixed(3)} * w;` : ''}
        }`);
  };
  mat.userData.cacheKey = (mat.userData.cacheKey || '') + `wind${strength}${heightScale}${flutter}`;
  mat.customProgramCacheKey = () => mat.userData.cacheKey;
  return mat;
}

export function getMaterials(quality = 'high') {
  if (M) return M;
  const T = generateTextures(quality);
  const rep = (t, x, y = x) => { for (const k of ['map', 'normalMap', 'roughnessMap']) { t[k] = t[k].clone(); t[k].repeat.set(x, y); t[k].needsUpdate = true; } return t; };
  M = { tex: T };
  M.siding = std(rep({ ...T.siding }, 1, 1), { normalScale: 0.8 });
  M.barn = std(T.barn, { normalScale: 1 });
  M.wood = std(T.wood, { normalScale: 1 });
  M.woodDark = std(T.wood, { color: 0x7a6a58 });
  M.shingles = std(T.shingles, { normalScale: 1.2 });
  M.metal = std(T.metal, { metalness: 0.6, normalScale: 1.3 });
  M.metalRoof = std(T.metal, { metalness: 0.55, normalScale: 1.4 });
  M.bark = std(T.bark, { normalScale: 1.5 });
  M.stone = std(T.stone, { normalScale: 1.2 });
  M.concrete = std(T.concrete, {});
  M.soil = std(T.soil, { normalScale: 1.5 });
  M.wallpaper = std(T.wallpaper, { wet: false });
  M.flannel = std(T.flannel, { wet: false });
  M.trim = std(null, { color: 0xe8e4da, roughness: 0.7 });
  M.trimDark = std(null, { color: 0x2c2a26, roughness: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.5 });
  M.windowLit = new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: 0xffb45a, emissiveIntensity: 0, roughness: 0.3 });
  M.paintGreen = std(null, { color: 0x3d5a32, roughness: 0.55, metalness: 0.3 });
  M.paintYellow = std(null, { color: 0xb8902a, roughness: 0.5, metalness: 0.3 });
  M.steel = std(null, { color: 0x6c7075, roughness: 0.4, metalness: 0.85 });
  M.darkSteel = std(null, { color: 0x2a2c2e, roughness: 0.45, metalness: 0.8 });
  M.rubber = std(null, { color: 0x18181a, roughness: 0.9 });
  M.hay = std(null, { color: 0xb59a52, roughness: 1 });
  M.cloth = std(null, { color: 0x6b6152, roughness: 1 });
  M.white = std(null, { color: 0xdedbd3, roughness: 0.8 });
  M.black = std(null, { color: 0x111111, roughness: 0.7 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xe9e2cc, roughness: 0.9, side: THREE.DoubleSide });
  M.ironRust = std(T.metal, { color: 0x7a5440, metalness: 0.5 });
  M.lampOn = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.2 });
  M.redLed = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  // foliage
  const leafTexA = leafTexture(256, 7, [[0.12, 0.2, 0.06], [0.3, 0.37, 0.11]]);
  const leafTexB = leafTexture(256, 13, [[0.07, 0.14, 0.07], [0.15, 0.24, 0.1]]);
  M.leaves = addWind(new THREE.MeshStandardMaterial({ map: leafTexA, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xffffff }), { strength: 0.6, heightScale: 0.08, flutter: 0.03 });
  M.needles = addWind(new THREE.MeshStandardMaterial({ map: leafTexB, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), { strength: 0.45, heightScale: 0.06, flutter: 0.02 });
  M.foliageFar = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }), { strength: 0.3, heightScale: 0.05 });
  M.barkWind = addWind(M.bark.clone(), { strength: 0.25, heightScale: 0.05 });
  M.plant = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), { strength: 1.2, heightScale: 0.9 });
  M.grass = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { strength: 1.4, heightScale: 1.6 });
  return M;
}
