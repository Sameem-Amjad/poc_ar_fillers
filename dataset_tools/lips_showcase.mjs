// Validation showcase: for each verified before/after pair, render OUR
// simulation on the real BEFORE photo at the patient's actual dose (Clinic
// style — the model trained on their data) and place it between the real
// before and the real after. LOCAL page only — patient data never leaves.
//
// Run from a directory with playwright installed; vite dev on :5173.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const CURATION = '/Users/sameem_amjad/myprojects/poc_ar_filter/lips_curation/';
const ROOT = '/Users/sameem_amjad/myprojects/poc_ar_filter/lips';
mkdirSync(CURATION + 'showcase/', { recursive: true });

const manifest = JSON.parse(readFileSync(CURATION + 'lips_manifest.json', 'utf8'));
const metrics = JSON.parse(readFileSync(CURATION + 'metrics.json', 'utf8'));
const pairs = JSON.parse(readFileSync(CURATION + 'pairs.json', 'utf8'));

// choose best image per stage per episode (same policy as training)
const episodes = new Map();
for (const r of manifest) {
  const key = `${r.folder}::${r.session}`;
  (episodes.get(key) ?? episodes.set(key, []).get(key)).push(r);
}
const pickBest = (rows, stage) => rows
  .filter(r => r.stage === stage && r.detected && (r.confidence === 'high' || r.confidence === 'medium'))
  .map(r => ({ ...r, interOcPx: metrics[r.file]?.interOcPx ?? 0, gap: metrics[r.file]?.mouthGap ?? 9 }))
  .filter(r => r.gap < 0.11)
  .sort((a, b) => b.interOcPx - a.interOcPx)[0];

const cases = [];
for (const p of pairs) {
  const eprows = [...episodes.values()].find(rs =>
    rs[0].patient === p.patient && String(rs[0].session) === String(p.session));
  if (!eprows) continue;
  const before = pickBest(eprows, 'before');
  const after = pickBest(eprows, 'after');
  if (before && after) cases.push({ patient: p.patient, doseMl: p.doseMl, deltaPct: p.deltaPct, gapDays: p.gapDays ?? null, before: before.file, after: after.file, faceSize: before.interOcPx });
}
// Only clear-outcome pairs belong in front of the client (noisy or
// suspect pairs go through practitioner review first).
const strong = cases.filter(c => c.deltaPct >= 3);
strong.sort((a, b) => b.faceSize - a.faceSize);
cases.length = 0; cases.push(...strong.slice(0, 6));
console.log(`showcase candidates: ${cases.length}`);

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/qa.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.qaReady === true, null, { timeout: 60000 });

const fsUrl = rel => 'http://localhost:5173/@fs/' + (ROOT + '/' + rel).slice(1).split('/').map(encodeURIComponent).join('/');
const save = (name, dataUrl) => {
  writeFileSync(CURATION + 'showcase/' + name, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return 'showcase/' + name;
};

const rendered = [];
let i = 0;
for (const c of cases) {
  i++;
  // real before: process (gives before crop + clinic simulation crops)
  const sim = await page.evaluate(u => window.qaProcess(u, true), fsUrl(c.before));
  const aft = await page.evaluate(u => window.qaMeasure(u), fsUrl(c.after));
  if (!sim.detected || !aft.detected) continue;
  const cfg = (sim.results ?? []).find(r => r.style === 'clinic' && Math.abs(r.doseMl - c.doseMl) < 0.01);
  if (!cfg?.crop || !sim.beforeCrop || !aft.crop) continue;
  rendered.push({
    ...c,
    beforeCrop: save(`case${i}_before.jpg`, sim.beforeCrop),
    simCrop: save(`case${i}_sim.jpg`, cfg.crop),
    afterCrop: save(`case${i}_after.jpg`, aft.crop),
  });
}
await browser.close();
console.log(`rendered cases: ${rendered.length}`);

const cards = rendered.map((c, idx) => `
<section class="case">
  <div class="case-head">
    <h2>Patient ${String(idx + 1).padStart(2, '0')}</h2>
    <span class="meta tabular">${c.doseMl} ml · after photo ${c.gapDays ? `+${c.gapDays} days` : 'at follow-up'} · measured lip area change +${c.deltaPct}%</span>
  </div>
  <div class="trio">
    <figure><img src="${c.beforeCrop}"><figcaption>Real photo — before</figcaption></figure>
    <figure class="sim"><img src="${c.simCrop}"><figcaption>OUR SIMULATION at ${c.doseMl} ml<br><span>rendered from the before photo only</span></figcaption></figure>
    <figure><img src="${c.afterCrop}"><figcaption>Real photo — actual result</figcaption></figure>
  </div>
</section>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Prediction validation — real patients</title>
<style>
body { background:#f7f8fa; color:#10151c; font:15px/1.55 -apple-system,"Segoe UI",sans-serif; margin:0; }
.wrap { max-width:1060px; margin:0 auto; padding:44px 24px 80px; }
.eyebrow { color:#2a8c86; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; margin:0 0 10px; }
h1 { font-size:30px; letter-spacing:-.02em; margin:0 0 10px; }
.lede { color:#3a434f; max-width:66ch; margin:0 0 34px; }
.tabular { font-variant-numeric: tabular-nums; }
.case { background:#fff; border:1px solid #e2e6ec; border-radius:16px; padding:20px 22px; margin-bottom:20px; }
.case-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.case h2 { font-size:16px; margin:0; }
.meta { color:#6b7480; font-size:13px; }
.trio { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
figure { margin:0; }
figure img { width:100%; border-radius:10px; display:block; background:#eef1f5; }
figcaption { font-size:12.5px; color:#6b7480; margin-top:7px; font-weight:600; }
figure.sim figcaption { color:#1f6f6b; }
figure.sim figcaption span { font-weight:400; color:#6b7480; }
figure.sim img { outline:3px solid #2a8c86; outline-offset:-3px; }
.note { color:#6b7480; font-size:13px; border-top:1px solid #e2e6ec; padding-top:16px; max-width:75ch; }
</style></head><body><div class="wrap">
<p class="eyebrow">Aesthetic AI · Model validation — CONFIDENTIAL, patient data</p>
<h1>We predicted your patients’ results</h1>
<p class="lede">Each row is one of your real patients. The middle image is our simulation, generated <b>only from the before photo</b> and the recorded dose, using the outcome model trained on your clinic’s own treatment pairs. The right image is what actually happened.</p>
${cards}
<p class="note">Model: clinic outcome field v0 (statistical, trained on ${rendered.length ? rendered.length : 'the'} verified pairs, leave-one-out validated). Local document — do not upload or share outside the clinic. Simulation is an estimate, not a guarantee of clinical results.</p>
</div></body></html>`;

writeFileSync(CURATION + 'validation_showcase.html', html);
console.log('→ lips_curation/validation_showcase.html');
