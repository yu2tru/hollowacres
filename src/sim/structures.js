// Buildable & fixed structures: placement, collision, damage, repair,
// the electrical network and the light field used by AI perception.
import { BUILDABLES, FIXED_STRUCTURES } from '../data/buildables.js';
import { BUILDINGS, PARCELS, FIELDS, PLOT_PITCH } from '../data/layout.js';
import { pointInRect, clamp } from '../core/math.js';
import { heightAt, slopeAt, isInPond } from './terrain.js';
import { makeStructure } from './state.js';
import { farmLevel } from './economy.js';

export function defOf(s) { return BUILDABLES[s.type] || FIXED_STRUCTURES[s.type]; }
export function displayName(s) {
  const d = defOf(s);
  if (s.type === 'door') return s.building === 'barn' ? 'Barn door' : 'Farmhouse door';
  if (s.type === 'solar') return `Solar panels (row ${s.id.split('_')[1]})`;
  if (s.level > 0 && d.upgrade) return d.upgrade.name;
  if (s.type === 'generator' && s.id === 'gen_main') return 'Main generator';
  return d.name;
}

export function lightProps(s) {
  const d = BUILDABLES.floodlight;
  return s.level > 0 ? d.upgrade.light : d.light;
}
export function powerDraw(s) {
  if (s.type === 'floodlight') return s.level > 0 ? BUILDABLES.floodlight.upgrade.power : 1;
  if (s.type === 'camera') return 1;
  return 0;
}

// --- collider attachment ---------------------------------------------------
export function footprint(type, x, z, rot, extra = {}) {
  const d = BUILDABLES[type] || FIXED_STRUCTURES[type];
  if (type === 'floodlight' || type === 'pole' || type === 'camera' || type === 'chimes')
    return { kind: 'circle', x, z, r: 0.28 };
  if (type === 'scarecrow') return { kind: 'circle', x, z, r: 0.25 };
  if (type === 'firepit') return { kind: 'circle', x, z, r: 0.9 };
  const w = extra.len || d.w;
  return { kind: 'box', x, z, hw: w / 2, hd: d.d / 2, rot };
}

export function attachStructure(sim, s) {
  detachStructure(sim, s);
  const def = defOf(s);
  let shape, y0, y1;
  if (s.type === 'door') {
    const b = BUILDINGS[s.building];
    const dp = b.doorPos;
    shape = { kind: 'box', x: dp.x, z: dp.z, hw: dp.width / 2 + 0.05, hd: 0.12, rot: dp.rot };
    y0 = b.baseY; y1 = b.baseY + (b.floor || 0) + 2.25;
    s.x = dp.x; s.z = dp.z; s.rot = dp.rot;
  } else if (s.type === 'pump') {
    shape = { kind: 'circle', x: s.x, z: s.z, r: 0.45 };
    y0 = heightAt(s.x, s.z) - 0.5; y1 = y0 + 1.6;
  } else {
    shape = footprint(s.type, s.x, s.z, s.rot, { len: s.len });
    y0 = heightAt(s.x, s.z) - 0.3; y1 = y0 + (def.h || 1) + 0.3;
  }
  const solidType = !['trap', 'sprinkler', 'decoy'].includes(s.type);
  const col = sim.world.add(shape, { y0, y1, tag: 'structure', ref: s, opaque: false, solid: solidType });
  s.blocksNav = !!(def.blocks || s.type === 'door');
  s.breakable = !!def.breakable || s.type === 'door';
  if (s.type === 'firepit' || s.type === 'solar') s.blocksNav = true;
  sim.rt.cols.set(s.id, col);
  if (s.blocksNav) sim.nav.markStructure(s, col);
  syncStructureCollision(sim, s);
}

export function detachStructure(sim, s) {
  const col = sim.rt.cols.get(s.id);
  if (col) { sim.world.remove(col); sim.rt.cols.delete(s.id); }
  sim.nav.clearStructureCells(s);
}

