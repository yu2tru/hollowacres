// Shared creature runtime: movement along nav paths, structure breaking,
// perception helpers and damage. Behaviour lives in per-type brains.
import { CREATURES } from '../../data/creatures.js';
import { WORLD } from '../../data/layout.js';
import { heightAt } from '../terrain.js';
import { wrapAngle, moveTowardsAngle, clamp } from '../../core/math.js';
import { damageStructure, approachPoint } from '../structures.js';

let SEQ = 1;

export class Creature {
  constructor(sim, type, x, z, opts = {}) {
    this.sim = sim;
    this.id = SEQ++;
    this.type = type;
    this.def = CREATURES[type];
    this.x = x; this.z = z; this.y = heightAt(x, z);
    this.yaw = Math.atan2(-x, -z); // face the farm
    this.hp = this.def.hp;
    this.alive = true;
    this.state = 'approach';
    this.stateT = 0;
    this.path = null;
    this.goal = null;
    this.goalKey = '';
    this.repathT = 0;
    this.speed = 0;
    this.moveSpeed = this.def.speed;
    this.attackCd = 0;
    this.stunUntil = 0;
    this.pinnedUntil = 0;
    this.lastSeen = null;      // {x,z,t}
    this.heard = null;         // {x,z,t}
    this.breakTarget = null;
    this.progressT = 0;
    this.lastProgress = { x, z };
    this.stuckCount = 0;
    this.deadT = 0;
    this.anim = { phase: 0, attack: 0, hurt: 0, stun: 0, mode: 'walk' };
    this.incorporeal = !!this.def.incorporeal;
    this.breaks = !!this.def.breaks;
    this.breakOnly = this.def.breakOnly || null;
    this.radius = this.def.radius;
    this.seenByPlayer = false;
    this.unseenT = 0;
    this.opts = opts;
    this.pack = opts.pack || null;
    this.extraCost = null;
    this.visibility = 1;       // render opacity hint (Hollow)
    this.inBeam = false;
    this.beamT = 0;
  }

  get now() { return this.sim.clockSeconds; }

  setState(s) {
    if (this.state !== s) { this.state = s; this.stateT = 0; this.path = null; this.breakTarget = null; }
  }

