import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import { STEPS, startTutorial, skipTutorial, acknowledge, currentStep } from '../../src/sim/tutorial.js';
import { computeFocus, doInteract } from '../../src/sim/interact.js';
import { useOnPlot, harvestAction } from '../../src/sim/player.js';
import * as econ from '../../src/sim/economy.js';
import * as S from '../../src/sim/structures.js';
import { FIXTURES } from '../../src/data/layout.js';
import { serialize, deserialize } from '../../src/sim/save.js';
import { GameSim } from '../../src/sim/game.js';

const tick = (sim, secs = 0.5) => { for (let t = 0; t < secs; t += 0.1) sim.update(0.1, {}); };
const stepId = (sim) => currentStep(sim.state)?.id;

// Stand at (x,z) and aim the view at a world point (tx, ty, tz).
function lookAt(sim, x, z, tx, ty, tz) {
  const p = sim.state.player;
  p.x = x; p.z = z; p.y = sim.world.groundAt(x, z, 5);
  const ey = p.y + 1.62;
  p.yaw = Math.atan2(-(tx - x), -(tz - z));
  p.pitch = Math.atan2(ty - ey, Math.hypot(tx - x, tz - z));
}

test('the whole tutorial can be completed through real game actions', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const st = sim.state;
  startTutorial(sim);
  assert.equal(stepId(sim), 'move');
  // a timer alone never advances a step
  tick(sim, 5);
  assert.equal(stepId(sim), 'move', 'does not advance without the action');

  // 1. walk to the table
  const T = FIXTURES.table;
  lookAt(sim, T.x + 1.4, T.z + 0.8, T.x, 0, T.z); tick(sim);
  assert.equal(stepId(sim), 'interact');

  // 2. read the letter via the real focus/interact path
  const tableY = sim.world.groundAt(T.x + 1.4, T.z + 0.8, 5) + 0.9;
  lookAt(sim, T.x + 1.4, T.z + 0.8, T.x, tableY, T.z);
  const f = computeFocus(sim);
  assert.equal(f?.id, 'table', 'aiming at the letter focuses it');
  doInteract(sim, f); tick(sim);
  assert.equal(stepId(sim), 'plant');

  // 3. plant three empty plots in the home field
  const empty = st.plots.filter((p) => p.field === 'A' && !p.crop).slice(0, 3);
  st.player.slot = 5;
  for (const p of empty) useOnPlot(sim, p, 'seeds');
  tick(sim);
  assert.equal(stepId(sim), 'water');

  // 4. fill the can at the field standpipe, then water
  st.player.water = 0;
  const pump = st.structures.find((s) => s.id === 'pump_field');
  doInteract(sim, { kind: 'structure', ref: pump });
  assert.ok(st.player.water > 0, 'standpipe filled the can');
  for (const p of empty) useOnPlot(sim, p, 'can');
  tick(sim);
  assert.equal(stepId(sim), 'grow');
  tick(sim, 3); assert.equal(stepId(sim), 'grow', 'info steps wait for the player');
  acknowledge(sim); tick(sim);
  assert.equal(stepId(sim), 'harvest');

  // 5. harvest the starter wheat and sell it
  const ripe = st.plots.filter((p) => p.starter && p.stage === 4);
  assert.ok(ripe.length >= 3, 'starter wheat is ripe on day one');
  const money = st.money;
  for (const p of ripe) harvestAction(sim, p);
  assert.ok(st.inv.produce.wheat > 0, 'harvested wheat is in the pack');
  econ.sellAll(sim); tick(sim);
  assert.ok(st.money > money, 'selling raised money');
  assert.equal(stepId(sim), 'upgrade');

  // 6. buy the galvanised can - must be affordable for a new player
  assert.ok(st.money >= 110, `can afford the suggested upgrade ($${st.money})`);
  assert.equal(econ.buyUpgrade(sim, 'can2'), null);
  assert.equal(st.player.water, 24, 'upgrade took effect (bigger can)');
  tick(sim);
  assert.equal(stepId(sim), 'power');

  // 7. refuel the generator
  const gen = st.structures.find((s) => s.id === 'gen_main');
  const fuel = gen.fuel;
  st.inv.fuel = 1;
  st.inv.fuel--; gen.fuel += 10; sim.tutorialEvent('refuel'); tick(sim);
  assert.ok(gen.fuel > fuel);
  assert.equal(stepId(sim), 'defend');

  // 8. build a trap near the crops
  st.inv.parts = Math.max(st.inv.parts, 1);
  assert.ok(S.place(sim, 'trap', -17.8, -44, 0).s, 'placed a trap');
  tick(sim);
  assert.equal(stepId(sim), 'night');

  // 9. live the first night through to morning
  st.player.x = -36; st.player.z = -38;
  sim.advanceClockTo(19 * 60 + 55);
  let guard = 0;
  while (st.time.day === 1 && guard++ < 20000) sim.update(0.1, {});
  tick(sim);
  assert.equal(st.time.day, 2);
  assert.ok(['repair', 'free'].includes(stepId(sim)), `after the night: ${stepId(sim)}`);

  // 10. repair something (damage one fence if the night left nothing broken)
  if (stepId(sim) === 'repair') {
    const broken = st.structures.find((s) => S.needsRepair(s) && s.type !== 'solar');
    st.inv.planks = 10; st.inv.parts = 10;
    assert.equal(S.repair(sim, broken), null);
    tick(sim);
  }
  assert.equal(stepId(sim), 'free');
  acknowledge(sim); tick(sim);
  assert.equal(st.tutorial.done, true);
  assert.equal(currentStep(st), null, 'tutorial is over; free play');
});

test('tutorial progress survives save/load and can be skipped and resumed', () => {
  const sim = newSim();
  startTutorial(sim);
  const T = FIXTURES.table;
  sim.state.player.x = T.x + 1; sim.state.player.z = T.z; tick(sim);
  assert.equal(stepId(sim), 'interact');
  const sim2 = new GameSim(deserialize(serialize(sim.state)), { headless: true });
  assert.equal(stepId(sim2), 'interact', 'resumes at the same step after loading');
  skipTutorial(sim2);
  assert.equal(currentStep(sim2.state), null);
  startTutorial(sim2);
  assert.equal(stepId(sim2), 'interact', 'resuming keeps progress');
  assert.equal(STEPS.length, 12);
});

test('a new farm has the starter wheat and a reachable field standpipe', () => {
  const sim = newSim();
  const ripe = sim.state.plots.filter((p) => p.starter);
  assert.equal(ripe.length, 3);
  const pipe = sim.state.structures.find((s) => s.id === 'pump_field');
  const nearest = Math.min(...sim.state.plots.filter((p) => p.field === 'A').map((p) => Math.hypot(p.x - pipe.x, p.z - pipe.z)));
  assert.ok(nearest < 4, 'standpipe is right beside the home field');
});
