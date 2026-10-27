// First-time player tutorial: a state machine of steps, each completed only
// by a real change in game state. Lives in the simulation so it is saved with
// the game and can be tested headlessly.
import { FIXTURES, FIELDS, BUILDINGS, PLOT_PITCH } from '../data/layout.js';
import { UPGRADES } from '../data/items.js';
import { needsRepair, displayName } from './structures.js';
import { CROPS } from '../data/crops.js';

const A = FIELDS[0];
const fieldCentre = { x: A.x0 + (A.cols * PLOT_PITCH) / 2, z: A.z0 + (A.rows * PLOT_PITCH) / 2 };
const ownedUpgrades = (st) => Object.keys(UPGRADES).filter((k) => st.owned[k]).length;
const gen = (st) => st.structures.find((s) => s.id === 'gen_main');
const starterPlots = (st) => st.plots.filter((p) => p.starter && p.crop && !p.dead && p.stage === 4);

// {k:action} in text is replaced by the bound key name; {k:slotN} by N.
export const STEPS = [
  {
    id: 'move', title: 'Find your feet',
    text: 'Move with {k:forward}{k:left}{k:back}{k:right} and look around with the mouse. Walk over to the kitchen table.',
    keys: [['forward', 'left', 'back', 'right'], 'Move', ['mouse'], 'Look', ['sprint'], 'Sprint'],
    target: () => ({ ...FIXTURES.table, label: 'Kitchen table' }),
    check: (sim) => Math.hypot(sim.state.player.x - FIXTURES.table.x, sim.state.player.z - FIXTURES.table.z) < 2.2,
  },
  {
    id: 'interact', title: 'Read the letter',
    text: 'Aim at the letter on the table. When its name appears under your crosshair, press {k:interact}.',
    keys: [['interact'], 'Interact'],
    target: () => ({ ...FIXTURES.table, label: 'Letter' }),
    check: (sim) => sim.state.lore.found.includes('realtor'),
  },
  {
    id: 'plant', title: 'Plant your first seeds',
    text: 'Go out the front door to the Home field, north-east of the house. Select seeds with {k:slot5}, aim at an empty plot and click to plant. {k:cycleSeed} switches seed type.',
    keys: [['slot5'], 'Seeds', ['lmb'], 'Plant', ['cycleSeed'], 'Seed type'],
    goal: 3, progress: (sim, base) => sim.state.stats.planted - base.planted,
    target: () => ({ ...fieldCentre, label: 'Home field' }),
    check: (sim, base) => sim.state.stats.planted - base.planted >= 3,
  },
  {
    id: 'water', title: 'Water them',
    text: 'Crops only grow while their soil is wet. Fill the watering can at the standpipe in the crop walkway ({k:interact}), select the can with {k:slot4} and click your plots.',
    keys: [['interact'], 'Fill can', ['slot4'], 'Can', ['lmb'], 'Water'],
    goal: 3, progress: (sim, base) => sim.state.stats.watered - base.watered,
    target: (sim) => (sim.state.player.water < 2 ? { ...FIXTURES.standpipe, label: 'Standpipe' } : { ...fieldCentre, label: 'Your plots' }),
    check: (sim, base) => sim.state.stats.watered - base.watered >= 3,
  },
  {
    id: 'grow', title: 'How crops grow', info: true,
    text: 'Watered crops grow day and night: wheat ripens in about a day and a half, potatoes in two and a half. A dry plot stops growing, and rain waters for you. Aim at any plot to see its state.',
    keys: [['enter'], 'Continue'],
    check: (sim) => sim.state.tutorial.ack === 'grow',
  },
  {
    id: 'harvest', title: 'Harvest and sell',
    text: 'The previous owner left some wheat that is ripe now. Press {k:interact} on it to harvest, then sell it at the shipping bin in front of the barn.',
    keys: [['interact'], 'Harvest / Sell'],
    target: (sim) => {
      const st = sim.state;
      const ripe = starterPlots(st)[0];
      if (ripe && !(st.inv.produce.wheat > 0)) return { x: ripe.x, z: ripe.z, label: 'Ripe wheat' };
      return { ...FIXTURES.shippingBin, label: 'Shipping bin' };
    },
    check: (sim, base) => sim.state.stats.sold > base.sold,
  },
  {
    id: 'upgrade', title: 'Buy an upgrade',
    text: 'Use the laptop on the desk in the house to open Hollis Feed & Supply. Buy the Galvanized watering can ($110): twice the water, and it soaks a row of three plots.',
    keys: [['interact'], 'Use laptop'],
    target: () => ({ ...FIXTURES.desk, label: 'Laptop' }),
    check: (sim, base) => ownedUpgrades(sim.state) > base.upgrades,
  },
  {
    id: 'power', title: 'Fuel the generator',
    text: 'At night, light keeps some creatures away. The generator in the fenced yard to the north-east powers the floodlights and the house. Press {k:interact} on it and choose Refuel.',
    keys: [['interact'], 'Manage generator'],
    target: (sim) => ({ x: gen(sim.state).x, z: gen(sim.state).z, label: 'Generator' }),
    check: (sim, base) => sim.state.tutorial.refuels > base.refuels || (gen(sim.state)?.fuel ?? 0) >= 17,
  },
  {
    id: 'defend', title: 'Build a defence',
    text: 'Press {k:build} for build mode. Pick a leg-hold trap or a barricade with the number keys and click to place it near your crops ({k:reload} rotates). Traps kill Gnawers outright.',
    keys: [['build'], 'Build mode', ['lmb'], 'Place', ['reload'], 'Rotate'],
    target: () => ({ ...fieldCentre, label: 'Near your crops' }),
    check: (sim, base) => sim.state.stats.built > base.built,
  },
  {
    id: 'night', title: 'Survive the night',
    text: 'At 8 PM things come out of the woods. Tonight it is a small pack of Gnawers after your crops. Stay near the lights, use the flashlight ({k:flashlight}) and revolver ({k:slot2}). They go back to the trees at first light. The bed skips to 6 PM.',
    keys: [['flashlight'], 'Flashlight', ['slot2'], 'Revolver', ['reload'], 'Reload'],
    check: (sim, base) => sim.state.stats.nights > base.nights,
  },
  {
    id: 'repair', title: 'Repair the damage',
    text: 'Damaged things stop working until fixed, and a broken fence is a way in. Equip the hammer ({k:slot6}), aim at something damaged and hold the mouse button. Repairs use lumber or spare parts.',
    keys: [['slot6'], 'Hammer', ['lmb'], 'Hold to repair'],
    target: (sim) => {
      const p = sim.state.player;
      let best = null, bd = Infinity;
      for (const s of sim.state.structures) if (needsRepair(s) && s.type !== 'solar') { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
      return best ? { x: best.x, z: best.z, label: displayName(best) } : null;
    },
    check: (sim, base) => sim.state.stats.repairs > base.repairs || !sim.state.structures.some((s) => needsRepair(s) && s.type !== 'solar'),
  },
  {
    id: 'free', title: 'The farm is yours', info: true,
    text: 'Farm, sell, expand, get ready before dusk, survive, repair - and read what the Hollis family left behind. {k:ledger} opens your ledger and journal, {k:map} the map, Esc the menu with controls and help.',
    keys: [['enter'], 'Start playing'],
    check: (sim) => sim.state.tutorial.ack === 'free',
  },
];

export function tutorialState(st) {
  const t = st.tutorial || (st.tutorial = {});
  if (t.step == null) t.step = 0;
  if (t.refuels == null) t.refuels = 0;
  return t;
}

function baseline(st) {
  return { planted: st.stats.planted || 0, watered: st.stats.watered || 0, sold: st.stats.sold || 0, built: st.stats.built || 0,
    repairs: st.stats.repairs || 0, nights: st.stats.nights || 0, upgrades: ownedUpgrades(st), refuels: st.tutorial.refuels || 0 };
}

export function tutorialActive(st) { const t = tutorialState(st); return !!t.active && !t.skipped && t.step < STEPS.length; }
export function currentStep(st) { return tutorialActive(st) ? STEPS[st.tutorial.step] : null; }

export function startTutorial(sim) {
  const t = tutorialState(sim.state);
  t.active = true; t.skipped = false; t.introSeen = true;
  if (!t.base) t.base = baseline(sim.state);
  sim.events.emit('tutorial', { step: t.step });
}

export function skipTutorial(sim) {
  const t = tutorialState(sim.state);
  t.skipped = true; t.introSeen = true;
  sim.events.emit('tutorial', { skipped: true });
}

export function acknowledge(sim) {
  const s = currentStep(sim.state);
  if (s?.info) { sim.state.tutorial.ack = s.id; updateTutorial(sim); }
}

// Called every tick from the simulation.
export function updateTutorial(sim) {
  const st = sim.state;
  if (!tutorialActive(st)) return;
  const t = st.tutorial;
  if (!t.base) t.base = baseline(st);
  let guard = 0;
  while (t.step < STEPS.length && guard++ < STEPS.length) {
    const step = STEPS[t.step];
    if (!step.check(sim, t.base)) break;
    sim.events.emit('tutorialStepDone', { step: t.step, id: step.id });
    t.step++;
    t.ack = null;
    t.base = baseline(st);
    if (t.step >= STEPS.length) { t.done = true; sim.events.emit('tutorial', { done: true }); break; }
    sim.events.emit('tutorial', { step: t.step });
  }
}

// The previous owner's last wheat: a few ripe plots so the harvest step can be
// done on day one with real crops.
export function plantStarterPatch(st) {
  const plots = st.plots.filter((p) => p.field === 'A' && p.row === 0 && p.col >= 3);
  for (const p of plots) Object.assign(p, { crop: 'wheat', growth: CROPS.wheat.growHours, stage: 4, moisture: 0.8, health: 1, starter: true });
}
