// Serializable game state. Everything that must survive save/load lives here.
// Runtime-only data (colliders, AI, nav) is rebuilt from this on load.
import { FIELDS, PLOT_PITCH, PARCELS, PREPLACED, fenceSegments, PLAYER_SPAWN } from '../data/layout.js';
import { BUILDABLES, FIXED_STRUCTURES } from '../data/buildables.js';
import { CROP_IDS } from '../data/crops.js';
import { heightAt } from './terrain.js';

export const SAVE_VERSION = 4;

export function makePlots() {
  const plots = [];
  for (const f of FIELDS) {
    for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) {
      const x = f.x0 + c * PLOT_PITCH + PLOT_PITCH / 2;
      const z = f.z0 + r * PLOT_PITCH + PLOT_PITCH / 2;
      plots.push({
        id: `${f.id}${r}_${c}`, field: f.id, row: r, col: c, x, z,
        crop: null, growth: 0, stage: 0, health: 1, moisture: 0.4,
        soil: f.soil, fert: 0, harvests: 0, dead: false, regrowing: false,
      });
    }
  }
  return plots;
}

export function makeStructure(type, x, z, rot, extra = {}) {
  const def = BUILDABLES[type] || FIXED_STRUCTURES[type];
  const s = {
    id: extra.id || `${type}_${Math.random().toString(36).slice(2, 9)}`,
    type, x, z, rot: rot || 0, level: 0,
    hp: def.hp, maxHp: def.hp,
  };
  if (type === 'generator') { s.fuel = extra.fuel ?? 0; s.mode = 'auto'; }
  if (type === 'floodlight') { s.on = true; }
  if (type === 'trap') { s.armed = true; }
  if (type === 'door') { s.building = extra.building; s.open = false; }
  if (type === 'camera') { s.name = extra.name || ''; }
  if (type === 'decoy') { s.activeUntil = 0; }
  if (type === 'gate') { s.open = false; }
  if (type === 'solar') { s.charge = 4; }
  if (type === 'firepit') { s.lit = false; }
  if (extra.len) s.len = extra.len;
  if (extra.broken) s.hp = 0;
  if (extra.fixed) s.fixed = true;
  return s;
}

export function createNewState(opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
  const structures = [];
  for (const p of PREPLACED) {
    const s = makeStructure(p.type, p.x ?? 0, p.z ?? 0, p.rot, { ...p, fixed: true });
    structures.push(s);
  }
  fenceSegments().forEach((f, i) => {
    const s = makeStructure('fence', f.x, f.z, f.rot, { fixed: true, len: f.len });
    s.id = `fence_${i}`;
    structures.push(s);
  });
  const prices = {};
  for (const id of CROP_IDS) prices[id] = 1;

  return {
    version: SAVE_VERSION,
    seed,
    difficulty: opts.difficulty || 'normal',
    time: { day: 1, minute: 7 * 60 },
    weather: { current: 'clear', next: 'clear', blend: 1, changeAt: 14 * 60, wetness: 0, wind: 0.3 },
    player: {
      x: PLAYER_SPAWN.x, y: heightAt(PLAYER_SPAWN.x, PLAYER_SPAWN.z) + 0.5, z: PLAYER_SPAWN.z,
      yaw: PLAYER_SPAWN.yaw, pitch: 0,
      health: 100, stamina: 100, battery: 100, flashlight: false,
      slot: 5, seedType: 'wheat', water: 12, mag: { revolver: 6, shotgun: 0 },
    },
    inv: {
      seeds: { wheat: 12, potato: 6 }, produce: {},
      fuel: 1, planks: 8, parts: 2, ammo38: 12, shells: 0, flares: 2, batteries: 1, medkit: 1, fertilizer: 0,
    },
    barn: { produce: {} },
    animals: { chickens: 6, eggs: 0 },
    owned: { revolver: true, parcels: ['core'] },
    money: 220,
    earned: 0,
    market: { prices, hot: 'potato', trend: {}, day: 1 },
    contracts: [],
    contractSeq: 0,
    plots: makePlots(),
    structures,
    lore: { found: [], bestiary: {}, stakes: {}, rite: 'none', mail: [], unread: [], reliefDay: -10 },
    tutorial: { step: 0 },
    night: { lastReport: null, ended: false },
    stats: { nights: 0, kills: {}, harvested: 0, sold: 0, repairs: 0, deaths: 0, built: 0 },
    flags: { ending: false },
  };
}

// Validate & migrate loaded data. Throws on unrecoverable data.
export function migrateState(data) {
  if (!data || typeof data !== 'object') throw new Error('Save data is empty or not an object');
  if (typeof data.version !== 'number') throw new Error('Save data has no version');
  if (data.version > SAVE_VERSION) throw new Error(`Save was made by a newer version (${data.version})`);
  if (data.version < 4) throw new Error('This save is from an older version of the farm layout and can\'t be loaded. Please start a new farm.');
  const fresh = createNewState({ seed: data.seed });
  // shallow-merge defaults for any missing keys (forward compatible additions)
  const out = { ...fresh, ...data };
  for (const k of ['time', 'weather', 'player', 'inv', 'barn', 'animals', 'owned', 'market', 'lore', 'tutorial', 'night', 'stats', 'flags']) {
    out[k] = { ...fresh[k], ...(data[k] || {}) };
  }
  out.inv.seeds = { ...(data.inv?.seeds || {}) };
  out.inv.produce = { ...(data.inv?.produce || {}) };
  out.barn.produce = { ...(data.barn?.produce || {}) };
  out.player.mag = { ...fresh.player.mag, ...(data.player?.mag || {}) };
  if (!Array.isArray(out.plots) || out.plots.length !== fresh.plots.length) {
    // layout changed: keep matching plot ids
    const byId = new Map((data.plots || []).map((p) => [p.id, p]));
    out.plots = fresh.plots.map((p) => ({ ...p, ...(byId.get(p.id) || {}) }));
  }
  if (!Array.isArray(out.structures)) out.structures = fresh.structures;
  out.structures = out.structures.filter((s) => s && (BUILDABLES[s.type] || FIXED_STRUCTURES[s.type]));
  if (!Array.isArray(out.contracts)) out.contracts = [];
  if (!Array.isArray(out.owned.parcels)) out.owned.parcels = ['core'];
  out.owned.parcels = out.owned.parcels.filter((id) => PARCELS.some((p) => p.id === id));
  if (!out.owned.parcels.includes('core')) out.owned.parcels.unshift('core');
  // numeric sanity
  out.money = Number.isFinite(out.money) ? out.money : fresh.money;
  out.player.health = Math.max(1, Math.min(100, Number(out.player.health) || 100));
  out.version = SAVE_VERSION;
  return out;
}
