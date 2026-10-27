// Market prices, selling, buying, contracts and farm level.
import { CROPS, CROP_IDS } from '../data/crops.js';
import { SUPPLIES, UPGRADES, FARM_LEVELS } from '../data/items.js';
import { PARCELS } from '../data/layout.js';
import { clamp } from '../core/math.js';
import { SHOP_OPEN, SHOP_CLOSE } from './clock.js';

export function farmLevel(state) {
  let lv = FARM_LEVELS[0];
  for (const l of FARM_LEVELS) if (state.earned >= l.earned) lv = l;
  return lv;
}
export function nextLevel(state) {
  return FARM_LEVELS.find((l) => l.earned > state.earned) || null;
}

export function priceOf(state, cropId) {
  const c = CROPS[cropId];
  const mult = state.market.prices[cropId] ?? 1;
  const hot = state.market.hot === cropId ? 1.35 : 1;
  return Math.max(1, Math.round(c.value * mult * hot));
}

// Bounded random walk with mean reversion, rolled each morning.
export function rollMarket(state, rng) {
  for (const id of CROP_IDS) {
    const cur = state.market.prices[id] ?? 1;
    const drift = (1 - cur) * 0.35 + rng.range(-0.12, 0.12);
    const next = clamp(cur + drift, 0.75, 1.3);
    state.market.trend[id] = next > cur + 0.01 ? 1 : next < cur - 0.01 ? -1 : 0;
    state.market.prices[id] = Math.round(next * 100) / 100;
  }
  const lvl = farmLevel(state).level;
  const avail = CROP_IDS.filter((id) => CROPS[id].level <= lvl + 1 || id === 'egg');
  state.market.hot = rng.pick(avail);
  state.market.day = state.time.day;
}

export function shopOpen(state) {
  const m = state.time.minute;
  return m >= SHOP_OPEN && m < SHOP_CLOSE;
}

export function totalProduce(obj) {
  let n = 0;
  for (const k in obj) n += obj[k] || 0;
  return n;
}

export function addMoney(sim, amount, reason) {
  sim.state.money += amount;
  if (amount > 0 && reason !== 'refund') sim.state.earned += amount;
  sim.events.emit('money', { amount, reason });
  sim.checkLevelUp();
}

// Sell produce of a crop from pack (and optionally barn). Returns money earned.
export function sell(sim, cropId, qty, from = 'pack') {
  const { state } = sim;
  const src = from === 'barn' ? state.barn.produce : state.inv.produce;
  const have = src[cropId] || 0;
  const n = Math.min(have, qty);
  if (n <= 0) return 0;
  src[cropId] = have - n;
  if (src[cropId] <= 0) delete src[cropId];
  const earned = n * priceOf(state, cropId);
  state.stats.sold += n;
  addMoney(sim, earned, 'sale');
  sim.events.emit('sold', { cropId, qty: n, earned });
  return earned;
}

export function sellAll(sim, from = 'pack') {
  const src = from === 'barn' ? sim.state.barn.produce : sim.state.inv.produce;
  let total = 0;
  for (const id of Object.keys(src)) total += sell(sim, id, src[id], from);
  return total;
}

export function buySupply(sim, id, count = 1) {
  const { state } = sim;
  const def = SUPPLIES[id];
  if (!def) return 'Unknown item';
  if (!shopOpen(state)) return 'Feed & Supply is closed (6 AM - 8 PM)';
  if (def.level && farmLevel(state).level < def.level) return `Requires farm level ${def.level}`;
  const cost = def.cost * count;
  if (state.money < cost) return 'Not enough money';
  if (id === 'chicken') {
    if (state.animals.chickens + count > 12) return 'The coop holds 12 hens';
    state.money -= cost;
    state.animals.chickens += count;
    sim.events.emit('purchase', { id, cost });
    return null;
  }
  state.money -= cost;
  state.inv[id] = (state.inv[id] || 0) + (def.qty || 1) * count;
  sim.events.emit('purchase', { id, cost });
  return null;
}

