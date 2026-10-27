// Per-creature behaviour. Each brain drives its creature through a small set
// of states using shared helpers on Creature and the simulation.
import { CROPS } from '../../data/crops.js';
import { BUILDINGS, WORLD } from '../../data/layout.js';
import { damagePlot, plotOwned } from '../farming.js';
import { damageStructure, displayName, lightProps, generatorRunning } from '../structures.js';
import { wrapAngle, clamp } from '../../core/math.js';

const away = (c, fromX, fromZ, dist) => {
  const a = Math.atan2(c.x - fromX, c.z - fromZ) + (Math.random() - 0.5) * 0.8;
  return { x: c.x + Math.sin(a) * dist, z: c.z + Math.cos(a) * dist };
};

// ---------------------------------------------------------------------------
// GNAWER - pack crop raider
// ---------------------------------------------------------------------------
export const gnawerBrain = {
  pickPlot(c) {
    const sim = c.sim, st = sim.state;
    const pack = c.pack;
    const starving = pack && pack.hunger > 160;
    const bold = pack && pack.alive() >= 3;
    const scarecrows = st.structures.filter((s) => s.type === 'scarecrow' && s.hp > 0);
    let best = null, bestScore = 0;
    for (const p of st.plots) {
      if (!p.crop || p.dead || !plotOwned(st, p) || p.stage < 1) continue;
      if (p.claimedBy && p.claimedBy !== c.id && sim.creatureById(p.claimedBy)?.alive) continue;
      const lit = sim.lightAt(p.x, p.z);
      if (lit > c.def.lightFear && !starving) continue;
      if (!bold && !starving && scarecrows.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 9)) continue;
      const appeal = CROPS[p.crop].gnawerAppeal * (0.4 + p.stage * 0.2) * p.health;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      const score = appeal / (1 + d / 40) * (lit > 0.3 ? 0.4 : 1) * (0.8 + Math.random() * 0.4);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    // A bold pack tears down the scarecrow guarding the richest field
    if (!best && bold && scarecrows.length) {
      const s = scarecrows.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
      return { scarecrow: s };
    }
    return best ? { plot: best } : null;
  },

  think(c, dt) {
    const sim = c.sim;
    // full: it has taken its share and goes back to the trees
    if ((c.eaten || 0) >= c.def.appetite) { if (c.targetPlot) c.targetPlot.claimedBy = null; c.retreat(dt); return; }
    if (c.pack) c.pack.hunger += dt;
    const sees = c.seesPlayer();
    const pd = c.distToPlayer();
    const bold = c.pack && c.pack.alive() >= 3 && c.hp > c.def.hp * 0.6;
    // react to the player
    if (sees && pd < 12 && c.state !== 'flee') {
      if (bold && pd < 9) c.setState('attack');
      else if (c.state !== 'attack') { c.setState('flee'); c.fleeFrom = { x: sim.state.player.x, z: sim.state.player.z }; }
    }
    // light suddenly too bright (flare thrown on them)
    if (c.state === 'feed' && sim.lightAt(c.x, c.z) > c.def.lightFear + 0.15 && !(c.pack && c.pack.hunger > 160)) {
      c.setState('flee'); c.fleeFrom = { x: c.x + 0.1, z: c.z };
    }

    switch (c.state) {
      case 'approach': case 'roam': {
        if (!c.targetPlot || c.targetPlot.dead || !c.targetPlot.crop || c.stateT > 40) {
          if (c.targetPlot) c.targetPlot.claimedBy = null;
          const pick = this.pickPlot(c);
          c.targetPlot = pick?.plot || null;
          c.targetScarecrow = pick?.scarecrow || null;
          if (c.targetPlot) c.targetPlot.claimedBy = c.id;
          c.stateT = 0;
          if (!pick) { // nothing to eat: circle the farm edge
            if (!c.wander || Math.hypot(c.wander.x - c.x, c.wander.z - c.z) < 3) {
              const a = Math.atan2(c.x, c.z) + (Math.random() - 0.5) * 1.4;
              const r = 60 + Math.random() * 30;
              c.wander = { x: Math.sin(a) * r, z: Math.cos(a) * r };
            }
            c.moveTo(c.wander.x, c.wander.z, c.def.speed, dt, 2);
            return;
          }
        }
        if (c.targetScarecrow) {
          const s = c.targetScarecrow;
          if (s.hp <= 0) { c.targetScarecrow = null; return; }
          if (c.moveTo(s.x, s.z, c.def.runSpeed * 0.7, dt, 1.4) <= 1.4) {
            c.attackCd -= dt;
            if (c.attackCd <= 0) { c.attackCd = 1; c.anim.attack = 1; damageStructure(sim, s, 12, c); }
          }
          return;
        }
        const p = c.targetPlot;
        const d = c.moveTo(p.x, p.z, c.def.speed * (Math.hypot(p.x - c.x, p.z - c.z) > 25 ? 1.6 : 1), dt, 0.9);
        if (d <= 0.9) c.setState('feed');
        return;
      }
      case 'feed': {
        const p = c.targetPlot;
        if (!p || !p.crop || p.dead) { c.setState('approach'); return; }
        c.speed = 0;
        c.anim.mode = 'feed';
        const before = p.health;
        damagePlot(sim, p, c.def.cropDamage * dt, c);
        c.eaten = (c.eaten || 0) + (before - p.health);
        if (c.pack) c.pack.hunger = 0;
        if (Math.random() < dt * 0.4) sim.events.emit('sfx', { id: 'gnaw', x: c.x, z: c.z });
        if (p.dead) { p.claimedBy = null; c.targetPlot = null; c.setState('approach'); }
        return;
      }
      case 'flee': {
        if (!c.fleeTo) c.fleeTo = away(c, c.fleeFrom?.x ?? c.x, c.fleeFrom?.z ?? c.z, 18);
        c.moveTo(c.fleeTo.x, c.fleeTo.z, c.def.runSpeed, dt, 1.5);
        if (c.stateT > 5) { c.fleeTo = null; c.setState('approach'); }
        return;
      }
      case 'attack': {
        const p = sim.state.player;
        c.moveTo(p.x, p.z, c.def.runSpeed, dt, c.def.attack.range * 0.8);
        if (c.tryAttackPlayer(dt)) { c.fleeFrom = { x: p.x, z: p.z }; c.setState('flee'); }
        if (c.stateT > 8 || !sim.playerAlive) c.setState('approach');
        return;
      }
      default: c.setState('approach');
    }
  },

  onDamaged(c) {
    const p = c.sim.state.player;
    c.fleeFrom = { x: p.x, z: p.z };
    c.fleeTo = null;
    c.setState('flee');
    // the rest of the pack scatters too if it's small
    if (c.pack && c.pack.alive() < 3) for (const m of c.pack.members) if (m !== c && m.alive && m.state !== 'flee') { m.fleeFrom = c.fleeFrom; m.setState('flee'); }
  },
};

