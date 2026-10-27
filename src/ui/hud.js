// Heads-up display: clock, money, objectives, alerts, prompts, hotbar, vitals.
import { h, clear, icon, keyName } from './dom.js';
import { fmtMoney, fmtTime } from '../core/math.js';
import { CROPS } from '../data/crops.js';
import { WEAPONS } from '../data/items.js';
import { WEATHER_TYPES, phaseOf } from '../sim/clock.js';
import { farmLevel, nextLevel, totalProduce } from '../sim/economy.js';
import { currentTool, slotAvailable } from '../sim/player.js';
import { displayName, tankSize } from '../sim/structures.js';
import { FARM_LEVELS } from '../data/items.js';
import { LORE, STAKES } from '../data/lore.js';

const SLOTS = ['shovel', 'revolver', 'shotgun', 'can', 'seeds', 'hammer', 'flare', 'medkit', 'fertilizer'];
const SLOT_NAMES = { shovel: 'Shovel', revolver: 'Revolver', shotgun: 'Shotgun', can: 'Watering can', seeds: 'Seeds', hammer: 'Hammer', flare: 'Flares', medkit: 'First aid', fertilizer: 'Fertilizer' };

export class HUD {
  constructor(root, app) {
    this.app = app;
    this.el = h('div.hud');
    root.append(this.el);
    this.tl = h('div.hud-tl');
    this.clock = h('div.hud-clock');
    this.sub = h('div.hud-sub');
    this.obj = h('div.hud-objective');
    this.tl.append(this.clock, this.sub, this.obj);
    this.tr = h('div.hud-tr');
    this.money = h('div.hud-money');
    this.level = h('div.hud-level');
    this.levelBar = h('div.hud-levelbar', {}, h('i'));
    this.tr.append(this.money, this.level, this.levelBar);
    this.alerts = h('div.hud-alerts');
    this.toasts = h('div.toasts');
    this.cross = h('div.crosshair');
    this.prompt = h('div.prompt');
    this.bl = h('div.hud-bl');
    this.hp = h('div.bar.hp', {}, h('i'));
    this.st = h('div.bar.st', {}, h('i'));
    this.bat = h('div.bar.bat', {}, h('i'));
    this.batLbl = h('div.bar-lbl', {}, h('span', {}, 'Flashlight'), h('span'));
    this.bl.append(h('div.bar-lbl', {}, h('span', {}, 'Health'), h('span')), this.hp, h('div.bar-lbl', {}, h('span', {}, 'Stamina')), this.st, this.batLbl, this.bat);
    this.hotbar = h('div.hotbar');
    this.slots = SLOTS.map((id, i) => {
      const s = h('div.slot', {}, h('span.n', {}, i + 1), icon(id), h('span.c'));
      this.hotbar.append(s);
      return s;
    });
    this.hotLabel = h('div.hotbar-label');
    this.br = h('div.hud-br');
    this.ammo = h('div.ammo');
    this.meta = h('div.meta');
    this.power = h('div.power');
    this.br.append(this.ammo, this.meta, this.power);
    this.fps = h('div.fps');
    this.el.append(this.tl, this.tr, this.alerts, this.toasts, this.cross, this.prompt, this.bl, this.hotLabel, this.hotbar, this.br, this.fps);
    this.hitT = 0;
    this._last = {};
  }

  setVisible(v) { this.el.classList.toggle('hidden', !v); }

  toast(text, level = 'info', ms) {
    const dur = ms || (level === 'night' || level === 'danger' ? 3500 : level === 'lore' || level === 'level' ? 5500 : 3200);
    const t = h(`div.toast.${level}`, {}, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, dur);
  }

