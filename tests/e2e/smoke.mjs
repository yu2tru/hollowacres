// End-to-end smoke test: builds nothing itself - expects `npm run build` first.
// Serves dist/, starts a new game in headless Chromium, captures screenshots
// at several times of day and fails on any page error.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve('tests/e2e/out');
fs.mkdirSync(OUT, { recursive: true });
const shots = process.argv.includes('--shots');

const server = await createServer({ root: path.resolve('.'), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const t0 = Date.now();
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('navigated', f.url()); });
const preset = process.argv.find((a) => a.startsWith('--preset='))?.split('=')[1];
if (preset) {
  await page.addInitScript((pr) => {
    if (localStorage.getItem('hollowacres.settings.v1')) return;
    const presets = { low: { renderScale: 0.75, shadows: 'low', ao: false, bloom: false, aa: 'fxaa', foliage: 'low', viewDistance: 'near', effects: 'low' }, high: { renderScale: 0.6, shadows: 'high', ao: false, bloom: true, aa: 'smaa', foliage: 'high', viewDistance: 'far', effects: 'high' } };
    localStorage.setItem('hollowacres.settings.v1', JSON.stringify({ graphics: { preset: pr, ...presets[pr], textures: 'high', fpsLimit: 0 } }));
  }, preset);
}
await page.goto('http://localhost:5199/', { waitUntil: 'load' });
await page.waitForSelector('.menu-btn');
if (shots) await page.screenshot({ path: `${OUT}/00-title.jpg`, quality: 80 });
await page.click('text=New farm');
await page.click('text=Begin');
await page.waitForFunction(() => window.__HA && window.__HA.state === 'paused' && window.__HA.renderer, null, { timeout: 180000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.click('text=Click to begin');
await page.waitForTimeout(500);
const run = async (fn, arg) => page.evaluate(fn, arg);
const snap = async (name, setup, arg) => {
  await run(setup, arg);
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 82, timeout: 120000 });
};
// interior start
await snap('01-start', () => {});
if (!process.argv.includes('--aerial-only')) await snap('01c-tool2', () => { const s = window.__HA.sim.state; s.player.slot = 2; Object.assign(s.player, { x: -6, z: 10, yaw: 0.2, pitch: -0.05 }); });
if (!process.argv.includes('--aerial-only')) await snap('02-courtyard-morning', () => { const s = window.__HA.sim.state; s.time.minute = 9 * 60; s.player.slot = 5; Object.assign(s.player, { x: -4, z: 14, yaw: 0.25, pitch: -0.02 }); });
if (!process.argv.includes('--aerial-only')) await snap('03-field', () => { const s = window.__HA.sim.state; Object.assign(s.player, { x: 3.5, z: -26, yaw: 0.4, pitch: -0.2 }); for (const p of s.plots.filter((q) => q.field === 'A')) { p.crop = ['wheat', 'potato', 'corn', 'tomato', 'pumpkin', 'strawberry'][p.col % 6]; p.growth = 200 * (p.row + 1) / 5; p.stage = Math.min(4, p.row); p.moisture = 1; } window.__HA.sim.events.emit('plotChanged'); });
if (!process.argv.includes('--aerial-only')) await snap('04-pen-water', () => { const s = window.__HA.sim.state; s.time.minute = 11 * 60; Object.assign(s.player, { x: -24, z: 4, yaw: 1.9, pitch: -0.08 }); });
if (!process.argv.includes('--aerial-only')) await snap('05-gen-barn', () => { const s = window.__HA.sim.state; Object.assign(s.player, { x: 24, z: -16, yaw: -2.2, pitch: -0.02 }); });
if (!process.argv.includes('--aerial-only')) await snap('06-solar-sunset', () => { const s = window.__HA.sim.state; s.time.minute = 19 * 60 + 5; Object.assign(s.player, { x: 0, z: 16, yaw: -2.3, pitch: -0.05 }); });
await snap('07-aerial', () => { const r = window.__HA.renderer; window.__HA.sim.state.time.minute = 13 * 60; r._uc = r.updateCamera; r.updateCamera = function () { this.camera.position.set(0, 150, 95); this.camera.rotation.set(-1.0, 0, 0, 'YXZ'); }; });
await snap('08-night-firepit', () => { const r = window.__HA.renderer; r.updateCamera = r._uc; const sim = window.__HA.sim, s = sim.state; s.time.minute = 22 * 60; s.player.flashlight = true; s.structures.find((q) => q.type === 'firepit').lit = true; Object.assign(s.player, { x: -7, z: 12, yaw: 0.6, pitch: -0.08 }); sim.events.emit('powerChanged'); });
await snap('09-creatures', () => { const sim = window.__HA.sim, s = sim.state; Object.assign(s.player, { x: -6, z: 50, yaw: Math.PI, pitch: -0.02 }); sim.opts.godMode = true; s.structures.find((q) => q.id === 'gate_main').open = true; sim.spawnCreature('drifter', -8, 62); sim.spawnCreature('pale', -3, 66); const pk = sim.makePack(); sim.spawnCreature('gnawer', -10, 60, { pack: pk }); sim.spawnCreature('antlered', 4, 68); });
await page.waitForTimeout(2500);

const stats = await run(() => ({ fps: window.__HA.fps, calls: window.__HA.renderer.stats, creatures: window.__HA.sim.creatures.length, day: window.__HA.sim.state.time.day }));
console.log('stats', JSON.stringify(stats));
await browser.close();
await server.close();
if (errors.length) { console.error('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log('e2e ok');
