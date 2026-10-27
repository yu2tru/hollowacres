// Navigation grid (1 m cells) with A* pathfinding. Structures that can be
// broken (barricades, doors, fences) are passable at a high cost for
// creatures that can break them, impassable for others.
import { WORLD } from '../data/layout.js';

const N = WORLD.navHalf * 2;
const SQRT2 = Math.SQRT2;

class Heap {
  constructor(cap) { this.idx = new Int32Array(cap); this.pri = new Float32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(i, p) {
    let k = this.n++;
    if (k >= this.idx.length) {
      const ni = new Int32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni;
      const np = new Float32Array(this.pri.length * 2); np.set(this.pri); this.pri = np;
    }
    while (k > 0) {
      const p2 = (k - 1) >> 1;
      if (this.pri[p2] <= p) break;
      this.idx[k] = this.idx[p2]; this.pri[k] = this.pri[p2]; k = p2;
    }
    this.idx[k] = i; this.pri[k] = p;
  }
  pop() {
    const top = this.idx[0];
    const li = this.idx[--this.n], lp = this.pri[this.n];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.pri[c + 1] < this.pri[c]) c++;
      if (this.pri[c] >= lp) break;
      this.idx[k] = this.idx[c]; this.pri[k] = this.pri[c]; k = c;
    }
    this.idx[k] = li; this.pri[k] = lp;
    return top;
  }
}

export class NavGrid {
  constructor() {
    this.N = N;
    this.half = WORLD.navHalf;
    this.blocked = new Uint8Array(N * N);     // static obstacles
    this.opaque = new Uint8Array(N * N);      // blocks line of sight
    this.dense = new Uint8Array(N * N);       // vegetation density (sight attenuation)
    this.tall = new Uint8Array(N * N);        // tall crops (dynamic, heavy sight attenuation)
    this.struct = new Int32Array(N * N);      // structure index + 1 occupying the cell
    this.g = new Float32Array(N * N);
    this.came = new Int32Array(N * N);
    this.visit = new Uint32Array(N * N);
    this.stamp = 1;
    this.heap = new Heap(4096);
    this.structs = [];                        // index -> structure object (live refs)
  }

  idx(x, z) {
    const cx = Math.floor(x + this.half), cz = Math.floor(z + this.half);
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return -1;
    return cz * N + cx;
  }
  cellCenter(i) {
    return { x: (i % N) - this.half + 0.5, z: Math.floor(i / N) - this.half + 0.5 };
  }

  // Rasterise a collider footprint into the grid via a callback per cell.
  rasterize(c, fn, inflate = 0.25) {
    const b = c.bounds;
    // thin shapes must still cover at least one cell centre across their width
    const ix = c.kind === 'box' ? Math.max(inflate, 0.56 - c.hw) : inflate;
    const iz = c.kind === 'box' ? Math.max(inflate, 0.56 - c.hd) : inflate;
    const pad = Math.max(ix, iz) + 1;
    for (let z = Math.floor(b.z0 - pad); z <= Math.ceil(b.z1 + pad); z++) {
      for (let x = Math.floor(b.x0 - pad); x <= Math.ceil(b.x1 + pad); x++) {
        const px = x + 0.5, pz = z + 0.5;
        let inside;
        if (c.kind === 'circle') inside = Math.hypot(px - c.x, pz - c.z) < c.r + inflate + 0.2;
        else {
          const dx = px - c.x, dz = pz - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          inside = Math.abs(lx) < c.hw + ix && Math.abs(lz) < c.hd + iz;
        }
        if (inside) { const i = this.idx(px, pz); if (i >= 0) fn(i); }
      }
    }
  }

  registerStructure(s) {
    let k = this.structs.indexOf(s);
    if (k < 0) { k = this.structs.length; this.structs.push(s); }
    return k + 1;
  }
  clearStructureCells(s) {
    const k = this.structs.indexOf(s) + 1;
    if (k <= 0 || !s._cells) return;
    for (const i of s._cells) if (this.struct[i] === k) this.struct[i] = 0;
    s._cells = null;
  }
  markStructure(s, collider) {
    this.clearStructureCells(s);
    const k = this.registerStructure(s);
    const cells = [];
    this.rasterize(collider, (i) => { if (!this.blocked[i]) { this.struct[i] = k; cells.push(i); } }, 0.15);
    s._cells = cells;
  }

