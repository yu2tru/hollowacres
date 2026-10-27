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
await snap('01b-interior', () => { const s = window.__HA.sim.state; Object.assign(s.player, { x: -18, z: -8, yaw: 1.2, pitch: -0.15 }); });
for (const [i, slot] of [[1, 1], [2, 2], [4, 4], [6, 6]]) await snap(`01c-tool${slot}`, (sl) => { const s = window.__HA.sim.state; s.player.slot = sl; Object.assign(s.player, { x: -4, z: 2, yaw: -2.4, pitch: -0.1 }); }, slot);
await snap('02-yard-morning', () => { const s = window.__HA.sim.state; s.time.minute = 9 * 60; Object.assign(s.player, { x: -4, z: 2, y: 0, yaw: -2.4, pitch: -0.05 }); });
await snap('03-field', () => { const s = window.__HA.sim.state; Object.assign(s.player, { x: 3, z: 9, yaw: -2.1, pitch: -0.25 }); for (const p of s.plots.slice(0, 24)) { p.crop = ['wheat', 'potato', 'corn', 'tomato', 'pumpkin', 'strawberry'][p.col % 6]; p.growth = 200 * (p.row + 1) / 4; p.stage = Math.min(4, p.row + 1); p.moisture = 1; } window.__HA.sim.events.emit('plotChanged'); });
await snap('04-sunset', () => { const s = window.__HA.sim.state; s.time.minute = 19 * 60 + 5; Object.assign(s.player, { x: 30, z: 30, yaw: 2.4, pitch: 0.02 }); });
await snap('05-night-yard', () => { const s = window.__HA.sim.state; s.time.minute = 22 * 60; s.player.flashlight = true; Object.assign(s.player, { x: 8, z: 8, yaw: 2.6, pitch: -0.05 }); window.__HA.sim.events.emit('powerChanged'); });
await snap('06-creatures', () => { const sim = window.__HA.sim, s = sim.state; Object.assign(s.player, { x: 0, z: 30, yaw: Math.PI, pitch: -0.05 }); sim.opts.godMode = true; sim.spawnCreature('drifter', -2, 40); sim.spawnCreature('pale', 3, 44); const pk = sim.makePack(); sim.spawnCreature('gnawer', -5, 38, { pack: pk }); sim.spawnCreature('antlered', 8, 46); });
await page.waitForTimeout(2500);
if (shots) await page.screenshot({ path: `${OUT}/07-creatures-later.jpg`, quality: 82 });
const stats = await run(() => ({ fps: window.__HA.fps, calls: window.__HA.renderer.stats, creatures: window.__HA.sim.creatures.length, day: window.__HA.sim.state.time.day }));
console.log('stats', JSON.stringify(stats));
await browser.close();
await server.close();
if (errors.length) { console.error('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log('e2e ok');
