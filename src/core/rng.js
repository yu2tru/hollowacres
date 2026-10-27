// Deterministic random helpers. Gameplay randomness goes through these so
// nights can be reproduced from a seed during testing.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._r = mulberry32(this.seed);
  }
  next() { return this._r(); }
  range(a, b) { return a + (b - a) * this._r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this._r() < p; }
  pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
  weighted(entries) {
    // entries: [{ w, v }]
    let total = 0;
    for (const e of entries) total += Math.max(0, e.w);
    if (total <= 0) return entries.length ? entries[0].v : undefined;
    let r = this._r() * total;
    for (const e of entries) {
      r -= Math.max(0, e.w);
      if (r <= 0) return e.v;
    }
    return entries[entries.length - 1].v;
  }
}

// Integer hash -> [0,1)
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
