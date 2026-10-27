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
    const path = sim.nav.findPath(s.x, s.z, 15, 5, {});
    assert.ok(path && path.length, `path from angle ${a.toFixed(2)}`);
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end.x - 15, end.z - 5) < 3, 'path reaches the target');
  }
});

test('walls block line of sight; open field does not', () => {
  const sim = newSim();
  assert.equal(sim.nav.sightLine(-22, -20, -22, 0), 0, 'farmhouse blocks sight');
  assert.ok(sim.nav.sightLine(5, 30, 25, 30) > 0.5);
});

test('house interior reachable through the door only when open', () => {
  const sim = newSim();
  const door = sim.state.structures.find((s) => s.id === 'door_house');
  const agent = { breaks: false };
  const inside = sim.nav.findPath(-24, 2, -22, -10, agent);
  const end = inside[inside.length - 1];
  assert.ok(Math.hypot(end.x + 22, end.z + 10) > 2, 'closed door keeps non-breakers out');
  door.open = true;
  const p2 = sim.nav.findPath(-24, 2, -22, -10, agent);
  const e2 = p2[p2.length - 1];
  assert.ok(Math.hypot(e2.x + 22, e2.z + 10) < 2, 'open door lets them in');
});
