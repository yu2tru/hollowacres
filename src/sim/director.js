// Night director: decides what comes out of the woods, when, and from where.
// Pressure scales with days survived, how much the farm has grown (the
// "tithe" owed) and difficulty - and drops as boundary stakes are restored.
import { CREATURES } from '../data/creatures.js';
import { WORLD } from '../data/layout.js';
import { Rng } from '../core/rng.js';
import { NIGHT } from './clock.js';
import { farmLevel } from './economy.js';

const DIFF = { easy: 0.65, normal: 1.0, hard: 1.4 };

export function nightBudget(state) {
  const day = state.time.day;
  const stakes = Object.values(state.lore.stakes || {}).filter(Boolean).length;
  const growth = state.earned / 1000 + (state.owned.parcels.length - 1) * 1.5;
  let b = 1 + day * 1.15 + growth * 1.0;
  b *= DIFF[state.difficulty] ?? 1;
  b *= 1 - stakes * 0.09;
  if (state.lore.rite === 'done') b *= 0.35;
  return Math.max(2, b);
}

export function planNight(state, seed) {
  const rng = new Rng(seed);
  const day = state.time.day;
  const rite = state.lore.rite === 'active';
  let budget = nightBudget(state);
  const plan = { day, waves: [], event: null, watcherAt: null, rite };
  const minuteRel = (m) => (m - NIGHT + 1440) % 1440; // minutes since 20:00

  // Rare events give certain nights a different rhythm
  if (!rite && day >= 4 && rng.chance(0.16)) {
    plan.event = rng.pick(['quiet', 'procession', 'hunger', 'blackout']);
  }
  if (rite) budget = budget * 2.0 + 12;
  if (plan.event === 'quiet') budget *= 0.7;

  const sealed = state.lore.rite === 'done';
  const allowed = (t) => rite || (day >= CREATURES[t].firstNight && !(sealed && ['hollow', 'pale', 'antlered'].includes(t)));
  const huntingPale = rite || (day >= 5 && !sealed);
  let hollowLeft = rite ? 2 : (allowed('hollow') ? 1 : 0);
  if (plan.event === 'blackout') hollowLeft = 2;
  let paleLeft = huntingPale ? 1 : 0;
  let antlerLeft = rite ? 3 : Math.min(2, Math.floor((day - 1) / 3) + 1);

  // Night 1: a gentle introduction - a small pack, and something watching.
  if (day === 1 && !rite) {
    plan.waves.push({ at: 95, groups: [{ type: 'gnawer', n: 2 }], angle: rng.range(0, Math.PI * 2) });
    plan.watcherAt = rng.int(160, 280);
    return plan;
  }
  if (!huntingPale && !sealed && rng.chance(0.6)) plan.watcherAt = rng.int(120, 400);

  const nWaves = plan.event === 'quiet' ? 1 : Math.min(6, 1 + Math.floor(day / 2) + (rite ? 2 : 0));
  const start = plan.event === 'quiet' ? 400 : 45;
  const end = 450; // 03:30
  for (let w = 0; w < nWaves; w++) {
    const at = Math.round(start + (end - start) * (w / Math.max(1, nWaves)) + rng.range(-15, 25));
    const share = budget / (nWaves - w);
    let spend = share * rng.range(0.8, 1.2);
    budget -= spend;
    const groups = [];
    const angle = rng.range(0, Math.PI * 2);
    let guard = 0;
    while (spend > 0.9 && guard++ < 20) {
      const opts = [];
      opts.push({ v: 'gnawer', w: plan.event === 'hunger' ? 6 : 3 });
      if (allowed('drifter')) opts.push({ v: 'drifter', w: plan.event === 'procession' ? 7 : 2.5 });
      if (allowed('antlered') && antlerLeft > 0 && spend >= 4) opts.push({ v: 'antlered', w: 1.2 });
      if (hollowLeft > 0 && spend >= 4 && (plan.event === 'blackout' || w >= 1)) opts.push({ v: 'hollow', w: plan.event === 'blackout' ? 6 : 1 });
      if (paleLeft > 0 && spend >= 3 && w >= 1) opts.push({ v: 'pale', w: 1.2 });
      const t = rng.weighted(opts);
      if (t === 'gnawer') {
        const n = Math.min(Math.max(2, Math.round(rng.range(2, 2 + day / 3))), 5);
        groups.push({ type: 'gnawer', n });
        spend -= n * CREATURES.gnawer.cost;
      } else if (t === 'drifter') {
        const n = rng.int(1, Math.min(3, 1 + Math.floor(day / 3)));
        groups.push({ type: 'drifter', n });
        spend -= n * CREATURES.drifter.cost;
      } else {
        groups.push({ type: t, n: 1 });
        spend -= CREATURES[t].cost;
        if (t === 'hollow') hollowLeft--;
        if (t === 'pale') paleLeft--;
        if (t === 'antlered') antlerLeft--;
      }
    }
    if (groups.length) plan.waves.push({ at: Math.max(30, at), groups, angle });
  }
  return plan;
}

