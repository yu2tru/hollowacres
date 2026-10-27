// Player movement, stamina, flashlight, weapons and tool use (simulation side).
import { WEAPONS } from '../data/items.js';
import { WORLD } from '../data/layout.js';
import { CROPS } from '../data/crops.js';
import { heightAt } from './terrain.js';
import { clamp } from '../core/math.js';
import * as farming from './farming.js';
import { repair, needsRepair, repairCost, affordable, displayName } from './structures.js';

export const EYE = 1.62, EYE_CROUCH = 1.05, RADIUS = 0.34;

export function viewDir(p) {
  const cp = Math.cos(p.pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}

export function updateMovement(sim, input, dt) {
  const p = sim.state.player;
  const rt = sim.rt.player;
  const crouch = !!input.crouch;
  rt.crouch = crouch;
  const canSprint = input.sprint && p.stamina > 1 && !crouch && (input.moveZ > 0.1);
  if (!canSprint && input.sprint && p.stamina <= 1) rt.exhausted = true;
  if (p.stamina > 25) rt.exhausted = false;
  const sprinting = canSprint && !rt.exhausted;
  rt.sprinting = sprinting;
  const base = crouch ? 1.7 : sprinting ? 6.0 : 3.6;
  const slowed = rt.chilledT > 0 ? 0.7 : 1;
  const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  let wx = fwd.x * input.moveZ + right.x * input.moveX;
  let wz = fwd.z * input.moveZ + right.z * input.moveX;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  const target = { x: wx * base * slowed, z: wz * base * slowed };
  const accel = rt.grounded ? 14 : 3;
  rt.vx += (target.x - rt.vx) * Math.min(1, accel * dt);
  rt.vz += (target.z - rt.vz) * Math.min(1, accel * dt);
  // knockback impulse
  if (rt.knock) { rt.vx += rt.knock.x; rt.vz += rt.knock.z; rt.knock = null; }

  // stamina
  if (sprinting && wl > 0.1) p.stamina = Math.max(0, p.stamina - dt * 17);
  else p.stamina = Math.min(100, p.stamina + dt * (crouch ? 16 : 11));

  // vertical
  if (input.jump && rt.grounded && !crouch && p.stamina > 8) { rt.vy = 4.4; rt.grounded = false; p.stamina -= 6; }
  rt.vy -= 17 * dt;

  // move in short sub-steps so fast movement or a long frame can't tunnel
  // through thin walls, fences or doors
  let nx = p.x, nz = p.z;
  const dx = rt.vx * dt, dz = rt.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) {
    const res = sim.world.resolveCircle(nx + dx / steps, nz + dz / steps, RADIUS, p.y + 0.32, p.y + (crouch ? 1.2 : 1.75));
    nx = res.x; nz = res.z;
  }
  // world bounds
  const r = Math.hypot(nx, nz);
  if (r > WORLD.playRadius) {
    nx *= WORLD.playRadius / r; nz *= WORLD.playRadius / r;
    if (!rt.boundWarned) { rt.boundWarned = true; sim.notify('The woods are too thick to go further.', 'info'); }
  } else if (r < WORLD.playRadius - 8) rt.boundWarned = false;

  const moved = Math.hypot(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz;
  let ny = p.y + rt.vy * dt;
  const ground = sim.world.groundAt(p.x, p.z, p.y);
  if (ny <= ground) {
    if (!rt.grounded && rt.vy < -7) sim.events.emit('sfx', { id: 'land', x: p.x, z: p.z });
    ny = ground; rt.vy = 0; rt.grounded = true;
  } else if (ny - ground > 0.05) rt.grounded = rt.vy <= 0 && ny - ground < 0.08;
  // walking down small steps/slopes: snap
  if (rt.grounded === false && rt.vy <= 0 && ny - ground < 0.35) { ny = ground; rt.vy = 0; rt.grounded = true; }
  p.y = ny;

  // footsteps & noise
  if (rt.grounded && moved > 0.001) {
    rt.stepDist += moved;
    const stride = sprinting ? 2.1 : crouch ? 1.1 : 1.6;
    if (rt.stepDist > stride) {
      rt.stepDist = 0;
      sim.events.emit('footstep', { x: p.x, z: p.z, surface: sim.surfaceAt(p.x, p.z), sprint: sprinting, crouch });
      if (sprinting) sim.emitNoise(p.x, p.z, 14, 'steps');
      else if (!crouch) sim.emitNoise(p.x, p.z, 4, 'steps');
    }
  }
  rt.speed = Math.hypot(rt.vx, rt.vz);
}

export function updateFlashlight(sim, dt) {
  const p = sim.state.player;
  if (!p.flashlight) return;
  const drain = sim.state.owned.focus ? 0.42 : 0.34;
  p.battery = Math.max(0, p.battery - dt * drain);
  if (p.battery <= 0) {
    if ((sim.state.inv.batteries || 0) > 0) {
      sim.state.inv.batteries--;
      p.battery = 100;
      sim.notify('Swapped in fresh batteries.', 'info');
      sim.events.emit('sfx', { id: 'battery' });
    } else {
      p.flashlight = false;
      sim.notify('Flashlight is dead. Buy batteries at Feed & Supply.', 'warn');
      sim.events.emit('sfx', { id: 'click' });
    }
  }
}

export function toggleFlashlight(sim) {
  const p = sim.state.player;
  if (!p.flashlight && p.battery <= 0) {
    if ((sim.state.inv.batteries || 0) > 0) { sim.state.inv.batteries--; p.battery = 100; }
    else { sim.notify('Flashlight batteries are dead.', 'warn'); return; }
  }
  p.flashlight = !p.flashlight;
  sim.events.emit('sfx', { id: 'click' });
}

// ---- hotbar ----------------------------------------------------------------
export function slotAvailable(sim, id) {
  const st = sim.state;
  switch (id) {
    case 'revolver': return !!st.owned.revolver;
    case 'shotgun': return !!st.owned.shotgun;
    case 'flare': return (st.inv.flares || 0) > 0;
    case 'medkit': return (st.inv.medkit || 0) > 0;
    case 'fertilizer': return (st.inv.fertilizer || 0) > 0;
    default: return true;
  }
}

export function currentTool(sim) {
  const slots = ['shovel', 'revolver', 'shotgun', 'can', 'seeds', 'hammer', 'flare', 'medkit', 'fertilizer'];
  return slots[(sim.state.player.slot || 1) - 1] || 'shovel';
}

export function selectSlot(sim, n) {
  const slots = ['shovel', 'revolver', 'shotgun', 'can', 'seeds', 'hammer', 'flare', 'medkit', 'fertilizer'];
  const id = slots[n - 1];
  if (!id) return;
  if (!slotAvailable(sim, id)) {
    const msg = { shotgun: 'You don\'t own a shotgun yet', flare: 'No flares', medkit: 'No first aid kits', fertilizer: 'No fertilizer' }[id];
    if (msg) sim.notify(msg, 'info');
    return;
  }
  if (sim.state.player.slot !== n) {
    sim.state.player.slot = n;
    sim.rt.weapon.reloading = 0;
    sim.rt.weapon.cd = Math.max(sim.rt.weapon.cd, 0.25);
    sim.events.emit('equip', { id });
  }
}

export function cycleSeed(sim, dir) {
  const st = sim.state;
  const ids = Object.keys(CROPS).filter((id) => !CROPS[id].animal && (st.inv.seeds[id] || 0) > 0);
  if (!ids.length) { sim.notify('No seeds. Buy some from the laptop in the house.', 'info'); return; }
  let i = ids.indexOf(st.player.seedType);
  i = (i + dir + ids.length) % ids.length;
  if (i < 0) i = 0;
  st.player.seedType = ids[i];
  sim.events.emit('seedChanged', ids[i]);
}

// ---- combat ----------------------------------------------------------------
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : -1);
}