// Broken or open structures stop blocking movement.
export function syncStructureCollision(sim, s) {
  const col = sim.rt.cols.get(s.id);
  if (!col) return;
  const broken = s.hp <= 0;
  if (s.type === 'door' || s.type === 'gate') col.enabled = !s.open && !broken;
  else if (['barricade', 'fence', 'coop'].includes(s.type)) col.enabled = !broken;
  else col.enabled = true;
}

// Closest point just outside a structure's footprint, from (x, z) - where a
// creature should stand to hit it.
export function approachPoint(s, x, z, gap = 0.9) {
  const d = defOf(s);
  const hw = (s.len || d.w || 1) / 2, hd = (d.d || 1) / 2;
  if (hw < 1.2 && hd < 1.2) return { x: s.x, z: s.z, r: Math.max(hw, hd) + gap };
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  const px = Math.max(-hw + 0.5, Math.min(hw - 0.5, lx));
  const pz = (lz >= 0 ? 1 : -1) * (hd + gap);
  return { x: s.x + px * c + pz * sn, z: s.z - px * sn + pz * c, r: 0.6 };
}

// --- placement --------------------------------------------------------------
export function ownedRectsContain(state, x, z, margin = 0) {
  return PARCELS.some((p) => state.owned.parcels.includes(p.id) &&
    pointInRect(x, z, { x0: p.rect.x0 + margin, x1: p.rect.x1 - margin, z0: p.rect.z0 + margin, z1: p.rect.z1 - margin }));
}

function onPlotBed(x, z, pad) {
  for (const f of FIELDS) {
    if (x < f.x0 - pad || z < f.z0 - pad || x > f.x0 + f.cols * PLOT_PITCH + pad || z > f.z0 + f.rows * PLOT_PITCH + pad) continue;
    return true;
  }
  return false;
}

export function canPlace(sim, type, x, z, rot) {
  const { state } = sim;
  const def = BUILDABLES[type];
  if (!def) return 'Unknown structure';
  if (def.level && farmLevel(state).level < def.level) return `Requires farm level ${def.level}`;
  if (def.requiresLore && !state.lore.found.includes(def.requiresLore)) return 'You don\'t know how to make this yet';
  if (!ownedRectsContain(state, x, z, 0.6)) return 'Must be on land you own';
  if (isInPond(x, z, 2)) return 'Too close to water';
  if (slopeAt(x, z) > 0.35) return 'Ground is too steep';
  const fieldOk = ['sprinkler', 'scarecrow', 'trap'].includes(type);
  if (!fieldOk && onPlotBed(x, z, 0.8)) return 'Can\'t build on crop fields';
  for (const b of Object.values(BUILDINGS)) {
    const dp = b.doorPos;
    if (dp && Math.hypot(x - dp.x, z - dp.z) < 3.2) return 'Would block a doorway';
  }
  const shape = footprint(type, x, z, rot);
  const r = shape.kind === 'circle' ? shape.r : Math.max(shape.hw, shape.hd);
  const g = heightAt(x, z);
  // overlap test: approximate box by sampling circles along its width
  const samples = [];
  if (shape.kind === 'circle') samples.push({ x, z, r: shape.r + 0.1 });
  else {
    const n = Math.max(1, Math.ceil(shape.hw / 0.4));
    for (let i = -n; i <= n; i++) {
      const t = (i / n) * shape.hw;
      samples.push({ x: x + Math.cos(rot) * t, z: z - Math.sin(rot) * t, r: Math.max(shape.hd, 0.25) + 0.05 });
    }
  }
  for (const smp of samples) {
    const hit = sim.world.overlapsCircle(smp.x, smp.z, smp.r, g + 0.05, g + 1.8, (c) => c.tag !== 'roof');
    if (hit) return hit.tag === 'structure' ? 'Overlaps another structure' : 'Something is in the way';
    // also refuse overlapping non-solid structures (traps, sprinklers)
    for (const s of state.structures) {
      if (['trap', 'sprinkler', 'decoy'].includes(s.type) && Math.hypot(s.x - smp.x, s.z - smp.z) < smp.r + 0.5) return 'Overlaps another structure';
    }
  }
  const p = state.player;
  if (Math.hypot(p.x - x, p.z - z) < r + 0.6 && type !== 'trap' && type !== 'sprinkler') return 'You\'re standing there';
  return null;
}

