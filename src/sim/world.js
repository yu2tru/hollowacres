// Physical world for the simulation: colliders, floors, ray casts.
// Colliders are 2D footprints (circle or oriented box) extruded over a y range.
import { heightAt, isInPond } from './terrain.js';
import { BUILDINGS, WORLD, LANDMARKS } from '../data/layout.js';

const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.colliders = [];
    this.grid = new Map();
    this.floors = [];   // { x0,x1,z0,z1, y }  walkable surfaces above terrain
    this._nextId = 1;
    this._stamp = 0;
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  _cellsFor(c) {
    const b = c.bounds;
    const out = [];
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++)
      for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) out.push(this._key(cx, cz));
    return out;
  }

  // shape: { kind:'circle', x,z,r } | { kind:'box', x,z,hw,hd,rot }
  add(shape, opts = {}) {
    const c = {
      id: this._nextId++, ...shape,
      y0: opts.y0 ?? -10, y1: opts.y1 ?? 100,
      tag: opts.tag || 'static', ref: opts.ref ?? null,
      enabled: true, opaque: opts.opaque ?? true, solid: opts.solid ?? true,
      bulletProof: opts.bulletProof ?? true,
    };
    if (c.kind === 'box') {
      c.cos = Math.cos(c.rot || 0); c.sin = Math.sin(c.rot || 0);
      const ex = Math.abs(c.cos) * c.hw + Math.abs(c.sin) * c.hd;
      const ez = Math.abs(c.sin) * c.hw + Math.abs(c.cos) * c.hd;
      c.bounds = { x0: c.x - ex, x1: c.x + ex, z0: c.z - ez, z1: c.z + ez };
    } else {
      c.bounds = { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r };
    }
    c._cells = this._cellsFor(c);
    for (const k of c._cells) {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    this.colliders.push(c);
    return c;
  }

  remove(c) {
    if (!c) return;
    for (const k of c._cells) {
      const arr = this.grid.get(k);
      if (arr) { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); }
    }
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  query(x0, z0, x1, z1) {
    const out = [];
    this._stamp++;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const arr = this.grid.get(this._key(cx, cz));
        if (!arr) continue;
        for (const c of arr) {
          if (c._stamp === this._stamp) continue;
          c._stamp = this._stamp;
          out.push(c);
        }
      }
    return out;
  }

  // Local coordinates of point in a box collider (x along box width axis).
  _toLocal(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    // inverse of rotation.y: local x axis = (cos, -sin), local z axis = (sin, cos)
    return { lx: dx * c.cos - dz * c.sin, lz: dx * c.sin + dz * c.cos };
  }
  _toWorldDir(c, lx, lz) {
    return { x: lx * c.cos + lz * c.sin, z: -lx * c.sin + lz * c.cos };
  }

  // Resolve a circle (x,z,r) occupying [y0,y1]. Returns corrected position.
  resolveCircle(x, z, r, y0, y1, filter) {
    let px = x, pz = z;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cands = this.query(px - r - 1, pz - r - 1, px + r + 1, pz + r + 1);
      for (const c of cands) {
        if (!c.enabled || !c.solid) continue;
        if (c.y1 <= y0 || c.y0 >= y1) continue;
        if (filter && !filter(c)) continue;
        if (c.kind === 'circle') {
          const dx = px - c.x, dz = pz - c.z;
          const d = Math.hypot(dx, dz);
          const min = r + c.r;
          if (d < min) {
            const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
            px = c.x + nx * min; pz = c.z + nz * min; moved = true;
          }
        } else {
          const { lx, lz } = this._toLocal(c, px, pz);
          const cx = Math.max(-c.hw, Math.min(c.hw, lx));
          const cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let dx = lx - cx, dz = lz - cz;
          const d = Math.hypot(dx, dz);
          if (d < r) {
            let nlx, nlz;
            if (d > 1e-5) {
              nlx = cx + (dx / d) * r; nlz = cz + (dz / d) * r;
            } else {
              // centre inside box: push out along the shallowest axis
              const ox = c.hw - Math.abs(lx), oz = c.hd - Math.abs(lz);
              if (ox < oz) { nlx = Math.sign(lx || 1) * (c.hw + r); nlz = lz; }
              else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hd + r); }
            }
            const w = this._toWorldDir(c, nlx, nlz);
            px = c.x + w.x; pz = c.z + w.z; moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  overlapsCircle(x, z, r, y0, y1, filter) {
    const cands = this.query(x - r - 1, z - r - 1, x + r + 1, z + r + 1);
    for (const c of cands) {
      if (!c.enabled || !c.solid) continue;
      if (c.y1 <= y0 || c.y0 >= y1) continue;
      if (filter && !filter(c)) continue;
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < r + c.r) return c;
      } else {
        const { lx, lz } = this._toLocal(c, x, z);
        const cx = Math.max(-c.hw, Math.min(c.hw, lx));
        const cz = Math.max(-c.hd, Math.min(c.hd, lz));
        if (Math.hypot(lx - cx, lz - cz) < r) return c;
      }
    }
    return null;
  }

  // 3D ray vs colliders. Returns { t, collider } or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, filter) {
    let best = null;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const cands = this.query(Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1);
    const hlen = Math.hypot(dx, dz);
    for (const c of cands) {
      if (!c.enabled) continue;
      if (filter && !filter(c)) continue;
      let tIn, tOut;
      if (c.kind === 'circle') {
        if (hlen < 1e-6) {
          if (Math.hypot(ox - c.x, oz - c.z) > c.r) continue;
          tIn = 0; tOut = maxT;
        } else {
          const fx = ox - c.x, fz = oz - c.z;
          const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r;
          const disc = b * b - 4 * a * cc;
          if (disc < 0) continue;
          const s = Math.sqrt(disc);
          tIn = (-b - s) / (2 * a); tOut = (-b + s) / (2 * a);
        }
      } else {
        const o = this._toLocal(c, ox, oz);
        const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos;
        tIn = -Infinity; tOut = Infinity;
        const slab = (oo, dd, h) => {
          if (Math.abs(dd) < 1e-9) return Math.abs(oo) <= h;
          let t1 = (-h - oo) / dd, t2 = (h - oo) / dd;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tIn = Math.max(tIn, t1); tOut = Math.min(tOut, t2);
          return tIn <= tOut;
        };
        if (!slab(o.lx, ldx, c.hw) || !slab(o.lz, ldz, c.hd)) continue;
      }
      // vertical slab
      if (Math.abs(dy) < 1e-9) {
        if (oy < c.y0 || oy > c.y1) continue;
      } else {
        let t1 = (c.y0 - oy) / dy, t2 = (c.y1 - oy) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tIn = Math.max(tIn, t1); tOut = Math.min(tOut, t2);
      }
      if (tIn > tOut || tOut < 0) continue;
      const t = Math.max(0, tIn);
      if (t <= maxT && (!best || t < best.t)) best = { t, collider: c };
    }
    return best;
  }

  addFloor(x0, x1, z0, z1, y) { this.floors.push({ x0, x1, z0, z1, y }); }

  // Ground height beneath a point, considering floors reachable from `fromY`.
  groundAt(x, z, fromY = Infinity, stepUp = 0.6) {
    let g = heightAt(x, z);
    for (const f of this.floors) {
      if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) {
        if (f.y <= fromY + stepUp && f.y > g) g = f.y;
      }
    }
    return g;
  }
}

