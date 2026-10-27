// Headless multi-day playthrough with a scripted farmer. Used to check the
// economy & difficulty balance, consequences and long-run stability.
//   node tests/sim/playthrough.mjs [days] [strategy] [seed] [difficulty]
// strategy: 'diligent' (defends, repairs, expands) | 'neglect' (farms only)
import { createNewState } from '../../src/sim/state.js';
import { GameSim } from '../../src/sim/game.js';
import * as farming from '../../src/sim/farming.js';
import * as econ from '../../src/sim/economy.js';
import * as S from '../../src/sim/structures.js';
import { CROPS } from '../../src/data/crops.js';
import { collectEggs } from '../../src/sim/animals.js';
import { serialize, deserialize } from '../../src/sim/save.js';

const DAYS = +(process.argv[2] || 10);
const STRAT = process.argv[3] || 'diligent';
const SEED = +(process.argv[4] || 777);
const DIFF = process.argv[5] || 'normal';

let sim = new GameSim(createNewState({ seed: SEED, difficulty: DIFF }), { headless: true });
const log = [];
const hook = (s) => {
  s.events.on('playerDown', (e) => log.push(`  ! player downed by ${e.by}`));
};
hook(sim);

function farmerDay() {
  const st = sim.state;
  const owned = st.plots.filter((p) => farming.plotOwned(st, p));
  const repairs = () => {
  if (STRAT === 'diligent') {
    const order = ['generator', 'solar', 'floodlight', 'door', 'gate', 'coop', 'pole', 'barricade', 'fence', 'camera', 'pump', 'scarecrow', 'trap'];
    for (const t of order) for (const s of st.structures.filter((q) => q.type === t && S.needsRepair(q))) {
      if (['fence', 'solar', 'pump', 'barricade'].includes(t) && st.money < 250) continue; // extras only with money to spare
      const c = S.repairCost(s);
      for (const [k, v] of Object.entries(c.mats)) if ((st.inv[k] || 0) < v && st.money > 60) econ.buySupply(sim, k, v - (st.inv[k] || 0));
      S.repair(sim, s);
    }
    for (const s of st.structures.filter((q) => q.type === 'trap' && !q.armed)) { if (!st.inv.parts) econ.buySupply(sim, 'parts', 1); if (st.inv.parts) { st.inv.parts--; s.armed = true; } }
  }
  };
  collectEggs(sim);
  // harvest & sell
  for (const p of owned) if (p.stage === 4 && p.crop && !p.dead) { farming.harvest(sim, p); if (sim.packRoom() <= 2) econ.sellAll(sim); }
  for (const c of [...st.contracts]) econ.fulfillContract(sim, c.id);
  econ.sellAll(sim); econ.sellAll(sim, 'barn');
  // clear & plant
  const lv = econ.farmLevel(st).level;
  const choices = Object.values(CROPS).filter((c) => c.level <= lv && !c.animal).sort((a, b) => (b.value * b.yield / b.growHours) - (a.value * a.yield / a.growHours));
  for (const p of owned) {
    if (p.dead) farming.clearPlot(sim, p);
    if (p.crop) continue;
    const reserve = STRAT === 'diligent' ? 25 : 10;
    let crop = choices.find((c) => (st.inv.seeds[c.id] || 0) > 0) || null;
    if (!crop) { crop = choices.find((c) => st.money - c.seedCost > reserve); if (crop) econ.buySeeds(sim, crop.id, 1); }
    if (crop && (st.inv.seeds[crop.id] || 0) > 0) farming.plant(sim, p, crop.id);
  }
  for (const p of owned) if (p.crop) farming.water(sim, p);
  repairs();
  // fuel
  if (STRAT === 'diligent') {
    for (const g of st.structures.filter((q) => q.type === 'generator')) {
      while (g.fuel < S.tankSize(st) - 9 && st.money > 30) { if (!st.inv.fuel) econ.buySupply(sim, 'fuel', 1); if (!st.inv.fuel) break; st.inv.fuel--; g.fuel += 10; }
    }
    // upgrades & defences by priority
    const buy = (fn) => fn();
    if (st.money < 200) return; // keep a cushion for seeds and fuel
    if (st.money > 300 && !st.owned.can2) buy(() => econ.buyUpgrade(sim, 'can2'));
    if (st.money > 400 && !st.owned.backpack) buy(() => econ.buyUpgrade(sim, 'backpack'));
    const has = (t) => st.structures.filter((s) => s.type === t).length;
    if (has('scarecrow') < 1 && st.money > 120) { if (st.inv.planks < 2) econ.buySupply(sim, 'planks', 2); S.place(sim, 'scarecrow', -7, -33, 0); }
    if (has('trap') < 3 && st.money > 200) { if (!st.inv.parts) econ.buySupply(sim, 'parts', 1); const spots = [[-17.8, -44], [3.4, -40], [-7, -51.5]]; S.place(sim, 'trap', ...spots[has('trap')], 0); }
    if (has('floodlight') < 3 && st.money > 350) { econ.buySupply(sim, 'parts', 1); S.place(sim, 'floodlight', -7, -52.5, 0); }
    if (has('floodlight') < 4 && st.money > 450) { econ.buySupply(sim, 'parts', 1); S.place(sim, 'floodlight', -30, -2, -Math.PI / 2); }
    if (st.owned.parcels.length < 2 && st.money > 1100 && lv >= 1) econ.buyParcel(sim, 'east');
    if (has('generator') < 2 && st.owned.parcels.includes('east') && st.money > 600) { econ.buySupply(sim, 'parts', 2); S.place(sim, 'generator', 49, -35, 0); }
    if (st.inv.planks < 4) econ.buySupply(sim, 'planks', 4);
  }
  // stock up a little
  if (STRAT !== 'neglect' && st.money > 80 && (st.inv.ammo38 || 0) < 24) econ.buySupply(sim, 'ammo38', 1);
}

