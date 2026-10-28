// Authored 3D models (glTF, meshopt-compressed; see tools/optimize-models.mjs).
// Each is scaled to its real-world size and re-pivoted to the centre of its
// base, so the game places it like any built-in model. If a model fails to
// load, the caller falls back to the built-in procedural model.
//
// The colliders in data/layout.js and data/buildables.js are sized from the
// dimensions noted here; change them together.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { addWetness } from './materials.js';
import generatorUrl from '../assets/models/generator.glb?url';
import truckUrl from '../assets/models/truck.glb?url';
import bedUrl from '../assets/models/bed.glb?url';
import pumpUrl from '../assets/models/pump.glb?url';
import chairUrl from '../assets/models/rockingchair.glb?url';
import wheelbarrowUrl from '../assets/models/wheelbarrow.glb?url';

// axis/size: the model is scaled uniformly so its extent along `axis` is `size` m.
// pivot 'origin': keep the model's own x/z origin (e.g. the pump column);
// otherwise the bounding-box centre. Facing: every model's front is +z.
export const MODEL_SPECS = {
  generator: { url: generatorUrl, axis: 'x', size: 1.5, outdoor: true },    // 1.50 x 0.97 x 1.02 m, panel on +z
  truck: { url: truckUrl, axis: 'z', size: 5.6, outdoor: true },            // 2.27 x 2.48 x 5.60 m, cab at +z
  bed: { url: bedUrl, axis: 'z', size: 2.15 },                              // 1.52 x 1.24 x 2.15 m, headboard at -z
  pump: { url: pumpUrl, axis: 'y', size: 1.75, pivot: 'origin', outdoor: true }, // 1.75 m tall, spout & bucket +z, handle -z
  rockingchair: { url: chairUrl, axis: 'y', size: 1.12, pivot: 'origin', outdoor: true }, // 0.54 x 1.12 x 0.58 m
  wheelbarrow: { url: wheelbarrowUrl, axis: 'z', size: 1.45, outdoor: true }, // 0.79 x 0.66 x 1.45 m, wheel at +z
};

const loaded = {};

export async function loadModels(renderer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  await Promise.all(Object.entries(MODEL_SPECS).map(async ([name, spec]) => {
    try {
      const gltf = await loader.loadAsync(spec.url);
      loaded[name] = normalise(gltf.scene, spec, aniso);
    } catch (e) {
      console.warn(`Model "${name}" could not be loaded; using the built-in one.`, e);
    }
  }));
  return Object.keys(loaded);
}

function normalise(scene, spec, aniso) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const s = spec.size / size[spec.axis];
  const centre = box.getCenter(new THREE.Vector3());
  const px = spec.pivot === 'origin' ? 0 : centre.x, pz = spec.pivot === 'origin' ? 0 : centre.z;
  const inner = new THREE.Group();
  inner.add(scene);
  inner.scale.setScalar(s);
  inner.position.set(-px * s, -box.min.y * s, -pz * s);
  const root = new THREE.Group();
  root.add(inner);
  root.userData.size = size.clone().multiplyScalar(s);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = aniso;
      if (m.transparent) { m.depthWrite = false; } else { m.transparent = false; m.alphaTest = m.alphaTest || 0; }
      if (spec.outdoor && !m.transparent && !m.userData.wet) { addWetness(m); m.userData.wet = true; }
    }
  });
  return root;
}

// A fresh instance (geometry and materials are shared between instances).
export function model(name) {
  const m = loaded[name];
  return m ? m.clone(true) : null;
}

export function hasModel(name) { return !!loaded[name]; }
