// Merge practitioner label corrections (downloaded from review.html) back
// into the manifest. Usage:
//   node lips_apply_corrections.mjs <corrections.json> [manifest.json]
import { readFileSync, writeFileSync } from 'fs';

const corrFile = process.argv[2];
const manifestFile = process.argv[3] ?? new URL('../lips_curation/lips_manifest.json', import.meta.url).pathname;
if (!corrFile) {
  console.error('usage: node lips_apply_corrections.mjs <lips_label_corrections.json> [manifest.json]');
  process.exit(1);
}

const corrections = JSON.parse(readFileSync(corrFile, 'utf8'));
const rows = JSON.parse(readFileSync(manifestFile, 'utf8'));

let applied = 0;
for (const r of rows) {
  if (corrections[r.file] && corrections[r.file] !== r.stage) {
    r.stage = corrections[r.file];
    r.method = 'practitioner';
    r.confidence = 'confirmed';
    applied++;
  }
}
writeFileSync(manifestFile, JSON.stringify(rows, null, 1));

const byStage = rows.reduce((m, r) => { m[r.stage] = (m[r.stage] || 0) + 1; return m; }, {});
console.log(`applied ${applied} corrections → ${manifestFile}`);
console.log('stages now:', JSON.stringify(byStage));
