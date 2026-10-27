import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5177/'); await page.waitForTimeout(6000);
console.log(page.url(), 'menu buttons:', await page.locator('.menu-btn').count());
await browser.close();