// ---------------------------------------------------------------------------
// DRIFTER - drawn to light, engines and noise; smashes them
// ---------------------------------------------------------------------------
export const drifterBrain = {
  pickTarget(c) {
    const sim = c.sim, st = sim.state;
    let best = null, bestScore = 0;
    for (const s of st.structures) {
      let w = 0;
      if (s.hp <= 0) continue;
      if (s.type === 'floodlight' && s.powered && s.bulb !== false && s.on !== false) w = 1.0;
      else if (s.type === 'generator' && generatorRunning(sim, s)) w = 0.85;
      else if (s.type === 'decoy' && s.activeUntil > sim.clockSeconds) w = 3;
      else if (s.type === 'camera' && s.powered) w = 0.3;
      if (!w) continue;
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d > 90) continue;
      const score = w / (1 + d / 25);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (!best && sim.rt.housePowered) {
      const door = st.structures.find((s) => s.id === 'door_house');
      if (door && door.hp > 0) best = door;
    }
    return best;
  },

  think(c, dt) {
    const sim = c.sim, p = sim.state.player;
    const sees = c.seesPlayer();
    if (sees) c.lastSeen = { x: p.x, z: p.z, t: c.now };
    const heard = sim.recentNoiseFor(c, 70);
    if (heard) c.heard = heard;
    c.anim.mode = 'walk';

    // chase the player when seen close, or when provoked
    if (sees && (c.distToPlayer() < 16 || c.provoked)) c.setState('chase');

    switch (c.state) {
      case 'chase': {
        if (!c.lastSeen || c.now - c.lastSeen.t > 9) { c.provoked = false; c.setState('search'); return; }
        const tx = sees ? p.x : c.lastSeen.x, tz = sees ? p.z : c.lastSeen.z;
        c.moveTo(tx, tz, c.def.runSpeed, dt, c.def.attack.range * 0.8);
        c.tryAttackPlayer(dt);
        return;
      }
      case 'search': {
        const at = c.heard && c.now - c.heard.t < 20 ? c.heard : c.lastSeen;
        if (!at || c.stateT > 14) { c.setState('approach'); return; }
        if (!c.searchPt) c.searchPt = { x: at.x + (Math.random() - 0.5) * 8, z: at.z + (Math.random() - 0.5) * 8 };
        if (c.moveTo(c.searchPt.x, c.searchPt.z, c.def.speed, dt, 1.2) < 1.2) c.searchPt = null;
        return;
      }
      default: {
        if (c.heard && c.now - c.heard.t < 6 && c.heard.kind !== 'generator') {
          c.investigate = c.heard; c.heard = null; c.setState('investigate'); return;
        }
        if (c.state === 'investigate') {
          const t = c.investigate;
          if (!t || c.moveTo(t.x, t.z, c.def.speed * 1.2, dt, 2) < 2 || c.stateT > 25) c.setState('approach');
          return;
        }
        // approach / smash lit things
        if (!c.target || c.target.hp <= 0 || c.stateT > 30 || (c.target.type === 'floodlight' && !c.target.powered)) {
          c.target = this.pickTarget(c);
          c.stateT = 0;
        }
        const t = c.target;
        if (!t) {
          const h = BUILDINGS.farmhouse;
          c.moveTo(h.x + 4, h.z + 9, c.def.speed, dt, 3);
          return;
        }
        const reach = t.type === 'generator' ? 1.6 : t.type === 'door' ? 1.0 : 1.2;
        if (c.moveTo(t.x, t.z, c.def.speed, dt, reach + c.radius) <= reach + c.radius + 0.1) c.attackStructure(t, dt);
      }
    }
  },
  onDamaged(c) {
    c.provoked = true;
    c.setState('chase');
  },
};