// crude stand-in for a player defending the yard: turn toward the nearest
// visible threat within revolver range and fire; reload when empty.
let fireT = 0;
function defend() {
  const st = sim.state, p = st.player;
  fireT -= 0.1;
  if (!sim.playerAlive) return {};
  if (p.health < 45 && st.inv.medkit > 0) { p.slot = 8; return { use: true }; }
  p.slot = 2;
  p.flashlight = p.battery > 5;
  let best = null, bd = 26;
  for (const c of sim.creatures) {
    if (!c.alive || c.incorporeal || c.opts.watcher || c.hiddenUntil > sim.clockSeconds) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bd && sim.nav.sightLine(p.x, p.z, c.x, c.z) > 0.3) { bd = d; best = c; }
  }
  if (!best) return p.mag.revolver < 6 ? { reload: true } : {};
  const dx = best.x - p.x, dz = best.z - p.z;
  p.yaw = Math.atan2(-dx, -dz);
  const hy = best.y + best.def.hit[0].y - (p.y + 1.62);
  p.pitch = Math.atan2(hy, Math.hypot(dx, dz));
  if (p.mag.revolver <= 0) return { reload: true };
  if (fireT <= 0) { fireT = 0.6 + Math.random() * 0.4; return { use: true }; }
  return {};
}

function run(seconds, dt = 0.1) { for (let t = 0; t < seconds; t += dt) sim.update(dt, {}); }

function toMinute(target) { // run real-time simulation until clock reaches target minute
  let guard = 0;
  while (Math.abs(sim.state.time.minute - target) > 0.6 && guard++ < 40000) sim.update(0.1, {});
}

const days = [];
let crash = null;
try {
  for (let d = 0; d < DAYS; d++) {
    const st = sim.state;
    // morning work
    st.time.minute = Math.max(st.time.minute, 7 * 60);
    farmerDay();
    sim.advanceClockTo(13 * 60);
    farmerDay();
    sim.advanceClockTo(18 * 60);
    farmerDay();
    // save/load round trip every evening (persistence under real conditions)
    sim = new GameSim(deserialize(serialize(sim.state)), { headless: true });
    hook(sim);
    // evening: the farmer waits in the house
    Object.assign(sim.state.player, { x: -36, z: -38, flashlight: false });
    sim.advanceClockTo(19 * 60 + 50);
    const money0 = sim.state.money;
    // live night (creatures, AI, combat with structures)
    const t0 = Date.now();
    let peak = 0;
    let guard = 0;
    if (STRAT === 'diligent') {
      Object.assign(sim.state.player, { x: 4, z: 0, slot: 2 });
      const fp = sim.state.structures.find((q) => q.type === 'firepit');
      if (sim.state.inv.planks >= 2) { sim.state.inv.planks -= 2; fp.lit = true; }
    }
    while (sim.state.time.day === st.time.day && guard++ < 20000) {
      sim.update(0.1, STRAT === 'diligent' ? defend() : {});
      peak = Math.max(peak, sim.creatures.length);
    }
    const r = sim.state.night.lastReport || {};
    const plotsPlanted = sim.state.plots.filter((p) => p.crop && !p.dead).length;
    days.push({ day: r.night, money: Math.round(sim.state.money), earned: Math.round(sim.state.earned), lvl: econ.farmLevel(sim.state).level,
      hens: sim.state.animals.chickens, cropsLost: r.cropsLost, destroyed: r.destroyed, damaged: (r.damaged || []).length, kills: JSON.stringify(r.kills || {}), downed: r.downed, peak, planted: plotsPlanted, ms: Date.now() - t0 });
    if (!Number.isFinite(sim.state.money) || !Number.isFinite(sim.state.player.x)) throw new Error('non-finite state');
  }
} catch (e) { crash = e; }
console.table(days);
for (const l of log) console.log(l);
if (crash) { console.error('CRASH', crash); process.exit(1); }
const last = days[days.length - 1];
console.log(JSON.stringify({ strategy: STRAT, difficulty: DIFF, finalMoney: last.money, earned: last.earned, level: last.lvl, totalCropsLost: days.reduce((a, d) => a + (d.cropsLost || 0), 0), deaths: sim.state.stats.deaths }));
