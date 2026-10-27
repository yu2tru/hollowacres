// Consumable items and supplies sold at Hollis Feed & Supply.
export const SUPPLIES = {
  fuel:      { id: 'fuel', name: 'Fuel can (10 L)', cost: 18, desc: 'Generator fuel. A full tank runs a small network all night.' },
  planks:    { id: 'planks', name: 'Lumber', cost: 6, desc: 'Building and repair material for wooden structures.' },
  parts:     { id: 'parts', name: 'Spare parts', cost: 14, desc: 'Scrap metal, bulbs and wiring for machinery and lights.' },
  ammo38:    { id: 'ammo38', name: '.38 rounds (x12)', cost: 16, qty: 12, desc: 'Revolver ammunition.' },
  shells:    { id: 'shells', name: '12ga shells (x8)', cost: 26, qty: 8, desc: 'Shotgun shells.', level: 2 },
  flares:    { id: 'flares', name: 'Road flares (x3)', cost: 24, qty: 3, desc: 'Thrown light. Scares Gnawers. Draws Drifters.' },
  batteries: { id: 'batteries', name: 'Batteries (x2)', cost: 8, qty: 2, desc: 'Flashlight battery swap (R with no weapon out, or auto).' },
  medkit:    { id: 'medkit', name: 'First aid kit', cost: 22, desc: 'Restores 60 health.' },
  chicken:   { id: 'chicken', name: 'Laying hen', cost: 30, desc: 'Lays an egg every morning. Roosts in the coop at night. Up to 12.' },
  fertilizer:{ id: 'fertilizer', name: 'Fertilizer', cost: 10, desc: 'Apply to a plot: +30% yield for its next crop.' },
};

// Tools & permanent upgrades.
export const UPGRADES = {
  can2:      { id: 'can2', name: 'Galvanized watering can', cost: 110, desc: 'Holds 24 waterings and soaks a row of 3 plots.', level: 1 },
  seeder:    { id: 'seeder', name: 'Push seeder', cost: 180, desc: 'Plant a row of 3 plots at once.', level: 1 },
  sickle:    { id: 'sickle', name: 'Harvest sickle', cost: 220, desc: 'Harvest a row of 3 ripe plots at once.', level: 2 },
  backpack:  { id: 'backpack', name: 'Canvas backpack', cost: 140, desc: 'Carry 70 produce instead of 35.', level: 1 },
  barn2:     { id: 'barn2', name: 'Barn shelving', cost: 450, desc: 'Barn storage 150 → 400 produce.', level: 2 },
  shotgun:   { id: 'shotgun', name: 'Pump shotgun', cost: 380, desc: 'Close-range stopping power. Uses 12ga shells.', level: 2 },
  tablet:    { id: 'tablet', name: 'Camera tablet', cost: 260, desc: 'View security cameras anywhere (V).', level: 2 },
  bigtank:   { id: 'bigtank', name: 'Generator long-range tank', cost: 240, desc: 'All generators hold 40 L instead of 20 L.', level: 2 },
  focus:     { id: 'focus', name: 'Focusing flashlight head', cost: 200, desc: 'Brighter, longer beam. Banishes faster.', level: 3 },
};

// Equipment slots (hotbar)
export const HOTBAR = [
  { slot: 1, id: 'shovel', name: 'Shovel' },
  { slot: 2, id: 'revolver', name: 'Revolver' },
  { slot: 3, id: 'shotgun', name: 'Shotgun' },
  { slot: 4, id: 'can', name: 'Watering can' },
  { slot: 5, id: 'seeds', name: 'Seeds' },
  { slot: 6, id: 'hammer', name: 'Hammer' },
  { slot: 7, id: 'flare', name: 'Flares' },
  { slot: 8, id: 'medkit', name: 'First aid' },
  { slot: 9, id: 'fertilizer', name: 'Fertilizer' },
];

export const WEAPONS = {
  shovel:   { melee: true, damage: 28, interval: 0.75, range: 2.4, noise: 6 },
  revolver: { damage: 36, interval: 0.42, mag: 6, reload: 2.1, ammo: 'ammo38', spread: 0.008, range: 90, noise: 70, pellets: 1 },
  shotgun:  { damage: 15, interval: 0.95, mag: 5, reload: 0.55, perShell: true, ammo: 'shells', spread: 0.06, range: 32, noise: 85, pellets: 8 },
};

export const FARM_LEVELS = [
  { level: 1, earned: 0, title: 'Newcomer' },
  { level: 2, earned: 900, title: 'Smallholder' },
  { level: 3, earned: 2800, title: 'Grower' },
  { level: 4, earned: 6500, title: 'Established Farm' },
  { level: 5, earned: 13000, title: 'Hollow Acres Co.' },
];