// Build static colliders for the fixed buildings, boundary and pond.
export function buildStaticWorld(world) {
  const T = 0.25; // wall thickness
  const addWallsWithDoor = (b, base, tag) => {
    const { x, z, w, d } = b;
    const y0 = base, y1 = base + b.wallH + (b.floor || 0);
    const sides = {
      south: { cx: x, cz: z + d / 2, len: w, rot: 0 },
      north: { cx: x, cz: z - d / 2, len: w, rot: 0 },
      east: { cx: x + w / 2, cz: z, len: d, rot: Math.PI / 2 },
      west: { cx: x - w / 2, cz: z, len: d, rot: Math.PI / 2 },
    };
    const doorInfo = {};
    for (const [name, s] of Object.entries(sides)) {
      const door = b.door && b.door.side === name ? b.door : null;
      const along = (s.rot === 0) ? [1, 0] : [0, -1]; // local x axis direction for rot
      if (!door) {
        world.add({ kind: 'box', x: s.cx, z: s.cz, hw: s.len / 2 + T / 2, hd: T / 2, rot: s.rot }, { y0, y1, tag });
        continue;
      }
      // split around door gap; offset measured along the wall's local x
      const half = s.len / 2, dw = door.width / 2, off = door.offset;
      const leftLen = (off - dw) - (-half);
      const rightLen = half - (off + dw);
      const segAt = (from, to) => {
        // only extend into the corners, never into the door gap
        const f = from <= -half + 1e-6 ? from - T / 2 : from, t2 = to >= half - 1e-6 ? to + T / 2 : to;
        const mid = (f + t2) / 2, len = t2 - f;
        world.add({ kind: 'box', x: s.cx + along[0] * mid, z: s.cz + along[1] * mid, hw: len / 2, hd: T / 2, rot: s.rot }, { y0, y1, tag });
      };
      if (leftLen > 0.05) segAt(-half, off - dw);
      if (rightLen > 0.05) segAt(off + dw, half);
      // lintel above the door (blocks rays, not walking)
      world.add({ kind: 'box', x: s.cx + along[0] * off, z: s.cz + along[1] * off, hw: dw, hd: T / 2, rot: s.rot },
        { y0: base + (b.floor || 0) + 2.25, y1, tag });
      doorInfo[name] = { x: s.cx + along[0] * off, z: s.cz + along[1] * off, rot: s.rot, width: door.width };
    }
    // roof volume: blocks bullets & sight, not movement under it
    world.add({ kind: 'box', x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4, rot: 0 },
      { y0: y1, y1: y1 + b.roofH, tag: tag + '_roof' });
    return doorInfo;
  };

  const fh = BUILDINGS.farmhouse;
  const baseH = heightAt(fh.x, fh.z);
  fh.baseY = baseH;
  const houseDoors = addWallsWithDoor(fh, baseH, 'farmhouse');
  world.addFloor(fh.x - fh.w / 2, fh.x + fh.w / 2, fh.z - fh.d / 2, fh.z + fh.d / 2, baseH + fh.floor);
  // porch + steps
  world.addFloor(fh.x - fh.w / 2, fh.x + fh.w / 2, fh.z + fh.d / 2, fh.z + fh.d / 2 + fh.porch.depth, baseH + fh.floor - 0.05);
  // porch posts
  for (const px of [-fh.w / 2 + 0.3, -0.8, fh.w / 2 - 0.3]) {
    world.add({ kind: 'circle', x: fh.x + px, z: fh.z + fh.d / 2 + fh.porch.depth - 0.25, r: 0.12 }, { y0: baseH, y1: baseH + 3.6, tag: 'porch', opaque: false });
  }
  fh.doorPos = houseDoors.south;

  const barn = BUILDINGS.barn;
  const bb = heightAt(barn.x, barn.z);
  barn.baseY = bb;
  const barnDoors = addWallsWithDoor(barn, bb, 'barn');
  barn.doorPos = barnDoors.west;

  const shed = BUILDINGS.shed;
  const sb = heightAt(shed.x, shed.z);
  shed.baseY = sb;
  addWallsWithDoor(shed, sb, 'shed');

  const silo = BUILDINGS.silo;
  silo.baseY = heightAt(silo.x, silo.z);
  world.add({ kind: 'circle', x: silo.x, z: silo.z, r: silo.r }, { y0: silo.baseY - 1, y1: silo.baseY + silo.h, tag: 'silo' });

  // interior furniture colliders (bed, desk, table) - low obstacles
  const furn = [
    { x: -26.2, z: -12.8, hw: 1.0, hd: 1.15, h: 0.7 },  // bed
    { x: -16.8, z: -13.5, hw: 1.2, hd: 0.45, h: 0.8 },  // desk
    { x: -22.5, z: -9.0, hw: 0.8, hd: 0.55, h: 0.8 },   // table
    { x: -27.4, z: -7.4, hw: 0.3, hd: 0.6, h: 0.9 },    // drawer
    { x: 22, z: -20.5, hw: 2.2, hd: 0.6, h: 1.0 },      // crates in barn
    { x: 27.5, z: -19.5, hw: 1.3, hd: 0.5, h: 0.95 },   // workbench
    { x: 26.5, z: -6.5, hw: 2.4, hd: 0.7, h: 1.2 },     // storage bins
  ];
  for (const f of furn) {
    const g = heightAt(f.x, f.z) + (f.x < -15 ? fh.floor : 0);
    world.add({ kind: 'box', x: f.x, z: f.z, hw: f.hw, hd: f.hd, rot: 0 }, { y0: g - 0.5, y1: g + f.h, tag: 'furniture', opaque: false });
  }
  addLandmarkColliders(world);
  return { houseDoor: houseDoors.south, barnDoor: barnDoors.west };
}