export function eyePos(sim) {
  const p = sim.state.player;
  return { x: p.x, y: p.y + (sim.rt.player.crouch ? EYE_CROUCH : EYE), z: p.z };
}

// Where does a ray hit the static world/terrain? returns distance
export function worldRayDist(sim, o, d, maxT, ignoreStructures = false) {
  const hit = sim.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxT,
    (c) => c.tag !== 'furniture' && (!ignoreStructures || c.tag !== 'structure') && c.solid !== false);
  let t = hit ? hit.t : maxT;
  // terrain march
  for (let s = 0.5; s < t; s += 0.75) {
    if (o.y + d.y * s < heightAt(o.x + d.x * s, o.z + d.z * s)) { t = s; break; }
  }
  return t;
}

function castShot(sim, o, d, w, range) {
  const wallT = worldRayDist(sim, o, d, range);
  let best = null;
  for (const c of sim.creatures) {
    if (!c.alive || c.incorporeal || c.hiddenUntil > sim.clockSeconds) continue;
    for (const h of c.def.hit) {
      const t = raySphere(o, d, { x: c.x, y: c.y + h.y, z: c.z }, h.r);
      if (t >= 0 && t < wallT && (!best || t < best.t)) best = { t, c, h };
    }
  }
  // bullets pass through the Hollow but disturb it
  for (const c of sim.creatures) {
    if (c.type !== 'hollow' || !c.alive) continue;
    const t = raySphere(o, d, { x: c.x, y: c.y + 1.4, z: c.z }, 0.8);
    if (t >= 0 && t < wallT) sim.events.emit('hollowDisperse', { c });
  }
  if (best) {
    let dmg = w.damage * best.h.mult;
    if (w.pellets > 1) dmg *= clamp(1.25 - best.t / range, 0.3, 1.1);
    best.c.damage(dmg, 'player', { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t, head: best.h.mult > 1.5 });
    return { hit: true, t: best.t, c: best.c };
  }
  return { hit: false, t: wallT };
}

