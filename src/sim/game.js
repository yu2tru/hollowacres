// GameSim: owns the game state and runs every gameplay system. It has no
// rendering or DOM dependencies, so it runs identically in the browser and
// in headless Node tests.
import { EventBus } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { clamp, wrapAngle } from '../core/math.js';
import { WORLD, BUILDINGS, POND, FIELDS, PLOT_PITCH } from '../data/layout.js';
import { CROPS } from '../data/crops.js';
import { LORE, STAKES } from '../data/lore.js';
import { CREATURES } from '../data/creatures.js';
import { FARM_LEVELS } from '../data/items.js';
import { CollisionWorld, buildStaticWorld } from './world.js';
import { NavGrid } from './nav.js';
import { getVegetation } from './vegetation.js';
import { heightAt, distToDriveway, distToPaths, isInPond } from './terrain.js';
import * as clock from './clock.js';
import * as farming from './farming.js';
import * as econ from './economy.js';
import * as S from './structures.js';
import * as P from './player.js';
import { computeFocus, doInteract } from './interact.js';
import { Creature } from './creatures/base.js';
import { BRAINS } from './creatures/brains.js';
import { Director } from './director.js';
import { updateAnimals, layEggs, syncChickens } from './animals.js';
import { ROAD } from '../data/layout.js';
import { updateTutorial, tutorialState } from './tutorial.js';

export const DAY_LENGTHS = { short: 0.35, normal: 0.5, long: 0.8 }; // real seconds per game minute
const DIFF_DMG = { easy: 0.65, normal: 1, hard: 1.3 };

export const OBJECTIVES = [
  { id: 'letter', text: 'Read the letter on the kitchen table' },
  { id: 'plant', text: 'Plant seeds in the South Field  (5 = seeds, LMB on a plot, Q = seed type)' },
  { id: 'water', text: 'Fill the can at the pump by the pond (E) and water your crops  (4 = can, LMB)' },
  { id: 'generator', text: 'Check the generator in the fenced yard to the north-east - refuel it before dark' },
  { id: 'night', text: 'Survive the night. Stay near the lights.' },
  { id: 'repair', text: 'Repair anything damaged  (6 = hammer, hold LMB)' },
  { id: 'sell', text: 'Harvest ripe crops (E) and sell them at the shipping bin' },
  { id: 'build', text: 'Build a defense  (B = build menu)' },
  { id: 'explore', text: 'Find the Hollis cabin in the woods west of the pond' },
];

export class GameSim {
  constructor(state, opts = {}) {
    this.state = state;
    this.opts = opts;
    this.events = new EventBus();
    this.rng = new Rng((state.seed ^ (state.time.day * 2654435761)) >>> 0);
    this.clockSeconds = 0;
    this.secPerMinute = DAY_LENGTHS[opts.dayLength || 'normal'] || 0.5;
    this.creatures = [];
    this.noises = [];
    this.alerts = [];
    this.retreating = false;
    this.playerAlive = true;
    this.paused = false;
    this.uiOpen = null;
    this.nightStats = this.freshNightStats();
    this.rt = {
      cols: new Map(), networks: [], lights: [], flares: [], housePowered: false,
      player: { vx: 0, vz: 0, vy: 0, grounded: true, crouch: false, sprinting: false, stepDist: 0, speed: 0, repairT: 0, chilledT: 0 },
      weapon: { cd: 0, reloading: 0 },
      camT: new Map(),
    };
    this._alertTimes = new Map();
    this._powerDirty = true;
    this._powerT = 0;
    this._genNoiseT = 0;
    this._camT = 0;
    this._decoyT = 0;
    this.focus = null;

    this.buildWorld();
    this.director = new Director(this);
    this.events.on('powerChanged', () => { this._powerDirty = true; });
    this.refreshPower();
    this.refreshTallCrops();
    this.ambient = clock.ambientLight(state.time.minute, state.weather);
    if (!state.market.trend || !Object.keys(state.market.trend).length) econ.rollMarket(state, this.rng);
    if (!state.contracts.length) econ.rollContracts(this, this.rng);
    if (clock.isNightTime(state.time.minute)) this.director.startNight();
    if (state.time.minute >= clock.DAWN && state.time.minute < clock.MORNING) this.retreating = true;
  }

  freshNightStats() {
    return { animalsLost: 0, cropsLost: 0, cropValueLost: 0, structuresHit: 0, structuresDestroyed: 0, lightsBlown: 0, kills: {}, downed: false, damageTaken: 0, fuelStart: 0 };
  }