export function costOf(type) {
  const d = BUILDABLES[type];
  return { money: d.cost, mats: d.mats || {} };
}

export function affordable(state, cost) {
  if (state.money < cost.money) return 'Not enough money';
  for (const [k, v] of Object.entries(cost.mats)) if ((state.inv[k] || 0) < v) return `Need ${v} ${k === 'parts' ? 'spare parts' : k}`;
  return null;
}
function pay(state, cost) {
  state.money -= cost.money;
  for (const [k, v] of Object.entries(cost.mats)) state.inv[k] -= v;
}

export function place(sim, type, x, z, rot) {
  const err = canPlace(sim, type, x, z, rot) || affordable(sim.state, costOf(type));
  if (err) return { err };
  pay(sim.state, costOf(type));
  const s = makeStructure(type, x, z, rot);
  if (type === 'camera') s.name = `Cam ${sim.state.structures.filter((q) => q.type === 'camera').length + 1}`;
  if (type === 'generator') s.fuel = 0;
  sim.state.structures.push(s);
  attachStructure(sim, s);
  sim.state.stats.built++;
  sim.events.emit('structureAdded', s);
  sim.events.emit('powerChanged');
  return { s };
}

export function upgradeCost(s) {
  const d = defOf(s);
  if (!d.upgrade || s.level > 0) return null;
  return { money: d.upgrade.cost, mats: d.upgrade.mats || {} };
}

export function upgrade(sim, s) {
  const cost = upgradeCost(s);
  if (!cost) return 'No upgrade available';
  if (s.hp < s.maxHp) return 'Repair it first';
  const err = affordable(sim.state, cost);
  if (err) return err;
  pay(sim.state, cost);
  const d = defOf(s);
  s.level = 1;
  s.maxHp = d.upgrade.hp || s.maxHp;
  s.hp = s.maxHp;
  sim.events.emit('structureChanged', s);
  sim.events.emit('powerChanged');
  return null;
}

export function demolish(sim, s) {
  if (s.fixed) return 'This can\'t be removed';
  const d = defOf(s);
  sim.state.money += Math.round(d.cost * 0.4);
  detachStructure(sim, s);
  sim.state.structures = sim.state.structures.filter((q) => q !== s);
  sim.events.emit('structureRemoved', s);
  sim.events.emit('powerChanged');
  return null;
}

// --- damage & repair --------------------------------------------------------
export function damageStructure(sim, s, amount, source) {
  if (s.hp <= 0) return;
  const before = s.hp;
  s.hp = Math.max(0, s.hp - amount);
  s.lastHitAt = sim.clockSeconds;
  if (!s._loggedHit && sim.isNight()) { s._loggedHit = true; sim.nightLog('structuresHit', 1, { id: s.id }); }
  if (s.hp <= 0) {
    if (s.type === 'door' || s.type === 'gate') s.open = true;
    if (s.type === 'floodlight') s.bulb = false;
    syncStructureCollision(sim, s);
    sim.events.emit('structureDestroyed', { s, source });
    sim.alert(`${displayName(s)} destroyed`, s);
    sim.nightLog('structuresDestroyed', 1, { id: s.id, type: s.type });
    sim.events.emit('powerChanged');
  } else if (before > s.maxHp * 0.5 && s.hp <= s.maxHp * 0.5) {
    sim.alert(`${displayName(s)} is badly damaged`, s);
  }
  sim.events.emit('structureChanged', s);
}

export function needsRepair(s) {
  return s.hp < s.maxHp || (s.type === 'floodlight' && s.bulb === false);
}

