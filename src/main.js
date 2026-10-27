import { App } from './app.js';

function supported() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

window.__HA_STARTED = true;
document.getElementById('boot')?.remove();

if (!supported()) {
  document.getElementById('ui').innerHTML = '<div class="fade-msg"><h2>WebGL 2 is required</h2><p>Hollow Acres needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari) and hardware acceleration enabled.</p></div>';
} else {
  const app = new App();
  app.start();
}