export function fire(sim, weaponId) {
  const w = WEAPONS[weaponId];
  const st = sim.state, p = st.player, rt = sim.rt.weapon;
  if (rt.cd > 0 || rt.reloading > 0) return;
  if ((p.mag[weaponId] || 0) <= 0) {
    sim.events.emit('sfx', { id: 'dryfire' });
    rt.cd = 0.3;
    if ((st.inv[w.ammo] || 0) > 0) startReload(sim, weaponId);
    else sim.notify(weaponId === 'revolver' ? 'Out of .38 rounds' : 'Out of shells', 'warn');
    return;
  }
  p.mag[weaponId]--;
  rt.cd = w.interval;
  const o = eyePos(sim);
  const base = viewDir(p);
  const spreadMul = (sim.rt.player.speed > 4 ? 2.2 : 1) * (sim.rt.aiming ? 0.5 : 1);
  const hits = [];
  for (let i = 0; i < w.pellets; i++) {
    const s = w.spread * spreadMul;
    const d = { x: base.x + (Math.random() - 0.5) * 2 * s, y: base.y + (Math.random() - 0.5) * 2 * s, z: base.z + (Math.random() - 0.5) * 2 * s };
    const l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l;
    const r = castShot(sim, o, d, w, w.range);
    hits.push({ ...r, end: { x: o.x + d.x * r.t, y: o.y + d.y * r.t, z: o.z + d.z * r.t } });
  }
  sim.emitNoise(p.x, p.z, w.noise, 'gunshot');
  sim.events.emit('shot', { weapon: weaponId, origin: o, hits });
  if (hits.some((h) => h.hit)) sim.events.emit('hitmarker', { kill: hits.some((h) => h.c && !h.c.alive) });
}

export function startReload(sim, weaponId) {
  const w = WEAPONS[weaponId];
  const st = sim.state, rt = sim.rt.weapon;
  if (rt.reloading > 0) return;
  if ((st.player.mag[weaponId] || 0) >= w.mag) return;
  if ((st.inv[w.ammo] || 0) <= 0) { sim.notify('No ammunition', 'warn'); return; }
  rt.reloading = w.reload;
  rt.reloadWeapon = weaponId;
  sim.events.emit('reload', { weapon: weaponId });
}

