// Train the clinic outcome model v0: a statistical displacement field learned
// from real before/after pairs.
//
// Per verified episode: pick the best-quality before and after image (largest
// face, lips closed), extract mouth-frame-normalized lip landmark vectors via
// the app engine, and take the per-landmark difference. Aggregate across
// pairs with a median, enforce left/right symmetry, and validate leave-one-out
// (predict each patient's after from a field trained WITHOUT them).
//
// Output: clinic field in mouth-width units at 1.0 ml-equivalent scale
// (aggregate statistics only — no patient imagery leaves lips_curation/).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const CURATION = new URL('../lips_curation/', import.meta.url).pathname;
const FIELD_OUT = new URL('../frontend/src/engine/lips/clinicField.json', import.meta.url).pathname;
const ROOT = '/Users/sameem_amjad/myprojects/poc_ar_filter/lips';

const manifest = JSON.parse(readFileSync(CURATION + 'lips_manifest.json', 'utf8'));
const metrics = JSON.parse(readFileSync(CURATION + 'metrics.json', 'utf8'));

const DOSE_EXP = 0.75;
const doseResp = ml => Math.pow(ml, DOSE_EXP);

// left↔right landmark mirror map along the lip rings
const MIRROR = { 61: 291, 185: 409, 40: 270, 39: 269, 37: 267, 0: 0, 267: 37, 269: 39, 270: 40, 409: 185, 291: 61,
  146: 375, 91: 321, 181: 405, 84: 314, 17: 17, 314: 84, 405: 181, 321: 91, 375: 146,
  78: 308, 191: 415, 80: 310, 81: 311, 82: 312, 13: 13, 312: 82, 311: 81, 310: 80, 415: 191, 308: 78,
  95: 324, 88: 318, 178: 402, 87: 317, 14: 14, 317: 87, 402: 178, 318: 88, 324: 95 };

// ── choose usable pairs from the manifest ──
const episodes = new Map();
for (const r of manifest) {
  const key = `${r.folder}::${r.session}`;
  const e = episodes.get(key) ?? { doseMl: r.doseMl, rows: [] };
  e.rows.push(r);
  episodes.set(key, e);
}

const candidates = [];
for (const [key, e] of episodes) {
  if (!e.doseMl) continue;
  const ok = r => r.detected && (r.confidence === 'high' || r.confidence === 'medium');
  const pick = stage => e.rows
    .filter(r => r.stage === stage && ok(r))
    .map(r => ({ ...r, interOcPx: metrics[r.file]?.interOcPx ?? 0, gap: metrics[r.file]?.mouthGap ?? 9 }))
    .filter(r => r.gap < 0.11) // lips (nearly) closed
    .sort((a, b) => b.interOcPx - a.interOcPx)[0];
  const before = pick('before');
  const after = pick('after');
  if (before && after) candidates.push({ key, doseMl: e.doseMl, before: before.file, after: after.file, gapB: before.gap, gapA: after.gap });
}
console.log(`usable pairs (both sides detected, lips closed): ${candidates.length}`);

// ── extract normalized lip vectors via the engine ──
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/qa.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.qaReady === true, null, { timeout: 60000 });

const vec = async rel => {
  const url = 'http://localhost:5173/@fs/' + (ROOT + '/' + rel).slice(1).split('/').map(encodeURIComponent).join('/');
  return page.evaluate(u => window.qaLipVectors(u), url);
};

const pairFields = [];
for (const c of candidates) {
  const b = await vec(c.before);
  const a = await vec(c.after);
  if (!b.detected || !a.detected) continue;
  // expression mismatch guard
  if (Math.abs(a.mouthGap - b.mouthGap) > 0.05) { console.log(`skip (expression) ${c.key}`); continue; }

  // displacement per landmark, converted to mouth-width units, normalized to 1.0 ml
  const scale = 1 / (b.mouthWidth || 1) / (doseResp(c.doseMl) / doseResp(1.0));
  const field = {};
  for (const idx of Object.keys(b.vectors)) {
    const dx = (a.vectors[idx][0] - b.vectors[idx][0]) * scale;
    const dy = (a.vectors[idx][1] - b.vectors[idx][1]) * scale;
    field[idx] = [dx, dy];
  }
  pairFields.push({ ...c, field, mouthWidthB: b.mouthWidth });
}
await browser.close();
console.log(`pairs with clean vector extraction: ${pairFields.length}`);
if (pairFields.length < 4) {
  console.log('Too few pairs to train responsibly — need practitioner label corrections first.');
  process.exit(1);
}

