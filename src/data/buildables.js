// Structures the player can construct. Footprint is in local space (w along x, d along z).
// `power` = load units drawn from a network. `blocks` = obstructs navigation.
export const BUILDABLES = {
  barricade: {
    id: 'barricade', name: 'Wooden barricade', cost: 10, mats: { planks: 3 }, hp: 140,
    w: 3.2, d: 0.5, h: 1.6, blocks: true, breakable: true, level: 1,
    desc: 'Blocks paths. Drifters and the Antlered will break through, but it costs them time.',
    upgrade: { name: 'Reinforced barricade', cost: 35, mats: { parts: 2 }, hp: 340 },
    repairMat: 'planks',
  },
  floodlight: {
    id: 'floodlight', name: 'Floodlight', cost: 70, mats: { parts: 1 }, hp: 90,
    w: 0.6, d: 0.6, h: 5, blocks: true, power: 1, light: { radius: 13, intensity: 1 }, level: 1,
    desc: 'Lights a wide area. Gnawers and the Pale avoid it. Drifters are drawn to it.',
    upgrade: { name: 'Halogen floodlight', cost: 110, mats: { parts: 1 }, hp: 130, light: { radius: 19, intensity: 1.4 }, power: 2 },
    repairMat: 'parts',
  },
  pole: {
    id: 'pole', name: 'Power pole', cost: 20, mats: { planks: 2 }, hp: 80,
    w: 0.4, d: 0.4, h: 6, blocks: true, level: 1, range: 26,
    desc: 'Extends a generator\'s network by 26 m.',
    repairMat: 'planks',
  },
  generator: {
    id: 'generator', name: 'Generator', cost: 320, mats: { parts: 2 }, hp: 160,
    w: 1.6, d: 1.0, h: 1.2, blocks: true, breakable: true, capacity: 8, tank: 20, range: 26, level: 1,
    desc: 'Powers lights and cameras nearby. Burns fuel; louder when loaded.',
    repairMat: 'parts',
  },
  camera: {
    id: 'camera', name: 'Security camera', cost: 120, mats: { parts: 1 }, hp: 40,
    w: 0.4, d: 0.4, h: 3.4, blocks: true, power: 1, level: 1,
    desc: 'Watch the farm from the desk monitor. Detects motion. Sees what eyes cannot.',
    repairMat: 'parts',
  },
  trap: {
    id: 'trap', name: 'Leg-hold trap', cost: 40, mats: { parts: 1 }, hp: 30,
    w: 0.9, d: 0.9, h: 0.2, blocks: false, level: 1,
    desc: 'Kills Gnawers outright. Pins Drifters. Briefly stuns the Antlered. Rearm after use (1 part).',
    repairMat: 'parts',
  },
  scarecrow: {
    id: 'scarecrow', name: 'Scarecrow', cost: 25, mats: { planks: 2 }, hp: 50,
    w: 0.6, d: 0.6, h: 2.3, blocks: false, level: 1, radius: 9,
    desc: 'Small packs of Gnawers will not feed within 9 m of it. Large packs will tear it down.',
    repairMat: 'planks',
  },
  sprinkler: {
    id: 'sprinkler', name: 'Sprinkler', cost: 55, mats: { parts: 1 }, hp: 30,
    w: 0.4, d: 0.4, h: 0.6, blocks: false, level: 1, radius: 4.6,
    desc: 'Waters plots within 4.6 m at 6 AM and 2 PM.',
    repairMat: 'parts',
  },
  decoy: {
    id: 'decoy', name: 'Radio decoy', cost: 65, mats: { parts: 1 }, hp: 30,
    w: 0.5, d: 0.4, h: 0.5, blocks: false, level: 2,
    desc: 'Interact to play a loud broadcast for 90 s. Draws Drifters and the Pale to it.',
    repairMat: 'parts',
  },
  chimes: {
    id: 'chimes', name: 'Iron chimes', cost: 45, mats: { parts: 2 }, hp: 40,
    w: 0.5, d: 0.5, h: 2.6, blocks: false, level: 1, radius: 12, requiresLore: 'chapel',
    desc: 'Cold iron on the wind. The Hollow cannot come within 12 m, nor put out lights there.',
    repairMat: 'parts',
  },
};

export const BUILD_ORDER = ['barricade', 'floodlight', 'pole', 'generator', 'camera', 'trap', 'scarecrow', 'sprinkler', 'decoy', 'chimes'];

// Non-buildable structure types that still have HP / repair.
export const FIXED_STRUCTURES = {
  door: { name: 'Door', hp: 120, repairMat: 'planks', breakable: true },
  pump: { name: 'Well pump', hp: 80, repairMat: 'parts' },
  fence: { name: 'Fence', hp: 70, repairMat: 'planks', breakable: true, blocks: true, w: 3.5, d: 0.25, h: 1.2, cost: 20, repairQty: 2 },
  gate: { name: 'Main gate', hp: 180, repairMat: 'planks', breakable: true, blocks: true, w: 6, d: 0.3, h: 1.6, cost: 120 },
  coop: { name: 'Chicken coop', hp: 180, repairMat: 'planks', breakable: true, blocks: true, w: 4, d: 3, h: 2.2, cost: 120 },
  solar: { name: 'Solar panel row', hp: 120, repairMat: 'parts', blocks: true, w: 34, d: 3.2, h: 2.2, cost: 260, capacity: 2, store: 8 },
  firepit: { name: 'Fire pit', hp: 999, blocks: true, w: 1.8, d: 1.8, h: 0.5, light: { radius: 9, intensity: 0.85 } },
};
