// Persistent player settings (separate from save games).
import { PRESETS } from './render/renderer.js';

const KEY = 'hollowacres.settings.v1';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', crouch: 'ControlLeft', jump: 'Space',
  interact: 'KeyE', flashlight: 'KeyF', reload: 'KeyR', cycleSeed: 'KeyQ',
  build: 'KeyB', ledger: 'Tab', map: 'KeyM', tablet: 'KeyV',
};

export const BINDING_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  sprint: 'Sprint', crouch: 'Crouch', jump: 'Jump', interact: 'Interact / harvest',
  flashlight: 'Flashlight', reload: 'Reload', cycleSeed: 'Change seed type',
  build: 'Build menu', ledger: 'Farm ledger', map: 'Map', tablet: 'Camera tablet',
};

export function detectPreset() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'low';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
    if (/swiftshader|llvmpipe|software/.test(r)) return 'low';
    if (/intel|uhd|iris|mali|adreno|apple m1/.test(r)) return 'medium';
    if (/rtx|radeon rx [67]|rx 7|rx 6|4090|4080|3080|3090/.test(r)) return 'epic';
    return 'high';
  } catch { return 'medium'; }
}

export function defaultSettings() {
  const preset = detectPreset();
  return {
    graphics: { preset, ...PRESETS[preset], fpsLimit: 0, textures: preset === 'low' ? 'low' : 'high', fullscreen: false },
    controls: { sensitivity: 1, invertY: false, fov: 75, headBob: true, reduceMotion: false, reduceFlashing: false, bindings: { ...DEFAULT_BINDINGS } },
    audio: { master: 0.8, sfx: 0.9, ambience: 0.8, music: 0.6, hrtf: true },
    gameplay: { difficulty: 'normal', dayLength: 'normal', hints: true, showFps: false },
  };
}

export function loadSettings() {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      graphics: { ...d.graphics, ...(s.graphics || {}) },
      controls: { ...d.controls, ...(s.controls || {}), bindings: { ...DEFAULT_BINDINGS, ...(s.controls?.bindings || {}) } },
      audio: { ...d.audio, ...(s.audio || {}) },
      gameplay: { ...d.gameplay, ...(s.gameplay || {}) },
    };
  } catch { return d; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
