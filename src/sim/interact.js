// Focus detection (what the player is looking at) and context interactions.
import { FIXTURES, LANDMARKS, BUILDINGS } from '../data/layout.js';
import { CROPS } from '../data/crops.js';
import { LORE, STAKES } from '../data/lore.js';
import { heightAt } from './terrain.js';
import { eyePos, viewDir, currentTool, harvestAction, worldRayDist } from './player.js';
import * as farming from './farming.js';
import { displayName, needsRepair, repairCost, defOf, tankSize } from './structures.js';
import { totalProduce } from './economy.js';

const REACH = 2.9;

function fixtureY(name, f) {
  const fh = BUILDINGS.farmhouse;
  const house = ['bed', 'desk', 'monitor', 'table', 'drawer'].includes(name);
  const base = house ? fh.baseY + fh.floor : heightAt(f.x, f.z);
  const off = { bed: 0.55, desk: 0.95, monitor: 1.15, table: 0.9, drawer: 0.95, shippingBin: 0.7, mailbox: 1.1, storage: 0.9, workbench: 1.0, ledgerCrate: 0.8 }[name] ?? 0.9;
  return base + off;
}

export function interactables(sim) {
  const out = [];
  for (const [name, f] of Object.entries(FIXTURES)) {
    if (name === 'well') continue; // the pump structure handles it
    out.push({ kind: 'fixture', id: name, x: f.x, y: fixtureY(name, f), z: f.z, r: name === 'bed' ? 1.0 : 0.6 });
  }
  for (const l of LANDMARKS) {
    const stake = l.id.startsWith('stake');
    const lz = stake ? l.z - 0.9 : l.z;
    out.push({ kind: 'landmark', id: l.id, x: l.x, y: heightAt(l.x, lz) + (stake ? 1.05 : 1.0), z: lz, r: stake ? 0.5 : 0.9 });
  }
  for (const s of sim.state.structures) {
    const def = defOf(s);
    let y = heightAt(s.x, s.z), r = 0.7;
    if (s.type === 'door') { y = BUILDINGS[s.building].baseY + (BUILDINGS[s.building].floor || 0) + 1.2; r = s.building === 'barn' ? 2.0 : 0.8; }
    else if (s.type === 'floodlight' || s.type === 'pole') { y += 1.4; r = 0.55; }
    else if (s.type === 'camera') { y += 1.6; r = 0.5; }
    else if (s.type === 'trap' || s.type === 'sprinkler' || s.type === 'decoy') { y += 0.25; r = 0.6; }
    else if (s.type === 'barricade' || s.type === 'fence') { y += 0.8; r = (s.len || def.w) / 2; }
    else y += (def.h || 1) * 0.6;
    out.push({ kind: 'structure', id: s.id, ref: s, x: s.x, y, z: s.z, r });
  }
  return out;
}

export function computeFocus(sim) {
  const p = sim.state.player;
  const o = eyePos(sim), d = viewDir(p);
  let best = null;
  for (const c of interactables(sim)) {
    const vx = c.x - o.x, vy = c.y - o.y, vz = c.z - o.z;
    const t = vx * d.x + vy * d.y + vz * d.z;
    const reach = c.kind === 'structure' ? REACH + 0.8 : REACH;
    if (t < 0 || t > reach + c.r) continue;
    const px = vx - d.x * t, py = vy - d.y * t, pz = vz - d.z * t;
    const perp = Math.hypot(px, py * 0.8, pz);
    if (perp > c.r + 0.15) continue;
    const score = t + perp * 1.5;
    if (!best || score < best.score) best = { ...c, score, t };
  }
  if (best) {
    // occlusion: ignore the focused structure's own collider
    const ownCol = best.ref ? sim.rt.cols.get(best.ref.id) : null;
    const hit = sim.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, Math.max(0, best.t - 0.35),
      (c) => c !== ownCol && c.tag !== 'furniture' && c.tag !== 'porch');
    if (hit) best = null;
  }
  // plots: march the view ray to the ground
  let plot = null;
  if (d.y < -0.05) {
    const maxT = Math.min(4.8, worldRayDist(sim, o, d, 4.8, true));
    for (let t = 0.6; t <= maxT; t += 0.1) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= heightAt(x, z) + 0.2) { plot = farming.plotAt(sim.state, x, z); break; }
    }
  }
  if (plot && (!best || best.kind === 'structure' && best.t > 2.2)) return describePlot(sim, plot);
  if (best) {
    const f = describe(sim, best);
    // nothing to say or do (e.g. an intact fence): no prompt
    if (!f.e && !f.lmb && !f.lines.length && f.kind === 'structure') return null;
    return f;
  }
  return null;
}

