// Static world layout. All positions in metres; +x east, +z south, y up.
// This is the single source of truth for where things are; both the
// simulation (collision, navigation, AI) and the renderer read it.
//
// The farm follows a fenced-compound plan (north up):
//   house NW · crop area N-centre · generator yard NE · storage barn E
//   animal pen W · courtyard & fire pit centre · water system SW
//   solar field SE · main gate S → driveway → county road.

export const WORLD = {
  playRadius: 152,       // hard boundary for the player
  navHalf: 160,          // navigation grid covers [-navHalf, navHalf]
  forestInner: 96,       // forest begins (outside the compound clearing)
  spawnRingMin: 112,
  spawnRingMax: 138,
  visualRadius: 330,
};

// Perimeter fence of the compound
export const COMPOUND = { x0: -60, x1: 60, z0: -57, z1: 57, gate: { x: -6, width: 6 } };

export const ROAD = {
  county: { z: 84, width: 7 },
  // outside the gate down to the county road
  driveway: [{ x: -6, z: 84 }, { x: -6, z: 70 }, { x: -6, z: 57 }],
  drivewayWidth: 4.5,
  // worn paths inside the compound (visual + footstep surface)
  paths: [
    [{ x: -40, z: -30 }, { x: -31, z: -22 }, { x: -14, z: -7 }, { x: 0, z: 3 }],   // house → courtyard
    [{ x: 0, z: 3 }, { x: 3.5, z: -10 }, { x: 3.5, z: -51 }],                      // courtyard → crop walkway
    [{ x: -16, z: -32.5 }, { x: 26, z: -32.5 }],                                     // walkway between crop blocks
    [{ x: 3.5, z: -10 }, { x: 28, z: -10 }, { x: 31, z: -30 }],                     // → generator yard gate
    [{ x: 0, z: 3 }, { x: 37, z: -4 }],                                              // → barn door
    [{ x: 0, z: 3 }, { x: -6, z: 30 }, { x: -6, z: 57 }],                           // → main gate
    [{ x: 0, z: 3 }, { x: -29, z: 8 }],                                              // → animal pen
    [{ x: -6, z: 18 }, { x: -20, z: 20 }, { x: -27, z: 29 }],                       // → water / pump
    [{ x: -6, z: 18 }, { x: 5, z: 20 }],                                             // → solar field
  ],
};

export const POND = { x: -42, z: 37, r: 9.5, waterY: -0.55 };

// Property: the whole compound is owned. Extra crop blocks are bought
// (cleared and tilled) as the farm grows.
export const PARCELS = [
  { id: 'core', name: 'Homestead', rect: { x0: -68, x1: 68, z0: -65, z1: 65 }, cost: 0, owned: true },
  { id: 'east', name: 'North-east crop block', rect: { x0: 4, x1: 27, z0: -51, z1: -34 }, cost: 900, minLevel: 1,
    desc: 'Clear and till 35 more plots beside your first field.' },
  { id: 'south', name: 'South-west crop block', rect: { x0: -17, x1: 3, z0: -31, z1: -11 }, cost: 1800, minLevel: 2,
    desc: '36 plots nearer the courtyard - and nearer the gate.' },
  { id: 'far', name: 'South-east crop block', rect: { x0: 4, x1: 27, z0: -31, z1: -11 }, cost: 3200, minLevel: 3,
    desc: 'The best soil on the farm (+20% yield). 42 plots.' },
];

// Crop fields: grid of plots, each plot is 2.4m with 3m pitch.
export const FIELDS = [
  { id: 'A', parcel: 'core', name: 'Home field', x0: -16, z0: -50, cols: 6, rows: 5, soil: 1.0 },
  { id: 'B', parcel: 'east', name: 'North-east block', x0: 5, z0: -50, cols: 7, rows: 5, soil: 1.0 },
  { id: 'C', parcel: 'south', name: 'South-west block', x0: -16, z0: -30, cols: 6, rows: 6, soil: 1.05 },
  { id: 'D', parcel: 'far', name: 'South-east block', x0: 5, z0: -30, cols: 7, rows: 6, soil: 1.2 },
];
export const PLOT_PITCH = 3;
export const PLOT_SIZE = 2.4;

