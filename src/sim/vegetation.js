// Deterministic placement of trees, bushes and rocks. Shared by the
// simulation (collision/nav) and the renderer (instancing), so what the
// player sees is exactly what blocks them.
import { hash2 } from '../core/rng.js';
import { fbm } from '../core/noise.js';
import { smoothstep } from '../core/math.js';
import { PARCELS, LANDMARKS, POND, ROAD, WORLD, BUILDINGS } from '../data/layout.js';
import { distToDriveway } from './terrain.js';

function inAnyParcel(x, z, pad = 0) {
  for (const p of PARCELS) {
    const r = p.rect;
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
  }
  return false;
}

export function forestDensity(x, z) {
  const r = Math.hypot(x / 1.12, z);
  let d = smoothstep(84, 108, r);
  // clumpy edge
  d *= 0.55 + 0.75 * fbm(x * 0.03, z * 0.03, 3, 41);
  if (r > 108) d = Math.max(d, 0.55 + 0.3 * fbm(x * 0.02, z * 0.02, 2, 5));
  return Math.min(1, d);
}

function excluded(x, z) {
  if (inAnyParcel(x, z, 6)) return true;
  if (Math.abs(z - ROAD.county.z) < ROAD.county.width / 2 + 3) return true;
  if (distToDriveway(x, z) < 6) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return true;
  for (const l of LANDMARKS) if (Math.hypot(x - l.x, z - l.z) < l.r + 2) return true;
  return false;
}

let cache = null;
export function getVegetation() {
  if (cache) return cache;
  const trees = [];
  const rocks = [];
  const bushes = [];
  const S = 4.6;
  const R = WORLD.visualRadius;
  for (let gx = -R; gx <= R; gx += S) {
    for (let gz = -R; gz <= R; gz += S) {
      const ix = Math.round(gx / S), iz = Math.round(gz / S);
      const x = gx + (hash2(ix, iz, 1) - 0.5) * S * 0.9;
      const z = gz + (hash2(ix, iz, 2) - 0.5) * S * 0.9;
      const rr = Math.hypot(x, z);
      if (rr > R) continue;
      if (excluded(x, z)) continue;
      const dens = forestDensity(x, z);
      const far = rr > 175;
      if (far && hash2(ix, iz, 9) < 0.35) continue; // thin the far ring for perf
      const h = hash2(ix, iz, 3);
      if (h < dens * 0.82) {
        const kindR = hash2(ix, iz, 4);
        const conifer = kindR < 0.45 + 0.25 * fbm(x * 0.01, z * 0.01, 2, 77);
        const dead = kindR > 0.965;
        const scale = 0.75 + hash2(ix, iz, 5) * 0.65;
        trees.push({
          x, z, scale, rot: hash2(ix, iz, 6) * Math.PI * 2,
          kind: dead ? 'dead' : conifer ? 'pine' : 'oak',
          r: (dead ? 0.22 : conifer ? 0.3 : 0.38) * scale,
          collide: rr < WORLD.playRadius + 6,
        });
      } else if (h < dens * 0.82 + 0.07 && rr < 200) {
        bushes.push({ x, z, scale: 0.6 + hash2(ix, iz, 7) * 0.9, rot: hash2(ix, iz, 8) * 6.28 });
      }
      if (hash2(ix, iz, 11) < 0.025 + dens * 0.03 && rr < 200) {
        rocks.push({ x: x + 1.3, z: z - 1.1, scale: 0.4 + hash2(ix, iz, 12) * 1.4, rot: hash2(ix, iz, 13) * 6.28 });
      }
    }
  }
  // Composed shade trees and a windbreak near the house
  const feature = [
    { x: -52, z: -48, kind: 'oak', scale: 1.5 }, { x: -24, z: -52, kind: 'oak', scale: 1.2 },
    { x: -52, z: -27, kind: 'oak', scale: 1.3 }, { x: -22, z: -18, kind: 'oak', scale: 1.1 },
    { x: 14, z: 7, kind: 'oak', scale: 1.25 }, { x: 56, z: 15, kind: 'pine', scale: 1.2 },
    { x: -55, z: 17, kind: 'pine', scale: 1.1 }, { x: 28, z: -20, kind: 'dead', scale: 1.0 },
    { x: -12, z: 50, kind: 'oak', scale: 1.2 },
  ];
  for (const f of feature) trees.push({ ...f, rot: f.x * 1.3, r: (f.kind === 'pine' ? 0.32 : 0.45) * f.scale, collide: true });
  // Scattered bushes along fences and buildings
  const B = BUILDINGS;
  bushes.push({ x: B.farmhouse.x + 6.6, z: B.farmhouse.z - 2, scale: 1.1, rot: 1 });
  bushes.push({ x: B.farmhouse.x - 6.8, z: B.farmhouse.z + 3, scale: 0.9, rot: 2 });
  for (const [x, z] of [[-7, 9], [6, 11], [-30, -33], [-51, -38], [38, 14], [-14, 18], [-57, 0], [57, -10], [-26, -48]]) bushes.push({ x, z, scale: 0.9 + ((x * 7 + z * 3) & 3) * 0.15, rot: x });
  cache = { trees, rocks, bushes };
  return cache;
}
