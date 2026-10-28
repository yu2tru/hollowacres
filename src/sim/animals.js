// Chickens: wander the pen by day, roost in the coop at night, lay an egg
// each morning. A breached coop at night means losses.
import { PEN } from '../data/layout.js';
import { isNightTime } from './clock.js';
import { heightAt } from './terrain.js';

const MAX_EGGS = 40;
export const MAX_CHICKENS = 12;

function coopOf(sim) { return sim.state.structures.find((s) => s.type === 'coop'); }

export function syncChickens(sim) {
  const n = sim.state.animals.chickens;
  const list = sim.rt.chickens || (sim.rt.chickens = []);
  while (list.length < n) {
    list.push({ id: Math.random(), x: PEN.x0 + 3 + Math.random() * (PEN.x1 - PEN.x0 - 6), z: PEN.z0 + 5 + Math.random() * (PEN.z1 - PEN.z0 - 8), tx: 0, tz: 0, t: 0, peck: 0, yaw: Math.random() * 6 });
  }
  while (list.length > n) list.pop();
  return list;
}

export function chickensRoosting(sim) {
  const m = sim.state.time.minute;
  return isNightTime(m) || m >= 19 * 60;
}

export function updateAnimals(sim, dt) {
  const list = syncChickens(sim);
  const coop = coopOf(sim);
  const roost = chickensRoosting(sim) && coop && coop.hp > 0;
  for (const c of list) {
    c.t -= dt;
    c.peck = Math.max(0, c.peck - dt);
    if (roost) { c.tx = coop.x + (Math.random() - 0.5) * 0.5; c.tz = coop.z + 1.8; }
    else if (c.t <= 0) {
      c.t = 2 + Math.random() * 5;
      if (Math.random() < 0.4) { c.peck = 1.5; c.tx = c.x; c.tz = c.z; }
      else { c.tx = PEN.x0 + 1.5 + Math.random() * (PEN.x1 - PEN.x0 - 3); c.tz = PEN.z0 + 4.5 + Math.random() * (PEN.z1 - PEN.z0 - 6); }
    }
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    c.moving = d > 0.2;
    if (c.moving) {
      const sp = Math.min(d, dt * (roost ? 1.6 : 0.9));
      c.x += (dx / d) * sp; c.z += (dz / d) * sp;
      c.yaw = Math.atan2(dx, dz);
    }
    c.inside = roost && d < 0.4;
  }
}

export function layEggs(sim) {
  const a = sim.state.animals;
  a.eggs = Math.min(MAX_EGGS, (a.eggs || 0) + a.chickens);
}

export function collectEggs(sim) {
  const st = sim.state, a = st.animals;
  if (!a.eggs) return a.chickens ? 'No eggs yet - they lay in the morning' : 'No hens. Buy some at Feed & Supply.';
  const take = Math.min(a.eggs, sim.packRoom());
  if (take <= 0) return 'Your pack is full';
  a.eggs -= take;
  st.inv.produce.egg = (st.inv.produce.egg || 0) + take;
  sim.events.emit('sfx', { id: 'harvest', x: sim.state.player.x, z: sim.state.player.z });
  sim.notify(`+${take} eggs`, 'good', { quiet: true });
  return null;
}

// A creature that has broken into the coop takes a hen.
export function takeChicken(sim, by) {
  const a = sim.state.animals;
  if (a.chickens <= 0) return false;
  a.chickens--;
  syncChickens(sim);
  sim.nightLog('animalsLost', 1);
  sim.events.emit('sfx', { id: 'hen', x: by.x, z: by.z });
  sim.alert('Something is in the chicken coop', by);
  return true;
}

// Hit volume of a hen (centre height above ground, radius) - matches the model.
export const HEN_HIT = { y: 0.28, r: 0.24 };
export function henCentre(c) { return { x: c.x, y: heightAt(c.x, c.z) + HEN_HIT.y, z: c.z }; }

// A hen killed by the player (stray shot or otherwise).
export function killChicken(sim, c) {
  const list = sim.rt.chickens || [];
  const i = list.indexOf(c);
  if (i < 0 || sim.state.animals.chickens <= 0) return false;
  list.splice(i, 1);
  sim.state.animals.chickens--;
  const p = henCentre(c);
  sim.events.emit('sfx', { id: 'hen', x: c.x, z: c.z });
  sim.events.emit('henKilled', { x: p.x, y: p.y, z: p.z });
  sim.notify('You shot one of your hens.', 'warn');
  return true;
}
