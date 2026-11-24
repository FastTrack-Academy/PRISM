/** Diagnostic PRISM score pass over the image bank, without OCR.
 *
 * Run: npx tsx scripts/score-benchmark.ts
 * Requires Python 3 and Pillow for PNG decoding. The app's full 1400px + OCR
 * pipeline can produce different values, so this report is not ground truth.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode } from './benchmark-raster';
import { evaluate, segment, SCORING } from '../src/lib/engine';

type Item = {
  id: string;
  file: string;
  category: string;
  expected_label: 'good' | 'bad';
  pair_id: string | null;
};
const root = join(process.cwd(), 'benchmark');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { items: Item[] };
const maxEdge = 700;

function csv(value: string | number | null) {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const rows: (string | number | null)[][] = [];
for (const item of manifest.items) {
  const raster = decode(join(root, item.file), maxEdge);
  const { regions, labels } = segment(raster);
  const result = evaluate(raster, regions, labels, [], 1);
  const predicted = result.score === null ? 'unscored' : result.score >= 80 ? 'good' : 'bad';
  rows.push([
    item.id,
    item.category,
    item.expected_label,
    item.pair_id,
    result.score,
    result.separation === null ? null : Math.round(result.separation),
    result.contrast === null ? null : Math.round(result.contrast),
    result.redundancy === null ? null : Math.round(result.redundancy),
    result.issues.filter((x) => x.severity === 'Major').length,
    predicted,
    predicted === item.expected_label ? 'match' : 'review',
  ]);
  process.stdout.write(`${item.id}: ${result.score ?? 'N/A'} (${predicted})\n`);
}

const header = [
  'id',
  'category',
  'expected_label',
  'pair_id',
  'score',
  'separation',
  'contrast',
  'redundancy',
  'major_issues',
  'predicted_at_80',
  'status',
];
const report = [header, ...rows].map((row) => row.map(csv).join(',')).join('\n') + '\n';
writeFileSync(join(root, 'score-reproduction.csv'), report);
console.log(
  `Saved ${rows.length} diagnostic results for ${SCORING.version} at ${maxEdge}px without OCR.`,
);