// Fixed buildings. Colliders are generated from these definitions.
export const BUILDINGS = {
  farmhouse: {
    x: -38, z: -38, w: 12, d: 9, floor: 0.5, wallH: 3.2, roofH: 2.6,
    door: { side: 'south', offset: -2.0, width: 1.4 },
    porch: { depth: 2.6 },
    windows: [
      { side: 'south', offset: 2.6 }, { side: 'east', offset: 0 }, { side: 'west', offset: -1.5 },
      { side: 'north', offset: 1.5 },
    ],
  },
  barn: {
    x: 45, z: -4, w: 13, d: 17, wallH: 5.0, roofH: 4.2,
    door: { side: 'west', offset: 0, width: 4.2 },
  },
  shed: { x: 52, z: -50, w: 5.5, d: 4.5, wallH: 2.6, roofH: 1.0, door: { side: 'south', offset: 0, width: 2.4 } },
};

// Small solid props with simple colliders (render/environment.js draws them)
export const PROPS = {
  tanks: [{ x: -20.5, z: 31, r: 2.1, h: 4.2 }, { x: -20.5, z: 38, r: 2.1, h: 4.2 }],
  pumpHouse: { x: -21, z: 46, w: 3.2, d: 3.2, h: 2.6 },
  genPads: [{ x: 40, z: -35 }, { x: 49, z: -35 }],
  crates: [{ x: 41, z: 8, w: 2.2, d: 1.2 }, { x: 47.5, z: 9, w: 1.4, d: 1.4 }],
  barrels: [{ x: 50, z: 7.5 }, { x: 51, z: 8.6 }, { x: 50.2, z: 9.8 }, { x: 51.3, z: 10.9 }],
  utilityPoles: [[-9, 86], [-10, 66], [-26, 40.5], [-32, 15], [-46, -24]],
  logs: [{ x: 3.2, z: 1.5, rot: 0.9 }, { x: -3, z: 2, rot: -0.7 }, { x: 0.3, z: 8, rot: 0.1 }, { x: 3.6, z: 7, rot: -0.4 }],
  // water main from the pond pump to the tanks: laid on the ground on saddles
  pipes: [[-30, 30, -22.4, 30], [-23, 30, -23, 38]],
  stackedCrate: { x: 41.4, z: 8.1, s: 1.0, h: 0.9, rot: 0.3 },   // sits on top of the first crate stack
};

const H = BUILDINGS.farmhouse, B = BUILDINGS.barn;
const rel = (b, dx, dz) => ({ x: b.x + dx, z: b.z + dz });

// Placed set-dressing (render/environment.js draws these at exactly these spots)
Object.assign(PROPS, {
  truck: { x: H.x + 10, z: H.z + 9.5, rot: 0.35 },
  tractor: { x: 33, z: -18, rot: 2.4 },
  bales: [{ x: -27.5, z: -6, rot: 0.2 }, { x: -26.6, z: -3.6, rot: 1.1 }, { x: -25.0, z: -5.2, rot: 0.6 }],
  woodpile: { x: H.x + H.w / 2 + 0.7, z: H.z - 1 },
  clothesline: { x: H.x - 9, z0: H.z - 4, z1: H.z + 5 },
  wheelbarrow: { x: -18.5, z: -31, rot: 1.2 },
  bucket: { x: 2.6, z: -34 },
  drums: [{ x: 56.5, z: -40 }, { x: 57.3, z: -41 }, { x: 56.6, z: -42 }],
  dock: { x: -33.5, z: 33, rot: 0.4, w: 1.4, d: 4 },
  rockingChair: { x: H.x + 2.6, z: H.z + H.d / 2 + 1.2, rot: 0 },   // on the porch
});

// Interactable fixtures (non-buildable) with positions.
export const FIXTURES = {
  bed: rel(H, -4.2, -2.8),
  desk: rel(H, 4.6, -3.4),          // laptop: shop/market/contracts/land
  monitor: rel(H, 5.8, -3.4),       // security camera monitor
  table: rel(H, -0.5, 1.0),         // letter on kitchen table
  drawer: rel(H, -5.0, 2.6),        // revolver drawer
  well: { x: -29, z: 30 },          // pump at the pond
  standpipe: { x: 3.5, z: -44.5 },  // field standpipe in the crop walkway
  shippingBin: { x: 35.5, z: 8 },
  mailbox: { x: -1, z: 79 },
  storage: rel(B, 0, 5),            // barn storage bins
  workbench: rel(B, 3.5, -6),
  ledgerCrate: rel(B, -2.5, -6.5),  // barn lore
  coop: { x: -46, z: -3.6 },        // collect eggs (front of the coop)
};

