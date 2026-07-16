// Survey the clinical lips dataset: parse Arabic folder labels, extract EXIF
// times, cluster shots within each patient session, and report how separable
// before/after is on timestamps alone. Read-only — never modifies the dataset.
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import exifr from 'exifr';

const ROOT = '/Users/sameem_amjad/myprojects/poc_ar_filter/lips';
const OUT = new URL('./lips_out/', import.meta.url).pathname;
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

// Parse dose + session count from the Arabic folder name.
// نص ابرة = half syringe (0.5 ml) · ابرة كاملة = full syringe (1.0 ml)
// مرتين = twice · N مرات = N times
const AR_NUMS = { 'مرتين': 2, 'ثلاث': 3, '3': 3, 'اربع': 4, '4': 4, 'خمس': 5, '5': 5, 'ست': 6, '6': 6, 'سبع': 7, '7': 7, 'ثمان': 8, '8': 8 };
function parseLabel(name) {
  const dose = /كامل/.test(name) ? 1.0 : /نص|نصف/.test(name) ? 0.5 : null;
  let times = 1;
  if (/مرتين/.test(name)) times = 2;
  else {
    const m = name.match(/(\d+)\s*مرات/) ?? name.match(/(ثلاث|اربع|خمس|ست|سبع|ثمان)\s*مرات/);
    if (m) times = AR_NUMS[m[1]] ?? 1;
  }
  const patient = name.split(/[-–]/)[0].trim();
  return { patient, doseMl: dose, sessionsLabeled: times };
}

const isImg = f => /\.(jpe?g)$/i.test(f);
const entries = readdirSync(ROOT).filter(d => !d.startsWith('.') && statSync(join(ROOT, d)).isDirectory());

const records = [];
for (const folder of entries) {
  const label = parseLabel(folder);
  const base = join(ROOT, folder);
  // sessions: root images = session "1"; numbered subfolders = their number
  const sessions = { '1': [] };
  for (const e of readdirSync(base)) {
    if (e.startsWith('.')) continue;
    const p = join(base, e);
    if (statSync(p).isDirectory()) {
      const imgs = readdirSync(p).filter(isImg).map(f => join(p, f));
      if (imgs.length) sessions[e] = imgs;
    } else if (isImg(e)) {
      sessions['1'].push(p);
    }
  }
  if (!sessions['1'].length) delete sessions['1'];

  for (const [session, files] of Object.entries(sessions)) {
    const shots = [];
    for (const f of files) {
      let t = null;
      try {
        const e = await exifr.parse(f, ['DateTimeOriginal']);
        t = e?.DateTimeOriginal ? new Date(e.DateTimeOriginal).getTime() : null;
      } catch { /* no exif */ }
      shots.push({ file: f, t });
    }
    records.push({ folder, ...label, session, shots });
  }
}

// Cluster each session's shots by time gap (>12 min or missing timestamps split out).
const GAP_MS = 12 * 60 * 1000;
let clusterable = 0, singleCluster = 0, noExif = 0, multi3 = 0;
for (const r of records) {
  const timed = r.shots.filter(s => s.t).sort((a, b) => a.t - b.t);
  const untimed = r.shots.filter(s => !s.t);
  const clusters = [];
  for (const s of timed) {
    const last = clusters[clusters.length - 1];
    if (last && s.t - last[last.length - 1].t < GAP_MS) last.push(s);
    else clusters.push([s]);
  }
  r.clusters = clusters.map(c => ({
    start: new Date(c[0].t).toISOString(),
    minutesFromPrev: null,
    files: c.map(s => s.file.replace(ROOT + '/', '')),
  }));
  for (let i = 1; i < clusters.length; i++) {
    r.clusters[i].minutesFromPrev = Math.round((clusters[i][0].t - clusters[i - 1][clusters[i - 1].length - 1].t) / 60000);
  }
  r.untimed = untimed.map(s => s.file.replace(ROOT + '/', ''));
  if (untimed.length && !timed.length) noExif++;
  else if (clusters.length === 2) clusterable++;
  else if (clusters.length === 1) singleCluster++;
  else if (clusters.length >= 3) multi3++;
}

const totalImgs = records.reduce((a, r) => a + r.shots.length, 0);
console.log(`patients: ${entries.length}, sessions: ${records.length}, images: ${totalImgs}`);
console.log(`sessions with exactly 2 time-clusters (auto before/after): ${clusterable}`);
console.log(`sessions with 1 cluster (single stage or needs vision): ${singleCluster}`);
console.log(`sessions with 3+ clusters (needs review): ${multi3}`);
console.log(`sessions with no EXIF at all: ${noExif}`);

// dose label coverage
const doses = records.reduce((m, r) => { m[r.doseMl ?? 'unknown'] = (m[r.doseMl ?? 'unknown'] || 0) + 1; return m; }, {});
console.log('dose labels (by session):', JSON.stringify(doses));

// gap distribution for 2-cluster sessions
const gaps = records.filter(r => r.clusters?.length === 2).map(r => r.clusters[1].minutesFromPrev).sort((a, b) => a - b);
console.log('2-cluster gaps (min):', gaps.slice(0, 5), '…', gaps.slice(-5), 'median', gaps[gaps.length >> 1]);

// 3+ cluster examples
for (const r of records.filter(r => r.clusters?.length >= 3).slice(0, 5)) {
  console.log(`3+: ${r.folder} s${r.session}: ${r.clusters.map(c => `${c.files.length}@${c.start.slice(0, 16)}${c.minutesFromPrev ? `(+${c.minutesFromPrev}m)` : ''}`).join(' | ')}`);
}

writeFileSync(OUT + 'survey.json', JSON.stringify(records, null, 1));
console.log('→ survey.json written');