function describePlot(sim, plot) {
  const info = farming.plotInfo(plot);
  const tool = currentTool(sim);
  const st = sim.state;
  const f = { kind: 'plot', ref: plot, title: info.title, lines: info.lines, e: null, lmb: null };
  if (!farming.plotOwned(st, plot)) { f.title = `${farming.fieldOf(plot).name} (not owned)`; f.lines = ['Buy this land from the laptop']; return f; }
  if (plot.dead) f.e = 'Clear ruined crop';
  else if (plot.stage === 4 && plot.crop) f.e = `Harvest${st.owned.sickle ? ' row' : ''}`;
  if (tool === 'can') f.lmb = st.player.water > 0 ? `Water${st.owned.can2 ? ' row' : ''} (${st.player.water} left)` : 'Can empty - refill at pump';
  if (tool === 'seeds' && !plot.crop && !plot.dead) {
    const c = CROPS[st.player.seedType];
    f.lmb = (st.inv.seeds[st.player.seedType] || 0) > 0 ? `Plant ${c.name.toLowerCase()} (${st.inv.seeds[st.player.seedType]})` : 'No seeds of this type';
    f.q = 'Change seed';
  }
  if (tool === 'fertilizer' && !plot.fert) f.lmb = `Fertilize (${st.inv.fertilizer || 0})`;
  if (tool === 'shovel' && plot.dead) f.lmb = 'Dig out';
  return f;
}

function describe(sim, c) {
  const st = sim.state;
  const f = { kind: c.kind, id: c.id, ref: c.ref, title: '', lines: [], e: null, lmb: null };
  if (c.kind === 'fixture') {
    switch (c.id) {
      case 'bed': {
        const m = st.time.minute;
        f.title = 'Bed';
        if (sim.isNight() || m >= 18 * 60) { f.lines = ['Not with that noise outside.']; }
        else { f.e = 'Sleep until 6 PM (saves game)'; }
        break;
      }
      case 'desk': f.title = 'Laptop'; f.lines = ['Feed & Supply · Market · Contracts · Land']; f.e = 'Use laptop'; break;
      case 'monitor': f.title = 'Security monitor'; f.e = 'View cameras'; f.lines = [`${st.structures.filter((s) => s.type === 'camera').length} cameras installed`]; break;
      case 'table': f.title = 'Letter'; f.e = 'Read'; break;
      case 'drawer': f.title = 'Dresser drawer'; f.e = st.lore.found.includes('drawer') ? 'Read note again' : 'Open'; break;
      case 'shippingBin': f.title = 'Shipping bin'; f.lines = [`Carrying ${totalProduce(st.inv.produce)} produce`]; f.e = 'Sell produce'; break;
      case 'mailbox': f.title = 'Mailbox'; f.e = st.lore.unread.length ? `Read mail (${st.lore.unread.length} new)` : 'Check mail'; break;
      case 'storage': f.title = 'Barn storage'; f.lines = [`${totalProduce(st.barn.produce)} / ${sim.barnCapacity()} stored`]; f.e = 'Open storage'; break;
      case 'workbench': f.title = 'Workbench'; f.lines = ['Property status & repairs']; f.e = 'Inspect property'; break;
      case 'ledgerCrate': f.title = 'Old ledger'; f.e = 'Read'; break;
    }
    return f;
  }
  if (c.kind === 'landmark') {
    const l = LANDMARKS.find((q) => q.id === c.id);
    f.title = l.name;
    if (STAKES.includes(c.id)) {
      const driven = st.lore.stakes[c.id];
      f.lines = [driven ? 'The iron stake is driven home.' : 'An old stone post. The iron stake in it is loose.'];
      if (!driven) f.e = 'Drive the stake home';
    } else if (c.id === 'stone') {
      const read = st.lore.found.includes('stone');
      f.e = read ? null : 'Examine';
      if (read) {
        const stakes = STAKES.filter((k) => st.lore.stakes[k]).length;
        if (st.lore.rite === 'done') f.lines = ['The stone is quiet.'];
        else if (st.lore.rite === 'active') f.lines = ['It is done. Get back to the farm and survive the night.'];
        else if (stakes < 4) f.lines = [`Stakes driven: ${stakes} / 4`];
        else if (!st.inv.produce.pumpkin && !st.barn.produce.pumpkin) f.lines = ['Bring the first fruit: a pumpkin.'];
        else { f.e = 'Perform the rite (offer a pumpkin)'; f.lines = ['Begins the final night. Prepare first.']; }
        if (!f.e) f.e = 'Read the inscription';
      }
    } else {
      f.e = st.lore.found.includes(c.id) ? 'Read again' : 'Search';
    }
    return f;
  }
  // structures
  const s = c.ref;
  const def = defOf(s);
  f.title = displayName(s);
  const hpPct = Math.round((s.hp / s.maxHp) * 100);
  if (s.hp <= 0) f.lines.push('Destroyed');
  else if (s.hp < s.maxHp) f.lines.push(`Condition ${hpPct}%`);
  if (s.type === 'floodlight') {
    if (s.bulb === false) f.lines.push('Bulb blown');
    f.lines.push(s.powered ? 'Powered' : s.network ? 'No power (generator off/empty or overloaded)' : 'Not connected - build a pole or generator nearby');
  }
  if (s.type === 'camera') f.lines.push(s.powered ? `${s.name} · online` : `${s.name} · no power`);
  if (s.type === 'generator') f.lines.push(`Fuel ${s.fuel.toFixed(1)} / ${tankSize(st)} L · ${s.mode.toUpperCase()}`);
  if (s.type === 'trap') f.lines.push(s.armed ? 'Armed' : 'Sprung');
  if (s.type === 'door') f.e = s.hp <= 0 ? null : s.open ? 'Close' : 'Open';
  else if (s.type === 'pump') { f.title = 'Well pump'; f.e = s.hp > 0 ? 'Refill watering can' : null; f.lines.push(`Can: ${st.player.water}/${st.owned.can2 ? 24 : 12}`); }
  else if (s.type === 'trap' && !s.armed) f.e = 'Rearm (1 spare part)';
  else if (s.type === 'decoy') f.e = s.activeUntil > sim.clockSeconds ? null : 'Switch on broadcast';
  else if (s.type !== 'fence') f.e = 'Manage';
  if (needsRepair(s)) {
    const cost = repairCost(s);
    const mats = Object.entries(cost.mats).map(([k, v]) => `${v} ${k === 'parts' ? 'parts' : 'lumber'}`).join(', ');
    f.lmbHold = currentTool(sim) === 'hammer';
    f.lines.push(`Repair: ${mats}${cost.money ? `, $${cost.money}` : ''}`);
    if (currentTool(sim) === 'hammer') f.lmb = 'Hold to repair';
    else f.lines.push('Equip the hammer (6) to repair');
  }
  return f;
}

