// Build the LOCAL review page (file://, patient data never leaves the machine).
// Practitioner flow: scan patient by patient, click any wrong/unknown chip to
// cycle before → after → unknown, then "Download corrections" and send the
// JSON back to be merged into the manifest.
import { readFileSync, writeFileSync } from 'fs';

const OUT = new URL('./lips_out/', import.meta.url).pathname;
const rows = JSON.parse(readFileSync(OUT + 'lips_manifest.json', 'utf8'));

// group: patient → episode(folder+session) → date
const patients = new Map();
for (const r of rows) {
  const p = patients.get(r.patient) ?? new Map();
  const epKey = `${r.folder}::${r.session}`;
  const ep = p.get(epKey) ?? [];
  ep.push(r);
  p.set(epKey, ep);
  patients.set(r.patient, p);
}

const CONF_LABEL = { high: 'auto · high', medium: 'auto · medium', low: 'auto · low', conflict: 'CONFLICT — check', none: 'needs label' };

let sections = '';
for (const [patient, eps] of patients) {
  const first = [...eps.values()][0][0];
  sections += `<section class="patient"><h2>${patient} <span class="meta">${first.doseMl ?? '?'} ml · ${first.sessionsLabeled}× · ${first.folder}</span></h2>`;
  for (const [epKey, imgs] of eps) {
    const session = epKey.split('::')[1];
    imgs.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
    sections += `<div class="episode"><h3>Session ${session}</h3><div class="strip">`;
    for (const r of imgs) {
      sections += `<figure class="shot conf-${r.confidence}" data-file="${r.file}">
        <img src="${r.thumb}" loading="lazy" alt="">
        <figcaption>
          <button class="stage stage-${r.stage}" onclick="cycle(this)">${r.stage}</button>
          <span class="date">${r.date}</span>
          <span class="conf">${CONF_LABEL[r.confidence] ?? r.confidence}${r.gapDays ? ` · +${r.gapDays}d` : ''}${r.gapMin ? ` · +${r.gapMin}m` : ''}${r.isCloseup ? ' · close-up' : ''}</span>
        </figcaption>
      </figure>`;
    }
    sections += `</div></div>`;
  }
  sections += `</section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Lips dataset review — before/after labels</title>
<style>
body { background: #f7f8fa; color: #10151c; font: 14px/1.5 -apple-system, "Segoe UI", sans-serif; margin: 0; }
header { position: sticky; top: 0; background: #fffffff2; backdrop-filter: blur(8px); border-bottom: 1px solid #e2e6ec; padding: 12px 20px; display: flex; align-items: center; gap: 16px; z-index: 5; }
h1 { font-size: 16px; margin: 0; flex: 1; }
.legend { display: flex; gap: 10px; font-size: 12px; color: #6b7480; align-items: center; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px; }
button.export { background: #2a8c86; border: 0; color: #fff; font-weight: 600; padding: 9px 16px; border-radius: 9px; cursor: pointer; }
main { max-width: 1240px; margin: 0 auto; padding: 18px 20px 80px; }
.patient { margin-bottom: 26px; }
.patient h2 { font-size: 16px; margin: 18px 0 4px; }
.patient .meta { color: #6b7480; font-weight: 400; font-size: 12.5px; margin-left: 8px; }
.episode h3 { font-size: 12px; color: #6b7480; text-transform: uppercase; letter-spacing: .08em; margin: 10px 0 6px; }
.strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.shot { margin: 0; flex: 0 0 170px; background: #fff; border: 1px solid #e2e6ec; border-radius: 12px; padding: 6px; }
.shot img { width: 100%; border-radius: 8px; display: block; }
.shot figcaption { display: flex; flex-direction: column; gap: 3px; padding: 6px 2px 2px; }
.stage { border: 0; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; cursor: pointer; width: fit-content; }
.stage-before  { background: #e8eefc; color: #2c5dbe; }
.stage-after   { background: #dcefec; color: #1f6f6b; }
.stage-unknown { background: #f1f3f6; color: #6b7480; }
.date { color: #3a434f; font-size: 12px; }
.conf { color: #a7aeb8; font-size: 11px; }
.conf-conflict { outline: 2px solid #c0463b; }
.conf-none .conf { color: #c9852a; font-weight: 600; }
.edited { outline: 2px solid #2a8c86; }
</style></head><body>
<header>
  <h1>Lips dataset — before/after review · ${rows.length} images · ${patients.size} patients</h1>
  <div class="legend">
    <span><span class="dot" style="background:#2c5dbe"></span>before</span>
    <span><span class="dot" style="background:#1f6f6b"></span>after</span>
    <span><span class="dot" style="background:#c9852a"></span>needs label</span>
    <span><span class="dot" style="background:#c0463b"></span>conflict</span>
  </div>
  <button class="export" onclick="exportCorrections()">Download corrections (<span id="n">0</span>)</button>
</header>
<main>${sections}</main>
<script>
const corrections = {};
const ORDER = ['before', 'after', 'unknown'];
function cycle(btn) {
  const cur = btn.textContent.trim();
  const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
  btn.textContent = next;
  btn.className = 'stage stage-' + next;
  const fig = btn.closest('.shot');
  corrections[fig.dataset.file] = next;
  fig.classList.add('edited');
  document.getElementById('n').textContent = Object.keys(corrections).length;
}
function exportCorrections() {
  const blob = new Blob([JSON.stringify(corrections, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lips_label_corrections.json';
  a.click();
}
</script>
</body></html>`;

writeFileSync(OUT + 'review.html', html);
console.log('review.html written:', Math.round(html.length / 1024), 'KB (images referenced locally, not embedded)');
