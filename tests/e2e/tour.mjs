// Visual audit tour: loads the game in headless Chromium and captures close-up
// screenshots from player height at a list of viewpoints.
//   node tests/e2e/tour.mjs [filter]
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.resolve('tests/e2e/tour');
fs.mkdirSync(OUT, { recursive: true });
const filters = (process.argv[2] || '').split(',');
export const VIEWS = [
  // name, x, z, yaw, pitch, minute
  ['house-front', -38, -22, 0, 0.02, 600], ['house-porch', -37, -29.5, 0.3, -0.05, 600], ['house-side', -24, -36, 1.4, 0.05, 600],
  ['house-interior', -34.5, -36, 1.4, -0.15, 600], ['house-interior2', -41, -36.5, -1.7, -0.1, 600],
  ['barn-front', 30, -4, -1.57, 0.05, 600], ['barn-inside', 40, -2, -1.9, -0.1, 600], ['barn-back', 48, 12, 2.9, 0.15, 600],
  ['gen-yard', 36, -38, 2.6, -0.1, 600], ['generator-close', 40, -42.5, 0.1, -0.35, 600], ['shed', 52, -43, 0, -0.05, 600],
  ['crops', 3.5, -30, 0.2, -0.3, 600], ['field-edge', -18, -44, -1.5, -0.25, 600],
  ['courtyard', -6, 12, 0.5, -0.12, 600], ['storage-yard', 32, 12, -1.4, -0.08, 600],
  ['pen', -27, 4, 1.7, -0.08, 600], ['water', -14, 26, 1.8, -0.06, 600], ['tanks-close', -16.5, 34, 1.5, 0.05, 600],
  ['solar', 6, 24, -1.9, -0.08, 600], ['gate-inside', -6, 48, 0, 0.0, 600], ['gate-outside', -6, 66, Math.PI, 0.02, 600],
  ['truck', -24, -28, 1.0, -0.12, 600], ['tractor', 27, -13, -0.88, -0.12, 600], ['fence-corner', -55, -52, -2.4, -0.1, 600],
  ['woods-edge', 0, -70, 0, 0.02, 600], ['night-yard', -4, 14, 0.4, -0.05, 22 * 60],
  ['crops-near', -6, -33, 3.0, -0.45, 600], ['crops-corn', 2.5, -38, 1.2, -0.25, 600], ['standpipe', 7, -41, 0.79, -0.3, 600],
  ['bin-close', 31.5, 11, -0.93, -0.3, 600], ['truck-close', -24.5, -26, 0.6, -0.15, 600],
].filter((v) => filters.some((f) => v[0].includes(f)));
const server = await createServer({ root: path.resolve('.'), server: { port: 5197, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.addInitScript(() => {
  localStorage.setItem('hollowacres.settings.v1', JSON.stringify({ graphics: { preset: 'high', renderScale: 0.6, shadows: 'high', ao: false, bloom: true, aa: 'fxaa', foliage: 'high', viewDistance: 'far', effects: 'high', textures: 'high', fpsLimit: 0 }, gameplay: { hints: false } }));
});
await page.goto('http://localhost:5197/');
await page.waitForSelector('.menu-btn');
await page.click('text=New farm'); await page.click('text=Begin');
await page.waitForFunction(() => window.__HA?.renderer && (window.__HA.state === 'paused' || window.__HA.menus.screen === 'intro'), null, { timeout: 240000 });
await page.evaluate(() => { const a = window.__HA; a.menus.clear(); a.state = 'playing'; a.sim.paused = false; a.sim.opts.godMode = true; window.__HA_TOUR = true; });
await page.evaluate(() => {
  const sim = window.__HA.sim, crops = ['wheat', 'potato', 'corn', 'tomato', 'strawberry', 'pumpkin'];
  for (const p of sim.state.plots.filter((q) => q.field === 'A' && !q.starter)) { p.crop = crops[p.col % 6]; p.stage = Math.min(4, p.row); p.growth = [0, 0.1, 0.5, 0.8, 1][p.stage] * 120; p.moisture = 1; }
  sim.events.emit('plotChanged');
});
for (const [name, x, z, yaw, pitch, minute] of VIEWS) {
  await page.evaluate(({ x, z, yaw, pitch, minute }) => {
    const sim = window.__HA.sim, p = sim.state.player;
    sim.state.time.minute = minute;
    Object.assign(p, { x, z, yaw, pitch, y: sim.world.groundAt(x, z) });
    p.flashlight = minute > 20 * 60;
    sim.rt.player.vx = sim.rt.player.vz = 0;
  }, { x, z, yaw, pitch, minute });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 80, timeout: 180000 });
  console.log('shot', name);
}
console.log(errors.length ? 'ERRORS\n' + [...new Set(errors)].join('\n') : 'no page errors');
await browser.close(); await server.close();
