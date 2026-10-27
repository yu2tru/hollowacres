import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import * as farming from '../../src/sim/farming.js';
import * as econ from '../../src/sim/economy.js';
import { CROPS } from '../../src/data/crops.js';

test('plant, water, grow, harvest, sell (Test A)', () => {
  const sim = newSim();
  const st = sim.state;
  const plot = st.plots.find((p) => p.field === 'A');
  assert.equal(farming.plant(sim, plot, 'wheat'), null);
  assert.equal(plot.crop, 'wheat');
  assert.equal(st.inv.seeds.wheat, 11);
  farming.water(sim, plot);
  // un-watered plots do not grow
  const dry = st.plots.filter((p) => p.field === 'A')[1];
  farming.plant(sim, dry, 'wheat'); dry.moisture = 0;
  // grow ~ 40 game hours, re-watering each day
  for (let h = 0; h < 40; h++) { farming.updatePlots(sim, 1); if (h % 20 === 0) farming.water(sim, plot); dry.moisture = 0; }
  assert.equal(plot.stage, 4, 'watered wheat ripens');
  assert.ok(dry.stage < 2, 'dry plot barely grows');
  const before = st.money;
  const r = farming.harvest(sim, plot);
  assert.ok(r.qty >= 1);
  assert.equal(plot.crop, null);
  const earned = econ.sell(sim, 'wheat', r.qty);
  assert.equal(st.money, before + earned);
  assert.ok(earned > CROPS.wheat.seedCost, 'harvest is profitable');
});

test('cannot plant on unowned land; regrowing crops come back', () => {
  const sim = newSim();
  const st = sim.state;
  const west = st.plots.find((p) => p.field === 'B');
  assert.match(farming.plant(sim, west, 'wheat'), /own/);
  const p = st.plots.find((q) => q.field === 'A');
  st.inv.seeds.tomato = 1;
  farming.plant(sim, p, 'tomato');
  p.growth = CROPS.tomato.growHours; p.stage = 4;
  farming.harvest(sim, p);
  assert.equal(p.crop, 'tomato', 'tomato regrows');
  assert.ok(p.stage < 4);
});

test('damage reduces yield and destroyed crops give nothing', () => {
  const sim = newSim();
  const st = sim.state;
  const [a, b] = st.plots.filter((p) => p.field === 'A');
  for (const p of [a, b]) { farming.plant(sim, p, 'potato'); p.growth = 999; p.stage = 4; }
  farming.damagePlot(sim, a, 0.5);
  const full = farming.yieldOf(st, b), half = farming.yieldOf(st, a);
  assert.ok(half < full);
  farming.damagePlot(sim, a, 1);
  assert.equal(a.dead, true);
  assert.equal(farming.harvest(sim, a).err, 'Ruined - nothing to harvest');
  assert.equal(sim.nightStats.cropsLost, 1);
  assert.equal(farming.clearPlot(sim, a), null);
  assert.equal(a.dead, false);
});

test('pack capacity limits harvest', () => {
  const sim = newSim();
  const st = sim.state;
  st.inv.produce.wheat = sim.packCapacity();
  const p = st.plots.find((q) => q.field === 'A');
  farming.plant(sim, p, 'wheat'); p.growth = 999; p.stage = 4;
  assert.match(farming.harvest(sim, p).err, /full/);
});
