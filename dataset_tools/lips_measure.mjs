// Measure lip metrics for every image in the clinical dataset via the QA
// harness (real engine, local only — nothing leaves the machine).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const ROOT = '/Users/sameem_amjad/myprojects/poc_ar_filter/lips';
const OUT = new URL('./lips_out/', import.meta.url).pathname;
mkdirSync(OUT + 'crops/', { recursive: true });

const survey = JSON.parse(readFileSync(OUT + 'survey.json', 'utf8'));
const files = [...new Set(survey.flatMap(r => r.shots.map(s => s.file)))];
console.log(`images to measure: ${files.length}`);

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
await page.goto('http://localhost:5173/qa.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.qaReady === true, null, { timeout: 60000 });

const toUrl = f =>
  'http://localhost:5173/@fs' + f.split('/').map(encodeURIComponent).join('/').replace(/^/, '/').replace('%2F', '/');

const metrics = {};
let done = 0, undetected = 0;
const t0 = Date.now();
for (const f of files) {
  const url = 'http://localhost:5173/@fs/' + f.slice(1).split('/').map(encodeURIComponent).join('/');
  let r;
  try {
    r = await page.evaluate(u => window.qaMeasure(u), url);
  } catch (e) {
    r = { detected: false, error: String(e).slice(0, 100) };
  }
  const rel = f.replace(ROOT + '/', '');
  if (r.detected) {
    const cropName = rel.replace(/[\/\s]/g, '_') + '.jpg';
    writeFileSync(OUT + 'crops/' + cropName, Buffer.from(r.crop.split(',')[1], 'base64'));
    metrics[rel] = { ...r, crop: 'crops/' + cropName };
  } else {
    metrics[rel] = r;
    undetected++;
  }
  if (++done % 40 === 0) {
    console.log(`${done}/${files.length} (${undetected} undetected) ${(done / ((Date.now() - t0) / 1000)).toFixed(1)}/s`);
    writeFileSync(OUT + 'metrics.json', JSON.stringify(metrics));
  }
}
writeFileSync(OUT + 'metrics.json', JSON.stringify(metrics, null, 1));
console.log(`DONE ${done}, undetected ${undetected}, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
await browser.close();
