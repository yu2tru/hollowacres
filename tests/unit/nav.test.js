import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import { WORLD } from '../../src/data/layout.js';

test('paths exist from every side of the forest ring into the farm', () => {
  const sim = newSim();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const r = WORLD.spawnRingMin + 5;
    const s = sim.nav.nearestWalkable(Math.sin(a) * r, Math.cos(a) * r, {}, 6);
    assert.ok(s, `walkable spawn at angle ${a.toFixed(2)}`);
    const path = sim.nav.findPath(s.x, s.z, 15, 5, { breaks: true });
    assert.ok(path && path.length, `path from angle ${a.toFixed(2)}`);
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end.x - 15, end.z - 5) < 3, 'path reaches the target');
  }
});

test('walls block line of sight; open field does not', () => {
  const sim = newSim();
  assert.equal(sim.nav.sightLine(-38, -48, -38, -28), 0, 'farmhouse blocks sight');
  assert.ok(sim.nav.sightLine(-5, 0, 15, 0) > 0.5);
});

test('the perimeter fence keeps out creatures that cannot break it, the gate lets them in', () => {
  const sim = newSim();
  const agent = { breaks: false };
  const p = sim.nav.findPath(-6, 75, 0, 10, agent);
  assert.ok(!p || Math.hypot(p[p.length - 1].x, p[p.length - 1].z - 10) > 3, 'sealed when the gate is closed');
  sim.state.structures.find((s) => s.id === 'gate_main').open = true;
  const p2 = sim.nav.findPath(-6, 75, 0, 10, agent);
  assert.ok(Math.hypot(p2[p2.length - 1].x, p2[p2.length - 1].z - 10) < 2, 'open gate lets them through');
});

test('house interior reachable through the door only when open', () => {
  const sim = newSim();
  const door = sim.state.structures.find((s) => s.id === 'door_house');
  const agent = { breaks: false };
  const inside = sim.nav.findPath(-40, -25, -38, -38, agent);
  const end = inside[inside.length - 1];
  assert.ok(Math.hypot(end.x + 38, end.z + 38) > 2, 'closed door keeps non-breakers out');
  door.open = true;
  const p2 = sim.nav.findPath(-40, -25, -38, -38, agent);
  const e2 = p2[p2.length - 1];
  assert.ok(Math.hypot(e2.x + 38, e2.z + 38) < 2, 'open door lets them in');
});
