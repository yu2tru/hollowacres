// Collider audit: samples points over the surface of every solid-looking mesh
// in the farm (buildings, props, structures) at the heights a player's body
// occupies, and reports clusters of surface that no collider covers - places
// you could walk through something you can see.
//   node tests/e2e/collider-audit.mjs
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ root: path.resolve('.'), server: { port: 5196, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript(() => localStorage.setItem('hollowacres.settings.v1', JSON.stringify({ graphics: { preset: 'low' }, gameplay: { hints: false } })));
await page.goto('http://localhost:5196/');
await page.waitForSelector('.menu-btn');
await page.click('text=New farm'); await page.click('text=Begin');
await page.waitForFunction(() => window.__HA?.renderer && (window.__HA.state === 'paused' || window.__HA.menus.screen === 'intro'), null, { timeout: 240000 });
const report = await page.evaluate(() => {
  const R = window.__HA.renderer, sim = window.__HA.sim, W = sim.world;
  const roots = ['environment', 'landmarks', 'structures'].map((n) => R.scene.getObjectByName(n)).filter(Boolean);
  const out = new Map();
  let rnd = 12345; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const tp = (e, x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  const label = (o) => { const n = []; for (let q = o; q && n.length < 4; q = q.parent) if (q.name) n.push(q.name); return n.join('<') || o.material?.name || '#' + (o.material?.color?.getHexString?.() || '?'); };
  for (const root of roots) root.updateMatrixWorld(true);
  for (const root of roots) root.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
    let hidden = false; for (let q = o; q; q = q.parent) if (q.visible === false) hidden = true;
    if (hidden || o.material?.transparent && o.material.opacity < 0.5) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    if (!pos) return;
    const e = o.matrixWorld.elements;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      const A = tp(e, pos.getX(ia), pos.getY(ia), pos.getZ(ia)), B = tp(e, pos.getX(ib), pos.getY(ib), pos.getZ(ib)), C = tp(e, pos.getX(ic), pos.getY(ic), pos.getZ(ic));
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      let n = area * 60; const k = Math.floor(n) + (rand() < n % 1 ? 1 : 0);
      for (let s = 0; s < k; s++) {
        let a = rand(), b = rand(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
        const x = A[0] + ux * a + vx * b, y = A[1] + uy * a + vy * b, z = A[2] + uz * a + vz * b;
        const gr = W.groundAt(x, z, y);
        const h = y - gr;
        if (h < 0.3 || h > 1.7) continue;              // below the step height or above the head
        if (W.overlapsCircle(x, z, 0.12, y - 0.05, y + 0.05)) continue;
        const key = label(o) + '|' + Math.round(x * 2) / 2 + ',' + Math.round(z * 2) / 2;
        const c = out.get(key) || { label: label(o), x: 0, z: 0, n: 0, y0: 9e9, y1: -9e9, x0: 9e9, x1: -9e9, z0: 9e9, z1: -9e9 };
        c.n++; c.x += x; c.z += z; c.y0 = Math.min(c.y0, h); c.y1 = Math.max(c.y1, h);
        c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.z0 = Math.min(c.z0, z); c.z1 = Math.max(c.z1, z);
        out.set(key, c);
      }
    }
  });
  // merge neighbouring cells of the same mesh into objects
  const cells = [...out.values()].map((c) => ({ ...c, x: c.x / c.n, z: c.z / c.n }));
  const groups = [];
  for (const c of cells) {
    const g = groups.find((q) => q.label === c.label && c.x0 < q.x1 + 0.6 && c.x1 > q.x0 - 0.6 && c.z0 < q.z1 + 0.6 && c.z1 > q.z0 - 0.6);
    if (g) { g.n += c.n; g.x0 = Math.min(g.x0, c.x0); g.x1 = Math.max(g.x1, c.x1); g.z0 = Math.min(g.z0, c.z0); g.z1 = Math.max(g.z1, c.z1); g.y0 = Math.min(g.y0, c.y0); g.y1 = Math.max(g.y1, c.y1); }
    else groups.push({ ...c });
  }
  return groups.filter((g) => g.n >= 6).sort((a, b) => b.n - a.n).map((g) => `${String(g.n).padStart(5)}  ${g.label.slice(0, 28).padEnd(28)} x ${g.x0.toFixed(1)}..${g.x1.toFixed(1)}  z ${g.z0.toFixed(1)}..${g.z1.toFixed(1)}  h ${g.y0.toFixed(2)}..${g.y1.toFixed(2)}`);
});
console.log(report.join('\n'));
await browser.close(); await server.close();
