// In-game panels: laptop (supply, market, contracts, land, forecast), shipping
// bin, barn storage, structure management, ledger (inventory, property,
// journal, bestiary, map, stats), camera monitor, documents and reports.
import { h, clear, keyName } from './dom.js';
import { fmtMoney, fmtTime } from '../core/math.js';
import { CROPS, CROP_IDS, PLANTABLE } from '../data/crops.js';
import { SUPPLIES, UPGRADES, FARM_LEVELS } from '../data/items.js';
import { BUILDABLES } from '../data/buildables.js';
import { CREATURES, CREATURE_IDS } from '../data/creatures.js';
import { LORE, STAKES } from '../data/lore.js';
import { PARCELS, FIELDS, PLOT_PITCH, BUILDINGS, LANDMARKS, ROAD, POND, FIXTURES } from '../data/layout.js';
import * as econ from '../sim/economy.js';
import * as S from '../sim/structures.js';
import { WEATHER_TYPES } from '../sim/clock.js';
import { plotOwned } from '../sim/farming.js';
import { getVegetation } from '../sim/vegetation.js';

export class Panels {
  constructor(root, app) {
    this.app = app;
    this.root = h('div.panels');
    root.append(this.root);
    this.open = null; // { kind, el, refresh }
  }

  get sim() { return this.app.sim; }
  isOpen() { return !!this.open; }

  close() {
    if (!this.open) return;
    this.open.onClose?.();
    this.open.el.remove();
    this.open = null;
    this.app.onPanelClosed();
  }

  show(kind, build, opts = {}) {
    if (this.open) this.close();
    const ov = h('div.overlay.interactive', { onmousedown: (e) => { if (e.target === ov && !opts.modal) this.close(); } });
    const state = { kind, el: ov, tab: opts.tab, refresh: null, onClose: opts.onClose };
    this.open = state;
    const render = () => { clear(ov); ov.append(build(state, render)); };
    state.refresh = render;
    render();
    this.root.append(ov);
    this.app.onPanelOpened(kind, opts);
  }

  refresh() { this.open?.refresh?.(); }

  panelFrame(title, sub, tabs, state, render, body, opts = {}) {
    const st = this.sim.state;
    const head = h('header', {}, h('h2', {}, title), sub ? h('span.sub', {}, sub) : null,
      opts.noMoney ? h('span', { style: { marginLeft: 'auto' } }) : h('span.money', {}, fmtMoney(st.money)),
      h('button.close', { onclick: () => this.close() }, 'Close  Esc'));
    const tabsEl = tabs ? h('div.tabs', {}, tabs.map(([id, label]) => h(`button.tab${state.tab === id ? '.on' : ''}`, { onclick: () => { state.tab = id; render(); this.app.audio.play('ui', { f: 520 }); } }, label))) : null;
    return h(`div.panel${opts.narrow ? '.narrow' : ''}`, {}, head, tabsEl, h('div.body', {}, body));
  }

  act(fn) {
    const err = fn();
    if (typeof err === 'string') { this.app.hud.toast(err, 'warn'); this.app.audio.play('ui', { f: 220 }); }
    else this.app.audio.play('coin');
    this.refresh();
  }

