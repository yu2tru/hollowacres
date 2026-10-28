// Optimises the source 3D models for the game: simplifies dense meshes,
// resizes and re-encodes textures (WebP), strips unused data and compresses
// geometry (meshopt). Output goes to src/assets/models/.
//
// The sources are the .glb files from the repo's "models" release. Run with
// the glTF tools installed somewhere (they are not game dependencies):
//   npm i --prefix /tmp/gt @gltf-transform/core @gltf-transform/extensions \
//         @gltf-transform/functions meshoptimizer sharp
//   NODE_PATH=/tmp/gt/node_modules node tools/optimize-models.mjs <sourceDir>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(path.join(process.env.NODE_PATH || '.', 'x.js'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, flatten, weld, simplify, textureCompress, meshopt, join, resample } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
const sharp = require('sharp');

const SRC = process.argv[2];
const OUT = path.resolve('src/assets/models');
fs.mkdirSync(OUT, { recursive: true });

// name: [source file, target triangle count, max texture size]
const JOBS = {
  generator: ['generator_lp.glb', 20000, 1024],
  truck: ['truck/source/Camion.glb', 30000, 1024],
  bed: ['victorian_bed.glb', 22000, 1024],
  pump: ['pump/source/Waterpump.glb', 18000, 512],
  rockingchair: ['western_rocking_chair.glb', 6000, 1024],
  wheelbarrow: ['wheel_barrow.glb', 9000, 512],
};

await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const [name, [file, target, tex]] of Object.entries(JOBS)) {
  const doc = await io.read(path.join(SRC, file));
  const root = doc.getRoot();
  // materials: solid surfaces must not be alpha-blended (sorting glitches); only glass stays transparent
  for (const m of root.listMaterials()) {
    const glass = /glass|window|vitre/i.test(m.getName());
    if (m.getAlphaMode() === 'BLEND' && !glass) m.setAlphaMode('OPAQUE');
    if (glass) { m.setAlphaMode('BLEND'); m.setDoubleSided(true); }
  }
  // drop data three.js doesn't need here: tangents (derived in the shader) and unused UV sets
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    prim.setAttribute('TANGENT', null);
    const mat = prim.getMaterial();
    const used = new Set([0]);
    if (mat) for (const info of [mat.getBaseColorTextureInfo(), mat.getNormalTextureInfo(), mat.getOcclusionTextureInfo(), mat.getMetallicRoughnessTextureInfo(), mat.getEmissiveTextureInfo()]) if (info) used.add(info.getTexCoord());
    for (const k of [1, 2, 3]) if (!used.has(k)) prim.setAttribute(`TEXCOORD_${k}`, null);
  }
  const before = tris(doc);
  await doc.transform(dedup(), flatten(), join(), weld({ tolerance: 0.0001 }), prune());
  const ratio = Math.min(1, target / before);
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }), weld(), prune());
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82, slots: /^(?!normal)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 90, slots: /normal/ }),
    dedup(), prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  console.log(`${name.padEnd(13)} tris ${Math.round(before)} -> ${Math.round(tris(doc))}  ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}
