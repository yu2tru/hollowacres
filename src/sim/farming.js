// Crop growth, watering, planting and harvesting. Pure logic over state.plots.
import { CROPS } from '../data/crops.js';
import { FIELDS, PLOT_PITCH, PLOT_SIZE } from '../data/layout.js';
import { clamp } from '../core/math.js';

export function stageFor(plot) {
  if (!plot.crop) return 0;
  const c = CROPS[plot.crop];
  const f = plot.growth / c.growHours;
  if (f >= 1) return 4;
  if (f >= 0.7) return 3;
  if (f >= 0.35) return 2;
  if (f >= 0.08) return 1;
  return 0;
}

export function fieldOf(plot) { return FIELDS.find((f) => f.id === plot.field); }

export function plotOwned(state, plot) {
  return state.owned.parcels.includes(fieldOf(plot).parcel);
}

export function plotAt(state, x, z) {
  for (const f of FIELDS) {
    const lx = x - f.x0, lz = z - f.z0;
    if (lx < 0 || lz < 0) continue;
    const c = Math.floor(lx / PLOT_PITCH), r = Math.floor(lz / PLOT_PITCH);
    if (c >= f.cols || r >= f.rows) continue;
    // must be on the bed itself, not the path between
    const ox = lx - c * PLOT_PITCH - PLOT_PITCH / 2, oz = lz - r * PLOT_PITCH - PLOT_PITCH / 2;
    if (Math.abs(ox) > PLOT_SIZE / 2 + 0.15 || Math.abs(oz) > PLOT_SIZE / 2 + 0.15) continue;
    return state.plots.find((p) => p.field === f.id && p.row === r && p.col === c) || null;
  }
  return null;
}

// Row of plots (for tool upgrades): the plot plus its neighbours along the
// axis the player is facing more across.
export function plotRow(state, plot, yaw, width) {
  if (width <= 1) return [plot];
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const alongCols = Math.abs(fz) > Math.abs(fx); // facing along z -> row spans columns
  const out = [plot];
  for (const d of [-1, 1]) {
    const r = alongCols ? plot.row : plot.row + d;
    const c = alongCols ? plot.col + d : plot.col;
    const p = state.plots.find((q) => q.field === plot.field && q.row === r && q.col === c);
    if (p) out.push(p);
  }
  return out;
}

export function updatePlots(sim, dtHours) {
  const { state } = sim;
  const raining = sim.weatherDef().rain > 0;
  let changed = false;
  for (const p of state.plots) {
    if (!plotOwned(state, p)) continue;
    const c = p.crop ? CROPS[p.crop] : null;
    if (raining) p.moisture = Math.min(1, p.moisture + dtHours * 0.5 * sim.weatherDef().rain);
    const decay = (c ? c.water : 0.6) / 22;
    p.moisture = Math.max(0, p.moisture - decay * dtHours);
    if (!c || p.dead) continue;
    const prevStage = p.stage;
    if (p.moisture > 0 && p.stage < 4) {
      const rate = 0.5 + 0.5 * p.health;
      p.growth = Math.min(c.growHours, p.growth + dtHours * rate);
    }
    // slow recovery of lightly damaged, watered crops
    if (p.health < 1 && p.health > 0.25 && p.moisture > 0) p.health = Math.min(1, p.health + dtHours * 0.004);
    // ripe crops left unharvested slowly spoil after 2 days
    if (p.stage === 4) {
      p.ripeHours = (p.ripeHours || 0) + dtHours;
      if (p.ripeHours > 48) p.health = Math.max(0.3, p.health - dtHours * 0.01);
    }
    p.stage = stageFor(p);
    if (p.stage !== prevStage) { changed = true; sim.events.emit('plotChanged', p); }
  }
  if (changed) sim.refreshTallCrops();
}

export function canPlant(state, plot) {
  if (!plotOwned(state, plot)) return 'You don\'t own this field yet';
  if (plot.dead) return 'Clear the ruined crop first';
  if (plot.crop) return 'Already planted';
  return null;
}

export function plant(sim, plot, cropId) {
  const { state } = sim;
  const err = canPlant(state, plot);
  if (err) return err;
  if ((state.inv.seeds[cropId] || 0) <= 0) return `No ${CROPS[cropId].name.toLowerCase()} seeds`;
  state.inv.seeds[cropId]--;
  state.stats.planted = (state.stats.planted || 0) + 1;
  Object.assign(plot, { crop: cropId, growth: 0, stage: 0, health: 1, harvests: 0, dead: false, ripeHours: 0, starter: false });
  sim.events.emit('plotChanged', plot);
  return null;
}