export class Director {
  constructor(sim) {
    this.sim = sim;
    this.plan = null;
    this.spawned = 0;
  }

  startNight() {
    const st = this.sim.state;
    this.plan = planNight(st, (st.seed ^ (st.time.day * 7919)) >>> 0);
    this.rng = new Rng((st.seed + st.time.day * 104729) >>> 0);
    this.spawned = 0;
    this.watcherDone = false;
    if (this.plan.event) this.sim.events.emit('nightEvent', this.plan.event);
    return this.plan;
  }

  minutesIntoNight() {
    return (this.sim.state.time.minute - NIGHT + 1440) % 1440;
  }

  update() {
    const sim = this.sim;
    if (!this.plan || sim.retreating) return;
    const m = this.minutesIntoNight();
    if (m > 570) return;
    for (const w of this.plan.waves) {
      if (w.done || m < w.at) continue;
      if (sim.creatures.filter((c) => c.alive).length >= 14) break; // cap concurrency; try later
      w.done = true;
      for (const g of w.groups) this.spawnGroup(g.type, g.n, w.angle + this.rng.range(-0.5, 0.5));
    }
    if (this.plan.watcherAt != null && !this.watcherDone && m >= this.plan.watcherAt) {
      this.watcherDone = true;
      this.spawnWatcher();
    }
  }

  // A point on the forest ring, walkable, not too near the player and not
  // in their direct line of sight.
  spawnPoint(angle, agent = {}) {
    const sim = this.sim, p = sim.state.player;
    for (let i = 0; i < 18; i++) {
      const a = angle + this.rng.range(-0.35, 0.35) * (1 + i * 0.15);
      const r = this.rng.range(WORLD.spawnRingMin, WORLD.spawnRingMax);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const pt = sim.nav.nearestWalkable(x, z, agent, 5);
      if (!pt) continue;
      if (Math.hypot(pt.x - p.x, pt.z - p.z) < 45) continue;
      if (i < 12 && sim.playerCanSeePoint(pt.x, pt.z, 70)) continue;
      return pt;
    }
    return null;
  }

  spawnGroup(type, n, angle) {
    const sim = this.sim;
    const pack = type === 'gnawer' ? sim.makePack() : null;
    const base = this.spawnPoint(angle, { breaks: true });
    if (!base) return;
    for (let i = 0; i < n; i++) {
      const pt = sim.nav.nearestWalkable(base.x + this.rng.range(-3, 3), base.z + this.rng.range(-3, 3), {}, 4) || base;
      const c = sim.spawnCreature(type, pt.x, pt.z, { pack, riteBound: this.plan.rite });
      if (c) this.spawned++;
    }
  }

  spawnWatcher() {
    const sim = this.sim, p = sim.state.player;
    // somewhere at the edge of the trees that the player might notice
    for (let i = 0; i < 24; i++) {
      const a = sim.state.player.yaw + Math.PI + this.rng.range(-0.9, 0.9); // in front of the player
      const r = WORLD.forestInner - 4 + this.rng.range(0, 8);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 40 || d > 110) continue;
      if (!sim.nav.walkable(x, z, {})) continue;
      sim.spawnCreature('pale', x, z, { watcher: true });
      return;
    }
  }
}
