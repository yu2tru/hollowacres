// Minimal event bus used to decouple simulation from presentation.
// The simulation emits events (sounds, hits, notifications); renderer, audio
// and UI subscribe. The simulation never depends on its listeners.
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this.map.get(type);
    if (set) for (const fn of set) {
      try { fn(payload); } catch (e) { console.error(`[events] handler for ${type} failed`, e); }
    }
    const any = this.map.get('*');
    if (any) for (const fn of any) {
      try { fn(type, payload); } catch (e) { console.error('[events] wildcard handler failed', e); }
    }
  }
  clear() { this.map.clear(); }
}
