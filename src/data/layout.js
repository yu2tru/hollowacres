// Static world layout. All positions in metres; +x east, +z south, y up.
// This is the single source of truth for where things are; both the
// simulation (collision, navigation, AI) and the renderer read it.

export const WORLD = {
  playRadius: 152,       // hard boundary for the player
  navHalf: 160,          // navigation grid covers [-navHalf, navHalf]
  forestInner: 96,       // forest begins (outside parcels)
  spawnRingMin: 112,
  spawnRingMax: 138,
  visualRadius: 330,
};

export const ROAD = {
  // County road running east-west and the farm driveway
  county: { z: 72, width: 7 },
  driveway: [
    { x: 2, z: 72 }, { x: 2, z: 40 }, { x: 0, z: 18 }, { x: -2, z: 4 },
  ],
  drivewayWidth: 4.5,
  // worn foot paths (visual + slightly faster walking feel)
  paths: [
    [{ x: -18, z: -3 }, { x: -6, z: 2 }, { x: 4, z: 4 }, { x: 16, z: -4 }],
    [{ x: -6, z: 2 }, { x: -6, z: -19 }],
    [{ x: 4, z: 4 }, { x: 10, z: 11 }],
  ],
};

export const POND = { x: -64, z: -40, r: 13, waterY: -0.55 };

// Property parcels. `owned` means owned at the start.
export const PARCELS = [
  { id: 'core', name: 'Homestead', rect: { x0: -40, x1: 40, z0: -42, z1: 42 }, cost: 0, owned: true },
  { id: 'west', name: 'West Field', rect: { x0: -74, x1: -40, z0: -4, z1: 44 }, cost: 1400, minLevel: 1,
    desc: 'Flat ground beside the old pond road. 35 tilled plots.' },
  { id: 'north', name: 'North Pasture', rect: { x0: -40, x1: 40, z0: -80, z1: -42 }, cost: 2800, minLevel: 2,
    desc: 'Open pasture backing onto the tree line. 40 plots. Closer to the woods.' },
  { id: 'east', name: 'Creek Bottom', rect: { x0: 40, x1: 84, z0: -24, z1: 44 }, cost: 4600, minLevel: 3,
    desc: 'Rich bottomland soil (+25% yield). 48 plots, far from the house.' },
];

// Crop fields: grid of plots, each plot is 2.4m with 3m pitch.
export const FIELDS = [
  { id: 'A', parcel: 'core', name: 'South Field', x0: 9, z0: 13, cols: 6, rows: 4, soil: 1.0 },
  { id: 'B', parcel: 'west', name: 'West Field', x0: -66, z0: 10, cols: 7, rows: 5, soil: 1.0 },
  { id: 'C', parcel: 'north', name: 'North Pasture', x0: -12, z0: -70, cols: 8, rows: 5, soil: 1.05 },
  { id: 'D', parcel: 'east', name: 'Creek Bottom', x0: 50, z0: -12, cols: 8, rows: 6, soil: 1.25 },
];
export const PLOT_PITCH = 3;
export const PLOT_SIZE = 2.4;

// Fixed buildings. Colliders are generated from these definitions.
export const BUILDINGS = {
  farmhouse: {
    x: -22, z: -10, w: 12, d: 9, floor: 0.5, wallH: 3.2, roofH: 2.6,
    door: { side: 'south', offset: -2.0, width: 1.4 },
    porch: { depth: 2.6 },
    windows: [
      { side: 'south', offset: 2.6 }, { side: 'east', offset: 0 }, { side: 'west', offset: -1.5 },
      { side: 'north', offset: 1.5 },
    ],
  },
  barn: {
    x: 24, z: -13, w: 13, d: 17, wallH: 5.0, roofH: 4.2,
    door: { side: 'west', offset: 0, width: 4.2 },
  },
  shed: { x: -7, z: -28, w: 5.5, d: 4.5, wallH: 2.6, roofH: 1.0, door: { side: 'south', offset: 0, width: 2.4 } },
  silo: { x: 34, z: -27, r: 3.2, h: 13 },
};

// Interactable fixtures (non-buildable) with positions.
export const FIXTURES = {
  bed: { x: -26.2, z: -12.8, rot: 0 },
  desk: { x: -17.4, z: -13.4 },          // laptop: shop/market/contracts/land
  monitor: { x: -16.2, z: -13.4 },       // security camera monitor
  table: { x: -22.5, z: -9.0 },          // letter on kitchen table
  drawer: { x: -27.0, z: -7.4 },         // revolver drawer
  well: { x: -7, z: 6 },
  shippingBin: { x: 8, z: 3 },
  mailbox: { x: 5.5, z: 67 },
  storage: { x: 24, z: -8 },             // barn storage bins
  workbench: { x: 27.5, z: -19 },
  ledgerCrate: { x: 21.5, z: -19.5 },    // barn lore
};

// Pre-installed structures (participate in damage/repair/power systems).
export const PREPLACED = [
  { type: 'generator', x: -7, z: -23.6, rot: 0, id: 'gen_main', fuel: 8 },
  { type: 'pole', x: 4, z: -8, rot: 0, id: 'pole_yard' },
  { type: 'floodlight', x: -1, z: -3, rot: Math.PI * 0.85, id: 'light_yard' },
  { type: 'floodlight', x: 12.5, z: 9, rot: Math.PI * 0.2, id: 'light_field' },
  { type: 'door', building: 'farmhouse', id: 'door_house' },
  { type: 'door', building: 'barn', id: 'door_barn' },
  { type: 'pump', x: -7, z: 6, id: 'pump_well' },
];

// Fence ring around field A with a gap (gate) on its north side.
export function fieldAFence() {
  const segs = [];
  const x0 = 6.5, x1 = 27.5, z0 = 10.5, z1 = 25.5;
  const seg = 3.5;
  // south side
  for (let x = x0; x < x1 - 0.01; x += seg) segs.push({ x: x + seg / 2, z: z1, rot: 0 });
  // north side, leave gap at x 13..16.5
  for (let x = x0; x < x1 - 0.01; x += seg) {
    const cx = x + seg / 2;
    if (cx > 12.5 && cx < 17) continue;
    segs.push({ x: cx, z: z0, rot: 0 });
  }
  // west + east sides
  for (let z = z0; z < z1 - 0.01; z += 3.75) {
    segs.push({ x: x0, z: z + 1.875, rot: Math.PI / 2, len: 3.75 });
    segs.push({ x: x1, z: z + 1.875, rot: Math.PI / 2, len: 3.75 });
  }
  return segs;
}

// Points of interest in the woods. Lore & stakes.
export const LANDMARKS = [
  { id: 'cabin', name: 'Hollis Cabin', x: -112, z: -62, r: 9 },
  { id: 'chapel', name: 'Chapel Ruin', x: 74, z: -112, r: 10 },
  { id: 'oldwell', name: 'Dry Well', x: 112, z: 58, r: 7 },
  { id: 'survey', name: 'Survey Marker', x: -58, z: 104, r: 6 },
  { id: 'stone', name: 'The Tithe Stone', x: 4, z: -136, r: 11 },
  { id: 'stake_n', name: 'North Boundary Stone', x: -42, z: -128, r: 4 },
  { id: 'stake_e', name: 'East Boundary Stone', x: 134, z: -18, r: 4 },
  { id: 'stake_s', name: 'South Boundary Stone', x: 40, z: 128, r: 4 },
  { id: 'stake_w', name: 'West Boundary Stone', x: -136, z: 24, r: 4 },
];

export const PLAYER_SPAWN = { x: -20.2, z: -7.2, yaw: Math.PI * 0.3 };