export function repairCost(s) {
  const d = defOf(s);
  const missing = clamp(1 - s.hp / s.maxHp, 0, 1);
  const mat = d.repairMat || 'planks';
  let qty = Math.ceil(missing * (d.repairQty || (mat === 'planks' ? 3 : 2)) * (s.level > 0 ? 1.5 : 1));
  if (s.type === 'floodlight' && s.bulb === false) qty = Math.max(qty, 1);
  if (s.type === 'generator') qty = Math.max(qty, missing > 0 ? 1 : 0);
  const money = Math.round(missing * (d.cost || 60) * 0.15);
  return { money, mats: qty > 0 ? { [mat]: qty } : {} };
}

export function repair(sim, s) {
  if (!needsRepair(s)) return 'Not damaged';
  const cost = repairCost(s);
  const err = affordable(sim.state, cost);
  if (err) return err;
  pay(sim.state, cost);
  s.hp = s.maxHp;
  if (s.type === 'floodlight') s.bulb = true;
  if (s.type === 'door' || s.type === 'gate') s.open = false;
  s._loggedHit = false;
  syncStructureCollision(sim, s);
  sim.state.stats.repairs++;
  sim.events.emit('structureChanged', s);
  sim.events.emit('powerChanged');
  sim.events.emit('repaired', s);
  return null;
}

// --- power ------------------------------------------------------------------
export const HOUSE_CONSUMER = { id: 'house', type: 'house', get x() { return BUILDINGS.farmhouse.x; }, get z() { return BUILDINGS.farmhouse.z; } };

export function generatorRunning(sim, g) {
  if (g.hp <= 0 || (g.fuel || 0) <= 0) return false;
  if (g.mode === 'on') return true;
  if (g.mode === 'auto') { const m = sim.state.time.minute; return m >= 19 * 60 || m < 6 * 60 + 30; }
  return false;
}

export function tankSize(state) { return state.owned.bigtank ? 40 : 20; }

export const autoHours = (m) => m >= 19 * 60 || m < 6 * 60 + 30;
export function solarRunning(sim, s) { return s.type === 'solar' && s.hp > 0 && (s.charge || 0) > 0.05 && autoHours(sim.state.time.minute); }
export function sourceRunning(sim, s) { return s.type === 'generator' ? generatorRunning(sim, s) : solarRunning(sim, s); }
export function sourceCapacity(s) { return s.type === 'generator' ? BUILDABLES.generator.capacity : FIXED_STRUCTURES.solar.capacity; }

// Solar rows charge in daylight (less under cloud) and drain while feeding the grid.
export function updateSolar(sim, dtHours, sunLevel, cloud) {
  const cap = FIXED_STRUCTURES.solar.store;
  for (const s of sim.state.structures) {
    if (s.type !== 'solar' || s.hp <= 0) continue;
    if (sunLevel > 0.1) s.charge = Math.min(cap, (s.charge || 0) + dtHours * 1.1 * sunLevel * (1 - cloud * 0.7));
  }
}

export function computePower(sim) {
  const { state } = sim;
  const gens = state.structures.filter((s) => s.type === 'generator' || (s.type === 'solar' && s.hp > 0));
  const poles = state.structures.filter((s) => s.type === 'pole' && s.hp > 0);
  const nodes = [...gens, ...poles];
  const R = 26;
  // union-find over nodes
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) <= R) parent[find(i)] = find(j);
  }
  const nets = new Map();
  nodes.forEach((n, i) => {
    const k = find(i);
    if (!nets.has(k)) nets.set(k, { nodes: [], gens: [], capacity: 0, load: 0, consumers: [], overloaded: false });
    const net = nets.get(k);
    net.nodes.push(n);
    if (n.type === 'generator' || n.type === 'solar') {
      net.gens.push(n);
      if (sourceRunning(sim, n)) net.capacity += sourceCapacity(n);
    }
  });
  const networks = [...nets.values()].filter((n) => n.gens.length > 0);
  const consumers = state.structures.filter((s) => (s.type === 'floodlight' || s.type === 'camera'));
  const all = [...consumers, HOUSE_CONSUMER];
  for (const c of all) c.powered = false;
  for (const c of all) {
    let best = null, bd = Infinity;
    for (const net of networks) for (const n of net.nodes) {
      const d = Math.hypot(n.x - c.x, n.z - c.z);
      if (d <= R && d < bd) { bd = d; best = net; }
    }
    c.network = best;
    if (!best) continue;
    const working = c.type === 'house' || (c.hp > 0 && (c.type !== 'floodlight' || (c.on !== false && c.bulb !== false)));
    if (!working) continue;
    best.consumers.push(c);
    best.load += c.type === 'house' ? 1 : powerDraw(c);
  }
  for (const net of networks) {
    net.overloaded = net.load > net.capacity && net.capacity > 0;
    const live = net.capacity > 0 && !net.overloaded;
    for (const c of net.consumers) c.powered = live;
    if (net.overloaded && !net._warned) sim.alert('Breaker tripped: network overloaded. Add a generator or remove lights.');
  }
  sim.rt.networks = networks;
  sim.rt.housePowered = HOUSE_CONSUMER.powered;
  return networks;
}

