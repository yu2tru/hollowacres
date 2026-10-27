import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers.js';
import { BUILDINGS, PROPS, FIXTURES, COMPOUND, PEN, SOLAR, FIREPIT, LANDMARKS } from '../../src/data/layout.js';
import { LANDMARK_SHAPES } from '../../src/sim/world.js';
import { getVegetation } from '../../src/sim/vegetation.js';

// Put the player `dist` metres from (tx, tz) on the side given by `from`
// (a unit vector pointing from the target toward the player), sprint at the
// target for a few seconds, and report how far past the target's centre
// they got (negative = stopped before it).
function charge(sim, tx, tz, from, { dist = 3.5, dt = 0.05, secs = 3, track = null } = {}) {
  const p = sim.state.player;
  p.x = tx + from[0] * dist; p.z = tz + from[1] * dist;
  p.y = sim.world.groundAt(p.x, p.z);
  p.yaw = Math.atan2(from[0], from[1]); // forward = -(sin,cos) = toward target
  p.stamina = 100;
  sim.rt.player.vx = sim.rt.player.vz = 0;
  let pen = 0;
  for (let t = 0; t < secs; t += dt) {
    sim.update(dt, { moveZ: 1, sprint: true }); p.stamina = 100;
    // deepest the player's body got into the target's own collider(s)
    if (track) for (let r = 0.34; r > 0; r -= 0.02) { if (sim.world.overlapsCircle(p.x, p.z, r, p.y + 0.35, p.y + 1.7, (c) => track.includes(c))) { pen = Math.max(pen, 0.34 - r + 0.02); break; } }
  }
  if (track) return pen;
  // signed progress along the charge direction beyond the target centre
  return -((p.x - tx) * from[0] + (p.z - tz) * from[1]);
}

const H = BUILDINGS.farmhouse, B = BUILDINGS.barn, S = BUILDINGS.shed;
const lm = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
const tree = getVegetation().trees.find((t) => t.collide && Math.hypot(t.x, t.z) > 100 && Math.hypot(t.x, t.z) < 120);

const SOLIDS = [
  ['farmhouse north wall', H.x, H.z - H.d / 2, [0, -1]],
  ['farmhouse east wall', H.x + H.w / 2, H.z, [1, 0]],
  ['farmhouse south wall (beside door)', H.x + 3, H.z + H.d / 2, [0, -1], { inside: true }],
  ['barn south wall', B.x, B.z + B.d / 2, [0, 1]],
  ['barn east wall', B.x + B.w / 2, B.z, [1, 0]],
  ['shed back wall', S.x, S.z - S.d / 2, [0, 1], { inside: true }],
  ['perimeter fence (north)', 10, COMPOUND.z0, [0, -1]],
  ['perimeter fence (west)', COMPOUND.x0, 0, [-1, 0]],
  ['closed main gate', COMPOUND.gate.x, COMPOUND.z1, [0, 1]],
  ['pen fence', PEN.x0, 0, [1, 0]],
  ['main generator', 40, -46, [0, 1]],
  ['water tank', PROPS.tanks[0].x, PROPS.tanks[0].z, [1, 0]],
  ['pump house', PROPS.pumpHouse.x, PROPS.pumpHouse.z, [1, 0]],
  ['pickup truck', PROPS.truck.x, PROPS.truck.z, [1, 0]],
  ['tractor', PROPS.tractor.x, PROPS.tractor.z, [-1, 0]],
  ['hay bale', PROPS.bales[0].x, PROPS.bales[0].z, [-1, 0]],
  ['shipping bin', FIXTURES.shippingBin.x, FIXTURES.shippingBin.z, [-1, 0]],
  ['chicken coop', PEN.coop.x, PEN.coop.z, [0, 1]],
  ['solar row', SOLAR.rows[0].x, SOLAR.rows[0].z, [0, -1]],
  ['pump trough', FIXTURES.well.x + 0.2, FIXTURES.well.z + 1.05, [0, 1]],
  ['woodpile', PROPS.woodpile.x, PROPS.woodpile.z, [1, 0]],
  ['porch railing', H.x + 3, H.z + H.d / 2 + H.porch.depth - 0.25, [0, 1]],
  ['storage crate', PROPS.crates[0].x, PROPS.crates[0].z, [0, 1]],
  ['fire pit', FIREPIT.x, FIREPIT.z, [1, 0]],
  ['utility pole', PROPS.utilityPoles[3][0], PROPS.utilityPoles[3][1], [1, 0]],
  ['tree trunk', tree.x, tree.z, [Math.sin(Math.atan2(-tree.x, -tree.z)), Math.cos(Math.atan2(-tree.x, -tree.z))]],
  ['cabin wall', lm.cabin.x + LANDMARK_SHAPES.cabin.dx, lm.cabin.z + LANDMARK_SHAPES.cabin.dz - LANDMARK_SHAPES.cabin.d / 2, [0, -1]],
  ['chapel back wall', lm.chapel.x, lm.chapel.z + LANDMARK_SHAPES.chapel.dz - LANDMARK_SHAPES.chapel.d / 2, [0, -1]],
];