  alert(a, sim) {
    const p = sim.state.player;
    const d = a.x != null ? Math.round(Math.hypot(a.x - p.x, a.z - p.z)) : null;
    const dir = a.x != null ? compass(Math.atan2(a.x - p.x, a.z - p.z)) : '';
    const el = h(`div.alert.${a.kind}`, {}, a.text, d != null ? h('span.dist', {}, `${d} m ${dir}`) : null);
    this.alerts.prepend(el);
    while (this.alerts.children.length > 5) this.alerts.lastChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .8s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 900); }, 9000);
  }

  hitmarker(kill) {
    this.cross.classList.add('hit');
    this.cross.classList.toggle('kill', !!kill);
    clearTimeout(this._hitTO);
    this._hitTO = setTimeout(() => this.cross.classList.remove('hit', 'kill'), kill ? 300 : 140);
  }

  objectiveText(sim) {
    const st = sim.state;
    const o = sim.currentObjective();
    if (o && st.settingsHints !== false) return { lbl: 'Objective', text: o.text };
    // mystery thread
    const found = st.lore.found;
    const stakes = STAKES.filter((k) => st.lore.stakes[k]).length;
    if (st.lore.rite === 'done') return { lbl: 'Hollow Acres', text: 'The line holds. Keep the farm growing.' };
    if (st.lore.rite === 'active') return { lbl: 'The Last Harvest', text: 'Survive until dawn.' };
    if (!found.includes('chapel')) return { lbl: 'Mystery', text: 'Dale mentioned a chapel in the north-east woods.' };
    if (!found.includes('survey')) return { lbl: 'Mystery', text: 'Coyle wrote of iron stakes at the corners. A surveyor would know where. Try the woods south-west.' };
    if (stakes < 4) return { lbl: 'Mystery', text: `Drive the iron stakes home at the boundary stones (${stakes}/4). Check the map.` };
    if (!found.includes('stone')) return { lbl: 'Mystery', text: 'Find the Tithe Stone deep in the north woods.' };
    if (!st.inv.produce.pumpkin && !st.barn.produce.pumpkin) return { lbl: 'Mystery', text: 'Grow a pumpkin to offer at the Tithe Stone (farm level 3).' };
    return { lbl: 'Mystery', text: 'Bring a pumpkin to the Tithe Stone before nightfall and perform the rite. Prepare first.' };
  }

  update(sim, dt, opts = {}) {
    const st = sim.state, p = st.player;
    const m = st.time.minute;
    const phase = phaseOf(m);
    const night = phase === 'night';
    this.setText(this.clock, 'clock', `<span class="day">Day ${st.time.day}</span>${fmtTime(m)}`, true);
    const w = WEATHER_TYPES[st.weather.current];
    const phaseName = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk - night is coming', night: st.lore.rite === 'active' ? 'The Last Harvest' : `Night ${st.time.day}` }[phase];
    this.setText(this.sub, 'sub', `${phaseName} · ${w.name}${sim.uiPausedTime ? ' · time paused' : ''}`);
    this.sub.classList.toggle('night', night);
    const obj = this.objectiveText(sim);
    this.setText(this.obj, 'obj', `<span class="lbl">${obj.lbl}</span>${obj.text}`, true);
    this.obj.classList.toggle('hidden', !opts.hints && obj.lbl === 'Objective');
    // money & level
    this.setText(this.money, 'money', fmtMoney(st.money));
    const lv = farmLevel(st), nx = nextLevel(st);
    this.setText(this.level, 'lvl', `Level ${lv.level} · ${lv.title}`);
    const pct = nx ? (st.earned - lv.earned) / (nx.earned - lv.earned) : 1;
    this.levelBar.firstChild.style.width = `${Math.min(100, pct * 100)}%`;
    // vitals
    this.hp.firstChild.style.width = `${p.health}%`;
    this.hp.classList.toggle('low', p.health < 35);
    this.st.firstChild.style.width = `${p.stamina}%`;
    this.bat.firstChild.style.width = `${p.battery}%`;
    this.batLbl.lastChild.textContent = `${Math.round(p.battery)}% · ${st.inv.batteries || 0} spare`;
    // hotbar
    const tool = currentTool(sim);
    SLOTS.forEach((id, i) => {
      const s = this.slots[i];
      s.classList.toggle('sel', tool === id);
      s.classList.toggle('off', !slotAvailable(sim, id));
      let c = '';
      if (id === 'revolver') c = `${p.mag.revolver}/${st.inv.ammo38 || 0}`;
      if (id === 'shotgun') c = st.owned.shotgun ? `${p.mag.shotgun}/${st.inv.shells || 0}` : '';
      if (id === 'can') c = `${p.water}`;
      if (id === 'seeds') c = `${st.inv.seeds[p.seedType] || 0}`;
      if (id === 'flare') c = `${st.inv.flares || 0}`;
      if (id === 'medkit') c = `${st.inv.medkit || 0}`;
      if (id === 'fertilizer') c = `${st.inv.fertilizer || 0}`;
      if (id === 'hammer') c = `${st.inv.planks || 0}·${st.inv.parts || 0}`;
      const cEl = s.querySelector('.c');
      if (cEl.textContent !== c) cEl.textContent = c;
    });
    let label = SLOT_NAMES[tool];
    if (tool === 'seeds') label = `${CROPS[p.seedType]?.name || 'Seeds'} seeds  <kbd>${keyName(this.app.settings.controls.bindings.cycleSeed)}</kbd> change`;
    if (tool === 'hammer') label = `Hammer · ${st.inv.planks || 0} lumber · ${st.inv.parts || 0} parts`;
    this.setText(this.hotLabel, 'hl', label, true);
    // bottom right
    if (tool === 'revolver' || tool === 'shotgun') {
      const reloading = sim.rt.weapon.reloading > 0;
      this.setText(this.ammo, 'ammo', `${p.mag[tool]}<small> / ${st.inv[WEAPONS[tool].ammo] || 0}${reloading ? ' · reloading' : ''}</small>`, true);
    } else if (tool === 'can') this.setText(this.ammo, 'ammo', `${p.water}<small> / ${st.owned.can2 ? 24 : 12} water</small>`, true);
    else this.setText(this.ammo, 'ammo', '');
    this.setText(this.meta, 'meta', `Pack ${totalProduce(st.inv.produce)}/${sim.packCapacity()} produce`);
    // power status (survival info)
    const main = st.structures.find((s) => s.id === 'gen_main');
    const nets = sim.rt.networks || [];
    const anyOver = nets.some((n) => n.overloaded);
    const gens = st.structures.filter((s) => s.type === 'generator');
    const lowFuel = gens.some((g) => g.fuel < 3);
    const off = gens.some((g) => g.hp <= 0 || g.fuel <= 0);
    let pw = '';
    if (night || phase === 'dusk' || lowFuel) {
      const parts = gens.map((g) => `${g.id === 'gen_main' ? 'Main' : 'Gen'} ${g.hp <= 0 ? 'DESTROYED' : `${g.fuel.toFixed(1)}L`}`);
      pw = `Power: ${anyOver ? 'OVERLOADED' : off ? 'FAILING' : 'on'} · ${parts.join(' · ')}`;
    }
    this.setText(this.power, 'pw', pw);
    this.power.className = `power ${anyOver || off ? 'bad' : lowFuel ? 'bad' : 'ok'}`;
    // prompt
    this.updatePrompt(sim);
    // fps
    this.fps.textContent = opts.showFps ? `${opts.fps | 0} fps · ${opts.calls || 0} draws` : '';
  }

  updatePrompt(sim) {
    const f = sim.focus;
    const b = this.app.settings.controls.bindings;
    if (!f || !sim.playerAlive) { this.setText(this.prompt, 'pr', ''); return; }
    const keys = [];
    if (f.e) keys.push(`<span><kbd>${keyName(b.interact)}</kbd>${f.e}</span>`);
    if (f.lmb) keys.push(`<span><kbd>LMB</kbd>${f.lmb}</span>`);
    let prog = '';
    const rt = sim.rt.player;
    if (f.kind === 'structure' && rt.repairTarget === f.ref && rt.repairT > 0) {
      const need = 1.4 + (f.ref.maxHp > 150 ? 0.8 : 0);
      prog = `<div class="progress"><i style="width:${Math.min(100, rt.repairT / need * 100)}%"></i></div>`;
    }
    const html = `<div class="t">${f.title}</div>${f.lines.map((l) => `<div class="l">${l}</div>`).join('')}<div class="k">${keys.join('')}</div>${prog}`;
    this.setText(this.prompt, 'pr', html, true);
  }

  setText(el, key, v, html = false) {
    if (this._last[key] === v) return;
    this._last[key] = v;
    if (html) el.innerHTML = v; else el.textContent = v;
  }
}

export function compass(a) {
  // a: atan2(dx, dz) where +z is south
  const deg = ((180 - (a * 180) / Math.PI) % 360 + 360) % 360; // 0 = north
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}