export function burnFuel(sim, dtHours) {
  const nets = sim.rt.networks || [];
  for (const net of nets) {
    const running = net.gens.filter((g) => sourceRunning(sim, g));
    if (!running.length) continue;
    const loadEach = net.overloaded ? 0 : net.load / running.length;
    for (const g of running) {
      if (g.type === 'solar') {
        const before = g.charge;
        g.charge = Math.max(0, g.charge - dtHours * loadEach);
        if (before > 0.05 && g.charge <= 0.05) { sim.alert('Solar batteries are flat', g); sim.events.emit('powerChanged'); }
        continue;
      }
      const before = g.fuel;
      g.fuel = Math.max(0, g.fuel - dtHours * (0.32 + 0.17 * loadEach));
      if (before > 2 && g.fuel <= 2) sim.alert(`${displayName(g)} is low on fuel`, g);
      if (before > 0 && g.fuel <= 0) {
        sim.alert(`${displayName(g)} ran out of fuel - lights are going out`, g);
        sim.events.emit('powerChanged');
        sim.events.emit('sfx', { id: 'gen_stop', x: g.x, z: g.z });
      }
    }
  }
}

// --- lights (for perception) -------------------------------------------------
export function rebuildLightSources(sim) {
  const out = [];
  for (const s of sim.state.structures) {
    if (s.type !== 'floodlight' || !s.powered || s.hp <= 0 || s.bulb === false || s.on === false) continue;
    if (s.flickerUntil && s.flickerUntil > sim.clockSeconds && Math.sin(sim.clockSeconds * 37) > 0) continue;
    const L = lightProps(s);
    const aim = L.radius * 0.55;
    out.push({ x: s.x + Math.sin(s.rot) * aim, z: s.z + Math.cos(s.rot) * aim, radius: L.radius, intensity: L.intensity, src: s });
  }
  if (sim.rt.housePowered) {
    const h = BUILDINGS.farmhouse;
    out.push({ x: h.x, z: h.z, radius: 8.5, intensity: 0.75, src: HOUSE_CONSUMER });
    out.push({ x: h.x, z: h.z + h.d / 2 + 1.6, radius: 6, intensity: 0.7, src: HOUSE_CONSUMER }); // porch light
  }
  for (const s of sim.state.structures) {
    if (s.type === 'firepit' && s.lit) out.push({ x: s.x, z: s.z, radius: 9, intensity: 0.85, src: s, fire: true });
  }
  for (const f of sim.rt.flares) out.push({ x: f.x, z: f.z, radius: 10, intensity: 0.9, src: null, flare: true });
  sim.rt.lights = out;
}

export function artificialLightAt(sim, x, z) {
  let l = 0;
  for (const L of sim.rt.lights) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.radius) l = Math.max(l, L.intensity * (1 - (d / L.radius) ** 2));
  }
  return l;
}

// Full perceptual light level at a point (ambient + artificial).
export function lightAt(sim, x, z) {
  return Math.min(1.5, sim.ambient + artificialLightAt(sim, x, z));
}