export function buySeeds(sim, cropId, count) {
  const { state } = sim;
  const c = CROPS[cropId];
  if (!c) return 'Unknown seed';
  if (!shopOpen(state)) return 'Feed & Supply is closed (6 AM - 8 PM)';
  if (c.level > farmLevel(state).level) return `Requires farm level ${c.level}`;
  const cost = c.seedCost * count;
  if (state.money < cost) return 'Not enough money';
  state.money -= cost;
  state.inv.seeds[cropId] = (state.inv.seeds[cropId] || 0) + count;
  sim.events.emit('purchase', { id: 'seed_' + cropId, cost });
  return null;
}

export function buyUpgrade(sim, id) {
  const { state } = sim;
  const def = UPGRADES[id];
  if (!def) return 'Unknown upgrade';
  if (state.owned[id]) return 'Already owned';
  if (!shopOpen(state)) return 'Feed & Supply is closed (6 AM - 8 PM)';
  if (def.level && farmLevel(state).level < def.level) return `Requires farm level ${def.level}`;
  if (state.money < def.cost) return 'Not enough money';
  state.money -= def.cost;
  state.owned[id] = true;
  if (id === 'can2') state.player.water = 24;
  if (id === 'shotgun') state.player.mag.shotgun = 0;
  if (id === 'bigtank') sim.events.emit('powerChanged');
  sim.events.emit('purchase', { id, cost: def.cost });
  return null;
}

export function buyParcel(sim, id) {
  const { state } = sim;
  const p = PARCELS.find((q) => q.id === id);
  if (!p) return 'Unknown land';
  if (state.owned.parcels.includes(id)) return 'Already owned';
  if (farmLevel(state).level < (p.minLevel || 1)) return `Requires farm level ${p.minLevel}`;
  if (state.money < p.cost) return 'Not enough money';
  state.money -= p.cost;
  state.owned.parcels.push(id);
  sim.events.emit('parcelBought', p);
  sim.notify(`Purchased ${p.name}. New plots are ready to plant.`, 'good');
  return null;
}

// ---- contracts -------------------------------------------------------------
const BUYERS = ['Corran Co-op', 'Miller\'s Bakery', 'Route 9 Diner', 'St. Agnes Kitchen', 'Harvest Market', 'Pruitt Family Store'];

export function rollContracts(sim, rng) {
  const { state } = sim;
  // expire overdue contracts
  state.contracts = state.contracts.filter((c) => {
    if (c.dueDay < state.time.day) { sim.notify(`Contract with ${c.from} expired.`, 'warn'); return false; }
    return true;
  });
  const lvl = farmLevel(state).level;
  const avail = CROP_IDS.filter((id) => CROPS[id].level <= lvl);
  while (state.contracts.length < Math.min(3, 1 + lvl)) {
    const crop = rng.pick(avail);
    const c = CROPS[crop];
    const qty = crop === 'pumpkin' ? rng.int(2, 3 + lvl) : Math.round(rng.int(6, 12) * (1 + lvl * 0.45));
    const days = rng.int(2, 4);
    const reward = Math.round(qty * c.value * rng.range(1.45, 1.8));
    state.contracts.push({ id: ++state.contractSeq, crop, qty, reward, dueDay: state.time.day + days, from: rng.pick(BUYERS), bonus: lvl >= 2 && rng.chance(0.3) ? rng.pick(['parts', 'shells', 'fuel']) : null });
  }
}

export function contractHave(state, c) {
  return (state.inv.produce[c.crop] || 0) + (state.barn.produce[c.crop] || 0);
}

export function fulfillContract(sim, id) {
  const { state } = sim;
  const c = state.contracts.find((k) => k.id === id);
  if (!c) return 'Contract not found';
  if (contractHave(state, c) < c.qty) return `Need ${c.qty} ${CROPS[c.crop].produce.toLowerCase()}`;
  let need = c.qty;
  for (const src of [state.inv.produce, state.barn.produce]) {
    const take = Math.min(need, src[c.crop] || 0);
    src[c.crop] = (src[c.crop] || 0) - take;
    if (src[c.crop] <= 0) delete src[c.crop];
    need -= take;
  }
  state.contracts = state.contracts.filter((k) => k.id !== id);
  addMoney(sim, c.reward, 'contract');
  if (c.bonus) state.inv[c.bonus] = (state.inv[c.bonus] || 0) + (c.bonus === 'shells' ? 8 : 2);
  sim.notify(`Delivered to ${c.from}: +$${c.reward}${c.bonus ? ' and a bonus crate' : ''}`, 'good');
  return null;
}