for (const [name, x, z, from, opts = {}] of SOLIDS) {
  test(`blocks the player: ${name}`, () => {
    const sim = newSim({ simOpts: { godMode: true } });
    const dir = opts.inside ? [-from[0], -from[1]] : from;
    const g = sim.world.groundAt(x, z);
    const track = sim.world.query(x - 0.2, z - 0.2, x + 0.2, z + 0.2).filter((c) => c.enabled && c.solid && c.y1 > g + 0.4 && sim.world.overlapsCircle(x, z, 0.05, g + 0.4, g + 1.6, (q) => q === c));
    assert.ok(track.length, `no solid collision shape at the ${name}`);
    const pen = charge(sim, x, z, dir, { dist: opts.inside ? 1.8 : 3.5, track });
    assert.ok(pen < 0.08, `player pushed ${pen.toFixed(2)} m into the ${name}`);
  });
}

test('no tunnelling at a 4 fps frame rate through a fence or wall', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  assert.ok(charge(sim, 10, COMPOUND.z0, [0, -1], { dt: 0.25 }) < 0.2, 'fence');
  assert.ok(charge(sim, H.x, H.z - H.d / 2, [0, -1], { dt: 0.25 }) < 0.2, 'house wall');
});

test('legitimate passages: open house door, porch steps, open gate, barn door', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const door = sim.state.structures.find((s) => s.id === 'door_house');
  const dx = H.x + H.door.offset;
  // closed door blocks
  assert.ok(charge(sim, dx, H.z + H.d / 2, [0, 1], { dist: 6 }) < 0.2, 'closed door blocks');
  door.open = true; sim.syncStructure(door);
  const into = charge(sim, dx, H.z + H.d / 2, [0, 1], { dist: 6, secs: 2 });
  assert.ok(into > 1.5, `walked in through the open door and up the porch steps (${into.toFixed(2)})`);
  assert.ok(sim.state.player.y > sim.world.groundAt(dx, H.z + H.d / 2 + 6) + 0.3, 'standing on the raised house floor');
  const gate = sim.state.structures.find((s) => s.id === 'gate_main');
  gate.open = true; sim.syncStructure(gate);
  assert.ok(charge(sim, COMPOUND.gate.x, COMPOUND.z1, [0, 1], { secs: 2 }) > 2, 'open gate');
  // barn door is open by default? open it and walk in
  const bd = sim.state.structures.find((s) => s.id === 'door_barn');
  bd.open = true; sim.syncStructure(bd);
  assert.ok(charge(sim, B.x - B.w / 2, B.z, [-1, 0], { secs: 2 }) > 2, 'open barn door');
});

test('the player never falls through the terrain or floors', () => {
  const sim = newSim({ simOpts: { godMode: true } });
  const p = sim.state.player;
  for (const [x, z] of [[0, 0], [-38, -38], [45, -4], [52, -50], [-40, 30], [90, 90], [-100, -10]]) {
    p.x = x; p.z = z; p.y = sim.world.groundAt(x, z) + 2;
    for (let i = 0; i < 40; i++) sim.update(0.05, {});
    assert.ok(p.y >= sim.world.groundAt(p.x, p.z, p.y + 0.1) - 0.01, `stood on ground at ${x},${z} (y ${p.y.toFixed(2)} vs ${sim.world.groundAt(p.x, p.z, p.y + 0.1).toFixed(2)})`);
  }
});