// Landmark ruins in the woods. Geometry here must match render/landmarks.js.
export const LANDMARK_SHAPES = {
  cabin: { dx: 0, dz: -3.6, w: 6, d: 5, h: 2.6, doorW: 1.4 },
  chapel: { dx: 0, dz: -2.5, w: 8, d: 11, h: 3.6, frontGap: 3.2 },
  oldwell: { dx: 2.2, dz: 0, r: 1.25 },
  stone: { dx: 0, dz: -2.4, r: 1.15, h: 3.4 },
};

function addLandmarkColliders(world) {
  const L = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
  const T = 0.3;
  const cab = LANDMARK_SHAPES.cabin, lc = L.cabin;
  {
    const cx = lc.x + cab.dx, cz = lc.z + cab.dz, g = heightAt(cx, cz);
    const opts = { y0: g - 1, y1: g + cab.h, tag: 'ruin' };
    world.add({ kind: 'box', x: cx, z: cz - cab.d / 2, hw: cab.w / 2, hd: T, rot: 0 }, opts);
    world.add({ kind: 'box', x: cx - cab.w / 2, z: cz, hw: T, hd: cab.d / 2, rot: 0 }, opts);
    world.add({ kind: 'box', x: cx + cab.w / 2, z: cz, hw: T, hd: cab.d / 2, rot: 0 }, opts);
    const side = (cab.w - cab.doorW) / 2;
    world.add({ kind: 'box', x: cx - cab.w / 2 + side / 2, z: cz + cab.d / 2, hw: side / 2, hd: T, rot: 0 }, opts);
    world.add({ kind: 'box', x: cx + cab.w / 2 - side / 2, z: cz + cab.d / 2, hw: side / 2, hd: T, rot: 0 }, opts);
  }
  const ch = LANDMARK_SHAPES.chapel, lch = L.chapel;
  {
    const cx = lch.x + ch.dx, cz = lch.z + ch.dz, g = heightAt(cx, cz);
    const opts = { y0: g - 1, y1: g + ch.h, tag: 'ruin' };
    world.add({ kind: 'box', x: cx, z: cz - ch.d / 2, hw: ch.w / 2, hd: T * 1.5, rot: 0 }, opts);
    world.add({ kind: 'box', x: cx - ch.w / 2, z: cz - 1.5, hw: T * 1.5, hd: ch.d / 2 - 1.5, rot: 0 }, opts);
    world.add({ kind: 'box', x: cx + ch.w / 2, z: cz + 1, hw: T * 1.5, hd: ch.d / 2 - 1, rot: 0 }, opts);
    const side = (ch.w - ch.frontGap) / 2;
    world.add({ kind: 'box', x: cx - ch.w / 2 + side / 2, z: cz + ch.d / 2, hw: side / 2, hd: T * 1.5, rot: 0 }, opts);
  }
  const ow = LANDMARK_SHAPES.oldwell, lw = L.oldwell;
  world.add({ kind: 'circle', x: lw.x + ow.dx, z: lw.z + ow.dz, r: ow.r }, { y0: -50, y1: heightAt(lw.x, lw.z) + 1, tag: 'ruin', opaque: false });
  const stn = LANDMARK_SHAPES.stone, ls = L.stone;
  world.add({ kind: 'circle', x: ls.x + stn.dx, z: ls.z + stn.dz, r: stn.r }, { y0: -50, y1: heightAt(ls.x, ls.z) + stn.h, tag: 'ruin' });
  for (const id of ['stake_n', 'stake_e', 'stake_s', 'stake_w']) {
    const l = L[id];
    world.add({ kind: 'circle', x: l.x, z: l.z - 0.9, r: 0.35 }, { y0: -50, y1: heightAt(l.x, l.z - 0.9) + 0.85, tag: 'ruin', opaque: false });
  }
}

export function isOutsideBounds(x, z) {
  return Math.hypot(x, z) > WORLD.playRadius || isInPond(x, z, -0.5);
}