// Furniture colliders, relative to their building (x, z offsets; half extents; height)
export const FURNITURE = [
  { b: 'farmhouse', x: -4.2, z: -2.8, hw: 0.77, hd: 1.08, h: 1.24 }, // bed model 1.52 x 1.24 x 2.15 m (to the top of the headboard)
  { b: 'farmhouse', x: 5.2, z: -3.5, hw: 1.2, hd: 0.45, h: 1.25 },   // desk with laptop & monitor
  { b: 'farmhouse', x: -0.5, z: 1.0, hw: 0.8, hd: 0.55, h: 0.8 },    // table
  { b: 'farmhouse', x: -5.4, z: 2.6, hw: 0.3, hd: 0.6, h: 1.5 },     // dresser with lamp
  { b: 'barn', x: -2.0, z: -6.55, hw: 0.97, hd: 0.52, h: 1.42 },     // ledger crates (stacked)
  { b: 'barn', x: 3.5, z: -6.05, hw: 1.32, hd: 0.48, h: 2.45 },      // workbench & pegboard
  { b: 'barn', x: 2.5, z: 6.5, hw: 2.45, hd: 0.72, h: 1.3 },         // storage bins
  { b: 'farmhouse', x: 5.45, z: 2.2, hw: 0.4, hd: 0.35, h: 0.9 },    // stove
  { b: 'farmhouse', x: 5.55, z: 0.4, hw: 0.3, hd: 1.2, h: 0.9 },     // kitchen counter
  { b: 'farmhouse', x: 4.9, z: -2.7, hw: 0.25, hd: 0.27, h: 1.1 },   // desk chair
  { b: 'farmhouse', x: -0.5, z: 0.12, hw: 0.23, hd: 0.25, h: 1.05 }, // table chairs
  { b: 'farmhouse', x: -0.5, z: 1.88, hw: 0.23, hd: 0.25, h: 1.05 },
  { b: 'barn', x: 5.5, z: -6.35, hw: 0.62, hd: 1.25, h: 1.1 },       // hay stack
  { b: 'barn', x: 4.2, z: -7.3, hw: 0.6, hd: 0.3, h: 0.6 },          // loose bale
];

// Height of the ground pipes' centre above the terrain.
export const PIPE_Y = 0.16;

export function roadPosts() {
  const out = [];
  for (let x = -150; x <= 150; x += 18) {
    if (Math.abs(x - COMPOUND.gate.x) < 6) continue;
    out.push([x, ROAD.county.z - ROAD.county.width / 2 - 0.6]);
  }
  return out;
}

// Shelf and jerrycans along the back wall of the generator shed (shed-relative).
export const SHED_ITEMS = {
  cans: [-1.6, -1.15, -0.7].map((x) => ({ x, z: -BUILDINGS.shed.d / 2 + 0.5 })),
  shelf: { x: 1.0, z: -BUILDINGS.shed.d / 2 + 0.35, w: 2.2, d: 0.45, h: 1.75 },
};

