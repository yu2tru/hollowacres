// Save/load. Versioned JSON in localStorage (browser) with validation and
// migration. Runtime-only fields are stripped on save.
import { migrateState, SAVE_VERSION } from './state.js';

const RUNTIME_KEYS = new Set(['powered', 'network', 'claimedBy', 'flickerUntil', 'lastHitAt', 'blocksNav', 'breakable']);
export const SLOT_KEYS = ['autosave', 'slot1', 'slot2', 'slot3'];
const PREFIX = 'hollowacres.save.';

export function serialize(state) {
  return JSON.stringify(state, (k, v) => {
    if (k.startsWith('_') || RUNTIME_KEYS.has(k)) return undefined;
    if (typeof v === 'number' && !Number.isFinite(v)) return 0;
    return v;
  });
}

export function deserialize(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Save file is corrupted (not valid JSON)'); }
  return migrateState(data);
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function canSaveNow(sim) {
  if (sim.isNight()) return 'You can\'t save during the night.';
  if (!sim.playerAlive) return 'You can\'t save right now.';
  if (sim.creatures.some((c) => c.alive)) return 'Not while something is out there.';
  return null;
}

export function saveToSlot(slot, state, meta = {}) {
  const ls = storage();
  if (!ls) throw new Error('Storage unavailable in this browser');
  const payload = serialize(state);
  const info = { version: SAVE_VERSION, savedAt: Date.now(), day: state.time.day, minute: state.time.minute, money: Math.round(state.money), ...meta };
  // write to temp key first, then commit: avoids half-written saves
  ls.setItem(PREFIX + slot + '.tmp', payload);
  ls.setItem(PREFIX + slot, payload);
  ls.setItem(PREFIX + slot + '.meta', JSON.stringify(info));
  ls.removeItem(PREFIX + slot + '.tmp');
  return info;
}

export function loadFromSlot(slot) {
  const ls = storage();
  if (!ls) throw new Error('Storage unavailable');
  const text = ls.getItem(PREFIX + slot);
  if (!text) throw new Error('No save in this slot');
  return deserialize(text);
}

export function slotInfo(slot) {
  const ls = storage();
  if (!ls) return null;
  try {
    const m = ls.getItem(PREFIX + slot + '.meta');
    if (!m || !ls.getItem(PREFIX + slot)) return null;
    return JSON.parse(m);
  } catch { return null; }
}

export function deleteSlot(slot) {
  const ls = storage();
  if (!ls) return;
  ls.removeItem(PREFIX + slot); ls.removeItem(PREFIX + slot + '.meta');
}
