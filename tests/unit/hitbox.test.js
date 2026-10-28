// Regression tests for the second repair pass: things you could walk or
// shoot through that you shouldn't, and the fence stopping shots it shouldn't.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import { BUILDINGS, PROPS, SHED_ITEMS, FIXTURES, PIPE_Y } from '../../src/data/layout.js';
import { fire, eyePos } from '../../src/sim/player.js';
import { heightAt } from '../../src/sim/terrain.js';
import { henCentre, syncChickens } from '../../src/sim/animals.js';

const solidAt = (sim, x, z, y) => !!sim.world.overlapsCircle(x, z, 0.05, y - 0.02, y + 0.02);

test('previously walk-through props are solid where they are drawn', () => {
  const sim = newSim();
  const S = BUILDINGS.shed, f = S.baseY + 0.15;
  for (const c of SHED_ITEMS.cans) assert.ok(solidAt(sim, S.x + c.x, S.z + c.z, f + 0.4), 'jerrycan');
  const sh = SHED_ITEMS.shelf;
  assert.ok(solidAt(sim, S.x + sh.x, S.z + sh.z, f + 1.2), 'shed shelf');
  // ground pipes: solid at pipe height but low enough to step over
  for (const [x0, z0, x1, z1] of PROPS.pipes) {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, g = heightAt(x, z);
    assert.ok(solidAt(sim, x, z, g + PIPE_Y), 'pipe');
    assert.ok(!solidAt(sim, x, z, g + 0.4), 'pipe is low');
  }
  // firepit log: collider runs along the log (its rotation), not across it
  const l = PROPS.logs[0], g = heightAt(l.x, l.z);
  const ax = Math.cos(l.rot), az = -Math.sin(l.rot);   // log axis for three.js rotation.y = rot
  assert.ok(solidAt(sim, l.x + ax * 0.75, l.z + az * 0.75, g + 0.3), 'along the log');
  assert.ok(!solidAt(sim, l.x - az * 0.6, l.z + ax * 0.6, g + 0.3), 'not across it');
  // models: truck, bed, rocking chair, generator, pump column
  assert.ok(solidAt(sim, PROPS.truck.x, PROPS.truck.z, heightAt(PROPS.truck.x, PROPS.truck.z) + 1.8), 'truck');
  assert.ok(solidAt(sim, PROPS.rockingChair.x, PROPS.rockingChair.z, heightAt(PROPS.rockingChair.x, PROPS.rockingChair.z) + 1.2), 'rocking chair');
  assert.ok(solidAt(sim, FIXTURES.well.x, FIXTURES.well.z, heightAt(FIXTURES.well.x, FIXTURES.well.z) + 1.2), 'pump');
});

function aimAt(sim, t) {
  const p = sim.state.player, o = eyePos(sim);
  const dx = t.x - o.x, dy = t.y - o.y, dz = t.z - o.z, L = Math.hypot(dx, dy, dz);
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(dy / L);
  sim.rt.weapon.cd = 0; sim.rt.weapon.reloading = 0; p.mag.revolver = 6;
}

test('bullets pass between fence rails but stop on them', () => {
  const sim = newSim({ minute: 22 * 60, simOpts: { godMode: true } });
  const rnd = Math.random; Math.random = () => 0.5;
  try {
    const p = sim.state.player;
    p.x = 10; p.z = -52; p.y = heightAt(p.x, p.z);
    const c = sim.spawnCreature('drifter', 10, -57.6); c.update = () => {}; c.hp = 1e6;
    const shoot = (y) => { aimAt(sim, { x: c.x, y: c.y + y, z: c.z }); let hit = null; const off = sim.events.on('shot', (e) => { hit = e.hits[0]; }); fire(sim, 'revolver'); off?.(); return hit; };
    assert.ok(shoot(1.62).hit, 'head shot over the fence');
    // a ray that crosses the fence exactly at a rail is stopped by it
    const fenceY = heightAt(10, -57) + 0.7, o = eyePos(sim);
    aimAt(sim, { x: 10, y: fenceY, z: -57 });
    const d = { x: 0, y: (fenceY - o.y), z: -57 - o.z }; const L = Math.hypot(d.y, d.z);
    let hit = null; const off = sim.events.on('shot', (e) => { hit = e.hits[0]; }); fire(sim, 'revolver'); off?.();
    assert.ok(!hit.hit && hit.t < L + 0.3, `rail stops the bullet (t ${hit.t.toFixed(2)} vs ${L.toFixed(2)})`);
  } finally { Math.random = rnd; }
});

test('the revolver can kill a hen', () => {
  const sim = newSim({ minute: 10 * 60 });
  const hen = syncChickens(sim)[0];
  hen.x = -40; hen.z = 0; hen.tx = hen.x; hen.tz = hen.z;
  for (const h of sim.rt.chickens.slice(1)) { h.x = -50; h.z = 10; h.tx = h.x; h.tz = h.z; }
  const p = sim.state.player; p.x = -35; p.z = 0; p.y = heightAt(p.x, p.z);
  const before = sim.state.animals.chickens;
  aimAt(sim, henCentre(hen));
  fire(sim, 'revolver');
  assert.equal(sim.state.animals.chickens, before - 1);
  assert.ok(!sim.rt.chickens.includes(hen), 'that hen is gone');
});