export function updateWeapon(sim, dt) {
  const rt = sim.rt.weapon, st = sim.state;
  rt.cd = Math.max(0, rt.cd - dt);
  if (rt.reloading > 0) {
    rt.reloading -= dt;
    if (rt.reloading <= 0) {
      const id = rt.reloadWeapon, w = WEAPONS[id];
      if (w.perShell) {
        if (st.inv[w.ammo] > 0 && st.player.mag[id] < w.mag) { st.inv[w.ammo]--; st.player.mag[id]++; sim.events.emit('sfx', { id: 'shell_in' }); }
        if (st.inv[w.ammo] > 0 && st.player.mag[id] < w.mag && currentTool(sim) === id) rt.reloading = w.reload;
        else rt.reloading = 0;
      } else {
        const need = w.mag - st.player.mag[id];
        const take = Math.min(need, st.inv[w.ammo] || 0);
        st.inv[w.ammo] -= take; st.player.mag[id] += take;
        rt.reloading = 0;
      }
    }
  }
}

export function melee(sim) {
  const rt = sim.rt.weapon;
  if (rt.cd > 0) return;
  const w = WEAPONS.shovel;
  rt.cd = w.interval;
  const p = sim.state.player;
  const f = viewDir(p);
  let best = null, bd = Infinity;
  for (const c of sim.creatures) {
    if (!c.alive || c.incorporeal) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) - c.radius;
    if (d > w.range) continue;
    const dot = (dx * f.x + dz * f.z) / Math.max(0.01, Math.hypot(dx, dz) * Math.hypot(f.x, f.z));
    if (dot < 0.55) continue;
    if (d < bd) { bd = d; best = c; }
  }
  sim.events.emit('swing', {});
  if (best) {
    best.damage(w.damage, 'player', { x: best.x, y: best.y + 1, z: best.z, melee: true });
    if (best.alive && best.type !== 'antlered') {
      const a = Math.atan2(best.x - p.x, best.z - p.z);
      const nx = best.x + Math.sin(a) * 0.7, nz = best.z + Math.cos(a) * 0.7;
      if (sim.nav.walkable(nx, nz, best)) { best.x = nx; best.z = nz; }
    }
    sim.emitNoise(p.x, p.z, w.noise, 'melee');
    sim.events.emit('hitmarker', { kill: !best.alive, melee: true });
  }
}

export function throwFlare(sim) {
  const st = sim.state, rt = sim.rt.weapon;
  if (rt.cd > 0 || (st.inv.flares || 0) <= 0) return;
  rt.cd = 0.8;
  st.inv.flares--;
  const o = eyePos(sim), d = viewDir(st.player);
  // simple ballistic estimate: ~14 m forward, stopped by walls
  const flat = { x: d.x, y: 0, z: d.z };
  const fl = Math.hypot(flat.x, flat.z) || 1;
  flat.x /= fl; flat.z /= fl;
  const dist = clamp(10 + d.y * 12, 4, 18);
  const t = worldRayDist(sim, o, { x: flat.x, y: -0.05, z: flat.z }, dist, false);
  const x = o.x + flat.x * Math.max(1, t - 0.5), z = o.z + flat.z * Math.max(1, t - 0.5);
  sim.rt.flares.push({ x, z, until: sim.clockSeconds + 75, born: sim.clockSeconds });
  sim.emitNoise(x, z, 30, 'flare');
  sim.events.emit('flareThrown', { x, z, from: o });
  if ((st.inv.flares || 0) <= 0) selectSlot(sim, 1);
}

export function useMedkit(sim) {
  const st = sim.state;
  if ((st.inv.medkit || 0) <= 0) return;
  if (st.player.health >= 100) { sim.notify('You\'re not hurt', 'info'); return; }
  st.inv.medkit--;
  st.player.health = Math.min(100, st.player.health + 60);
  sim.events.emit('sfx', { id: 'medkit' });
  sim.notify('Patched up (+60 health)', 'good');
  if (st.inv.medkit <= 0) selectSlot(sim, 1);
}

