// Renders each optimised model from +z, +x, -z and above (red = x, green = y, blue = z).
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ root: path.resolve('.'), server: { port: 5195, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 300 } });
for (const m of (process.argv[2] || 'generator,truck,bed,pump,rockingchair,wheelbarrow').split(',')) {
  await page.goto(`http://localhost:5195/tests/e2e/model-preview.html?m=${m}`);
  await page.waitForFunction(() => window.__info, null, { timeout: 120000 });
  console.log(m, JSON.stringify(await page.evaluate(() => window.__info)));
  await page.screenshot({ path: `tests/e2e/tour/model-${m}.jpg`, quality: 85, timeout: 120000 });
}
await browser.close(); await server.close();