  // ---------------------------------------------------------------- world --
  buildWorld() {
    this.world = new CollisionWorld();
    this.nav = new NavGrid();
    const doors = buildStaticWorld(this.world);
    // pond: wade-proof
    this.world.add({ kind: 'circle', x: POND.x, z: POND.z, r: POND.r - 2 }, { y0: -20, y1: 3, tag: 'pond', opaque: false });
    const veg = getVegetation();
    for (const t of veg.trees) {
      if (!t.collide) continue;
      this.world.add({ kind: 'circle', x: t.x, z: t.z, r: t.r }, { y0: -5, y1: 40, tag: 'tree', opaque: false });
    }
    for (const r of veg.rocks) {
      if (Math.hypot(r.x, r.z) > WORLD.playRadius + 4 || r.scale < 0.9) continue;
      this.world.add({ kind: 'circle', x: r.x, z: r.z, r: r.scale * 0.55 }, { y0: -5, y1: heightAt(r.x, r.z) + r.scale * 0.6, tag: 'rock', opaque: false });
    }
    // rasterise static colliders into nav grid
    const nav = this.nav;
    for (const c of this.world.colliders) {
      if (c.tag.endsWith('_roof') || c.tag === 'furniture' || c.tag === 'porch') continue;
      if (c.y0 > heightAt(c.x, c.z) + 1.5) continue; // lintels
      if (c.y1 < heightAt(c.x, c.z) + 0.35) continue; // pipes and the like: stepped over
      const isWall = ['farmhouse', 'barn', 'shed', 'ruin', 'prop'].includes(c.tag) && c.opaque;
      nav.rasterize(c, (i) => { nav.blocked[i] = 1; if (isWall) nav.opaque[i] = 1; }, c.tag === 'tree' ? 0.05 : 0.15);
    }
    // vegetation density for sight attenuation
    for (const t of veg.trees) {
      if (Math.hypot(t.x, t.z) > WORLD.navHalf) continue;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const i = nav.idx(t.x + dx, t.z + dz); if (i >= 0) nav.dense[i] = 1;
      }
    }
    for (const b of veg.bushes) {
      const i = nav.idx(b.x, b.z); if (i >= 0) nav.dense[i] = 1;
    }
    // world edge
    for (let i = 0; i < nav.N * nav.N; i++) {
      const p = nav.cellCenter(i);
      if (Math.hypot(p.x, p.z) > WORLD.navHalf - 2) nav.blocked[i] = 1;
      if (isInPond(p.x, p.z, -1)) nav.blocked[i] = 1;
    }
    this.doors = doors;
    for (const s of this.state.structures) S.attachStructure(this, s);
  }

  syncStructure(s) { S.syncStructureCollision(this, s); }

  refreshTallCrops() {
    const nav = this.nav;
    nav.tall.fill(0);
    for (const p of this.state.plots) {
      if (!p.crop || p.dead || !CROPS[p.crop].tall || p.stage < 3) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const i = nav.idx(p.x + dx, p.z + dz); if (i >= 0) nav.tall[i] = 1;
      }
    }
  }

  refreshPower() {
    S.computePower(this);
    S.rebuildLightSources(this);
    this._powerDirty = false;
    this.events.emit('powerUpdated', this.rt.networks);
  }

  // ---------------------------------------------------------------- helpers --
  weatherDef() { return clock.WEATHER_TYPES[this.state.weather.current] || clock.WEATHER_TYPES.clear; }
  isNight() { return clock.isNightTime(this.state.time.minute); }
  phase() { return clock.phaseOf(this.state.time.minute); }
  lightAt(x, z) { return S.lightAt(this, x, z); }
  lightAtPlayer() {
    const p = this.state.player;
    return this.lightAt(p.x, p.z) + (p.flashlight ? 0.45 : 0);
  }
  get playerCrouched() { return this.rt.player.crouch; }
  pointIndoors(x, z) {
    const h = BUILDINGS.farmhouse;
    return Math.abs(x - h.x) < h.w / 2 - 0.1 && Math.abs(z - h.z) < h.d / 2 - 0.1;
  }
  playerIndoors() { return this.pointIndoors(this.state.player.x, this.state.player.z); }
  packCapacity() { return this.state.owned.backpack ? 70 : 35; }
  packRoom() { return this.packCapacity() - econ.totalProduce(this.state.inv.produce); }
  barnCapacity() { return this.state.owned.barn2 ? 400 : 150; }
  creatureById(id) { return this.creatures.find((c) => c.id === id); }

  surfaceAt(x, z) {
    const h = BUILDINGS.farmhouse;
    if (Math.abs(x - h.x) < h.w / 2 && z > h.z - h.d / 2 && z < h.z + h.d / 2 + h.porch.depth) return 'wood';
    const b = BUILDINGS.barn;
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return 'wood';
    if (distToDriveway(x, z) < 2.6 || Math.abs(z - ROAD.county.z) < 3.5) return 'gravel';
    if (farming.plotAt(this.state, x, z) || distToPaths(x, z) < 1.2) return 'dirt';
    if (this.state.weather.wetness > 0.5) return 'mud';
    return 'grass';
  }

  ironNear(x, z) {
    for (const s of this.state.structures) if (s.type === 'chimes' && s.hp > 0 && Math.hypot(s.x - x, s.z - z) < 12) return true;
    return false;
  }
  nearestIron(x, z) {
    let best = null, bd = Infinity;
    for (const s of this.state.structures) if (s.type === 'chimes' && s.hp > 0) {
      const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  emitNoise(x, z, radius, kind) {
    this.noises.push({ x, z, radius, kind, t: this.clockSeconds });
    if (this.noises.length > 40) this.noises.shift();
  }
  recentNoiseFor(c, maxR = 80) {
    let best = null;
    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i];
      if (this.clockSeconds - n.t > 3) break;
      if (n.kind === 'generator' || n.kind === 'steps' && c.type !== 'drifter') continue;
      const d = Math.hypot(n.x - c.x, n.z - c.z);
      if (d < Math.min(maxR, n.radius * c.def.hearing)) { best = n; break; }
    }
    return best;
  }

  // Is the player looking at creature c (with enough light to see it)?
  playerObserves(c) {
    if (!this.playerAlive || this.uiOpen === 'cameras') return false;
    const p = this.state.player;
    const o = P.eyePos(this), d = P.viewDir(p);
    const cy = c.y + (c.type === 'pale' ? 2.0 : 1.0);
    const vx = c.x - o.x, vy = cy - o.y, vz = c.z - o.z;
    const dist = Math.hypot(vx, vy, vz);
    if (dist > 70 * this.weatherDef().sightMul) return false;
    const cos = (vx * d.x + vy * d.y + vz * d.z) / dist;
    if (cos < Math.cos(0.6)) return false;
    const lit = this.lightAt(c.x, c.z) > 0.15 || dist < 9 || c.inBeam;
    if (!lit) return false;
    return this.nav.sightLine(p.x, p.z, c.x, c.z) > 0.3;
  }

  playerCanSeePoint(x, z, maxD = 80) {
    const p = this.state.player;
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > maxD) return false;
    const f = P.viewDir(p);
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - Math.atan2(f.x, f.z)));
    if (ang > 0.9) return false;
    return this.nav.sightLine(p.x, p.z, x, z) > 0.4;
  }

  darkPointNear(px, pz, rmin, rmax, thresh) {
    let best = null, bd = Infinity;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + this.rng.range(0, 0.3);
      for (const r of [rmin, (rmin + rmax) / 2, rmax]) {
        const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
        if (!this.nav.walkable(x, z, {})) continue;
        if (this.lightAt(x, z) > thresh * 0.9) continue;
        const score = r + (this.nav.sightLine(px, pz, x, z) > 0.3 ? 0 : 10);
        if (score < bd) { bd = score; best = { x, z }; }
        break;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- creatures --
  makePack() {
    const pack = { members: [], hunger: 0, alive() { return this.members.filter((m) => m.alive).length; } };
    return pack;
  }

  spawnCreature(type, x, z, opts = {}) {
    const c = new Creature(this, type, x, z, opts);
    c.brain = BRAINS[CREATURES[type].brain];
    if (opts.pack) opts.pack.members.push(c);
    if (c.def.lightFear) {
      const fear = c.def.lightFear;
      c.extraCost = (i) => {
        if (c.pack && c.pack.hunger > 160 && c.pack.alive() >= 3) return 0;
        const p = this.nav.cellCenter(i);
        return S.artificialLightAt(this, p.x, p.z) + this.ambient > fear ? 60 : 0;
      };
    }
    if (type === 'hollow') {
      c.extraCost = (i) => { const p = this.nav.cellCenter(i); return this.ironNear(p.x, p.z) ? 500 : 0; };
    }
    this.creatures.push(c);
    this.events.emit('creatureSpawn', c);
    return c;
  }

  onCreatureKilled(c) {
    const k = this.nightStats.kills;
    k[c.type] = (k[c.type] || 0) + 1;
    this.state.stats.kills[c.type] = (this.state.stats.kills[c.type] || 0) + 1;
    if (c.targetPlot) c.targetPlot.claimedBy = null;
    this.events.emit('creatureKilled', c);
    this.markBestiary(c.type, 'seen');
  }

  checkTraps(c) {
    if (c.incorporeal || c.opts.watcher) return;
    for (const s of this.state.structures) {
      if (s.type !== 'trap' || !s.armed || s.hp <= 0) continue;
      if (Math.hypot(s.x - c.x, s.z - c.z) < 0.75 + c.radius * 0.5) {
        s.armed = false;
        this.events.emit('sfx', { id: 'trap_snap', x: s.x, z: s.z });
        this.events.emit('structureChanged', s);
        c.trapped(s);
        this.alert(`Trap sprung: ${c.def.name}`, s);
      }
    }
  }

  updateCreatures(dt) {
    const p = this.state.player;
    const eye = P.eyePos(this), dir = P.viewDir(p);
    const beamRange = this.state.owned.focus ? 34 : 26, beamAng = this.state.owned.focus ? 0.24 : 0.3;
    for (const c of this.creatures) {
      if (c.hiddenUntil && c.hiddenUntil > this.clockSeconds) { c.visibility = 0; continue; }
      // flashlight beam
      c.inBeam = false;
      if (p.flashlight && c.alive) {
        const cy = c.y + (c.type === 'gnawer' ? 0.5 : 1.4);
        const vx = c.x - eye.x, vy = cy - eye.y, vz = c.z - eye.z, dist = Math.hypot(vx, vy, vz);
        if (dist < beamRange && (vx * dir.x + vy * dir.y + vz * dir.z) / dist > Math.cos(beamAng) &&
          this.nav.sightLine(p.x, p.z, c.x, c.z) > 0.3) c.inBeam = true;
      }
      c.update(dt);
      // did the player see it?
      if (c.alive) {
        const seen = this.playerObserves(c) || (c.inBeam && c.type !== 'hollow');
        c.seenByPlayer = seen;
        if (seen && c.type !== 'hollow' && !c.opts.watcher) this.markBestiary(c.type, 'seen');
        if (seen && c.opts.watcher && !this.state.lore.bestiary.pale) this.markBestiary('pale', 'seen');
      }
    }
    // remove dead (after corpse time) and despawned
    const before = this.creatures.length;
    this.creatures = this.creatures.filter((c) => !c.removed && !(!c.alive && c.deadT > 10));
    if (this.creatures.length !== before) this.events.emit('creaturesChanged');
  }

  // Motion detection on powered cameras
  updateCameras() {
    for (const s of this.state.structures) {
      if (s.type !== 'camera' || !s.powered || s.hp <= 0) continue;
      for (const c of this.creatures) {
        if (!c.alive || (c.hiddenUntil > this.clockSeconds)) continue;
        const dx = c.x - s.x, dz = c.z - s.z, d = Math.hypot(dx, dz);
        if (d > 32) continue;
        if (Math.abs(wrapAngle(Math.atan2(dx, dz) - s.rot)) > 0.75) continue;
        if (this.nav.sightLine(s.x, s.z, c.x, c.z) < 0.3) continue;
        const last = this.rt.camT.get(s.id) || -999;
        if (this.clockSeconds - last > 25) {
          this.rt.camT.set(s.id, this.clockSeconds);
          this.alert(`Motion on ${s.name}`, s, 'camera');
          this.events.emit('cameraMotion', { cam: s, creature: c });
          if (c.type === 'hollow') this.markBestiary('hollow', 'seen');
        }
      }
    }
  }

  // ---------------------------------------------------------------- player --
  damagePlayer(amount, src, opts = {}) {
    if (!this.playerAlive || this.opts.godMode) return;
    const p = this.state.player;
    const dmg = amount * (DIFF_DMG[this.state.difficulty] || 1);
    p.health -= dmg;
    this.nightStats.damageTaken += dmg;
    if (opts.knock) this.rt.player.knock = opts.knock;
    if (opts.chill) this.rt.player.chilledT = 1.0;
    const dir = src ? Math.atan2(src.x - p.x, src.z - p.z) : 0;
    this.events.emit('playerHurt', { amount: dmg, dir, src: src?.type, chill: !!opts.chill });
    if (src?.type) this.markBestiary(src.type, 'seen');
    if (p.health <= 0) { p.health = 0; this.playerDown(src); }
  }

  playerDown(src) {
    if (!this.playerAlive) return;
    this.playerAlive = false;
    this.state.stats.deaths++;
    this.nightStats.downed = true;
    this.events.emit('playerDown', { by: src?.type });
    // the App resolves after a short fade; headless resolves immediately
    if (this.opts.headless) this.resolveDowned();
  }

  // The night carries on without you. Apply consequences, wake at dawn.
  resolveDowned() {
    const st = this.state;
    const nightNow = this.isNight();
    if (nightNow) {
      const remain = clamp(((clock.DAWN - st.time.minute + 1440) % 1440) / 570, 0, 1);
      const living = this.creatures.filter((c) => c.alive && !c.opts.watcher);
      // creatures that haven't arrived yet still come
      const pending = [];
      for (const w of this.director.plan?.waves || []) if (!w.done) for (const g of w.groups) for (let i = 0; i < g.n; i++) pending.push(g.type);
      const actors = [...living.map((c) => c.type), ...pending.map((t) => t)].slice(0, 20);
      const crops = st.plots.filter((p) => p.crop && !p.dead && farming.plotOwned(st, p))
        .sort((a, b) => CROPS[b.crop].gnawerAppeal - CROPS[a.crop].gnawerAppeal);
      for (const t of actors) {
        const f = remain * (pending.includes(t) ? 0.5 : 1);
        if (t === 'gnawer') {
          const coop = st.structures.find((q) => q.type === 'coop');
          if (coop && coop.hp <= 0 && st.animals.chickens > 0 && this.rng.chance(0.5 * f)) { st.animals.chickens--; this.nightStats.animalsLost++; }
          for (let k = 0; k < Math.round(2 * f + this.rng.next()); k++) { const p = crops.shift(); if (p) farming.damagePlot(this, p, 1, null); }
        } else if (t === 'drifter' || t === 'antlered' || t === 'pale') {
          const targets = st.structures.filter((s) => s.hp > 0 && (t === 'drifter' ? ['floodlight', 'generator', 'camera'] : t === 'pale' ? ['door'] : ['generator', 'barricade', 'fence', 'pole']).includes(s.type));
          const s = this.rng.pick(targets);
          if (s) S.damageStructure(this, s, (t === 'antlered' ? 140 : 70) * f, null);
        } else if (t === 'hollow') {
          for (const s of st.structures.filter((q) => q.type === 'floodlight' && q.bulb !== false).slice(0, 2)) { s.bulb = false; this.nightStats.lightsBlown++; }
        }
      }
    }
    for (const c of this.creatures) c.despawn('dawn');
    this.creatures = [];
    // medical bill and dropped produce
    const bill = Math.min(100, Math.round(Math.max(0, st.money) * 0.12));
    st.money -= bill;
    for (const k of Object.keys(st.inv.produce)) st.inv.produce[k] = Math.floor(st.inv.produce[k] / 2);
    this.nightStats.bill = bill;
    // wake up in bed
    const b = BUILDINGS.farmhouse;
    Object.assign(st.player, { x: -24.5, z: -12.8, y: b.baseY + b.floor, health: 55, stamina: 100, flashlight: false });
    this.rt.player.vx = this.rt.player.vz = this.rt.player.vy = 0;
    this.playerAlive = true;
    if (st.lore.rite === 'active') { st.lore.rite = 'failed'; }
    if (nightNow) {
      this.advanceClockTo(clock.MORNING); // fires morning logic
    }
    this.events.emit('playerRevived', { bill });
  }

  // ---------------------------------------------------------------- notifications --
  notify(text, level = 'info', opts = {}) { this.events.emit('notify', { text, level, ...opts }); }
  alert(text, src, kind = 'damage') {
    const last = this._alertTimes.get(text) || -999;
    if (this.clockSeconds - last < 20) return;
    this._alertTimes.set(text, this.clockSeconds);
    const a = { text, kind, x: src?.x, z: src?.z, t: this.clockSeconds };
    this.alerts.push(a);
    if (this.alerts.length > 30) this.alerts.shift();
    this.events.emit('alert', a);
  }
  nightLog(key, n = 1, meta = {}) {
    if (key === 'cropsLost') {
      this.nightStats.cropsLost += n;
      if (meta.crop) this.nightStats.cropValueLost += CROPS[meta.crop].value * CROPS[meta.crop].yield;
    } else this.nightStats[key] = (this.nightStats[key] || 0) + n;
  }
  openUI(panel, ref) { this.events.emit('openUI', { panel, ref }); if (panel === 'structure' && ref?.type === 'generator') this.tutorialEvent('generator'); }

  markBestiary(type, level) {
    const b = this.state.lore.bestiary;
    const rank = { seen: 1, known: 2 };
    if ((rank[b[type]] || 0) >= rank[level]) return;
    b[type] = level;
    this.events.emit('bestiary', { type, level });
    if (level === 'seen') this.notify(`Journal: new entry - ${CREATURES[type].name}`, 'lore');
  }

  tutorialEvent(kind) {
    const t = tutorialState(this.state);
    if (kind === 'refuel') t.refuels = (t.refuels || 0) + 1;
    this.events.emit('objectives', kind);
  }
  currentObjective() {
    return null; // superseded by the step-by-step tutorial (sim/tutorial.js)
  }

  checkLevelUp() {
    const lv = econ.farmLevel(this.state).level;
    const seen = this.state.levelSeen || 1;
    if (lv > seen) {
      this.state.levelSeen = lv;
      const unlocked = Object.values(CROPS).filter((c) => c.level === lv).map((c) => c.name.toLowerCase());
      const L = FARM_LEVELS.find((l) => l.level === lv);
      this.notify(`Farm level ${lv}: ${L.title}${unlocked.length ? ` - unlocked ${unlocked.join(', ')}` : ''}. New items at Feed & Supply.`, 'level');
      this.events.emit('levelUp', lv);
    }
  }

  // ---------------------------------------------------------------- lore --
  discover(id) {
    const st = this.state;
    const L = LORE[id];
    if (!L) return;
    const first = !st.lore.found.includes(id);
    if (first) {
      st.lore.found.push(id);
      for (const t of L.reveals || []) this.markBestiary(t, 'known');
      if (L.reward) {
        for (const [k, v] of Object.entries(L.reward)) st.inv[k] = (st.inv[k] || 0) + v;
        this.notify('You found supplies hidden here.', 'good');
      }
      if (L.unlocks?.includes('chimes')) this.notify('New blueprint: Iron chimes (build menu)', 'level');
      if (L.revealsStakes) this.notify('The boundary stones are marked on your map.', 'lore');
      if (id === 'realtor') this.tutorialEvent('letter');
      if (id === 'cabin') this.tutorialEvent('explore');
    }
    this.events.emit('loreOpened', { id, first });
  }

  readMail() {
    const st = this.state;
    if (!st.lore.unread.length) { this.notify('Nothing but a seed catalogue.', 'info'); return; }
    const id = st.lore.unread.shift();
    if (id === '__relief') { this.notify('Co-op relief parcel: 12 wheat seeds and $40. "Hang in there."', 'good'); return; }
    this.discover(id);
  }

  driveStake(id) {
    const st = this.state;
    if (st.lore.stakes[id]) return;
    st.lore.stakes[id] = true;
    const n = STAKES.filter((k) => st.lore.stakes[k]).length;
    this.events.emit('sfx', { id: 'stake', x: this.state.player.x, z: this.state.player.z });
    this.notify(`You drive the iron stake home. The woods go very quiet. (${n}/4)`, 'lore');
    this.events.emit('stakeDriven', { id, n });
  }

  performRite() {
    const st = this.state;
    if (STAKES.some((k) => !st.lore.stakes[k])) return;
    if (st.lore.rite === 'active' || st.lore.rite === 'done') return;
    const m = st.time.minute;
    if (m < clock.MORNING || m > 19 * 60 + 30) { this.notify('Not now. The rite must be begun before nightfall.', 'warn'); return; }
    const src = st.inv.produce.pumpkin ? st.inv.produce : st.barn.produce.pumpkin ? st.barn.produce : null;
    if (!src) { this.notify('You need a pumpkin to offer.', 'warn'); return; }
    src.pumpkin--; if (src.pumpkin <= 0) delete src.pumpkin;
    st.lore.rite = 'active';
    this.notify('You break the pumpkin on the stone. Far off, something answers. Tonight they come for everything owed.', 'lore');
    this.events.emit('riteBegun');
  }

  // ---------------------------------------------------------------- time --
  sleep() {
    const m = this.state.time.minute;
    if (this.isNight() || m >= 18 * 60) return;
    this.events.emit('sleepStart');
    this.advanceClockTo(18 * 60);
    this.state.player.health = Math.min(100, this.state.player.health + 25);
    this.state.player.stamina = 100;
    this.notify('You slept until evening.', 'info');
    this.events.emit('autosave', { reason: 'sleep' });
  }

  // Fast-forward game time (no creatures), firing scheduled events.
  advanceClockTo(target) {
    let guard = 0;
    while (guard++ < 2000) {
      const cur = this.state.time.minute;
      const remain = (target - cur + 1440) % 1440;
      if (remain < 1e-4 || remain > 1440 - 1e-4) break;
      this.tickClock(Math.min(10, remain), true);
    }
    this.state.time.minute = target;
  }

  // Advance clock by game minutes and fire time-of-day transitions.
  tickClock(dMin, fast = false) {
    const st = this.state;
    const prev = st.time.minute;
    st.time.minute = Math.round(((prev + dMin) % 1440) * 1e4) / 1e4;
    const cur = st.time.minute;
    const dtH = dMin / 60;
    clock.updateWeather(st, this.rng, dMin);
    farming.updatePlots(this, dtH);
    S.burnFuel(this, dtH);
    const sun = Math.max(0, Math.min(1, clock.sunState(cur).elevation * 2));
    S.updateSolar(this, dtH, sun, this.weatherDef().cloud);
    const crossed = (mark) => clock.crossed(prev, cur, mark);
    if (crossed(6 * 60) || crossed(14 * 60)) farming.runSprinklers(this);
    if (crossed(19 * 60) || crossed(6 * 60 + 30)) this._powerDirty = true;
    if (crossed(18 * 60 + 30) && !fast) this.events.emit('duskWarning');
    if (crossed(clock.NIGHT)) this.startNight();
    if (crossed(clock.DAWN)) this.startDawn();
    if (crossed(clock.MORNING)) this.morning();
  }

  startNight() {
    this.retreating = false;
    this.nightStats = this.freshNightStats();
    this.nightStats.fuelStart = this.state.structures.filter((s) => s.type === 'generator').reduce((a, g) => a + g.fuel, 0);
    const plan = this.director.startNight();
    this._powerDirty = true;
    this.events.emit('nightStart', { day: this.state.time.day, plan });
    if (this.state.lore.rite === 'active') this.notify('THE LAST HARVEST. Survive until dawn.', 'danger');
    else this.notify(`Night ${this.state.time.day}`, 'night');
  }

  startDawn() {
    this.retreating = true;
    if (this.creatures.some((c) => c.alive)) this.notify('First light. They\'re going back to the trees.', 'good');
    this.events.emit('dawn');
  }

  morning() {
    const st = this.state;
    for (const c of this.creatures) if (c.alive) c.despawn('morning');
    this.creatures = [];
    this.retreating = false;
    const ns = this.nightStats;
    const damaged = st.structures.filter((s) => S.needsRepair(s)).map((s) => ({ id: s.id, name: S.displayName(s), hp: s.hp, maxHp: s.maxHp }));
    const report = {
      night: st.time.day, animalsLost: ns.animalsLost, cropsLost: ns.cropsLost, cropValueLost: Math.round(ns.cropValueLost),
      damaged, destroyed: ns.structuresDestroyed, lightsBlown: ns.lightsBlown, kills: { ...ns.kills },
      downed: ns.downed, bill: ns.bill || 0, damageTaken: Math.round(ns.damageTaken),
      fuelUsed: Math.max(0, Math.round((ns.fuelStart - st.structures.filter((s) => s.type === 'generator').reduce((a, g) => a + g.fuel, 0)) * 10) / 10),
      rite: st.lore.rite,
    };
    st.night.lastReport = report;
    st.stats.nights++;
    st.time.day++;
    this.rng = new Rng((st.seed ^ (st.time.day * 2654435761)) >>> 0);
    econ.rollMarket(st, this.rng);
    econ.rollContracts(this, this.rng);
    layEggs(this);
    for (const f of st.structures) if (f.type === 'firepit' && f.lit) { f.lit = false; this.events.emit('structureChanged', f); }
    // mail
    for (const [id, L] of Object.entries(LORE)) {
      if (L.mail && st.time.day >= L.mail && !st.lore.mail.includes(id)) {
        st.lore.mail.push(id); st.lore.unread.push(id);
        this.notify('There\'s mail in the mailbox by the road.', 'lore');
      }
    }
    // relief so a ruined farm can always recover
    const planted = st.plots.some((p) => p.crop && !p.dead);
    const seeds = Object.values(st.inv.seeds).reduce((a, b) => a + b, 0);
    const plantedCount = st.plots.filter((p) => p.crop && !p.dead).length;
    if (st.money < 60 && plantedCount < 6 && seeds < 6 && st.time.day - st.lore.reliefDay >= 3) {
      st.lore.reliefDay = st.time.day;
      st.inv.seeds.wheat = (st.inv.seeds.wheat || 0) + 12;
      st.money += 40;
      st.lore.unread.push('__relief');
      this.notify('The county co-op left a relief parcel in your mailbox.', 'good');
    }
    if (st.lore.rite === 'active') {
      st.lore.rite = 'done';
      st.flags.ending = true;
      report.rite = 'done';
      this.events.emit('ending');
    } else if (st.lore.rite === 'failed') {
      st.lore.rite = 'none';
      this.notify('The line did not hold. You will have to perform the rite again.', 'warn');
    }
    this.tutorialEvent('night');
    if (!damaged.length) this.tutorialEvent('repair');
    this._powerDirty = true;
    this.events.emit('morning', report);
    this.events.emit('autosave', { reason: 'morning' });
  }

  // ---------------------------------------------------------------- main update --
  // input: see input/input.js. dt: real seconds.
  update(dt, rawInput = {}) {
    if (this.paused) return;
    const input = { moveX: 0, moveZ: 0, ...rawInput };
    if (!Number.isFinite(input.moveX)) input.moveX = 0;
    if (!Number.isFinite(input.moveZ)) input.moveZ = 0;
    dt = Math.min(dt, 0.1);
    this.clockSeconds += dt;
    const st = this.state;

    // time flows unless a blocking menu is open during the day
    const dMin = dt / this.secPerMinute;
    this._minAcc = (this._minAcc || 0) + dMin;
    if (this._minAcc >= 0.25) { const m = this._minAcc; this._minAcc = 0; this.tickClock(m); }
    this.ambient = clock.ambientLight(st.time.minute, st.weather);

    // player
    if (this.playerAlive) {
      P.updateMovement(this, input, dt);
      P.updateFlashlight(this, dt);
      P.updateWeapon(this, dt);
      this.rt.player.chilledT = Math.max(0, this.rt.player.chilledT - dt);
      this.rt.aiming = !!input.aim;
      if (input.flashlight) P.toggleFlashlight(this);
      if (input.slot) P.selectSlot(this, input.slot);
      if (input.cycleSeed) P.cycleSeed(this, input.cycleSeed);
      this.focus = computeFocus(this);
      if (input.interact) doInteract(this, this.focus);
      const tool = P.currentTool(this);
      if (input.reload && (tool === 'revolver' || tool === 'shotgun')) P.startReload(this, tool);
      if (tool === 'hammer') P.updateRepair(this, this.focus, input.useHeld, dt);
      if (input.use) {
        if (tool === 'revolver' || tool === 'shotgun') P.fire(this, tool);
        else if (tool === 'shovel') {
          if (this.focus?.kind === 'plot' && this.focus.ref.dead) P.useOnPlot(this, this.focus.ref, 'shovel');
          else P.melee(this);
        } else if (tool === 'flare') P.throwFlare(this);
        else if (tool === 'medkit') P.useMedkit(this);
        else if (this.focus?.kind === 'plot' && ['can', 'seeds', 'fertilizer'].includes(tool)) P.useOnPlot(this, this.focus.ref, tool);
      }
      // slow health regen in daylight when not recently hurt
      if (!this.isNight() && st.player.health < 100) st.player.health = Math.min(100, st.player.health + dt * 0.4);
    }

    updateAnimals(this, dt);
    this._tutT = (this._tutT || 0) - dt;
    if (this._tutT <= 0) { this._tutT = 0.2; updateTutorial(this); }
    // power, lights, flares
    this._powerT -= dt;
    this.rt.flares = this.rt.flares.filter((f) => f.until > this.clockSeconds);
    if (this._powerDirty || this._powerT <= 0) { this.refreshPower(); this._powerT = 1; }
    else S.rebuildLightSources(this);

    // generator & decoy noise, cameras
    this._genNoiseT -= dt;
    if (this._genNoiseT <= 0) {
      this._genNoiseT = 3;
      for (const net of this.rt.networks) for (const g of net.gens) if (S.generatorRunning(this, g)) this.emitNoise(g.x, g.z, 22 + net.load * 3, 'generator');
    }
    this._decoyT -= dt;
    if (this._decoyT <= 0) {
      this._decoyT = 2;
      for (const s of st.structures) if (s.type === 'decoy' && s.activeUntil > this.clockSeconds && s.hp > 0) this.emitNoise(s.x, s.z, 60, 'decoy');
    }
    this._camT -= dt;
    if (this._camT <= 0) { this._camT = 0.5; this.updateCameras(); }

    // night
    if (this.isNight() || this.creatures.length) {
      this.director.update();
      this.updateCreatures(dt);
    }
  }
}
