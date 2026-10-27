import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
for (const f of ['index.html', 'HollowAcres.html']) {
  await page.goto('file://' + process.cwd() + '/' + f);
  await page.waitForTimeout(5000);
  console.log(f, '->', page.url().split('/').pop(), 'menu buttons:', await page.locator('.menu-btn').count());
}
await browser.close();