  // ------------------------------------------------------------------ laptop
  laptop(tab = 'supply') {
    this.show('laptop', (state, render) => {
      const sim = this.sim, st = sim.state;
      const open = econ.shopOpen(st);
      const lv = econ.farmLevel(st).level;
      let body;
      if (state.tab === 'supply') {
        const seedCards = PLANTABLE.map((id) => {
          const c = CROPS[id];
          const locked = c.level > lv;
          return h(`div.card${locked ? '.locked' : ''}`, {},
            h('div.nm', {}, `${c.name} seeds`, h('span.pr', {}, `$${c.seedCost}`)),
            h('div.ds', {}, `${c.note} ${Math.round(c.growHours / 24 * 10) / 10} days · yields ~${c.yield} × $${econ.priceOf(st, id)}${c.regrowHours ? ' · regrows' : ''}`),
            h('div.ds.muted', {}, locked ? `Unlocks at farm level ${c.level}` : `You have ${st.inv.seeds[id] || 0}`),
            h('div.row', {}, [1, 5, 10].map((n) => h('button.btn', { disabled: locked || !open || st.money < c.seedCost * n, onclick: () => this.act(() => econ.buySeeds(sim, id, n)) }, `Buy ${n}`))));
        });
        const supCards = Object.values(SUPPLIES).map((d) => {
          const locked = d.level && d.level > lv;
          const have = st.inv[d.id] || 0;
          return h(`div.card${locked ? '.locked' : ''}`, {},
            h('div.nm', {}, d.name, h('span.pr', {}, `$${d.cost}`)), h('div.ds', {}, d.desc),
            h('div.ds.muted', {}, locked ? `Unlocks at farm level ${d.level}` : d.id === 'chicken' ? `Hens: ${st.animals.chickens} / 12` : `In stock at home: ${have}`),
            h('div.row', {}, [1, 5].map((n) => h('button.btn', { disabled: locked || !open || st.money < d.cost * n, onclick: () => this.act(() => econ.buySupply(sim, d.id, n)) }, `Buy ${n}`))));
        });
        const upCards = Object.values(UPGRADES).map((d) => {
          const owned = !!st.owned[d.id];
          const locked = d.level && d.level > lv;
          return h(`div.card${locked ? '.locked' : ''}`, {},
            h('div.nm', {}, d.name, h('span.pr', {}, owned ? 'Owned' : `$${d.cost}`)), h('div.ds', {}, d.desc),
            locked ? h('div.ds.muted', {}, `Unlocks at farm level ${d.level}`) : null,
            h('div.row', {}, h('button.btn', { disabled: owned || locked || !open || st.money < d.cost, onclick: () => this.act(() => econ.buyUpgrade(sim, d.id)) }, owned ? 'Owned' : 'Buy')));
        });
        body = [
          !open ? h('div.card', {}, h('div.ds.bad', {}, 'Hollis Feed & Supply is closed. Open 6 AM - 8 PM. You can still read market prices and contracts.')) : null,
          h('div.section-title', {}, 'Seeds'), h('div.grid', {}, seedCards),
          h('div.section-title', {}, 'Supplies'), h('div.grid', {}, supCards),
          h('div.section-title', {}, 'Tools & upgrades'), h('div.grid', {}, upCards),
        ];
      } else if (state.tab === 'market') {
        const rows = CROP_IDS.map((id) => {
          const c = CROPS[id];
          const tr = st.market.trend[id];
          const have = (st.inv.produce[id] || 0), inBarn = (st.barn.produce[id] || 0);
          return h('tr', {}, h('td', {}, c.produce, st.market.hot === id ? h('span.accent', {}, '  ★ in demand') : null),
            h('td', {}, `$${econ.priceOf(st, id)}`, h(`span.trend.${tr > 0 ? 'up' : tr < 0 ? 'down' : ''}`, {}, tr > 0 ? ' ▲' : tr < 0 ? ' ▼' : ' ·')),
            h('td.muted', {}, `${have} carried · ${inBarn} in barn`),
            h('td', {}, h('button.btn', { disabled: !inBarn, onclick: () => this.act(() => { econ.sell(sim, id, inBarn, 'barn'); }) }, inBarn ? `Sell barn stock (+$${inBarn * econ.priceOf(st, id)})` : 'Sell barn stock')));
        });
        body = [h('div.ds.muted', {}, 'Prices move each morning within ±25% of normal. The starred crop sells for 35% more today. Carried produce is sold at the shipping bin; barn stock can be sold here.'),
          h('table.t', { style: { marginTop: '10px' } }, h('tr', {}, h('th', {}, 'Produce'), h('th', {}, 'Today'), h('th', {}, 'Owned'), h('th', {}, '')), rows)];
        body.push(h('div.ds.muted', { style: { marginTop: '8px' } }, `Hens: ${st.animals.chickens} · eggs waiting at the coop: ${st.animals.eggs || 0}`));
      } else if (state.tab === 'contracts') {
        const list = st.contracts.map((c) => {
          const have = econ.contractHave(st, c);
          const days = c.dueDay - st.time.day;
          return h('div.card', {}, h('div.nm', {}, `${c.qty} × ${CROPS[c.crop].produce}`, h('span.pr', {}, `$${c.reward}`)),
            h('div.ds', {}, `For ${c.from}. ${days <= 0 ? 'Due today' : `Due in ${days} day${days > 1 ? 's' : ''}`}. Market value ~$${c.qty * econ.priceOf(st, c.crop)}.${c.bonus ? ' Includes a bonus supply crate.' : ''}`),
            h('div.ds.muted', {}, `You have ${have} (pack + barn)`),
            h('div.row', {}, h('button.btn', { disabled: have < c.qty, onclick: () => this.act(() => econ.fulfillContract(sim, c.id)) }, 'Deliver')));
        });
        body = [h('div.ds.muted', {}, 'Buyers in Corran post delivery contracts. They pay well above market. New offers appear each morning.'), h('div.grid', { style: { marginTop: '10px' } }, list.length ? list : h('div.muted', {}, 'No contracts right now.'))];
      } else if (state.tab === 'land') {
        body = h('div.grid', {}, PARCELS.filter((p) => p.cost > 0).map((p) => {
          const owned = st.owned.parcels.includes(p.id);
          const locked = (p.minLevel || 1) > lv;
          return h(`div.card${locked ? '.locked' : ''}`, {}, h('div.nm', {}, p.name, h('span.pr', {}, owned ? 'Owned' : fmtMoney(p.cost))), h('div.ds', {}, p.desc),
            locked ? h('div.ds.muted', {}, `Requires farm level ${p.minLevel}`) : null,
            h('div.ds.muted', {}, 'More fields mean more income - and more crops to defend at night.'),
            h('div.row', {}, h('button.btn', { disabled: owned || locked || st.money < p.cost, onclick: () => this.act(() => econ.buyParcel(sim, p.id)) }, owned ? 'Owned' : 'Clear & till')));
        }));
      } else {
        const w = st.weather;
        const cur = WEATHER_TYPES[w.current], nxt = WEATHER_TYPES[w.next];
        body = [h('div.card', {}, h('div.nm', {}, 'Corran County forecast'),
          h('div.ds', {}, `Now: ${cur.name}. ${cur.rain ? 'Rain is watering your fields.' : ''}`),
          h('div.ds', {}, `Expected next (around ${fmtTime(w.changeAt)}): ${nxt.name}.`),
          h('div.ds.muted', {}, 'Fog cuts how far you can see - and how far they can. Storms bring rain and lightning. Rain waters crops for free.'))];
      }
      return this.panelFrame('Laptop', open ? 'Hollis Feed & Supply · open' : 'Feed & Supply closed', [['supply', 'Supply'], ['market', 'Market'], ['contracts', `Contracts (${st.contracts.length})`], ['land', 'Fields'], ['forecast', 'Forecast']], state, render, body);
    }, { tab });
  }

