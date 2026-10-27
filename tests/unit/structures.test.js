import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, step } from './helpers.js';
import * as S from '../../src/sim/structures.js';

test('placement validation: owned land, blocking, cost', () => {
  const sim = newSim();
  const st = sim.state;
  assert.match(S.canPlace(sim, 'barricade', 100, 0, 0), /land you own/);
  assert.match(S.canPlace(sim, 'barricade', 17.5, -9, 0), /in the way|structure|doorway/);   // barn wall
  assert.match(S.canPlace(sim, 'floodlight', 15, 18, 0), /crop fields/);
  assert.equal(S.canPlace(sim, 'barricade', 30, 2, 0), null);
  st.money = 0;
  const r = S.place(sim, 'barricade', 30, 2, 0);
  assert.match(r.err, /money/);
  st.money = 500;
  const ok = S.place(sim, 'barricade', 30, 2, 0);
  assert.ok(ok.s);
  assert.match(S.canPlace(sim, 'barricade', 30, 2, 0), /Overlaps|in the way/);
});

test('damage -> destroyed breach -> repair restores collision & nav (Tests D, E)', () => {
  const sim = newSim();
  const st = sim.state;
  st.money = 500;
  const { s } = S.place(sim, 'barricade', 30, 2, 0);
  const cell = sim.nav.idx(30, 2);
  assert.equal(sim.nav.structureAt(cell), s);
  assert.equal(sim.nav.cellCost(cell, { breaks: false }), Infinity, 'blocks non-breakers');
  assert.ok(sim.nav.cellCost(cell, { breaks: true }) > 5, 'costly for breakers');
  S.damageStructure(sim, s, 1000, null);
  assert.equal(s.hp, 0);
  assert.equal(sim.nav.cellCost(cell, { breaks: false }) < Infinity, true, 'breach is passable');
  assert.equal(sim.rt.cols.get(s.id).enabled, false);
  const planks = st.inv.planks;
  assert.equal(S.repair(sim, s), null);
  assert.equal(s.hp, s.maxHp);
  assert.ok(st.inv.planks < planks, 'repair consumed lumber');
  assert.equal(sim.rt.cols.get(s.id).enabled, true);
  assert.equal(sim.nav.cellCost(cell, { breaks: false }), Infinity);
  st.inv.planks = 0; st.inv.parts = 0;
  S.damageStructure(sim, s, 50, null);
  assert.match(S.repair(sim, s), /Need/);
});

test('power network: generator -> pole -> light, fuel, overload (Test F)', () => {
  const sim = newSim({ minute: 21 * 60 });
  const st = sim.state;
  st.money = 5000; st.inv.parts = 20; st.inv.planks = 20;
  const gen = st.structures.find((s) => s.id === 'gen_main');
  gen.fuel = 10;
  sim.refreshPower();
  const yard = st.structures.find((s) => s.id === 'light_yard');
  assert.equal(yard.powered, true, 'yard light powered at night (auto)');
  assert.equal(sim.rt.housePowered, true);
  // far light is unpowered until a pole connects it
  const { s: far } = S.place(sim, 'floodlight', 36, 30, 0);
  sim.refreshPower();
  assert.equal(far.powered, false);
  S.place(sim, 'pole', 24, 28, 0);
  S.place(sim, 'pole', 22, 6, 0);
  sim.refreshPower();
  assert.equal(far.powered, true, 'pole chain carries power');
  // light level is higher under a powered floodlight
  assert.ok(sim.lightAt(yard.x, yard.z - 7) > sim.lightAt(-60, 60));
  // fuel burns and lights die when empty
  gen.fuel = 0.05;
  sim.tickClock(30);
  sim.refreshPower();
  assert.equal(gen.fuel, 0);
  assert.equal(yard.powered, false);
  // destroyed generator powers nothing
  gen.fuel = 10; S.damageStructure(sim, gen, 999, null); sim.refreshPower();
  assert.equal(yard.powered, false);
  S.repair(sim, gen); sim.refreshPower();
  assert.equal(yard.powered, true);
  // overload: too many lights for one generator
  let placed = 0;
  for (let x = -24; x < 10 && placed < 8; x += 2.5) for (const z of [-33, -36, -18]) { if (placed < 8 && S.place(sim, 'floodlight', x, z, 0).s) placed++; }
  assert.equal(placed, 8);
  sim.refreshPower();
  assert.ok(sim.rt.networks.some((n) => n.overloaded));
});

test('generator in auto mode is off during the day', () => {
  const sim = newSim({ minute: 12 * 60 });
  sim.refreshPower();
  assert.equal(sim.state.structures.find((s) => s.id === 'light_yard').powered, false);
});

test('upgrades raise hp and light radius', () => {
  const sim = newSim();
  const st = sim.state;
  st.money = 1000; st.inv.parts = 10;
  const yard = st.structures.find((s) => s.id === 'light_yard');
  const r0 = S.lightProps(yard).radius;
  assert.equal(S.upgrade(sim, yard), null);
  assert.ok(S.lightProps(yard).radius > r0);
  assert.equal(S.upgrade(sim, yard), 'No upgrade available');
});