// ── aggregate: median per landmark, then symmetrize ──
const median = arr => { const s = [...arr].sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const LM_IDS = Object.keys(pairFields[0].field);

function aggregate(pairs) {
  const raw = {};
  for (const id of LM_IDS) {
    raw[id] = [median(pairs.map(p => p.field[id][0])), median(pairs.map(p => p.field[id][1]))];
  }
  // symmetrize: d(L) := avg(d(L), mirror-x of d(R))
  const sym = {};
  for (const id of LM_IDS) {
    const m = String(MIRROR[id]);
    sym[id] = [
      +(0.5 * (raw[id][0] - raw[m][0])).toFixed(5),
      +(0.5 * (raw[id][1] + raw[m][1])).toFixed(5),
    ];
  }
  // clamp outliers (landmark noise) to a sane per-landmark magnitude
  for (const id of LM_IDS) {
    const mag = Math.hypot(sym[id][0], sym[id][1]);
    if (mag > 0.05) { sym[id][0] *= 0.05 / mag; sym[id][1] *= 0.05 / mag; }
  }
  return sym;
}

const clinicField = aggregate(pairFields);

// ── leave-one-out validation ──
// Error metric: mean abs distance between predicted and actual after-vectors
// across lip landmarks, as % of mouth width. Baseline = "no change".
let errNull = 0, errModel = 0;
for (let i = 0; i < pairFields.length; i++) {
  const held = pairFields[i];
  const field = aggregate(pairFields.filter((_, j) => j !== i));
  const dose = doseResp(held.doseMl) / doseResp(1.0);
  let eN = 0, eM = 0;
  for (const id of LM_IDS) {
    const actual = held.field[id];                    // actual displacement (1.0ml-normalized, mouth-width units)
    const predicted = [field[id][0] * 1, field[id][1] * 1]; // model prediction at same normalization
    eN += Math.hypot(actual[0], actual[1]);
    eM += Math.hypot(actual[0] - predicted[0], actual[1] - predicted[1]);
  }
  errNull += (eN / LM_IDS.length) * dose * 100;
  errModel += (eM / LM_IDS.length) * dose * 100;
}
errNull /= pairFields.length;
errModel /= pairFields.length;

const report = {
  trainedAt: new Date().toISOString().slice(0, 10),
  pairs: pairFields.map(p => ({ episode: p.key, doseMl: p.doseMl })),
  nPairs: pairFields.length,
  looMeanAbsErrorPctMouthWidth: +errModel.toFixed(2),
  nullModelErrorPctMouthWidth: +errNull.toFixed(2),
  improvementPct: +((1 - errModel / errNull) * 100).toFixed(1),
};
writeFileSync(CURATION + 'training_report.json', JSON.stringify(report, null, 1));
writeFileSync(FIELD_OUT, JSON.stringify({
  meta: { units: 'mouthWidth at 1.0 ml equivalent', trainedOn: pairFields.length, trainedAt: report.trainedAt },
  field: clinicField,
}, null, 1));

console.log(`\nLOO validation (per-landmark mean abs error, % of mouth width):`);
console.log(`  null model (no change): ${errNull.toFixed(2)}%`);
console.log(`  clinic field:           ${errModel.toFixed(2)}%  (${report.improvementPct}% better)`);
console.log(`\nfield → ${FIELD_OUT}`);
// quick physiology readout
const up = clinicField['0'], low = clinicField['17'];
console.log(`sanity: philtrum-top moves (${up[0]}, ${up[1]}), lower-center (${low[0]}, ${low[1]}) [x=right, y=up, ×mouthWidth]`);
