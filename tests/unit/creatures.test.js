import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, step } from './helpers.js';
import * as farming from '../../src/sim/farming.js';
import * as S from '../../src/sim/structures.js';

function nightSim(opts = {}) {
  const sim = newSim({ minute: 21 * 60, simOpts: { godMode: true }, ...opts });
  sim.director.plan = { waves: [], watcherAt: null };
  // park the player inside the house, out of the way
  Object.assign(sim.state.player, { x: -24, z: -12 });
  return sim;
}

test('gnawers find and eat crops in dark fields (Test C/D)', () => {
  const sim = nightSim();
  const st = sim.state;
  // switch lights off so the field is dark
  for (const s of st.structures) if (s.type === 'floodlight') s.on = false;
  sim.refreshPower();
  const plots = st.plots.filter((p) => p.field === 'A').slice(0, 6);
  for (const p of plots) { farming.plant(sim, p, 'potato'); p.growth = 40; p.stage = farming.stageFor(p); }
  const pack = sim.makePack();
  sim.spawnCreature('gnawer', -5, -64, { pack });
  sim.spawnCreature('gnawer', -3, -65, { pack });
  step(sim, 150);
  const dmg = plots.filter((p) => p.health < 1).length;
  assert.ok(dmg >= 1, `crops damaged: ${dmg}`);
});

test('lit fields deter small packs', () => {
  const sim = nightSim();
  const st = sim.state;
  const p = st.plots.find((q) => q.field === 'A' && q.row === 0 && q.col === 2);
  farming.plant(sim, p, 'potato'); p.growth = 40; p.stage = 2;
  sim.refreshPower();
  assert.ok(sim.lightAt(p.x, p.z) > 0.42, 'test plot is lit by field floodlight');
  const g = sim.spawnCreature('gnawer', 20, 60, { pack: sim.makePack() });
  step(sim, 40);
  assert.equal(p.health, 1, 'lit plot untouched');
});

test('drifters go for powered lights and break them', () => {
  const sim = nightSim();
  const st = sim.state;
  sim.refreshPower();
  const light = st.structures.find((s) => s.id === 'light_field');
  assert.ok(light.powered);
  sim.spawnCreature('drifter', 14, 30);
  step(sim, 120);
  assert.ok(light.hp < light.maxHp, `light damaged (${light.hp})`);
});

test('the Antlered rams the generator', () => {
  const sim = nightSim();
  const st = sim.state;
  const gen = st.structures.find((s) => s.id === 'gen_main');
  gen.fuel = 20;
  sim.refreshPower();
  const a = sim.spawnCreature('antlered', -10, -60);
  step(sim, 120);
  assert.ok(gen.hp < gen.maxHp, `generator damaged (${gen.hp})`);
});

test('the Pale freezes while watched and moves when not', () => {
  const sim = nightSim();
  const st = sim.state;
  Object.assign(st.player, { x: 0, z: 40, yaw: 0, pitch: 0 }); // looking north (-z)
  const pale = sim.spawnCreature('pale', 0, 32); // close enough to see without light
  pale.setState('stalk');
  const before = { x: pale.x, z: pale.z };
  step(sim, 3);
  assert.ok(Math.hypot(pale.x - before.x, pale.z - before.z) < 0.5, 'did not move while observed');
  st.player.yaw = Math.PI; // turn around
  step(sim, 0.8);
  assert.ok(Math.hypot(pale.x - before.x, pale.z - before.z) > 2, 'moved when unobserved');
});

test('the Hollow snuffs lights; chimes and the flashlight beam stop it', () => {
  const sim = nightSim();
  const st = sim.state;
  sim.refreshPower();
  const light = st.structures.find((s) => s.id === 'light_field');
  const h = sim.spawnCreature('hollow', 30, 30);
  step(sim, 60);
  assert.equal(light.bulb, false, 'bulb blown');
  // banish: hold the beam on it
  h.x = 0; h.z = 30; h.path = null;
  Object.assign(st.player, { x: 0, z: 40, yaw: 0, pitch: 0.0 });
  st.player.flashlight = true; st.player.battery = 100;
  step(sim, 2.5);
  assert.ok(h.banished >= 1, 'banished by sustained light');
  assert.ok(sim.ironNear(0, 0) === false);
});

test('traps catch creatures (Test F)', () => {
  const sim = nightSim();
  const st = sim.state;
  st.money = 500; st.inv.parts = 5;
  for (const s of st.structures) if (s.type === 'floodlight') s.on = false;
  sim.refreshPower();
  const p = st.plots.find((q) => q.field === 'A' && q.row === 0 && q.col === 0);
  st.inv.seeds.pumpkin = 1;
  farming.plant(sim, p, 'pumpkin'); p.growth = 60; p.stage = 2;
  assert.equal(p.crop, 'pumpkin');
  const { s: trap } = S.place(sim, 'trap', p.x, p.z, 0);
  assert.ok(trap);
  const g = sim.spawnCreature('gnawer', p.x, p.z - 6, { pack: sim.makePack() });
  g.targetPlot = p; p.claimedBy = g.id;
  step(sim, 30);
  assert.equal(trap.armed, false, 'trap sprung');
  assert.equal(g.alive, false, 'gnawer killed by trap');
});

test('creatures retreat at dawn and are gone by morning (Test B/C)', () => {
  const sim = nightSim({ minute: 5 * 60 + 20 });
  const c = sim.spawnCreature('drifter', 10, 30);
  step(sim, 8); // crosses 5:30 (0.5 s per game minute)
  assert.equal(sim.retreating, true);
  assert.equal(c.state, 'retreat');
  let reported = null;
  sim.events.on('morning', (r) => { reported = r; });
  const day = sim.state.time.day;
  step(sim, 25);
  assert.ok(reported, 'morning report');
  assert.equal(sim.state.time.day, day + 1);
  assert.equal(sim.creatures.length, 0);
});

test('combat: revolver shot damages a creature in view', () => {
  const sim = nightSim();
  const st = sim.state;
  Object.assign(st.player, { x: 0, z: 40, yaw: 0, pitch: 0 });
  st.player.slot = 2;
  st.player.y = sim.world.groundAt(0, 40);
  st.player.pitch = -0.03;
  const d = sim.spawnCreature('drifter', 0, 32);
  d.update = () => {}; // hold still
  d.y = sim.world.groundAt(0, 32);
  sim.update(0.05, { use: true });
  assert.ok(d.hp < d.def.hp, 'hit');
  assert.equal(st.player.mag.revolver, 5);
});
