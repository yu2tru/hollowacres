// Creature profiles. The shared AI framework (sim/creatures) reads these
// numbers; behaviour differences come from `brain` + the profile flags.
export const CREATURES = {
  gnawer: {
    id: 'gnawer', name: 'Gnawer', category: 'Animal', brain: 'gnawer',
    hp: 45, speed: 3.4, runSpeed: 7.2, radius: 0.45, cost: 1, firstNight: 1,
    hit: [{ y: 0.55, r: 0.55, mult: 1 }],
    sight: 22, fov: 2.4, hearing: 1.0,
    lightFear: 0.42,        // won't enter light above this unless starving
    cropDamage: 0.045,      // plot health per second while feeding
    appetite: 1.6,          // plot-healths eaten before it is full and leaves
    attack: { damage: 9, range: 1.6, interval: 1.1 },
    breaks: false, trapEffect: 'kill',
    desc: 'Hairless, long-jawed things that run in packs and eat what you grow.',
    lore: 'Feeds on crops, preferring potatoes and pumpkins. Each one takes its fill and goes back to the trees. Skittish alone, bold in numbers. Avoids bright light and scarecrows unless the pack is large or starving. A trap kills one outright.',
  },
  drifter: {
    id: 'drifter', name: 'Drifter', category: 'Humanoid', brain: 'drifter',
    hp: 100, speed: 1.5, runSpeed: 2.6, radius: 0.4, cost: 2, firstNight: 2,
    hit: [{ y: 1.05, r: 0.42, mult: 1 }, { y: 1.62, r: 0.2, mult: 2.2 }],
    sight: 26, fov: 2.0, hearing: 1.3,
    lightAttract: true,
    attack: { damage: 16, range: 1.7, interval: 2.0, structDamage: 15 },
    breaks: true, trapEffect: 'pin',
    desc: 'People, or the shape of people, in clothes from other decades.',
    lore: 'Drawn to light, engines and noise. They shamble toward your floodlights and generators and beat them apart. Slow, but they do not stop. Aim for the head. Traps pin them in place.',
  },
  antlered: {
    id: 'antlered', name: 'The Antlered', category: 'Animal', brain: 'antlered',
    hp: 420, speed: 2.4, runSpeed: 9.5, radius: 1.1, cost: 5, firstNight: 3,
    hit: [{ y: 1.4, r: 1.05, mult: 1 }, { y: 2.6, r: 0.45, mult: 1.6 }],
    sight: 30, fov: 2.2, hearing: 0.9,
    attack: { damage: 38, range: 2.6, interval: 2.2, structDamage: 70 },
    breaks: true, trapEffect: 'stun',
    desc: 'An elk-shaped thing as tall as the barn door, crowned in dead branches.',
    lore: 'Goes for what fences the land: generators, gates, barricades, the barn. Charges in straight lines and is dazed afterwards. Indifferent to light. Shotguns and traps make it think twice.',
  },
  pale: {
    id: 'pale', name: 'The Pale Farmhand', category: 'Humanoid', brain: 'pale',
    hp: 170, speed: 1.0, runSpeed: 6.4, radius: 0.45, cost: 4, firstNight: 1,
    hit: [{ y: 1.3, r: 0.4, mult: 1 }, { y: 2.15, r: 0.3, mult: 1 }, { y: 2.65, r: 0.24, mult: 2 }],
    sight: 45, fov: 3.2, hearing: 1.0,
    lightFear: 0.36,
    attack: { damage: 30, range: 1.9, interval: 2.0, structDamage: 30 },
    breaks: true, trapEffect: 'stun',
    desc: 'Too tall. Overalls. It stands at the edge of the light and waits for you to look away.',
    lore: 'Hunts the farmer, not the farm. It only moves while unobserved: keep your eyes and your light on it. It will not walk into floodlight. Wounded, it retreats to the trees. It can break doors if the house is dark.',
  },
  hollow: {
    id: 'hollow', name: 'The Hollow', category: 'Supernatural', brain: 'hollow',
    hp: 999, speed: 1.8, runSpeed: 3.2, radius: 0.4, cost: 5, firstNight: 4,
    hit: [], sight: 30, fov: 6.3, hearing: 0,
    attack: { damage: 9, range: 4.0, interval: 0.5 },
    breaks: false, trapEffect: 'none', incorporeal: true,
    desc: 'A gap in the dark the size of a person. Lights die when it passes.',
    lore: 'Seeks out powered lights and snuffs them. Almost invisible to the eye, but plain on camera. Bullets pass through. Hold a flashlight beam on it to drive it off; three times and it is gone for the night. Cannot abide cold iron.',
  },
};

export const CREATURE_IDS = Object.keys(CREATURES);
