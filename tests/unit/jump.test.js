import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import { FIXTURES, PROPS } from '../../src/data/layout.js';

// Run at an object, jump 1 m before it, and record what happens.
function runAt(sim, tx, tz, fromDx, fromDz) {
  const p = sim.state.player, rt = sim.rt.player;
  p.x = tx + fromDx; p.z = tz + fromDz; p.y = sim.world.groundAt(p.x, p.z);
  Object.assign(rt, { grounded: true, vy: 0, vx: 0, vz: 0 }); p.stamina = 100;
  p.yaw = Math.atan2(fromDx, fromDz); p.pitch = 0;
  const L = Math.hypot(fromDx, fromDz), ux = -fromDx / L, uz = -fromDz / L;
  const along = () => (p.x - (tx + fromDx)) * ux + (p.z - (tz + fromDz)) * uz;
  let jumped = false, prev = 0, maxBack = 0, maxDy = 0, prevY = p.y, top = 0;
  const g0 = sim.world.groundAt(tx + fromDx, tz + fromDz);
  for (let i = 0; i < 45; i++) {
    const jump = !jumped && L - along() <= 1.0; if (jump) jumped = true;
    sim.update(1 / 30, { moveZ: 1, moveX: 0, jump });
    const a = along(); maxBack = Math.max(maxBack, prev - a); prev = a;
    maxDy = Math.max(maxDy, Math.abs(p.y - prevY)); prevY = p.y;
    if (rt.grounded) top = Math.max(top, p.y - g0);
  }
  return { travelled: prev, maxBack, maxDy, top };
}

test('jump: smooth arc on open ground, no snap at the end', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const p = sim.state.player; p.x = 0; p.z = 20; p.y = sim.world.groundAt(0, 20);
  const g = p.y, ys = [];
  sim.update(1 / 60, { jump: true });
  for (let i = 0; i < 60; i++) { sim.update(1 / 60, {}); ys.push(p.y - g); }
  const peak = Math.max(...ys);
  assert.ok(peak > 0.6 && peak < 0.85, `peak ${peak}`);
  // descending part is a parabola: no frame drops more than free fall allows
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i - 1] - ys[i] < 0.11, `drop of ${(ys[i - 1] - ys[i]).toFixed(3)} at frame ${i}`);
  assert.ok(Math.abs(ys.at(-1)) < 0.01 && sim.rt.player.grounded, 'landed');
});

test('jump: land on top of low objects without being shoved off', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const wb = runAt(sim, PROPS.wheelbarrow.x, PROPS.wheelbarrow.z, -2.5, 0);
  assert.ok(wb.maxBack < 0.01, `pushed back ${wb.maxBack}`);
  assert.ok(wb.top > 0.5, `stood on the wheelbarrow (top ${wb.top})`);
  const W = FIXTURES.well;
  const tr = runAt(sim, W.x + 0.2, W.z + 1.05, 0, 2.5);
  assert.ok(tr.maxBack < 0.01 && tr.travelled > 2.4, `over/onto the trough ${JSON.stringify(tr)}`);
});

test('jump: clear a log, but not the 1.2 m fence', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const log = runAt(sim, PROPS.logs[2].x, PROPS.logs[2].z, 0, -2.5);
  assert.ok(log.travelled > 3.5 && log.maxBack < 0.01, `over the log ${JSON.stringify(log)}`);
  const fence = runAt(sim, 10, -57, 0, 2.5);
  assert.ok(fence.travelled < 2.3, `fence stops the player ${JSON.stringify(fence)}`);
});