  // ------------------------------------------------------------- shipping bin
  sell() {
    this.show('sell', (state, render) => {
      const sim = this.sim, st = sim.state;
      const ids = Object.keys(st.inv.produce).filter((k) => st.inv.produce[k] > 0);
      const total = ids.reduce((a, id) => a + st.inv.produce[id] * econ.priceOf(st, id), 0);
      const rows = ids.map((id) => h('tr', {}, h('td', {}, CROPS[id].produce, st.market.hot === id ? h('span.accent', {}, ' ★') : null), h('td', {}, st.inv.produce[id]), h('td', {}, `$${econ.priceOf(st, id)} ea`),
        h('td', {}, h('button.btn', { onclick: () => this.act(() => { econ.sell(sim, id, 1); sim.tutorialEvent('sell'); }) }, 'Sell 1'), ' ', h('button.btn', { onclick: () => this.act(() => { econ.sell(sim, id, st.inv.produce[id]); sim.tutorialEvent('sell'); }) }, `Sell all (+$${st.inv.produce[id] * econ.priceOf(st, id)})`))));
      const body = [ids.length ? h('table.t', {}, h('tr', {}, h('th', {}, 'Produce'), h('th', {}, 'Qty'), h('th', {}, 'Price'), h('th', {}, '')), rows) : h('div.muted', {}, 'You aren\'t carrying any produce. Harvest ripe crops with E.'),
        ids.length ? h('div.row', { style: { marginTop: '14px', display: 'flex', gap: '8px' } }, h('button.btn.big', { onclick: () => this.act(() => { econ.sellAll(sim); sim.tutorialEvent('sell'); }) }, `Sell everything (+${fmtMoney(total)})`)) : null,
        h('div.ds.muted', { style: { marginTop: '12px' } }, 'Check the laptop for contracts first - they pay more.')];
      return this.panelFrame('Shipping bin', 'Sold at today\'s market price', null, state, render, body, { narrow: true });
    });
  }

  // ------------------------------------------------------------ barn storage
  storage() {
    this.show('storage', (state, render) => {
      const sim = this.sim, st = sim.state;
      const cap = sim.barnCapacity();
      const stored = econ.totalProduce(st.barn.produce);
      const ids = [...new Set([...Object.keys(st.inv.produce), ...Object.keys(st.barn.produce)])].filter((k) => (st.inv.produce[k] || 0) + (st.barn.produce[k] || 0) > 0);
      const move = (id, n, toBarn) => {
        const from = toBarn ? st.inv.produce : st.barn.produce, to = toBarn ? st.barn.produce : st.inv.produce;
        const room = toBarn ? cap - econ.totalProduce(st.barn.produce) : sim.packRoom();
        const k = Math.min(n, from[id] || 0, room);
        if (k <= 0) return toBarn ? 'Barn storage is full' : 'Your pack is full';
        from[id] -= k; if (from[id] <= 0) delete from[id];
        to[id] = (to[id] || 0) + k;
        return null;
      };
      const rows = ids.map((id) => h('tr', {}, h('td', {}, CROPS[id].produce), h('td', {}, st.inv.produce[id] || 0), h('td', {}, st.barn.produce[id] || 0),
        h('td', {}, h('button.btn', { onclick: () => this.act(() => move(id, 999, true)) }, 'Store all'), ' ', h('button.btn.ghost', { onclick: () => this.act(() => move(id, 10, false)) }, 'Take 10'))));
      const body = [h('div.ds', {}, `Barn storage: ${stored} / ${cap}. Pack: ${econ.totalProduce(st.inv.produce)} / ${sim.packCapacity()}.`),
        ids.length ? h('table.t', { style: { marginTop: '10px' } }, h('tr', {}, h('th', {}, 'Produce'), h('th', {}, 'Pack'), h('th', {}, 'Barn'), h('th', {}, '')), rows) : h('div.muted', { style: { marginTop: '10px' } }, 'Nothing to store.'),
        h('div.row', { style: { marginTop: '12px', display: 'flex', gap: '8px' } }, h('button.btn', { onclick: () => this.act(() => { let e = null; for (const id of Object.keys(st.inv.produce)) e = move(id, 999, true) || e; return e; }) }, 'Store everything')),
        h('div.ds.muted', { style: { marginTop: '10px' } }, 'Stored produce can be sold from the laptop Market tab or used for contracts. Upgrade shelving at Feed & Supply.')];
      return this.panelFrame('Barn storage', null, null, state, render, body, { narrow: true });
    });
  }