// Collision shapes for every solid outdoor prop. Shared by physics & AI.
// { kind:'box', x, z, hw, hd, rot, h } | { kind:'circle', x, z, r, h }
export function propSolids() {
  const P = PROPS, out = [];
  const box = (x, z, hw, hd, rot, h) => out.push({ kind: 'box', x, z, hw, hd, rot: rot || 0, h });
  const circ = (x, z, r, h) => out.push({ kind: 'circle', x, z, r, h });
  box(P.truck.x, P.truck.z, 1.14, 2.8, P.truck.rot, 2.5);              // flatbed truck model 2.27 x 2.48 x 5.6 m
  box(P.tractor.x, P.tractor.z, 1.0, 1.7, P.tractor.rot, 2.2);
  for (const b of P.bales) box(b.x, b.z, 0.6, 0.75, b.rot, 1.5);
  box(P.woodpile.x, P.woodpile.z, 0.45, 0.85, 0, 0.9);
  circ(P.clothesline.x, P.clothesline.z0, 0.08, 2.2); circ(P.clothesline.x, P.clothesline.z1, 0.08, 2.2);
  box(P.wheelbarrow.x, P.wheelbarrow.z, 0.4, 0.73, P.wheelbarrow.rot, 0.66); // model 0.79 x 0.66 x 1.45 m
  circ(P.bucket.x, P.bucket.z, 0.17, 0.35);
  for (const d of P.drums) circ(d.x, d.z, 0.3, 0.9);
  // pump trough and shipping bin
  box(FIXTURES.well.x + 0.2, FIXTURES.well.z + 1.05, 0.82, 0.32, 0, 0.75);
  box(FIXTURES.shippingBin.x, FIXTURES.shippingBin.z, 0.8, 0.55, Math.PI / 2, 1.12);
  circ(FIXTURES.mailbox.x, FIXTURES.mailbox.z, 0.12, 1.3);
  circ(FIXTURES.well.x - 0.9, FIXTURES.well.z + 0.4, 0.17, 0.32);        // bucket by the pond pump
  box(FIXTURES.mailbox.x, FIXTURES.mailbox.z, 0.15, 0.27, 0, 1.42);     // the box on the post
  // crate stacked on the yard crates
  { const c = P.stackedCrate; box(c.x, c.z, c.s / 2 + 0.05, c.s / 2 + 0.05, c.rot, 1.1 + c.h); }
  // tank access ladders (east side of each tank)
  for (const t of P.tanks) box(t.x + t.r + 0.12, t.z, 0.08, 0.26, 0, t.h + 0.4);
  // ground pipes: low enough to step over, but you walk over them, not through
  for (const [x0, z0, x1, z1] of P.pipes) box((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2, 0.13, -Math.atan2(z1 - z0, x1 - x0), PIPE_Y + 0.1);
  // road edge posts along the county road
  for (const [x, z] of roadPosts()) circ(x, z, 0.08, 0.9);
  // porch rocking chair
  { const c = P.rockingChair; box(c.x, c.z + 0.04, 0.28, 0.31, c.rot, 1.12 + H.floor); } // model 0.54 x 1.12 x 0.58 m
  // gateway posts and the road sign
  const gx = COMPOUND.gate.x, gz = COMPOUND.z1, hw = COMPOUND.gate.width / 2 + 0.3;
  circ(gx - hw, gz, 0.16, 3.6); circ(gx + hw, gz, 0.16, 3.6);
  circ(gx + 7, ROAD.county.z - 4.5, 0.06, 2.4);
  // porch railing (gap for the steps in front of the door)
  const PD = H.porch.depth, rz = H.z + H.d / 2 + PD - 0.25;
  for (const [a, b] of [[-H.w / 2 + 0.3, H.door.offset - 0.9], [H.door.offset + 0.9, H.w / 2 - 0.3]]) box(H.x + (a + b) / 2, rz, (b - a) / 2, 0.06, 0, 1.0 + H.floor);
  return out;
}


// Animal pen & coop
export const PEN = { x0: -54, x1: -30, z0: -12, z1: 14, coop: { x: -46, z: -6.5, w: 4, d: 3 } };

// Solar field: four panel rows
export const SOLAR = {
  rows: [27, 34.5, 42, 49.5].map((z, i) => ({ id: `solar_${i + 1}`, x: 30, z, len: 34, depth: 3.2 })),
};

export const FIREPIT = { x: 0, z: 4.5 };

// Pre-installed structures (participate in damage/repair/power systems).
export const PREPLACED = [
  { type: 'generator', x: 40, z: -46, rot: 0, id: 'gen_main', fuel: 8 },
  { type: 'pole', x: 20, z: -53, id: 'pole_1' },
  { type: 'pole', x: -2, z: -53, id: 'pole_2' },
  { type: 'pole', x: -22, z: -46, id: 'pole_3' },
  { type: 'pole', x: 4, z: -33, id: 'pole_4' },
  { type: 'pole', x: 8, z: -9, id: 'pole_5' },
  { type: 'pole', x: 10, z: 15, id: 'pole_6' },
  { type: 'floodlight', x: 2, z: -8.5, rot: Math.PI, id: 'light_yard' },
  { type: 'floodlight', x: -19, z: -42, rot: Math.PI / 2, id: 'light_field' },
  { type: 'door', building: 'farmhouse', id: 'door_house' },
  { type: 'door', building: 'barn', id: 'door_barn' },
  { type: 'pump', x: FIXTURES.well.x, z: FIXTURES.well.z, id: 'pump_well' },
  { type: 'pump', x: FIXTURES.standpipe.x, z: FIXTURES.standpipe.z, id: 'pump_field' },
  { type: 'gate', x: COMPOUND.gate.x, z: COMPOUND.z1, rot: 0, id: 'gate_main', len: COMPOUND.gate.width },
  { type: 'coop', x: PEN.coop.x, z: PEN.coop.z, rot: 0, id: 'coop' },
  { type: 'firepit', x: FIREPIT.x, z: FIREPIT.z, id: 'firepit' },
  // the solar field: two rows still work, two were wrecked before you arrived
  ...SOLAR.rows.map((r, i) => ({ type: 'solar', x: r.x, z: r.z, rot: 0, id: r.id, len: r.len, broken: i >= 2 })),
];

// Fence runs: [x0, z0, x1, z1, gaps[[from,to] along the run]]
const FENCE_RUNS = [
  // perimeter (gate gap on the south side)
  [COMPOUND.x0, COMPOUND.z0, COMPOUND.x1, COMPOUND.z0, []],
  [COMPOUND.x0, COMPOUND.z1, COMPOUND.x1, COMPOUND.z1, [[COMPOUND.gate.x - COMPOUND.gate.width / 2, COMPOUND.gate.x + COMPOUND.gate.width / 2]]],
  [COMPOUND.x0, COMPOUND.z0, COMPOUND.x0, COMPOUND.z1, []],
  [COMPOUND.x1, COMPOUND.z0, COMPOUND.x1, COMPOUND.z1, []],
  // generator yard (west & south sides; opening to the west)
  [31, -57, 31, -25, [[-33.5, -28]]],
  [31, -25, 60, -25, []],
  // animal pen (opening on the east side)
  [PEN.x0, PEN.z0, PEN.x1, PEN.z0, []],
  [PEN.x0, PEN.z1, PEN.x1, PEN.z1, []],
  [PEN.x0, PEN.z0, PEN.x0, PEN.z1, []],
  [PEN.x1, PEN.z0, PEN.x1, PEN.z1, [[5, 10]]],
  // water system (opening at the north-east corner)
  [-60, 20, -15, 20, [[-24, -18]]],
  [-15, 20, -15, 57, []],
  // solar field (opening at the north-west)
  [2, 20, 60, 20, [[3, 8]]],
  [2, 20, 2, 57, []],
];

export function fenceSegments() {
  const segs = [];
  for (const [x0, z0, x1, z1, gaps] of FENCE_RUNS) {
    const horiz = z0 === z1;
    const a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1;
    // split the run into solid intervals around the gaps
    const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
    const parts = [];
    let cur = a0;
    for (const [g0, g1] of cuts) { if (g0 > cur) parts.push([cur, g0]); cur = Math.max(cur, g1); }
    if (cur < a1) parts.push([cur, a1]);
    for (const [p0, p1] of parts) {
      const n = Math.max(1, Math.round((p1 - p0) / 3.5));
      const len = (p1 - p0) / n;
      for (let i = 0; i < n; i++) {
        const c = p0 + (i + 0.5) * len;
        segs.push(horiz ? { x: c, z: z0, rot: 0, len } : { x: x0, z: c, rot: Math.PI / 2, len });
      }
    }
  }
  return segs;
}

// Points of interest in the woods. Lore & stakes.
export const LANDMARKS = [
  { id: 'cabin', name: 'Hollis Cabin', x: -112, z: -62, r: 9 },
  { id: 'chapel', name: 'Chapel Ruin', x: 74, z: -112, r: 10 },
  { id: 'oldwell', name: 'Dry Well', x: 112, z: 58, r: 7 },
  { id: 'survey', name: 'Survey Marker', x: -58, z: 106, r: 6 },
  { id: 'stone', name: 'The Tithe Stone', x: 4, z: -136, r: 11 },
  { id: 'stake_n', name: 'North Boundary Stone', x: -42, z: -128, r: 4 },
  { id: 'stake_e', name: 'East Boundary Stone', x: 134, z: -18, r: 4 },
  { id: 'stake_s', name: 'South Boundary Stone', x: 40, z: 128, r: 4 },
  { id: 'stake_w', name: 'West Boundary Stone', x: -136, z: 24, r: 4 },
];

export const PLAYER_SPAWN = { x: -35.5, z: -35.8, yaw: 1.19 };