export function water(sim, plot) {
  if (!plotOwned(sim.state, plot)) return 'You don\'t own this field yet';
  plot.moisture = 1;
  sim.state.stats.watered = (sim.state.stats.watered || 0) + 1;
  sim.events.emit('plotChanged', plot);
  return null;
}

export function fertilize(sim, plot) {
  const { state } = sim;
  if (!plotOwned(state, plot)) return 'You don\'t own this field yet';
  if (plot.fert > 0) return 'Already fertilized';
  if ((state.inv.fertilizer || 0) <= 0) return 'No fertilizer';
  state.inv.fertilizer--;
  plot.fert = 1;
  sim.events.emit('plotChanged', plot);
  return null;
}

export function yieldOf(state, plot) {
  const c = CROPS[plot.crop];
  if (!c || plot.dead) return 0;
  const q = plot.health * plot.soil * (1 + (plot.fert ? 0.3 : 0));
  return Math.max(plot.health > 0.2 ? 1 : 0, Math.round(c.yield * q));
}

export function harvest(sim, plot) {
  const { state } = sim;
  if (!plot.crop) return { err: 'Nothing planted' };
  if (plot.dead) return { err: 'Ruined - nothing to harvest' };
  if (plot.stage < 4) return { err: 'Not ripe yet' };
  const c = CROPS[plot.crop];
  const n = yieldOf(state, plot);
  const room = sim.packRoom();
  if (room <= 0) return { err: 'Your pack is full - store produce in the barn or sell it' };
  const take = Math.min(n, room);
  state.inv.produce[plot.crop] = (state.inv.produce[plot.crop] || 0) + take;
  state.stats.harvested += take;
  const lost = n - take;
  if (c.regrowHours > 0 && plot.harvests < 3) {
    plot.harvests++;
    plot.growth = c.growHours - c.regrowHours;
    plot.ripeHours = 0;
  } else {
    Object.assign(plot, { crop: null, growth: 0, harvests: 0, fert: 0, ripeHours: 0, health: 1 });
  }
  plot.stage = stageFor(plot);
  sim.events.emit('plotChanged', plot);
  sim.events.emit('harvest', { plot, crop: c.id, qty: take });
  sim.refreshTallCrops();
  return { qty: take, crop: c.id, lost };
}

export function clearPlot(sim, plot) {
  if (!plot.crop && !plot.dead) return 'Nothing to clear';
  Object.assign(plot, { crop: null, growth: 0, stage: 0, dead: false, health: 1, harvests: 0, fert: 0, ripeHours: 0 });
  sim.events.emit('plotChanged', plot);
  sim.refreshTallCrops();
  return null;
}

export function damagePlot(sim, plot, amount, source) {
  if (!plot.crop || plot.dead) return false;
  plot.health = clamp(plot.health - amount, 0, 1);
  if (plot.health <= 0.08) {
    plot.dead = true;
    plot.health = 0;
    sim.nightLog('cropsLost', 1, { crop: plot.crop });
    sim.events.emit('plotDestroyed', { plot, source });
  }
  sim.events.emit('plotChanged', plot);
  if (plot.dead) sim.refreshTallCrops();
  return true;
}

export function runSprinklers(sim) {
  const { state } = sim;
  const sprinklers = state.structures.filter((s) => s.type === 'sprinkler' && s.hp > 0);
  let n = 0;
  for (const s of sprinklers) {
    const R = 4.6;
    for (const p of state.plots) {
      if (Math.hypot(p.x - s.x, p.z - s.z) <= R && plotOwned(state, p)) { p.moisture = 1; n++; sim.events.emit('plotChanged', p); }
    }
  }
  return n;
}

export function plotInfo(plot) {
  if (plot.dead) return { title: `${CROPS[plot.crop]?.name || 'Crop'} (ruined)`, lines: ['Destroyed. Clear the plot to replant.'] };
  if (!plot.crop) return { title: 'Tilled plot', lines: [`Soil ${(plot.soil * 100) | 0}%`, plot.moisture > 0 ? 'Damp' : 'Dry', plot.fert ? 'Fertilized' : ''].filter(Boolean) };
  const c = CROPS[plot.crop];
  const pct = Math.floor((plot.growth / c.growHours) * 100);
  return {
    title: c.name,
    lines: [
      plot.stage === 4 ? 'Ripe - ready to harvest' : `${pct}% grown`,
      plot.moisture > 0 ? `Watered (${Math.round(plot.moisture * 100)}%)` : 'Needs water - not growing',
      plot.health < 0.98 ? `Health ${Math.round(plot.health * 100)}%` : '',
    ].filter(Boolean),
  };
}
