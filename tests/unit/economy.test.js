import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import * as econ from '../../src/sim/economy.js';
import { Rng } from '../../src/core/rng.js';
import { CROP_IDS } from '../../src/data/crops.js';

test('market prices stay within bounds over many days', () => {
  const sim = newSim();
  const rng = new Rng(9);
  for (let d = 0; d < 200; d++) {
    econ.rollMarket(sim.state, rng);
    for (const id of CROP_IDS) {
      const m = sim.state.market.prices[id];
      assert.ok(m >= 0.75 && m <= 1.3, `${id} multiplier ${m}`);
    }
  }
});

test('shop hours, buying, duplicate purchases blocked', () => {
  const sim = newSim();
  const st = sim.state;
  st.money = 1000;
  assert.equal(econ.buySeeds(sim, 'potato', 5), null);
  assert.equal(st.inv.seeds.potato, 11);
  assert.equal(econ.buyUpgrade(sim, 'can2'), null);
  assert.equal(econ.buyUpgrade(sim, 'can2'), 'Already owned');
  assert.match(econ.buySeeds(sim, 'pumpkin', 1), /level/);
  st.time.minute = 23 * 60;
  assert.match(econ.buySupply(sim, 'fuel', 1), /closed/);
  st.money = 3;
  st.time.minute = 10 * 60;
  assert.equal(econ.buySupply(sim, 'fuel', 1), 'Not enough money');
});

test('contracts: fulfil from pack + barn, pays reward, level up', () => {
  const sim = newSim();
  const st = sim.state;
  st.contracts = [{ id: 1, crop: 'wheat', qty: 10, reward: 150, dueDay: 3, from: 'Test' }];
  st.inv.produce.wheat = 4; st.barn.produce.wheat = 8;
  const m = st.money;
  assert.equal(econ.fulfillContract(sim, 1), null);
  assert.equal(st.money, m + 150);
  assert.equal((st.inv.produce.wheat || 0) + (st.barn.produce.wheat || 0), 2);
  assert.equal(st.contracts.length, 0);
  st.earned = 5000; sim.checkLevelUp();
  assert.equal(econ.farmLevel(st).level, 3);
});

test('land purchase requires level and money', () => {
  const sim = newSim();
  const st = sim.state;
  st.money = 10000;
  assert.match(econ.buyParcel(sim, 'far'), /level/);
  assert.equal(econ.buyParcel(sim, 'east'), null);
  assert.ok(st.owned.parcels.includes('east'));
  assert.equal(econ.buyParcel(sim, 'east'), 'Already owned');
});
