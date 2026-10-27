// Keyboard & mouse input with rebindable keys and pointer lock.
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.onKey = null; // hook for UI (rebinding, menus)
    window.addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e) === true) { e.preventDefault(); return; }
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.locked) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp spikes some browsers produce on lock
      const cx = Math.max(-300, Math.min(300, e.movementX || 0)), cy = Math.max(-300, Math.min(300, e.movementY || 0));
      this.mouse.dx += cx; this.mouse.dy += cy;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  lock() { try { const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false }); p?.catch?.(() => this.canvas.requestPointerLock?.()); } catch { this.canvas.requestPointerLock?.(); } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  key(action) { return this.down.has(this.settings.controls.bindings[action]); }
  hit(action) { return this.pressed.has(this.settings.controls.bindings[action]); }
  hitCode(code) { return this.pressed.has(code); }

  // Build the per-frame input for the simulation and consume edge events.
  frame(gameplayActive) {
    const b = this.settings.controls.bindings;
    const d = (a) => this.down.has(b[a]);
    let slot = null;
    for (let i = 1; i <= 9; i++) if (this.pressed.has('Digit' + i)) slot = i;
    const out = {
      moveX: gameplayActive ? (d('right') ? 1 : 0) - (d('left') ? 1 : 0) : 0,
      moveZ: gameplayActive ? (d('forward') ? 1 : 0) - (d('back') ? 1 : 0) : 0,
      sprint: gameplayActive && d('sprint'),
      crouch: gameplayActive && (d('crouch') || this.down.has('KeyC')),
      jump: gameplayActive && this.hit('jump'),
      interact: gameplayActive && this.hit('interact'),
      flashlight: gameplayActive && this.hit('flashlight'),
      reload: gameplayActive && this.hit('reload'),
      cycleSeed: gameplayActive && this.hit('cycleSeed') ? 1 : 0,
      slot: gameplayActive ? slot : null,
      use: gameplayActive && this.mouse.leftPressed,
      useHeld: gameplayActive && this.mouse.left,
      aim: gameplayActive && this.mouse.right,
      wheel: this.mouse.wheel,
      lookDX: this.mouse.dx, lookDY: this.mouse.dy,
    };
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0;
  }
}
