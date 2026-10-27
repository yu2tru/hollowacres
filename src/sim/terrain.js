import { fbm } from '../core/noise.js';
import { smoothstep, clamp } from '../core/math.js';
import { POND, ROAD, LANDMARKS } from '../data/layout.js';

// Pure terrain height function shared by simulation and renderer.
// The farm sits in a gently undulating basin; hills rise beyond the forest.
const SEED = 7;

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function distToDriveway(x, z) {
  let d = Infinity;
  const pts = ROAD.driveway;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distToSegment(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z));
  }
  return d;
}

export function distToPaths(x, z) {
  let d = Infinity;
  for (const p of ROAD.paths) {
    for (let i = 0; i < p.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z));
    }
  }
  return d;
}

export function heightAt(x, z) {
  // radial weight: 0 in the farm basin, 1 in the hills
  const ex = x / 1.15, ez = z;
  const r = Math.hypot(ex, ez);
  const hills = smoothstep(100, 175, r);
  const far = smoothstep(170, 320, r);

  let h = (fbm(x * 0.012, z * 0.012, 3, SEED) - 0.5) * 1.2; // gentle undulation
  h += hills * ((fbm(x * 0.009, z * 0.009, 4, SEED + 3) - 0.35) * 22);
  h += far * (fbm(x * 0.004, z * 0.004, 4, SEED + 9) * 55 + 10);

  // County road sits on a slight embankment, flattened
  const roadD = Math.abs(z - ROAD.county.z);
  const roadW = 1 - smoothstep(ROAD.county.width * 0.5, ROAD.county.width * 0.5 + 6, roadD);
  h = h * (1 - roadW) + (0.15 + h * 0.2) * roadW;

  // Pond basin
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 8) {
    const t = 1 - smoothstep(POND.r * 0.3, POND.r + 6, pd);
    h -= t * 2.0;
  }

  // Flatten landmark clearings a little so props sit nicely
  for (const l of LANDMARKS) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.r + 8) {
      const t = 1 - smoothstep(l.r * 0.6, l.r + 8, d);
      const base = (fbm(l.x * 0.012, l.z * 0.012, 3, SEED) - 0.5) * 1.2 +
        smoothstep(100, 175, Math.hypot(l.x / 1.15, l.z)) * ((fbm(l.x * 0.009, l.z * 0.009, 4, SEED + 3) - 0.35) * 22);
      h = h * (1 - t * 0.85) + base * t * 0.85;
    }
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 0.75;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

export function isInPond(x, z, margin = 0) {
  return Math.hypot(x - POND.x, z - POND.z) < POND.r - 1.5 + margin;
}