// ---------------------------------------------------------------------------
// ANTLERED - charges the things that fence the land
// ---------------------------------------------------------------------------
export const antleredBrain = {
  pickTarget(c) {
    const sim = c.sim, st = sim.state;
    let best = null, bestScore = 0;
    for (const s of st.structures) {
      if (s.hp <= 0) continue;
      let w = 0;
      if (s.type === 'generator') w = generatorRunning(sim, s) ? 1.4 : 0.9;
      else if (s.type === 'door' && s.building === 'barn') w = 0.8;
      else if (s.type === 'barricade') w = 0.6;
      else if (s.type === 'fence') w = 0.45;
      else if (s.type === 'pole') w = 0.5;
      else if (s.type === 'pump') w = 0.35;
      if (!w) continue;
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      const score = w / (1 + d / 35) * (0.85 + Math.random() * 0.3);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  },

  think(c, dt) {
    const sim = c.sim, p = sim.state.player;
    const sees = c.seesPlayer();
    const pd = c.distToPlayer();
    c.anim.mode = c.state === 'charge' ? 'run' : 'walk';
    if (c.hp < c.def.hp * 0.4 && !c.fled) { c.fled = true; c.setState('flee'); }

    switch (c.state) {
      case 'flee': {
        if (!c.fleeTo) c.fleeTo = away(c, p.x, p.z, 45);
        c.moveTo(c.fleeTo.x, c.fleeTo.z, c.def.runSpeed * 0.5, dt, 3);
        if (c.stateT > 40) { c.fleeTo = null; c.hp = Math.min(c.def.hp * 0.7, c.hp + 120); c.setState('approach'); }
        return;
      }
      case 'windup': {
        c.speed = 0;
        const t = c.chargeTarget;
        c.yaw += clamp(wrapAngle(Math.atan2(t.x - c.x, t.z - c.z) - c.yaw), -dt * 3, dt * 3);
        if (c.stateT > 1.25) {
          const a = c.yaw;
          c.chargeDir = { x: Math.sin(a), z: Math.cos(a) };
          c.chargeDist = 0;
          c.setState('charge');
          sim.events.emit('sfx', { id: 'antler_charge', x: c.x, z: c.z });
        }
        return;
      }
      case 'charge': {
        const step = c.def.runSpeed * dt;
        const nx = c.x + c.chargeDir.x * step, nz = c.z + c.chargeDir.z * step;
        c.chargeDist += step;
        // hit player?
        if (sim.playerAlive && Math.hypot(p.x - nx, p.z - nz) < c.radius + 0.6 && !c.hitPlayer) {
          c.hitPlayer = true;
          sim.damagePlayer(c.def.attack.damage, c, { knock: { x: c.chargeDir.x * 6, z: c.chargeDir.z * 6 } });
        }
        // hit structure?
        const cell = sim.nav.idx(nx + c.chargeDir.x * c.radius, nz + c.chargeDir.z * c.radius);
        const s = cell >= 0 ? sim.nav.structureAt(cell) : null;
        const blockedStatic = cell < 0 || sim.nav.blocked[cell];
        if ((s && s.hp > 0 && s.blocksNav && !s.open) || blockedStatic || c.chargeDist > 32) {
          if (s && s.hp > 0) { damageStructure(sim, s, c.def.attack.structDamage, c); sim.events.emit('sfx', { id: 'crash', x: nx, z: nz }); }
          else if (blockedStatic && c.chargeDist < 32) sim.events.emit('sfx', { id: 'crash', x: nx, z: nz });
          // also damage the target if we stopped next to it
          const t = c.chargeTarget;
          if (t && t !== s && t.hp > 0 && Math.hypot(t.x - c.x, t.z - c.z) < c.radius + 2.2) damageStructure(sim, t, c.def.attack.structDamage, c);
          c.stunUntil = c.now + 2.4;
          c.hitPlayer = false;
          sim.emitNoise(c.x, c.z, 40, 'crash');
          c.setState('approach');
          return;
        }
        const res = sim.world.resolveCircle(nx, nz, c.radius * 0.8, c.y + 0.3, c.y + 2, (col) => col.tag !== 'structure');
        if (Math.hypot(res.x - nx, res.z - nz) > 0.05) { c.stunUntil = c.now + 2.4; c.setState('approach'); sim.events.emit('sfx', { id: 'crash', x: nx, z: nz }); return; }
        c.x = res.x; c.z = res.z;
        c.speed = c.def.runSpeed;
        return;
      }
      default: {
        // player who shot it becomes the target
        const huntPlayer = c.provoked && sees && pd < 22;
        if (!c.target || c.target.hp <= 0 || c.stateT > 45) { c.target = this.pickTarget(c); c.stateT = 0; }
        const t = huntPlayer ? p : c.target;
        if (!t) { c.moveTo(0, 0, c.def.speed, dt, 8); return; }
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        const lineClear = d < 26 && d > 5 && sim.nav.sightLine(c.x, c.z, t.x, t.z) > 0.5;
        if (lineClear && (c.chargeCd || 0) <= c.now) {
          c.chargeTarget = { x: t.x, z: t.z };
          c.chargeCd = c.now + 6;
          c.setState('windup');
          sim.events.emit('sfx', { id: 'antler_snort', x: c.x, z: c.z });
          return;
        }
        if (huntPlayer) { c.moveTo(p.x, p.z, c.def.speed * 1.4, dt, c.def.attack.range); c.tryAttackPlayer(dt); return; }
        if (c.moveTo(t.x, t.z, c.def.speed, dt, c.radius + 1.4) <= c.radius + 1.5) c.attackStructure(t, dt);
      }
    }
  },
  onDamaged(c) { c.provoked = true; },
};

// ---------------------------------------------------------------------------
// PALE FARMHAND - moves only when unobserved, avoids light, hunts the farmer
// ---------------------------------------------------------------------------
export const paleBrain = {
  think(c, dt) {
    const sim = c.sim, p = sim.state.player;
    const pd = c.distToPlayer();
    const observed = sim.playerObserves(c);
    c.observed = observed;
    c.anim.mode = 'walk';

    // Watcher variant: stands at the treeline, leaves when stared at or approached
    if (c.opts.watcher) {
      c.speed = 0;
      c.facePlayer(dt);
      if (observed) c.staredT = (c.staredT || 0) + dt;
      if (c.staredT > 2.2 || pd < 30 || c.stateT > 150) {
        if (!c.leaving) { c.leaving = true; c.leaveT = 0; }
      }
      if (c.leaving) {
        c.leaveT += dt;
        if (!observed || c.leaveT > 1.2) { c.despawn('vanished'); sim.events.emit('sfx', { id: 'pale_vanish', x: c.x, z: c.z }); }
      }
      return;
    }

    // flashlight beam on it up close makes it recoil
    if (c.inBeam && pd < 15) { c.beamT += dt; if (c.beamT > 1.2) { c.beamT = 0; c.setState('recoil'); sim.events.emit('sfx', { id: 'pale_hiss', x: c.x, z: c.z }); } }
    else c.beamT = Math.max(0, c.beamT - dt * 0.5);

    if (observed && c.state !== 'retreatHurt' && c.state !== 'recoil') {
      c.speed = 0;            // frozen while watched
      c.facePlayer(dt * 0.3);
      c.anim.mode = 'still';
      return;
    }

    switch (c.state) {
      case 'recoil': {
        if (!c.fleeTo) c.fleeTo = away(c, p.x, p.z, 28);
        c.moveTo(c.fleeTo.x, c.fleeTo.z, c.def.runSpeed, dt, 2);
        if (c.stateT > 18) { c.fleeTo = null; c.setState('stalk'); }
        return;
      }
      case 'retreatHurt': {
        if (!c.fleeTo) {
          const a = Math.atan2(c.x, c.z);
          c.fleeTo = { x: Math.sin(a) * (WORLD.forestInner + 12), z: Math.cos(a) * (WORLD.forestInner + 12) };
        }
        c.moveTo(c.fleeTo.x, c.fleeTo.z, c.def.runSpeed, dt, 3);
        if (c.stateT > 100) { c.fleeTo = null; c.hp = Math.min(c.def.hp, c.hp + c.def.hp * 0.3); c.setState('stalk'); }
        return;
      }
      case 'afterAttack': {
        if (!c.fleeTo) c.fleeTo = away(c, p.x, p.z, 22);
        c.moveTo(c.fleeTo.x, c.fleeTo.z, c.def.runSpeed, dt, 2);
        if (c.stateT > 14) { c.fleeTo = null; c.setState('stalk'); }
        return;
      }
      default: {
        // Player in light: wait at the edge of darkness, close as it dares
        const playerLit = sim.lightAt(p.x, p.z) > c.def.lightFear;
        const indoors = sim.playerIndoors();
        if (indoors && !sim.rt.housePowered) {
          const door = sim.state.structures.find((s) => s.id === 'door_house');
          if (door && door.hp > 0 && !door.open) {
            if (c.moveTo(door.x, door.z + 1.4, c.def.runSpeed, dt, 1.0) <= 1.1) c.attackStructure(door, dt);
            return;
          }
        }
        if (playerLit || (indoors && sim.rt.housePowered)) {
          // stand in the dark watching
          if (!c.waitPt || c.stateT > 20) {
            c.waitPt = sim.darkPointNear(p.x, p.z, 16, 26, c.def.lightFear) || { x: c.x, z: c.z };
            c.stateT = 0;
          }
          if (c.moveTo(c.waitPt.x, c.waitPt.z, c.def.runSpeed, dt, 1) < 1.2) { c.speed = 0; c.facePlayer(dt); c.anim.mode = 'still'; }
          if (Math.random() < dt * 0.05 && pd < 30) sim.events.emit('sfx', { id: 'pale_click', x: c.x, z: c.z });
          return;
        }
        // Hunt: close in while unobserved
        c.moveTo(p.x, p.z, c.def.runSpeed, dt, c.def.attack.range * 0.8);
        if (pd < 22 && Math.random() < dt * 0.25) sim.events.emit('sfx', { id: 'pale_step', x: c.x, z: c.z });
        if (c.tryAttackPlayer(dt)) c.setState('afterAttack');
      }
    }
  },
  onDamaged(c) {
    if (c.hp < c.def.hp * 0.5) c.setState('retreatHurt');
    else c.setState('recoil');
  },
};

// ---------------------------------------------------------------------------
// HOLLOW - snuffs lights, mimics sounds, banished by sustained light
// ---------------------------------------------------------------------------
export const hollowBrain = {
  pickLight(c) {
    const sim = c.sim;
    let best = null, bd = Infinity;
    for (const s of sim.state.structures) {
      if (s.type !== 'floodlight' || !s.powered || s.hp <= 0 || s.bulb === false || s.on === false) continue;
      if (sim.ironNear(s.x, s.z)) continue;
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  },

  think(c, dt) {
    const sim = c.sim, p = sim.state.player;
    const pd = c.distToPlayer();
    c.anim.mode = 'drift';
    // visibility to the naked eye: faint, stronger in the flashlight beam
    c.visibility = 0.06 + (c.inBeam ? 0.55 : 0) + (pd < 6 ? 0.15 : 0);

    // banishing
    const need = sim.state.owned.focus ? 1.2 : 2.0;
    if (c.inBeam && pd < (sim.state.owned.focus ? 24 : 18)) {
      c.beamT += dt;
      if (Math.random() < dt * 3) sim.events.emit('sfx', { id: 'hollow_burn', x: c.x, z: c.z });
      if (c.beamT >= need) { this.banish(c); return; }
    } else c.beamT = Math.max(0, c.beamT - dt * 0.7);

    // iron pushes it away
    if (sim.ironNear(c.x, c.z)) {
      const iron = sim.nearestIron(c.x, c.z);
      const a = Math.atan2(c.x - iron.x, c.z - iron.z);
      c.x += Math.sin(a) * dt * 3; c.z += Math.cos(a) * dt * 3;
      return;
    }

    // mimicry
    c.mimicT = (c.mimicT ?? 30 + Math.random() * 30) - dt;
    if (c.mimicT <= 0 && pd < 60) {
      c.mimicT = 35 + Math.random() * 45;
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 6;
      sim.events.emit('sfx', { id: 'mimic', x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, variant: Math.floor(Math.random() * 3) });
    }

    // chill the player when close
    if (pd < c.def.attack.range && sim.playerAlive) {
      c.attackCd -= dt;
      if (c.attackCd <= 0) { c.attackCd = c.def.attack.interval; sim.damagePlayer(c.def.attack.damage, c, { chill: true }); }
    }

    // drift toward lights, or the player if near
    if (pd < 16 && sim.playerAlive) { c.moveTo(p.x, p.z, c.def.speed, dt, 2.5); return; }
    if (!c.target || !c.target.powered || c.target.bulb === false || c.target.hp <= 0) { c.target = this.pickLight(c); c.drainT = 0; }
    const t = c.target;
    if (!t) { c.moveTo(p.x, p.z, c.def.speed, dt, 10); return; }
    if (c.moveTo(t.x, t.z, c.def.speed, dt, 7) <= 7.5) {
      c.speed = 0;
      c.drainT = (c.drainT || 0) + dt;
      t.flickerUntil = sim.clockSeconds + 0.5;
      if (c.drainT > 3.2) {
        t.bulb = false;
        t.hp = Math.max(1, Math.round(t.hp * 0.7));
        sim.events.emit('sfx', { id: 'bulb_pop', x: t.x, z: t.z });
        sim.events.emit('structureChanged', t);
        sim.events.emit('powerChanged');
        sim.alert(`${displayName(t)} went dark`, t);
        sim.nightLog('lightsBlown', 1);
        c.target = null;
      }
    }
  },

  banish(c) {
    const sim = c.sim;
    c.banished = (c.banished || 0) + 1;
    c.beamT = 0;
    sim.events.emit('sfx', { id: 'hollow_banish', x: c.x, z: c.z });
    sim.events.emit('hollowBanished', { c });
    if (c.banished >= 3) { c.despawn('banished'); sim.notify('The Hollow is gone for tonight.', 'good'); return; }
    // reappear elsewhere later
    c.hiddenUntil = sim.clockSeconds + 45 + Math.random() * 35;
    const a = Math.random() * Math.PI * 2;
    const r = WORLD.spawnRingMin;
    c.x = Math.sin(a) * r; c.z = Math.cos(a) * r;
    c.path = null; c.target = null;
  },
};

export const BRAINS = { gnawer: gnawerBrain, drifter: drifterBrain, antlered: antleredBrain, pale: paleBrain, hollow: hollowBrain };
