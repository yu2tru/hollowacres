// Application controller: menus, session lifecycle, main loop, build mode,
// and the glue between simulation events and presentation (UI, audio).
import { createNewState } from './sim/state.js';
import { GameSim } from './sim/game.js';
import { saveToSlot, loadFromSlot, canSaveNow } from './sim/save.js';
import { Renderer } from './render/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { Input } from './input/input.js';
import { HUD } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Menus } from './ui/menus.js';
import { h } from './ui/dom.js';
import { loadSettings, saveSettings } from './settings.js';
import { BUILDABLES, BUILD_ORDER } from './data/buildables.js';
import { canPlace, affordable, costOf, place } from './sim/structures.js';
import { eyePos, viewDir, slotAvailable } from './sim/player.js';
import { heightAt } from './sim/terrain.js';
import { farmLevel } from './sim/economy.js';
import { clamp } from './core/math.js';

const PENDING = 'hollowacres.pendingLoad';

export class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.uiRoot = document.getElementById('ui');
    this.settings = loadSettings();
    this.input = new Input(this.canvas, this.settings);
    this.audio = new AudioEngine(this.settings);
    this.hud = new HUD(this.uiRoot, this);
    this.hud.setVisible(false);
    this.buildUI = h('div.build-ui.hidden');
    this.uiRoot.append(this.buildUI);
    this.panels = new Panels(this.uiRoot, this);
    this.menus = new Menus(this.uiRoot, this);
    this.sim = null;
    this.renderer = null;
    this.state = 'menu'; // menu | loading | playing | paused | downed
    this.build = { active: false, type: 'barricade', rot: 0 };
    this.fadeV = 0;
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.panels.isOpen() && !this.build.active) this.pause();
    };
    window.addEventListener('resize', () => this.renderer?.resize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.__HA = this; // debugging & automated tests
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    const pending = sessionStorage.getItem(PENDING);
    if (pending) {
      sessionStorage.removeItem(PENDING);
      const p = JSON.parse(pending);
      if (p.slot) return this.loadGame(p.slot, true);
      if (p.newGame) return this.newGame(p.newGame, true);
    }
    this.menus.title();
  }

  // ---------------------------------------------------------------- sessions
  newGame(opts, direct = false) {
    if (this.sim && !direct) { sessionStorage.setItem(PENDING, JSON.stringify({ newGame: opts })); location.reload(); return; }
    const st = createNewState({ difficulty: opts.difficulty || 'normal' });
    this.startSession(st, opts.dayLength);
  }

  loadGame(slot, direct = false) {
    if (this.sim && !direct) { sessionStorage.setItem(PENDING, JSON.stringify({ slot })); location.reload(); return; }
    let st;
    try { st = loadFromSlot(slot); } catch (e) {
      console.error(e);
      this.menus.title();
      this.hud.setVisible(true);
      this.hud.toast(`Couldn't load: ${e.message}`, 'warn', 6000);
      setTimeout(() => this.hud.setVisible(false), 6000);
      return;
    }
    this.startSession(st, this.settings.gameplay.dayLength);
  }

  quitToTitle() { location.reload(); }

  async startSession(state, dayLength) {
    this.state = 'loading';
    this.menus.loading('Preparing', 2);
    await new Promise((r) => setTimeout(r, 30));
    try {
      this.sim = new GameSim(state, { dayLength: dayLength || this.settings.gameplay.dayLength });
      this.sim.state.settingsHints = this.settings.gameplay.hints;
      this.renderer = new Renderer(this.canvas, this.settings);
      const steps = ['Generating materials', 'Shaping the land', 'Raising the farm', 'Planting the woods', 'Lighting'];
      await this.renderer.build(this.sim, (label) => this.menus.loading(label, 10 + steps.indexOf(label) * 18));
      this.hookSim();
    } catch (e) {
      console.error(e);
      this.menus.fade('Something went wrong', `Hollow Acres couldn't start: ${e.message}. Your browser needs WebGL 2. Try lowering graphics settings or updating your graphics drivers.`);
      this.state = 'error';
      return;
    }
    this.menus.loading('Ready', 100);
    this.state = 'paused';
    this.hud.setVisible(true);
    this.menus.set(h('div.menu-screen.interactive', { onclick: () => this.resume() }, h('div.menu-col', {},
      h('h1.title', { style: { fontSize: '54px' } }, `Day ${this.sim.state.time.day}`),
      h('div.tagline', {}, this.sim.state.time.day === 1 ? 'The Hollis place. Yours now. The realtor left a letter on the kitchen table.' : 'Back to work.'),
      h('button.btn.big', {}, 'Click to begin'))), 'start');
  }

  hookSim() {
    const E = this.sim.events, A = this.audio, sim = this.sim;
    E.on('notify', (n) => { this.hud.toast(n.text, n.level); if (!n.quiet && n.level === 'level') A.play('coin'); });
    E.on('alert', (a) => { this.hud.alert(a, sim); A.play('alert'); });
    E.on('openUI', ({ panel, ref }) => this.openPanel(panel, ref));
    E.on('loreOpened', ({ id }) => { this.panels.doc(id); A.play('ui', { f: 330 }); });
    E.on('footstep', (e) => A.play('footstep', e));
    E.on('sfx', (e) => A.play(e.id, e));
    E.on('shot', (e) => A.play(e.weapon));
    E.on('reload', () => A.play('reload'));
    E.on('swing', () => A.play('swing'));
    E.on('hitmarker', (e) => { this.hud.hitmarker(e.kill); A.play('hitmarker', e); });
    E.on('creatureHit', (e) => A.play('hit', { x: e.c.x, z: e.c.z }));
    E.on('playerHurt', () => A.play('hurt'));
    E.on('flareThrown', (e) => A.play('flare', { x: e.x, z: e.z }));
    E.on('harvest', () => {});
    E.on('sold', () => A.play('coin'));
    E.on('creatureSpawn', (c) => {
      const id = { gnawer: 'gnawer_call', drifter: 'drifter_moan', antlered: 'antler_bellow' }[c.type];
      if (id && !c.opts.watcher) setTimeout(() => A.play(id, { x: c.x, z: c.z }), 400 + Math.random() * 1500);
    });
    E.on('nightStart', () => { A.play('night'); });
    E.on('dawn', () => A.play('dawn'));
    E.on('duskWarning', () => { this.hud.toast('The sun is going down. Fuel the generator and get the lights on.', 'warn', 5000); A.play('alert'); });
    E.on('stakeDriven', () => A.play('sting'));
    E.on('riteBegun', () => A.play('sting'));
    E.on('levelUp', () => A.play('coin'));
    E.on('autosave', ({ reason }) => { try { saveToSlot('autosave', sim.state, { reason }); } catch (e) { console.warn('autosave failed', e); } });
    E.on('morning', (r) => {
      if (this.state === 'downed') return; // shown after the fade
      this.unlockForPanel();
      this.panels.report(r, () => {});
    });
    E.on('playerDown', () => this.onPlayerDown());
    E.on('ending', () => { this.endingPending = true; });
    E.on('objectives', () => {});
  }

  openPanel(panel, ref) {
    if (panel === 'laptop') this.panels.laptop();
    else if (panel === 'sell') this.panels.sell();
    else if (panel === 'storage') this.panels.storage();
    else if (panel === 'structure') this.panels.structure(ref);
    else if (panel === 'property') this.panels.ledger('property');
    else if (panel === 'cameras') this.openCameras();
  }

  openCameras() {
    this.panels.cameras((cam) => this.renderer.setCCTV(cam));
    if (!this.panels.isOpen()) this.renderer.setCCTV(null);
  }

  onPanelOpened(kind) {
    this.input.unlock();
    // time stands still while you read & shop during the day; not at night
    if (this.sim && kind !== 'cameras' && !this.sim.isNight() && !this.sim.creatures.length) { this.sim.paused = true; this.sim.uiPausedTime = true; }
  }
  onPanelClosed() {
    if (!this.sim) return;
    this.sim.paused = false; this.sim.uiPausedTime = false;
    this.renderer?.setCCTV(null);
    if (this.endingPending && this.state === 'playing') { this.endingPending = false; this.showEnding(); return; }
    if (this.state === 'playing') this.input.lock();
  }
  unlockForPanel() { this.input.unlock(); }

  showEnding() {
    this.state = 'paused'; this.sim.paused = true; this.input.unlock();
    this.menus.ending(() => { this.menus.clear(); this.resume(); });
  }

  // ---------------------------------------------------------------- pause
  pause() {
    if (!this.sim || this.state === 'downed') return;
    this.state = 'paused';
    this.sim.paused = true;
    this.input.unlock();
    this.menus.pause();
  }

  resume() {
    if (!this.sim) return;
    this.audio.init();
    this.audio.applyVolumes();
    this.menus.clear();
    this.state = 'playing';
    this.sim.paused = this.panels.isOpen() && this.sim.uiPausedTime;
    this.input.lock();
    if (this.sim.state.time.day === 1 && !this._greeted) { this._greeted = true; setTimeout(() => this.hud.toast('Read the realtor\'s letter on the kitchen table (E).', 'info', 5000), 800); }
  }

  canSave() { return this.sim ? canSaveNow(this.sim) : 'No game running'; }
  saveGame(slot) {
    const err = this.canSave();
    if (err) { this.hud.toast(err, 'warn'); return err; }
    try { saveToSlot(slot, this.sim.state); this.hud.toast('Game saved', 'good'); return null; } catch (e) { this.hud.toast(`Save failed: ${e.message}`, 'warn'); return e.message; }
  }

  applySettings() {
    this.audio.applyVolumes();
    this.renderer?.applyGraphics(this.settings);
    if (this.sim) this.sim.state.settingsHints = this.settings.gameplay.hints;
  }

  onPlayerDown() {
    this.state = 'downed';
    this.panels.close();
    this.build.active = false;
    this.input.unlock();
    this.fadeTarget = 1;
    setTimeout(() => this.menus.fade('Everything goes dark.', 'The night carries on without you.'), 1200);
    setTimeout(() => {
      this.sim.resolveDowned();
      this.fadeTarget = 0;
      this.state = 'paused';
      this.menus.clear();
      const r = this.sim.state.night.lastReport;
      if (r) this.panels.report(r, () => {});
      else this.resume();
    }, 4500);
  }

  // ---------------------------------------------------------------- keys
  onKeyDown(e) {
    if (this.input.onKey) return;
    if (e.code === 'Escape') {
      if (this.state === 'playing' || this.state === 'paused') {
        if (this.panels.isOpen()) { this.panels.close(); return; }
        if (this.build.active) { this.toggleBuild(false); return; }
        if (this.state === 'playing') this.pause();
        else if (this.menus.screen === 'pause') this.resume();
        else if (this.menus.screen === 'settings' || this.menus.screen === 'save' || this.menus.screen === 'load' || this.menus.screen === 'about') this.menus.pause();
      }
      return;
    }
    if (this.state !== 'playing') return;
    const b = this.settings.controls.bindings;
    if (this.panels.open?.kind === 'cameras' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { this.panels.open.pick(e.code === 'ArrowLeft' ? -1 : 1); return; }
    if (e.code === b.ledger) { e.preventDefault(); if (this.panels.open?.kind === 'ledger') this.panels.close(); else this.panels.ledger(); return; }
    if (this.panels.isOpen()) return;
    if (e.code === b.build) { this.toggleBuild(!this.build.active); return; }
    if (e.code === b.map) { this.panels.ledger('map'); return; }
    if (e.code === b.tablet) {
      if (this.sim.state.owned.tablet) this.openCameras();
      else this.hud.toast('You need the camera tablet (Feed & Supply) - or use the monitor on the desk.', 'info');
    }
  }

  // ---------------------------------------------------------------- build mode
  toggleBuild(on) {
    this.build.active = on;
    this.buildUI.classList.toggle('hidden', !on);
    if (on) this.renderBuildUI();
  }

  renderBuildUI() {
    const st = this.sim.state;
    const lv = farmLevel(st).level;
    this.buildUI.innerHTML = '';
    const bar = h('div.build-bar');
    BUILD_ORDER.forEach((id, i) => {
      const d = BUILDABLES[id];
      const locked = (d.level && d.level > lv) || (d.requiresLore && !st.lore.found.includes(d.requiresLore));
      if (d.requiresLore && !st.lore.found.includes(d.requiresLore)) return;
      const cost = costOf(id);
      const mats = Object.entries(cost.mats).map(([k, v]) => `${v} ${k === 'parts' ? 'parts' : 'lumber'}`).join(' · ');
      bar.append(h(`div.build-item${this.build.type === id ? '.sel' : ''}${locked ? '.locked' : ''}`, {},
        h('div.nm', {}, `${(i + 1) % 10} ${d.name}`), h('div.cs', {}, `$${cost.money}${mats ? ' · ' + mats : ''}`)));
    });
    this.buildHelp = h('div.build-help');
    this.buildUI.append(this.buildHelp, bar);
  }

  updateBuild(input) {
    const sim = this.sim, st = sim.state, b = this.build;
    const ids = BUILD_ORDER.filter((id) => !BUILDABLES[id].requiresLore || st.lore.found.includes(BUILDABLES[id].requiresLore));
    for (let i = 0; i <= 9; i++) if (this.input.hitCode('Digit' + i)) { const id = ids[(i + 9) % 10]; if (id) { b.type = id; this.renderBuildUI(); } }
    if (input.wheel) b.rot += input.wheel * Math.PI / 8;
    if (this.input.hit('reload')) b.rot += Math.PI / 4;
    // aim point on the ground
    const o = eyePos(sim), d = viewDir(st.player);
    let px = o.x + d.x * 5, pz = o.z + d.z * 5;
    for (let t = 1; t < 14; t += 0.2) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= heightAt(x, z)) { px = x; pz = z; break; }
      if (t > 12) { px = o.x + d.x * 6; pz = o.z + d.z * 6; }
    }
    px = Math.round(px * 4) / 4; pz = Math.round(pz * 4) / 4;
    const err = canPlace(sim, b.type, px, pz, b.rot) || affordable(st, costOf(b.type));
    b.x = px; b.z = pz; b.ok = !err;
    const d0 = BUILDABLES[b.type];
    this.buildHelp.innerHTML = `<div><b>${d0.name}</b> — ${d0.desc}</div><div class="${err ? 'why' : 'muted'}">${err || 'LMB place · R / wheel rotate · 1-0 choose · B or Esc exit'}</div>`;
    if (input.use) {
      if (err) { this.hud.toast(err, 'warn'); this.audio.play('ui', { f: 200 }); }
      else {
        const r = place(sim, b.type, px, pz, b.rot);
        if (r.err) this.hud.toast(r.err, 'warn');
        else { this.audio.play('hammer'); sim.tutorialEvent('build'); this.renderBuildUI(); }
      }
    }
    if (input.aim) this.toggleBuild(false);
  }

  // ---------------------------------------------------------------- main loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const limit = this.settings.graphics.fpsLimit;
    if (limit && now - this.last < 1000 / limit - 1) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    if (!this.sim || !this.renderer || this.state === 'loading' || this.state === 'error') { this.input.endFrame(); return; }
    const sim = this.sim;
    const playing = this.state === 'playing' && !this.panels.isOpen();
    const gameplay = playing && !this.build.active ? true : playing;
    const input = this.input.frame(gameplay);
    if (playing) {
      const sens = 0.0022 * this.settings.controls.sensitivity;
      const p = sim.state.player;
      p.yaw -= input.lookDX * sens;
      p.pitch -= input.lookDY * sens * (this.settings.controls.invertY ? -1 : 1);
      p.pitch = clamp(p.pitch, -1.45, 1.45);
      if (this.build.active) {
        this.updateBuild(input);
        input.use = false; input.useHeld = false; input.reload = false; input.slot = null; input.aim = false;
      } else if (input.wheel) {
        // cycle hotbar
        const order = ['shovel', 'revolver', 'shotgun', 'can', 'seeds', 'hammer', 'flare', 'medkit', 'fertilizer'];
        let s = p.slot;
        for (let i = 0; i < 9; i++) { s = ((s - 1 + input.wheel + 9) % 9) + 1; if (slotAvailable(sim, order[s - 1])) break; }
        input.slot = s;
      }
    }
    try {
      if (this.state === 'playing' || this.state === 'downed' || (this.panels.isOpen() && !sim.paused)) sim.update(dt, playing ? input : {});
    } catch (e) { console.error('sim update failed', e); }
    // presentation
    this.updateAudio(dt);
    if (this.panels.open?.kind === 'cameras' && this.panels.open.stamp) this.panels.open.stamp.textContent = this.panels.open.stamp.textContent.replace(/\d+:\d\d [AP]M/, require12(sim.state.time.minute));
    this.fadeV += ((this.fadeTarget || 0) - this.fadeV) * Math.min(1, dt * 1.5);
    this.hud.update(sim, dt, { hints: this.settings.gameplay.hints, showFps: this.settings.gameplay.showFps, fps: this.fps, calls: this.renderer.stats?.calls });
    const ghost = this.build.active && this.build.x != null ? { type: this.build.type, x: this.build.x, z: this.build.z, rot: this.build.rot, ok: this.build.ok } : null;
    try {
      this.renderer.render(dt, { lookDX: input.lookDX, lookDY: input.lookDY, ghost, fade: this.fadeV, onThunder: (b) => this.audio.play('thunder', b) });
    } catch (e) { console.error('render failed', e); }
    this.input.endFrame();
  }

  updateAudio(dt) {
    const A = this.audio, sim = this.sim;
    if (!A.ready) return;
    const cam = this.renderer.camera;
    const d = viewDir(sim.state.player);
    A.setListener({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, d);
    // continuous positional loops
    for (const net of sim.rt.networks || []) for (const g of net.gens) A.setLoop('gen_' + g.id, 'generator', g.x, g.z, g.hp > 0 && g.fuel > 0 && (g.mode === 'on' || (g.mode === 'auto' && (sim.state.time.minute >= 1140 || sim.state.time.minute < 390))));
    for (const s of sim.state.structures) if (s.type === 'decoy') A.setLoop('decoy_' + s.id, 'decoy', s.x, s.z, s.activeUntil > sim.clockSeconds);
    const seen = new Set();
    let minD = 999, near = 0;
    const p = sim.state.player;
    for (const c of sim.creatures) {
      if (!c.alive || (c.hiddenUntil > sim.clockSeconds)) continue;
      const dd = Math.hypot(c.x - p.x, c.z - p.z);
      if (!c.opts.watcher) { minD = Math.min(minD, dd); if (dd < 30) near++; }
      if (c.type === 'hollow') { A.setLoop('hollow_' + c.id, 'hollow', c.x, c.z, true); seen.add('hollow_' + c.id); }
      // idle vocalisations
      if (Math.random() < dt * (c.type === 'gnawer' ? 0.08 : c.type === 'drifter' ? 0.05 : c.type === 'antlered' ? 0.03 : 0)) {
        A.play({ gnawer: 'gnawer_call', drifter: 'drifter_moan', antlered: 'antler_snort' }[c.type], { x: c.x, z: c.z });
      }
    }
    for (const id of [...A.loops.keys()]) if (id.startsWith('hollow_') && !seen.has(id)) A.setLoop(id, 'hollow', 0, 0, false);
    const night = sim.isNight();
    const tension = clamp((night ? 0.12 : 0) + (minD < 60 ? (1 - minD / 60) * 0.75 : 0) + near * 0.05 + (sim.state.lore.rite === 'active' ? 0.2 : 0), 0, 1);
    const day = this.renderer.sky.daylight ?? 1;
    A.update(dt, { day, wind: sim.state.weather.wind || 0.3, rain: this.renderer.weather.rain || 0, indoors: sim.playerIndoors(), tension, hush: minD < 35 ? 1 : 0, x: p.x, z: p.z, health: p.health });
  }
}

function require12(minute) {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440, hh = Math.floor(m / 60), mm = m % 60;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}