// LMB with a farming tool on the focused plot
export function useOnPlot(sim, plot, tool) {
  const st = sim.state;
  const yaw = st.player.yaw;
  if (tool === 'can') {
    if (st.player.water <= 0) return sim.notify('Watering can is empty - refill it at the well pump', 'warn');
    const row = farming.plotRow(st, plot, yaw, st.owned.can2 ? 3 : 1);
    let n = 0;
    for (const p of row) {
      if (st.player.water <= 0) break;
      if (!farming.plotOwned(st, p)) continue;
      farming.water(sim, p); st.player.water--; n++;
    }
    if (n) { sim.events.emit('sfx', { id: 'water', x: plot.x, z: plot.z }); sim.tutorialEvent('water'); }
    return;
  }
  if (tool === 'seeds') {
    const crop = st.player.seedType;
    if ((st.inv.seeds[crop] || 0) <= 0) { cycleSeed(sim, 1); return; }
    const row = farming.plotRow(st, plot, yaw, st.owned.seeder ? 3 : 1);
    let n = 0, lastErr = null;
    for (const p of row) {
      const err = farming.plant(sim, p, crop);
      if (!err) n++; else if (p === plot) lastErr = err;
    }
    if (n) { sim.events.emit('sfx', { id: 'plant', x: plot.x, z: plot.z }); sim.tutorialEvent('plant'); }
    else if (lastErr) sim.notify(lastErr, 'info');
    return;
  }
  if (tool === 'fertilizer') {
    const err = farming.fertilize(sim, plot);
    if (err) sim.notify(err, 'info'); else sim.events.emit('sfx', { id: 'plant', x: plot.x, z: plot.z });
    return;
  }
  if (tool === 'shovel') {
    if (plot.dead) { farming.clearPlot(sim, plot); sim.events.emit('sfx', { id: 'dig', x: plot.x, z: plot.z }); }
  }
}

export function harvestAction(sim, plot) {
  const st = sim.state;
  const row = farming.plotRow(st, plot, st.player.yaw, st.owned.sickle ? 3 : 1);
  let total = 0, crop = null, err = null;
  for (const p of row) {
    if (p.stage !== 4 || !p.crop || p.dead) continue;
    const r = farming.harvest(sim, p);
    if (r.err) { err = r.err; break; }
    total += r.qty; crop = r.crop;
  }
  if (total) {
    sim.events.emit('sfx', { id: 'harvest', x: plot.x, z: plot.z });
    sim.notify(`+${total} ${CROPS[crop].produce.toLowerCase()}`, 'good', { quiet: true });
    sim.tutorialEvent('harvest');
  } else if (err) sim.notify(err, 'warn');
}

// Hammer: hold on a damaged structure
export function updateRepair(sim, focus, held, dt) {
  const rt = sim.rt.player;
  if (!held || !focus || focus.kind !== 'structure' || !needsRepair(focus.ref)) { rt.repairT = 0; rt.repairTarget = null; return; }
  const s = focus.ref;
  if (rt.repairTarget !== s) { rt.repairTarget = s; rt.repairT = 0; }
  const cost = repairCost(s);
  const err = affordable(sim.state, cost);
  if (err) { if (rt.repairT === 0) sim.notify(err, 'warn'); rt.repairT = -999; return; }
  if (rt.repairT < 0) return;
  rt.repairT += dt;
  if (Math.random() < dt * 4) sim.events.emit('sfx', { id: 'hammer', x: s.x, z: s.z });
  const need = 1.4 + (s.maxHp > 150 ? 0.8 : 0);
  if (rt.repairT >= need) {
    const e = repair(sim, s);
    if (e) sim.notify(e, 'warn');
    else { sim.notify(`Repaired ${displayName(s).toLowerCase()}`, 'good'); sim.tutorialEvent('repair'); }
    rt.repairT = 0; rt.repairTarget = null;
  }
}