export function doInteract(sim, f) {
  if (!f) return;
  const st = sim.state;
  if (f.kind === 'plot') {
    const plot = f.ref;
    if (plot.dead) { farming.clearPlot(sim, plot); sim.events.emit('sfx', { id: 'dig', x: plot.x, z: plot.z }); return; }
    if (plot.stage === 4 && plot.crop) harvestAction(sim, plot);
    return;
  }
  if (f.kind === 'fixture') {
    switch (f.id) {
      case 'bed': if (f.e) sim.sleep(); return;
      case 'desk': sim.openUI('laptop'); return;
      case 'monitor': sim.openUI('cameras'); return;
      case 'table': sim.discover('realtor'); return;
      case 'drawer': sim.discover('drawer'); return;
      case 'shippingBin': sim.openUI('sell'); return;
      case 'mailbox': sim.readMail(); return;
      case 'storage': sim.openUI('storage'); return;
      case 'workbench': sim.openUI('property'); return;
      case 'ledgerCrate': sim.discover('ledger'); return;
    }
    return;
  }
  if (f.kind === 'landmark') {
    if (STAKES.includes(f.id)) { sim.driveStake(f.id); return; }
    if (f.id === 'stone') {
      if (!st.lore.found.includes('stone')) { sim.discover('stone'); return; }
      if (f.e && f.e.startsWith('Perform')) { sim.performRite(); return; }
      sim.discover('stone');
      return;
    }
    const loreId = Object.keys(LORE).find((k) => LORE[k].at === f.id);
    if (loreId) sim.discover(loreId);
    return;
  }
  const s = f.ref;
  if (!s) return;
  switch (s.type) {
    case 'door':
      if (s.hp <= 0) return;
      s.open = !s.open;
      sim.syncStructure(s);
      sim.events.emit('sfx', { id: s.open ? 'door_open' : 'door_close', x: s.x, z: s.z, big: s.building === 'barn' });
      sim.events.emit('structureChanged', s);
      return;
    case 'pump': {
      if (s.hp <= 0) { sim.notify('The pump is broken - repair it with the hammer', 'warn'); return; }
      st.player.water = st.owned.can2 ? 24 : 12;
      sim.events.emit('sfx', { id: 'pump', x: s.x, z: s.z });
      sim.notify('Watering can filled', 'info', { quiet: true });
      return;
    }
    case 'trap':
      if (!s.armed) {
        if ((st.inv.parts || 0) < 1) { sim.notify('Need 1 spare part to rearm', 'warn'); return; }
        st.inv.parts--; s.armed = true; sim.events.emit('structureChanged', s); sim.events.emit('sfx', { id: 'trap_set', x: s.x, z: s.z });
        return;
      }
      sim.openUI('structure', s); return;
    case 'decoy':
      if (s.activeUntil <= sim.clockSeconds) { s.activeUntil = sim.clockSeconds + 90; sim.events.emit('decoyOn', s); sim.notify('Broadcast on for 90 seconds', 'info'); }
      return;
    case 'fence': return;
    default: sim.openUI('structure', s);
  }
}
