import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, step } from './helpers.js';
import { serialize, deserialize } from '../../src/sim/save.js';
import { GameSim } from '../../src/sim/game.js';
import * as S from '../../src/sim/structures.js';
import * as farming from '../../src/sim/farming.js';

test('round trip preserves crops, structures, damage, upgrades, lore (Test H)', () => {
  const sim = newSim();
  const st = sim.state;
  st.money = 2000; st.inv.parts = 9;
  const p = st.plots.find((q) => q.field === 'A');
  farming.plant(sim, p, 'potato'); p.growth = 20; farming.damagePlot(sim, p, 0.3);
  const { s } = S.place(sim, 'barricade', 30, 2, 1.2);
  S.damageStructure(sim, s, 50, null);
  const yard = st.structures.find((q) => q.id === 'light_yard'); S.upgrade(sim, yard);
  st.owned.can2 = true; st.lore.found.push('ledger'); st.lore.stakes.stake_n = true;
  st.time.day = 5; st.time.minute = 600;
  sim.refreshPower();
  const text = serialize(st);
  assert.ok(!text.includes('"powered"'), 'runtime fields stripped');
  const loaded = deserialize(text);
  const sim2 = new GameSim(loaded, { headless: true });
  const p2 = sim2.state.plots.find((q) => q.id === p.id);
  assert.equal(p2.crop, 'potato');
  assert.ok(Math.abs(p2.health - p.health) < 1e-9);
  const s2 = sim2.state.structures.find((q) => q.id === s.id);
  assert.equal(s2.hp, s.hp);
  assert.equal(s2.rot, 1.2);
  assert.equal(sim2.state.structures.find((q) => q.id === 'light_yard').level, 1);
  assert.equal(sim2.state.owned.can2, true);
  assert.deepEqual(sim2.state.lore.found, st.lore.found);
  assert.equal(sim2.state.time.day, 5);
  assert.equal(sim2.state.structures.length, st.structures.length, 'no duplicated structures');
  // loading twice does not duplicate anything
  const sim3 = new GameSim(deserialize(serialize(sim2.state)), { headless: true });
  assert.equal(sim3.state.structures.length, st.structures.length);
  assert.equal(sim3.world.colliders.length, sim2.world.colliders.length);
});

test('corrupted and future saves are rejected; missing fields are filled', () => {
  assert.throws(() => deserialize('{not json'), /corrupted/);
  assert.throws(() => deserialize(JSON.stringify({ version: 999 })), /newer/);
  assert.throws(() => deserialize('null'), /empty/);
  const sim = newSim();
  const data = JSON.parse(serialize(sim.state));
  delete data.stats; delete data.lore.bestiary; data.plots = data.plots.slice(0, 5);
  const fixed = deserialize(JSON.stringify(data));
  assert.ok(fixed.stats && fixed.lore.bestiary);
  assert.equal(fixed.plots.length, sim.state.plots.length);
});