  // -------------------------------------------------------- structure panel
  structure(s) {
    this.show('structure', (state, render) => {
      const sim = this.sim, st = sim.state;
      const def = S.defOf(s);
      const lines = [];
      const actions = [];
      lines.push(h('div.ds', {}, def.desc || ''));
      lines.push(h('div.ds', {}, `Condition: ${Math.round(s.hp)} / ${s.maxHp}`, ' ', hpBar(s.hp / s.maxHp)));
      if (S.needsRepair(s)) {
        const c = S.repairCost(s);
        lines.push(h('div.ds.accent', {}, `Needs repair: ${Object.entries(c.mats).map(([k, v]) => `${v} ${k === 'parts' ? 'spare parts' : 'lumber'}`).join(', ')}${c.money ? ` + $${c.money}` : ''}. Use the hammer (6), hold LMB.`));
      }
      if (s.type === 'generator') {
        const tank = S.tankSize(st);
        const net = (sim.rt.networks || []).find((n) => n.gens.includes(s));
        lines.push(h('div.ds', {}, `Fuel: ${s.fuel.toFixed(1)} / ${tank} L · You have ${st.inv.fuel || 0} fuel cans (10 L each)`));
        lines.push(h('div.ds', {}, `Mode: ${s.mode.toUpperCase()} - ${s.mode === 'auto' ? 'runs 7 PM to 6:30 AM' : s.mode === 'on' ? 'always on' : 'off'}`));
        if (net) lines.push(h('div.ds', {}, `Network load: ${net.load} / ${net.capacity || 0}${net.overloaded ? ' - OVERLOADED' : ''} · burn ≈ ${(0.32 + 0.17 * net.load).toFixed(2)} L/hour while running`));
        actions.push(h('button.btn', { disabled: !(st.inv.fuel > 0) || s.fuel >= tank - 0.1, onclick: () => this.act(() => { if (!(st.inv.fuel > 0)) return 'No fuel cans - buy them at Feed & Supply'; st.inv.fuel--; s.fuel = Math.min(tank, s.fuel + 10); sim.events.emit('powerChanged'); sim.tutorialEvent('generator'); return null; }) }, 'Refuel (+10 L)'));
        for (const m of ['auto', 'on', 'off']) actions.push(h(`button.btn${s.mode === m ? '' : '.ghost'}`, { onclick: () => this.act(() => { s.mode = m; sim.events.emit('powerChanged'); sim.events.emit('structureChanged', s); return null; }) }, m === 'auto' ? 'Auto (dusk-dawn)' : m === 'on' ? 'Always on' : 'Off'));
      }
      if (s.type === 'floodlight') {
        lines.push(h('div.ds', {}, s.powered ? 'Powered.' : s.network ? 'On a network, but no power right now.' : 'Not connected: needs a generator or power pole within 26 m.'));
        actions.push(h('button.btn', { onclick: () => this.act(() => { s.on = s.on === false; sim.events.emit('powerChanged'); return null; }) }, s.on === false ? 'Switch on' : 'Switch off'));
      }
      if (s.type === 'camera') lines.push(h('div.ds', {}, `${s.name}: ${s.powered ? 'online' : 'offline - needs power'}. View from the desk monitor${st.owned.tablet ? ' or tablet (V)' : ''}.`));
      if (s.type === 'trap') lines.push(h('div.ds', {}, s.armed ? 'Armed.' : 'Sprung - rearm with E (1 spare part).'));
      const up = S.upgradeCost(s);
      if (up) actions.push(h('button.btn', { onclick: () => this.act(() => S.upgrade(sim, s)) }, `Upgrade to ${def.upgrade.name} ($${up.money}${Object.entries(up.mats).map(([k, v]) => ` + ${v} ${k === 'parts' ? 'parts' : 'lumber'}`).join('')})`));
      if (!s.fixed) actions.push(h('button.btn.danger', { onclick: () => { S.demolish(sim, s); this.close(); this.app.hud.toast('Demolished (40% refunded)', 'info'); } }, 'Demolish'));
      return this.panelFrame(S.displayName(s), null, null, state, render, [...lines, h('div.row', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } }, actions)], { narrow: true });
    });
  }

  // ----------------------------------------------------------------- ledger
  ledger(tab = 'inventory') {
    this.show('ledger', (state, render) => {
      const sim = this.sim, st = sim.state;
      let body;
      if (state.tab === 'inventory') body = this.inventoryBody(sim);
      else if (state.tab === 'property') body = this.propertyBody(sim);
      else if (state.tab === 'contracts') body = h('div.grid', {}, st.contracts.map((c) => h('div.card', {}, h('div.nm', {}, `${c.qty} × ${CROPS[c.crop].produce}`, h('span.pr', {}, `$${c.reward}`)), h('div.ds', {}, `${c.from} · due day ${c.dueDay} · you have ${econ.contractHave(st, c)}`), h('div.ds.muted', {}, 'Deliver from the laptop.'))));
      else if (state.tab === 'journal') body = this.journalBody(sim, state, render);
      else if (state.tab === 'map') body = this.mapBody(sim);
      else body = this.statsBody(sim);
      return this.panelFrame('Farm ledger', `Day ${st.time.day}`, [['inventory', 'Inventory'], ['property', 'Property'], ['contracts', 'Contracts'], ['journal', 'Journal'], ['map', 'Map'], ['stats', 'Records']], state, render, body);
    }, { tab });
  }

  inventoryBody(sim) {
    const st = sim.state;
    const seeds = Object.entries(st.inv.seeds).filter(([, v]) => v > 0);
    const produce = Object.entries(st.inv.produce).filter(([, v]) => v > 0);
    const barn = Object.entries(st.barn.produce).filter(([, v]) => v > 0);
    const sup = Object.values(SUPPLIES).map((d) => [d.name.replace(/ \(.+\)/, ''), d.id === 'chicken' ? st.animals.chickens : st.inv[d.id] || 0]);
    const tools = [['Shovel', true], ['Revolver', st.owned.revolver], ['Shotgun', st.owned.shotgun], ...Object.values(UPGRADES).filter((u) => u.id !== 'shotgun').map((u) => [u.name, st.owned[u.id]])];
    return [
      h('div.grid', {},
        h('div.card', {}, h('div.nm', {}, 'Seeds'), seeds.length ? seeds.map(([k, v]) => h('div.ds', {}, `${CROPS[k].name}: ${v}`)) : h('div.ds.muted', {}, 'None')),
        h('div.card', {}, h('div.nm', {}, `Pack (${econ.totalProduce(st.inv.produce)}/${sim.packCapacity()})`), produce.length ? produce.map(([k, v]) => h('div.ds', {}, `${CROPS[k].produce}: ${v}`)) : h('div.ds.muted', {}, 'Empty')),
        h('div.card', {}, h('div.nm', {}, `Barn (${econ.totalProduce(st.barn.produce)}/${sim.barnCapacity()})`), barn.length ? barn.map(([k, v]) => h('div.ds', {}, `${CROPS[k].produce}: ${v}`)) : h('div.ds.muted', {}, 'Empty')),
        h('div.card', {}, h('div.nm', {}, 'Supplies'), sup.map(([n, v]) => h('div.ds', {}, `${n}: ${v}`))),
        h('div.card', {}, h('div.nm', {}, 'Equipment'), tools.map(([n, v]) => h(`div.ds${v ? '' : '.muted'}`, {}, `${v ? '✓' : '·'} ${n}`))),
        h('div.card', {}, h('div.nm', {}, 'Loaded'), h('div.ds', {}, `Revolver ${st.player.mag.revolver}/6`), st.owned.shotgun ? h('div.ds', {}, `Shotgun ${st.player.mag.shotgun}/5`) : null, h('div.ds', {}, `Watering can ${st.player.water}/${st.owned.can2 ? 24 : 12}`), h('div.ds', {}, `Flashlight ${Math.round(st.player.battery)}%`))),
    ];
  }

  propertyBody(sim) {
    const st = sim.state;
    const list = [...st.structures].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    const rows = list.map((s) => {
      const r = s.hp / s.maxHp;
      const c = S.needsRepair(s) ? S.repairCost(s) : null;
      const extra = s.type === 'generator' ? `${s.fuel.toFixed(1)} L · ${s.mode}` : s.type === 'floodlight' ? (s.bulb === false ? 'bulb blown' : s.powered ? 'lit' : 'unpowered') : s.type === 'camera' ? (s.powered ? 'online' : 'offline') : s.type === 'trap' ? (s.armed ? 'armed' : 'sprung') : '';
      return h('tr', {}, h('td', {}, S.displayName(s)), h('td', {}, hpBar(r), ' ', h('span.muted', {}, `${Math.round(r * 100)}%`)), h('td.muted', {}, extra),
        h('td', {}, c ? `${Object.entries(c.mats).map(([k, v]) => `${v} ${k === 'parts' ? 'parts' : 'lumber'}`).join(', ')}${c.money ? ` +$${c.money}` : ''}` : h('span.good', {}, 'OK')));
    });
    const plots = st.plots.filter((p) => plotOwned(st, p));
    const planted = plots.filter((p) => p.crop && !p.dead).length, ruined = plots.filter((p) => p.dead).length, dry = plots.filter((p) => p.crop && !p.dead && p.moisture <= 0).length, ripe = plots.filter((p) => p.stage === 4 && !p.dead && p.crop).length;
    const nets = sim.rt.networks || [];
    return [
      h('div.section-title', {}, 'Fields'),
      h('div.ds', {}, `${plots.length} plots owned · ${planted} planted · ${ripe} ripe · ${dry} need water · ${ruined} ruined`),
      h('div.section-title', {}, 'Power'),
      nets.length ? nets.map((n, i) => h('div.ds', {}, `Network ${i + 1}: ${n.gens.length} generator(s), load ${n.load}/${n.capacity}${n.overloaded ? ' - OVERLOADED' : ''}, ${n.consumers.length} devices`)) : h('div.ds.muted', {}, 'No generators.'),
      h('div.ds', {}, `Farmhouse: ${sim.rt.housePowered ? 'lights on' : 'dark'}`),
      h('div.section-title', {}, 'Structures'),
      h('table.t', {}, h('tr', {}, h('th', {}, 'Structure'), h('th', {}, 'Condition'), h('th', {}, 'Status'), h('th', {}, 'Repair cost')), rows),
    ];
  }

  journalBody(sim, state, render) {
    const st = sim.state;
    state.entry = state.entry || null;
    const docs = Object.keys(LORE).filter((id) => st.lore.found.includes(id));
    const beasts = CREATURE_IDS.filter((id) => st.lore.bestiary[id]);
    let page = h('div.muted', {}, 'Select an entry.');
    if (state.entry?.startsWith('doc:')) { const L = LORE[state.entry.slice(4)]; page = [h('div.nm', { style: { fontSize: '20px', marginBottom: '10px' } }, L.title), h('div.page', {}, L.text)]; }
    if (state.entry?.startsWith('beast:')) {
      const id = state.entry.slice(6), c = CREATURES[id], known = st.lore.bestiary[id] === 'known';
      page = [h('div.nm', { style: { fontSize: '20px' } }, c.name), h('div.muted', {}, `${c.category} · killed: ${st.stats.kills[id] || 0}`),
        h('div.page', { style: { marginTop: '10px' } }, c.desc), h('div.page', { style: { marginTop: '10px' } }, known ? c.lore : 'You don\'t know much about it yet. Old papers around the property might say more.')];
    }
    const stakes = STAKES.filter((k) => st.lore.stakes[k]).length;
    return h('div.journal', {},
      h('div.list', {},
        h('div.hdr', {}, `Documents (${docs.length}/${Object.keys(LORE).length})`),
        docs.map((id) => h(`button${state.entry === 'doc:' + id ? '.on' : ''}`, { onclick: () => { state.entry = 'doc:' + id; render(); } }, LORE[id].title)),
        h('div.hdr', {}, 'Bestiary'),
        beasts.length ? beasts.map((id) => h(`button${state.entry === 'beast:' + id ? '.on' : ''}`, { onclick: () => { state.entry = 'beast:' + id; render(); } }, CREATURES[id].name)) : h('div.muted', { style: { padding: '0 10px', fontSize: '12px' } }, 'Nothing seen yet.'),
        h('div.hdr', {}, 'Boundary stakes'), h('div.muted', { style: { padding: '0 10px', fontSize: '12px' } }, `${stakes} of 4 driven home`)),
      h('div', {}, page));
  }

  mapBody(sim) {
    const st = sim.state;
    const c = document.createElement('canvas');
    const W = 560; c.width = W; c.height = W;
    const ctx = c.getContext('2d');
    const R = 160, sc = W / (R * 2);
    const X = (x) => (x + R) * sc, Z = (z) => (z + R) * sc;
    ctx.fillStyle = '#26301f'; ctx.fillRect(0, 0, W, W);
    // forest
    ctx.fillStyle = '#18200f';
    for (const t of getVegetation().trees) if (Math.abs(t.x) < R && Math.abs(t.z) < R) ctx.fillRect(X(t.x) - 1.5, Z(t.z) - 1.5, 3, 3);
    // parcels
    for (const p of PARCELS) {
      const owned = st.owned.parcels.includes(p.id);
      ctx.strokeStyle = owned ? '#d9a441' : '#d9a44155'; ctx.setLineDash(owned ? [] : [4, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(X(p.rect.x0), Z(p.rect.z0), (p.rect.x1 - p.rect.x0) * sc, (p.rect.z1 - p.rect.z0) * sc);
      ctx.setLineDash([]);
      ctx.fillStyle = owned ? '#d9a441' : '#d9a44188'; ctx.font = '11px system-ui';
      ctx.fillText(p.name + (owned ? '' : ` ($${p.cost})`), X(p.rect.x0) + 4, Z(p.rect.z0) + 13);
    }
    // roads, pond
    ctx.strokeStyle = '#8b8170'; ctx.lineWidth = ROAD.county.width * sc;
    ctx.beginPath(); ctx.moveTo(0, Z(ROAD.county.z)); ctx.lineTo(W, Z(ROAD.county.z)); ctx.stroke();
    ctx.lineWidth = ROAD.drivewayWidth * sc; ctx.beginPath(); ROAD.driveway.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke();
    ctx.fillStyle = '#2b4a52'; ctx.beginPath(); ctx.arc(X(POND.x), Z(POND.z), POND.r * sc, 0, Math.PI * 2); ctx.fill();
    // plots
    for (const p of st.plots) {
      if (!plotOwned(st, p)) continue;
      ctx.fillStyle = p.dead ? '#5a2a1a' : p.stage === 4 ? '#d9b84a' : p.crop ? '#6f8f3a' : '#4a3a28';
      ctx.fillRect(X(p.x - 1.2), Z(p.z - 1.2), 2.4 * sc, 2.4 * sc);
    }
    // buildings
    ctx.fillStyle = '#c9bfae';
    for (const b of Object.values(BUILDINGS)) {
      if (b.r) { ctx.beginPath(); ctx.arc(X(b.x), Z(b.z), b.r * sc, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sc, b.d * sc);
    }
    // fences (broken ones in red) and long structures
    for (const s of st.structures) {
      if (s.type !== 'fence' && s.type !== 'gate' && s.type !== 'solar') continue;
      const len = s.len || 3.5, c = Math.cos(s.rot), sn = Math.sin(s.rot);
      ctx.strokeStyle = s.hp <= 0 ? '#d0533a' : s.type === 'solar' ? '#4a6fb0' : s.type === 'gate' ? (s.open ? '#8fb36a' : '#c9a46a') : '#8a7a62';
      ctx.lineWidth = s.type === 'solar' ? 3.2 * sc : s.type === 'gate' ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(X(s.x - c * len / 2), Z(s.z + sn * len / 2)); ctx.lineTo(X(s.x + c * len / 2), Z(s.z - sn * len / 2)); ctx.stroke();
    }
    // structures
    for (const s of st.structures) {
      if (['fence', 'door', 'gate', 'solar'].includes(s.type)) continue;
      const col = s.hp <= 0 ? '#d0533a' : { floodlight: '#ffe08a', generator: '#8fd06a', camera: '#6fe08a', barricade: '#b08a5a', trap: '#999', pole: '#776655', firepit: '#ff8a36', coop: '#e9e4d8' }[s.type] || '#bbb';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // landmarks discovered
    for (const l of LANDMARKS) {
      const isStake = l.id.startsWith('stake');
      const known = isStake ? st.lore.found.includes('survey') : st.lore.found.some((id) => LORE[id].at === l.id) || (l.id === 'stone' && st.lore.found.includes('chapel'));
      const hint = !known && ({ cabin: st.lore.found.includes('drawer') || st.time.day >= 2, chapel: st.lore.mail.includes('letter_dale') }[l.id]);
      if (!known && !hint) continue;
      ctx.fillStyle = isStake ? (st.lore.stakes[l.id] ? '#9fb4d8' : '#e0e6f4') : '#9fb4d8';
      ctx.beginPath(); ctx.arc(X(l.x), Z(l.z), isStake ? 4 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '11px Georgia'; ctx.fillText(known ? l.name : '?', X(l.x) + 7, Z(l.z) + 4);
    }
    // player
    const p = st.player;
    ctx.save(); ctx.translate(X(p.x), Z(p.z)); ctx.rotate(-p.yaw);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ece4d2'; ctx.font = 'bold 13px Georgia'; ctx.fillText('N', W / 2 - 4, 16);
    return h('div.mapwrap', {}, c, h('div.legend', {},
      h('div', {}, h('i', { style: { background: '#d9b84a' } }), 'Ripe crops'), h('div', {}, h('i', { style: { background: '#6f8f3a' } }), 'Growing'), h('div', {}, h('i', { style: { background: '#5a2a1a' } }), 'Ruined'),
      h('div', {}, h('i', { style: { background: '#ffe08a' } }), 'Floodlight'), h('div', {}, h('i', { style: { background: '#8fd06a' } }), 'Generator'), h('div', {}, h('i', { style: { background: '#d0533a' } }), 'Destroyed / fence breach'), h('div', {}, h('i', { style: { background: '#4a6fb0' } }), 'Solar panels'),
      h('div', {}, h('i', { style: { background: '#9fb4d8' } }), 'Places of interest'), h('div', { class: 'muted', style: { marginTop: '10px', maxWidth: '220px' } }, 'Dashed outlines are land for sale. The woods are dangerous after dark.')));
  }

  statsBody(sim) {
    const st = sim.state;
    const k = st.stats.kills;
    return h('div.grid', {},
      h('div.card', {}, h('div.nm', {}, 'The farm'), h('div.ds', {}, `Nights survived: ${st.stats.nights}`), h('div.ds', {}, `Lifetime earnings: ${fmtMoney(st.earned)}`), h('div.ds', {}, `Produce harvested: ${st.stats.harvested}`), h('div.ds', {}, `Produce sold: ${st.stats.sold}`), h('div.ds', {}, `Structures built: ${st.stats.built}`), h('div.ds', {}, `Repairs: ${st.stats.repairs}`), h('div.ds', {}, `Times you didn't make it to dawn: ${st.stats.deaths}`)),
      h('div.card', {}, h('div.nm', {}, 'Driven off for good'), CREATURE_IDS.filter((id) => k[id]).map((id) => h('div.ds', {}, `${CREATURES[id].name}: ${k[id]}`)), Object.keys(k).length ? null : h('div.ds.muted', {}, 'None yet')),
      h('div.card', {}, h('div.nm', {}, 'Farm levels'), FARM_LEVELS.map((l) => h(`div.ds${st.earned >= l.earned ? '' : '.muted'}`, {}, `${l.level}. ${l.title} - ${fmtMoney(l.earned)}`))),
    );
  }

  // --------------------------------------------------------------- documents
  doc(id) {
    const L = LORE[id];
    if (!L) return;
    this.show('doc', (state) => h('div.doc.interactive', {}, h('h3', {}, L.title), h('pre', {}, L.text), h('div.foot', {}, 'Saved to your journal (Tab). Click or press Esc to close.')), {});
    this.open.el.addEventListener('mousedown', () => this.close());
  }

  // ----------------------------------------------------------- morning report
  report(r, onClose) {
    this.show('report', (state) => {
      const st = this.sim.state;
      const items = [];
      if (r.rite === 'done') items.push(h('li.accent', {}, 'The line held. Whatever lives under the trees is bound again.'));
      if (r.downed) items.push(h('li.bad', {}, `You didn't make it to dawn. Medical bill: ${fmtMoney(r.bill)}. Half your carried produce was lost.`));
      items.push(h('li', {}, r.cropsLost ? h('span.bad', {}, `${r.cropsLost} plots of crops destroyed (~${fmtMoney(r.cropValueLost)} of produce)`) : h('span.good', {}, 'No crops lost')));
      if (r.destroyed) items.push(h('li.bad', {}, `${r.destroyed} structures destroyed`));
      if (r.animalsLost) items.push(h('li.bad', {}, `${r.animalsLost} hen${r.animalsLost > 1 ? 's' : ''} taken from the coop`));
      if (r.lightsBlown) items.push(h('li.bad', {}, `${r.lightsBlown} lights blown out`));
      if (r.damaged.length) items.push(h('li', {}, `Needs repair: ${r.damaged.slice(0, 6).map((d) => d.name).join(', ')}${r.damaged.length > 6 ? ` and ${r.damaged.length - 6} more` : ''}`));
      else items.push(h('li.good', {}, 'Everything is standing'));
      const kills = Object.entries(r.kills);
      if (kills.length) items.push(h('li', {}, `Killed: ${kills.map(([k, v]) => `${v} ${CREATURES[k].name}${v > 1 && k !== 'pale' && k !== 'antlered' && k !== 'hollow' ? 's' : ''}`).join(', ')}`));
      if (r.fuelUsed) items.push(h('li.muted', {}, `${r.fuelUsed} L of fuel burned`));
      return h('div.panel.report.interactive', {}, h('header', {}, h('h2', {}, `Morning, day ${st.time.day}`)),
        h('div.body', {}, h('div.big', {}, r.downed ? 'A hard night.' : r.cropsLost + r.destroyed === 0 ? 'A quiet night.' : 'You made it.'), h('ul', {}, items),
          h('div.ds.muted', {}, `Market today: ${CROPS[st.market.hot].produce} in demand. ${st.contracts.length} contracts open. Game saved.`),
          h('div.row', { style: { marginTop: '16px' } }, h('button.btn.big', { onclick: () => this.close() }, 'Start the day'))));
    }, { onClose, modal: true });
  }

  // ------------------------------------------------------------ camera view
  cameras(onSelect) {
    const sim = this.sim;
    const cams = sim.state.structures.filter((s) => s.type === 'camera');
    if (!cams.length) { this.app.hud.toast('No cameras installed. Build them with B.', 'info'); return; }
    let idx = 0;
    const pick = (i) => { idx = (i + cams.length) % cams.length; onSelect(cams[idx]); };
    this.show('cameras', (state, render) => {
      const cam = cams[idx];
      const side = h('div.side', {}, h('div', {}, 'SECURITY'), cams.map((c, i) => h(`button${i === idx ? '.on' : ''}`, { onclick: () => { pick(i); render(); } }, `${c.name}${c.powered && c.hp > 0 ? '' : ' · NO SIGNAL'}`)));
      const stamp = h('div.stamp', {}, `${cam.name}  DAY ${sim.state.time.day}  ${fmtTime(sim.state.time.minute)}`);
      state.stamp = stamp;
      return h('div.cctv.interactive', {}, side, stamp, h('div.rec', {}, cam.powered && cam.hp > 0 ? '● REC' : 'NO SIGNAL'), h('div.hint', {}, '← → switch camera · Esc exit · time keeps running'));
    }, { onClose: () => onSelect(null) });
    pick(0);
    this.open.cams = cams;
    this.open.pick = (d) => { pick(idx + d); this.open.refresh(); };
    // overlay should not darken the feed
    this.open.el.style.background = 'transparent';
  }
}

function hpBar(r) {
  const cls = r < 0.35 ? '.low' : r < 0.7 ? '.mid' : '';
  return h(`span.hpbar${cls}`, {}, h('i', { style: { width: `${Math.max(0, Math.min(100, r * 100))}%` } }));
}
