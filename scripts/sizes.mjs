import { chromium } from 'playwright';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
});

for (const [w, h, name] of [
  [1366, 768, '1366'],
  [1600, 900, '1600'],
  [2560, 1440, '2560']
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#boot-enter').catch(() => {});
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `shots/size-${name}.png` });
  await page.close();
}

await browser.close();
console.log('done');
