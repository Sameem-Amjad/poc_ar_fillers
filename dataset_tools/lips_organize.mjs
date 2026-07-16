// Fuse EXIF clustering + lip-fullness metrics into a labeled manifest.
//
// Episode = one treatment record (a patient folder, or a numbered session
// subfolder inside it). Within an episode:
//   · 2 calendar-day clusters, 1–90 days apart → before-day / after-day
//     (clinic pattern: before shots on injection day, afters at follow-up)
//   · 1 day with 2 bursts 5–180 min apart → before / immediately-after
//   · 1 day, 1 burst → unknown → resolved against the patient's own
//     measured fullness anchors where possible, else queued for review
//   · 3+ days → first day = before, last = after, middle days for review
// Lower-face macro close-ups (no eyes) can't be measured by the face
// landmarker — they are labeled purely by time rules.
// Read-only over the dataset; writes manifest + review data only.
import { readFileSync, writeFileSync } from 'fs';

const OUT = new URL('./lips_out/', import.meta.url).pathname;
const survey = JSON.parse(readFileSync(OUT + 'survey.json', 'utf8'));
const metrics = JSON.parse(readFileSync(OUT + 'metrics.json', 'utf8'));

const BURST_MS = 12 * 60 * 1000;

const day = t => new Date(t).toISOString().slice(0, 10);
const fullnessOf = shots => {
  const vals = shots.map(s => metrics[s.rel]?.vermilionArea).filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

// ── episodes with day/burst structure ──
const episodes = survey.map(rec => {
  const shots = rec.shots
    .map(s => ({ rel: s.file.replace(/^.*?\/lips\//, ''), t: s.t }))
    .filter(s => s.t)
    .sort((a, b) => a.t - b.t);

  const days = [];
  for (const s of shots) {
    const last = days[days.length - 1];
    if (last && day(s.t) === day(last.shots[last.shots.length - 1].t)) last.shots.push(s);
    else days.push({ date: day(s.t), shots: [s] });
  }
  for (const d of days) {
    d.bursts = [];
    for (const s of d.shots) {
      const last = d.bursts[d.bursts.length - 1];
      if (last && s.t - last[last.length - 1].t < BURST_MS) last.push(s);
      else d.bursts.push([s]);
    }
  }
  return { ...rec, days };
});

// ── label stages per episode ──
const rows = [];
const pairs = [];

for (const ep of episodes) {
  const emit = (shots, stage, method, confidence, extra = {}) => {
    for (const s of shots) {
      const m = metrics[s.rel] ?? {};
      rows.push({
        file: s.rel, patient: ep.patient, folder: ep.folder, session: ep.session,
        doseMl: ep.doseMl, sessionsLabeled: ep.sessionsLabeled,
        date: day(s.t), stage, method, confidence,
        detected: !!m.detected, isCloseup: !m.detected,
        vermilionArea: m.vermilionArea ?? null, mouthWidth: m.mouthWidth ?? null,
        upperH: m.upperH ?? null, lowerH: m.lowerH ?? null,
        crop: m.crop ?? null, ...extra,
      });
    }
  };

  const d = ep.days;
  if (d.length === 2) {
    const gapDays = (d[1].shots[0].t - d[0].shots[0].t) / 86400000;
    if (gapDays >= 1 && gapDays <= 90) {
      const fb = fullnessOf(d[0].shots), fa = fullnessOf(d[1].shots);
      const deltaPct = fb != null && fa != null ? Math.round(((fa - fb) / fb) * 1000) / 10 : null;
      const conf = deltaPct == null ? 'medium' : deltaPct > -2 ? 'high' : 'conflict';
      emit(d[0].shots, 'before', 'visit-followup-gap', conf, { gapDays: Math.round(gapDays) });
      emit(d[1].shots, 'after', 'visit-followup-gap', conf, { gapDays: Math.round(gapDays) });
      if (conf === 'high' && deltaPct != null) pairs.push({ patient: ep.patient, session: ep.session, doseMl: ep.doseMl, gapDays: Math.round(gapDays), deltaPct });
      continue;
    }
  }
  if (d.length === 1 && d[0].bursts.length === 2) {
    const gapMin = (d[0].bursts[1][0].t - d[0].bursts[0].at(-1).t) / 60000;
    if (gapMin >= 5 && gapMin <= 180) {
      const fb = fullnessOf(d[0].bursts[0]), fa = fullnessOf(d[0].bursts[1]);
      const deltaPct = fb != null && fa != null ? Math.round(((fa - fb) / fb) * 1000) / 10 : null;
      const conf = deltaPct == null ? 'medium' : deltaPct > -2 ? 'high' : 'conflict';
      emit(d[0].bursts[0], 'before', 'same-day-procedure-gap', conf, { gapMin: Math.round(gapMin) });
      emit(d[0].bursts[1], 'after', 'same-day-procedure-gap', conf, { gapMin: Math.round(gapMin) });
      if (conf === 'high' && deltaPct != null) pairs.push({ patient: ep.patient, session: ep.session, doseMl: ep.doseMl, gapMin: Math.round(gapMin), deltaPct });
      continue;
    }
  }
  if (d.length >= 3) {
    emit(d[0].shots, 'before', 'multi-visit-endpoints', 'low');
    for (let i = 1; i < d.length - 1; i++) emit(d[i].shots, 'unknown', 'multi-visit-middle', 'none');
    emit(d[d.length - 1].shots, 'after', 'multi-visit-endpoints', 'low');
    continue;
  }
  // single day, single burst (or unusual) → unknown for now
  for (const dd of d) emit(dd.shots, 'unknown', 'single-burst', 'none');
}

// ── pass 2: resolve unknowns against the patient's measured anchors ──
const anchorsByPatient = new Map();
for (const r of rows) {
  if (r.confidence === 'high' && r.vermilionArea != null && (r.stage === 'before' || r.stage === 'after')) {
    const a = anchorsByPatient.get(r.patient) ?? { before: [], after: [] };
    a[r.stage].push(r.vermilionArea);
    anchorsByPatient.set(r.patient, a);
  }
}
let resolved = 0;
for (const r of rows) {
  if (r.stage !== 'unknown' || r.vermilionArea == null) continue;
  const a = anchorsByPatient.get(r.patient);
  if (!a?.before.length || !a?.after.length) continue;
  const mid = (Math.max(...a.before) + Math.min(...a.after)) / 2;
  const rel = (r.vermilionArea - mid) / mid;
  if (Math.abs(rel) > 0.03) {
    r.stage = rel > 0 ? 'after' : 'before';
    r.method = 'fullness-vs-anchors';
    r.confidence = 'medium';
    resolved++;
  }
}

writeFileSync(OUT + 'lips_manifest.json', JSON.stringify(rows, null, 1));
writeFileSync(OUT + 'pairs.json', JSON.stringify(pairs, null, 1));

// ── summary ──
const count = (key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});
console.log(`images: ${rows.length}  episodes: ${episodes.length}  patients: ${new Set(rows.map(r => r.patient)).size}`);
console.log('by stage:', JSON.stringify(count('stage')));
console.log('by method:', JSON.stringify(count('method')));
console.log('by confidence:', JSON.stringify(count('confidence')));
console.log(`metric-resolved unknowns: ${resolved}`);
console.log(`verified pairs (episode-level): ${pairs.length}`);
const half = pairs.filter(x => x.doseMl === 0.5).map(x => x.deltaPct).sort((a, b) => a - b);
if (half.length) console.log(`Δ vermilion area for 0.5 ml (n=${half.length}): median ${half[half.length >> 1]}%  IQR [${half[Math.floor(half.length * .25)]}, ${half[Math.floor(half.length * .75)]}]`);
const closeups = rows.filter(r => r.isCloseup).length;
console.log(`lower-face close-ups (time-labeled only): ${closeups}`);