  // Navigate toward (x,z). Returns distance remaining.
  moveTo(x, z, speed, dt, stopDist = 0.6) {
    const d = Math.hypot(x - this.x, z - this.z);
    if (d <= stopDist) { this.speed = 0; return d; }
    const key = `${Math.round(x / 2)},${Math.round(z / 2)}`;
    this.repathT -= dt;
    if (!this.path || key !== this.goalKey || this.repathT <= 0) {
      this.goalKey = key;
      this.repathT = 2.0 + Math.random() * 1.2;
      this.path = this.sim.nav.findPath(this.x, this.z, x, z, this) || [];
      if (!this.path.length && d < 3) this.path = [{ x, z }];
    }
    if (!this.path.length) {
      this.speed = 0;
      this.progressT += dt;
      if (this.progressT > 4) { this.progressT = 0; this.stuckCount++; }
      return d;
    }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.55 && this.path.length > 1) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return d;
    this.stepToward(wp.x, wp.z, speed, dt);
    return d;
  }

  stepToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) { this.speed = 0; return; }
    const want = Math.atan2(dx, dz);
    this.yaw = moveTowardsAngle(this.yaw, want, dt * (this.type === 'antlered' ? 2.2 : 5));
    // a breakable structure (barricade, fence, door) physically in our way?
    if (!this.incorporeal && this.breaks) {
      const ax = this.x + (dx / len) * 0.45, az = this.z + (dz / len) * 0.45;
      const hit = this.sim.world.overlapsCircle(ax, az, this.radius * 0.85, this.y + 0.3, this.y + 1.6,
        (c) => c.tag === 'structure' && c.ref && c.ref.breakable && c.ref.hp > 0 && !c.ref.open && (!this.breakOnly || this.breakOnly.includes(c.ref.type)));
      if (hit) { this.breakTarget = hit.ref; this.speed = 0; return; }
    }
    const step = Math.min(len, speed * dt);
    let nx = this.x + (dx / len) * step, nz = this.z + (dz / len) * step;
    if (!this.incorporeal) {
      const g = this.y;
      const n = Math.max(1, Math.ceil(step / 0.15));
      let px = this.x, pz = this.z;
      for (let i = 0; i < n; i++) {
        const p = this.sim.world.resolveCircle(px + (nx - this.x) / n, pz + (nz - this.z) / n, this.radius * 0.8, g + 0.3, g + 1.6,
          (c) => c.tag !== 'furniture' || this.type === 'pale');
        px = p.x; pz = p.z;
      }
      nx = px; nz = pz;
    } else {
      // incorporeal creatures still cannot pass building walls
      const p = this.sim.world.resolveCircle(nx, nz, 0.3, this.y + 0.5, this.y + 1.5, (c) => c.tag !== 'structure');
      nx = p.x; nz = p.z;
    }
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    this.speed = moved / Math.max(dt, 1e-4);
    // progress / stuck detection
    this.progressT += dt;
    if (this.progressT > 2.5) {
      const p = Math.hypot(this.x - this.lastProgress.x, this.z - this.lastProgress.z);
      if (p < 0.6) { this.stuckCount++; this.path = null; this.nudge(); }
      else this.stuckCount = Math.max(0, this.stuckCount - 1);
      this.progressT = 0;
      this.lastProgress = { x: this.x, z: this.z };
    }
  }

  nudge() {
    const a = Math.random() * Math.PI * 2;
    const nx = this.x + Math.sin(a) * 0.8, nz = this.z + Math.cos(a) * 0.8;
    if (this.sim.nav.walkable(nx, nz, this)) { this.x = nx; this.z = nz; }
  }

  // Hit whatever structure is in the way. Returns true while busy breaking.
  handleBreaking(dt) {
    const s = this.breakTarget;
    if (!s) return false;
    if (s.hp <= 0 || s.open) { this.breakTarget = null; this.path = null; return false; }
    const ap = approachPoint(s, this.x, this.z, 0);
    if (Math.hypot(ap.x - this.x, ap.z - this.z) > ap.r + this.radius + 3) { this.breakTarget = null; return false; }
    this.yaw = moveTowardsAngle(this.yaw, Math.atan2(s.x - this.x, s.z - this.z), dt * 4);
    this.speed = 0;
    this.attackCd -= dt;
    if (this.attackCd <= 0) {
      this.attackCd = this.def.attack.interval;
      this.anim.attack = 1;
      damageStructure(this.sim, s, this.def.attack.structDamage || 10, this);
      this.sim.events.emit('sfx', { id: 'smash', x: s.x, z: s.z, kind: s.type });
      this.sim.emitNoise(s.x, s.z, 25, 'smash');
    }
    return true;
  }

  attackStructure(s, dt) {
    this.breakTarget = s;
    return this.handleBreaking(dt);
  }

  // Simple attack on the player (range & cooldown checked)
  tryAttackPlayer(dt, mult = 1) {
    const p = this.sim.state.player;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    this.attackCd -= dt;
    if (d <= this.def.attack.range && this.attackCd <= 0 && Math.abs(p.y - this.y) < 2.2) {
      this.attackCd = this.def.attack.interval;
      this.anim.attack = 1;
      this.sim.damagePlayer(this.def.attack.damage * mult, this);
      return true;
    }
    return false;
  }

  distToPlayer() {
    const p = this.sim.state.player;
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  facePlayer(dt) {
    const p = this.sim.state.player;
    this.yaw = moveTowardsAngle(this.yaw, Math.atan2(p.x - this.x, p.z - this.z), dt * 4);
  }

  // Can this creature perceive the player right now? 0..1
  seesPlayer() {
    const sim = this.sim, p = sim.state.player;
    if (!sim.playerAlive) return 0;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d < 3) return 1;
    let light = sim.lightAtPlayer();
    const range = this.def.sight * (0.35 + 0.65 * clamp(light, 0, 1)) * sim.weatherDef().sightMul * (sim.playerCrouched ? 0.7 : 1);
    if (d > range) return 0;
    const ang = Math.abs(wrapAngle(Math.atan2(p.x - this.x, p.z - this.z) - this.yaw));
    if (ang > this.def.fov / 2 && d > 6) return 0;
    if (sim.playerIndoors() && !this.insideHouse() && d > 4) {
      // indoors: only seen through the open door / windows when lit inside
      if (!sim.rt.housePowered) return 0;
    }
    const vis = sim.nav.sightLine(this.x, this.z, p.x, p.z);
    return vis > 0.35 ? vis : 0;
  }

  insideHouse() { return this.sim.pointIndoors(this.x, this.z); }

  // Retreat to the treeline at first light. Returns true when despawned.
  retreat(dt) {
    if (this.state !== 'retreat') {
      this.setState('retreat');
      const a = Math.atan2(this.x, this.z);
      const r = WORLD.spawnRingMin + 6;
      this.retreatTo = { x: Math.sin(a) * r, z: Math.cos(a) * r };
    }
    const d = this.moveTo(this.retreatTo.x, this.retreatTo.z, this.def.runSpeed * 0.65, dt, 2);
    this.unseenT = this.seenByPlayer ? 0 : this.unseenT + dt;
    const r = Math.hypot(this.x / 1.12, this.z);
    if (d < 3 || r > WORLD.forestInner + 6 && this.unseenT > 4 || this.unseenT > 45 && this.distToPlayer() > 35) {
      this.despawn('retreated');
      return true;
    }
    return false;
  }

  despawn(reason) {
    this.alive = false;
    this.removed = true;
    this.sim.events.emit('creatureDespawn', { c: this, reason });
  }

  damage(amount, source = 'player', hitInfo = {}) {
    if (!this.alive || this.incorporeal) return;
    const stunned = this.stunUntil > this.now;
    const mult = stunned && this.type === 'antlered' ? 1.5 : 1;
    this.hp -= amount * mult;
    this.anim.hurt = 1;
    this.lastHurtAt = this.now;
    this.sim.events.emit('creatureHit', { c: this, amount, ...hitInfo });
    if (source === 'player') {
      const p = this.sim.state.player;
      this.lastSeen = { x: p.x, z: p.z, t: this.now };
      this.provoked = true;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deadT = 0;
      this.sim.onCreatureKilled(this);
    } else if (this.brain?.onDamaged) {
      this.brain.onDamaged(this, amount, source);
    }
  }

  // Trap interactions
  trapped(trap) {
    const eff = this.def.trapEffect;
    if (eff === 'none') return false;
    if (eff === 'kill') { this.damage(80, 'trap'); }
    else if (eff === 'pin') { this.pinnedUntil = this.now + 8; this.damage(30, 'trap'); }
    else if (eff === 'stun') { this.stunUntil = this.now + (this.type === 'pale' ? 3 : 4.5); this.damage(35, 'trap'); }
    return true;
  }

  update(dt) {
    this.anim.attack = Math.max(0, this.anim.attack - dt * 2.5);
    this.anim.hurt = Math.max(0, this.anim.hurt - dt * 3);
    if (!this.alive) { this.deadT += dt; this.speed = 0; return; }
    this.stateT += dt;
    this.y = heightAt(this.x, this.z);
    if (this.sim.pointIndoors(this.x, this.z)) this.y = this.sim.world.groundAt(this.x, this.z, this.y + 1);
    if (this.stunUntil > this.now || this.pinnedUntil > this.now) {
      this.speed = 0;
      this.anim.stun = 1;
      // pinned creatures still lash out
      if (this.pinnedUntil > this.now && this.type !== 'gnawer') this.tryAttackPlayer(dt);
      return;
    }
    this.anim.stun = 0;
    if (this.sim.retreating && !this.opts.riteBound) { this.retreat(dt); return; }
    if (this.handleBreaking(dt)) return;
    this.brain.think(this, dt);
    this.sim.checkTraps(this);
  }
}