  structureAt(i) {
    const k = this.struct[i];
    return k ? this.structs[k - 1] : null;
  }

  // cost of entering cell i for an agent; Infinity = impassable
  cellCost(i, agent) {
    if (this.blocked[i]) return Infinity;
    const s = this.structureAt(i);
    if (s && s.blocksNav && s.hp > 0 && !s.open) {
      if (agent.incorporeal) return 1;
      if (!agent.breaks || !s.breakable || (agent.breakOnly && !agent.breakOnly.includes(s.type))) return Infinity;
      return 3 + s.hp / 30;
    }
    return 1 + (this.dense[i] ? 0.4 : 0) + (agent.extraCost ? agent.extraCost(i) : 0);
  }

  walkable(x, z, agent) {
    const i = this.idx(x, z);
    return i >= 0 && this.cellCost(i, agent || {}) < Infinity;
  }

  nearestWalkable(x, z, agent = {}, maxR = 6) {
    const i0 = this.idx(x, z);
    if (i0 >= 0 && this.cellCost(i0, agent) < Infinity) return this.cellCenter(i0);
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const i = this.idx(x + dx, z + dz);
        if (i >= 0 && this.cellCost(i, agent) < Infinity) return this.cellCenter(i);
      }
    }
    return null;
  }

  // A* from (sx,sz) to (tx,tz). Returns array of {x,z} waypoints or null.
  findPath(sx, sz, tx, tz, agent = {}, maxNodes = 40000) {
    let start = this.idx(sx, sz);
    let goalP = this.nearestWalkable(tx, tz, agent, 4);
    if (start < 0 || !goalP) return null;
    if (this.cellCost(start, agent) === Infinity) {
      const s = this.nearestWalkable(sx, sz, agent, 3);
      if (!s) return null;
      start = this.idx(s.x, s.z);
    }
    const goal = this.idx(goalP.x, goalP.z);
    if (start === goal) return [goalP];
    const stamp = ++this.stamp;
    const { g, came, visit, heap } = this;
    heap.clear();
    const gx = goal % N, gz = (goal / N) | 0;
    const h = (i) => {
      const dx = Math.abs((i % N) - gx), dz = Math.abs(((i / N) | 0) - gz);
      return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
    };
    g[start] = 0; came[start] = -1; visit[start] = stamp;
    heap.push(start, h(start));
    let expanded = 0, best = start, bestH = h(start);
    while (heap.n > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (++expanded > maxNodes) break;
      const cx = cur % N, cz = (cur / N) | 0;
      const gc = g[cur];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        const c = this.cellCost(ni, agent);
        if (c === Infinity) continue;
        if (dx && dz) { // no corner cutting
          if (this.cellCost(cz * N + nx, agent) === Infinity || this.cellCost(nz * N + cx, agent) === Infinity) continue;
        }
        const ng = gc + c * (dx && dz ? SQRT2 : 1);
        if (visit[ni] !== stamp || ng < g[ni]) {
          visit[ni] = stamp; g[ni] = ng; came[ni] = cur;
          const hh = h(ni);
          if (hh < bestH) { bestH = hh; best = ni; }
          heap.push(ni, ng + hh * 1.5);
        }
      }
    }
    let end = visit[goal] === stamp ? goal : best;
    if (end === start) return null;
    const cells = [];
    for (let c = end; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    return this._smooth(cells, agent);
  }

  // Remove intermediate waypoints where a straight walk is clear.
  _smooth(cells, agent) {
    const pts = cells.map((c) => ({ ...this.cellCenter(c), cell: c }));
    if (pts.length <= 2) return pts.slice(1);
    const out = [];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z, agent)) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Is the straight line walkable at cost ~1 (no structures/obstacles)?
  clearLine(ax, az, bx, bz, agent) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.4);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = this.idx(ax + (bx - ax) * t, az + (bz - az) * t);
      if (i < 0) return false;
      const c = this.cellCost(i, agent);
      if (c > 1.5) return false;
    }
    return true;
  }

  // Line of sight through opaque cells. Returns visibility 0..1 (vegetation attenuates).
  sightLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.5);
    let vis = 1;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const i = this.idx(ax + (bx - ax) * t, az + (bz - az) * t);
      if (i < 0) return 0;
      if (this.opaque[i]) return 0;
      if (this.dense[i]) vis *= 0.965;
      if (this.tall[i]) vis *= 0.72;
    }
    return vis;
  }
}
