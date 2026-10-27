// Crop definitions. Times are in game hours of *watered* growth.
// value = base sell price per unit of produce.
export const CROPS = {
  wheat: {
    id: 'wheat', name: 'Wheat', seedCost: 5, growHours: 34, yield: 2, value: 10,
    regrowHours: 0, water: 0.7, level: 1, tall: false, gnawerAppeal: 0.5,
    produce: 'Wheat sheaf', color: [0.86, 0.74, 0.42],
    note: 'Fast and hardy. Forgiving if you miss a watering.',
  },
  potato: {
    id: 'potato', name: 'Potatoes', seedCost: 8, growHours: 56, yield: 3, value: 11,
    regrowHours: 0, water: 1.0, level: 1, tall: false, gnawerAppeal: 1.2,
    produce: 'Potatoes', color: [0.62, 0.48, 0.3],
    note: 'Reliable earner. Gnawers dig for them.',
  },
  corn: {
    id: 'corn', name: 'Corn', seedCost: 10, growHours: 70, yield: 4, value: 9,
    regrowHours: 0, water: 1.1, level: 2, tall: true, gnawerAppeal: 0.8,
    produce: 'Corn', color: [0.95, 0.8, 0.3],
    note: 'Tall stalks block sight lines - yours and theirs.',
  },
  tomato: {
    id: 'tomato', name: 'Tomatoes', seedCost: 18, growHours: 58, yield: 3, value: 8,
    regrowHours: 28, water: 1.2, level: 2, tall: false, gnawerAppeal: 0.9,
    produce: 'Tomatoes', color: [0.85, 0.18, 0.12],
    note: 'Keeps producing after the first harvest.',
  },
  strawberry: {
    id: 'strawberry', name: 'Strawberries', seedCost: 30, growHours: 66, yield: 4, value: 9,
    regrowHours: 24, water: 1.3, level: 3, tall: false, gnawerAppeal: 1.0,
    produce: 'Strawberries', color: [0.86, 0.1, 0.16],
    note: 'Premium regrowing crop. Thirsty.',
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkins', seedCost: 34, growHours: 110, yield: 1, value: 165,
    regrowHours: 0, water: 1.0, level: 3, tall: false, gnawerAppeal: 2.0,
    produce: 'Pumpkin', color: [0.92, 0.48, 0.1],
    note: 'Slow, very valuable. Something in the woods wants them badly.',
  },
};

// Animal products share the produce/market system but can't be planted.
CROPS.egg = {
  id: 'egg', name: 'Eggs', seedCost: 0, growHours: 1, yield: 1, value: 5, regrowHours: 0, water: 0,
  level: 99, tall: false, gnawerAppeal: 0, produce: 'Eggs', color: [0.92, 0.88, 0.78], animal: true,
  note: 'Laid each morning by your chickens. Collect them at the coop.',
};

export const CROP_IDS = Object.keys(CROPS);
export const PLANTABLE = CROP_IDS.filter((id) => !CROPS[id].animal);
// stages: 0 seed, 1 sprout, 2 young, 3 mature, 4 ripe
export const STAGE_NAMES = ['Seeded', 'Sprouting', 'Growing', 'Maturing', 'Ripe'];
