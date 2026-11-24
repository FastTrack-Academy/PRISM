import {scoreStage1, STAGE1_VERSION} from '../src/lib/stage1';
import bank from '../benchmark/study-bank.json';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { segment, evaluate } from '../src/lib/engine';
import {
  analyzeFigure,
  concern,
  reviewRisk,
  FIGURE_VERSION,
  type Profile,
  type PairEvidence,
  type ProfileResult,
} from '../src/lib/figure';
import { CVD_MODES, type Raster } from '../src/lib/types';
import {figureRaster} from '../src/lib/figure-raster';
import { decode } from './benchmark-raster';

type Reference = {
  points: [number, number][];
  radius: number;
  expected: Partial<Record<Profile, 'loss' | 'retain'>>;
};
type Item = {
  id: string;
  file: string;
  split: string;
  family: string;
  width: number;
  height: number;
  sha256: string;
  refs: Reference[];
};
const root = join(process.cwd(), 'benchmark');
const split = process.argv[2] || 'development';
if (!['development', 'fresh'].includes(split)) throw Error('Choose development or fresh.');
const key = readFileSync(join(root, 'figure-key.json'));
const stage1=process.argv.includes('--stage1');
const items = (JSON.parse(key.toString()) as Item[]).filter((i) => i.split === split && (!stage1 || split==='fresh' || bank.some(row=>row.original===i.id)));
const historical = new Map(
  readFileSync(join(root, 'score-baseline.csv'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const cells = line.replaceAll('"', '').split(',');
      return [cells[0], Number(cells[4])] as const;
    }),
);

function legacy(r: Raster) {
  const { regions, labels } = segment(r);
  const result = evaluate(r, regions, labels, [], 1);
  const profiles: ProfileResult[] = CVD_MODES.map((mode) => {
    const warnings: PairEvidence[] = [];
    for (const issue of result.issues) {
      const metric = issue.metrics.find((m) => m.mode === mode);
      if (metric && metric.risk >= reviewRisk)
        warnings.push({
          a: issue.regionIds[0],
          b: issue.regionIds[1],
          normal: issue.normalDeltaE,
          metric,
          examples: 1,
        });
    }
    warnings.sort((a, b) => b.metric.risk - a.metric.risk);
    return { mode, examined: result.examinedColorPairs!, warnings, strongest: warnings[0] ?? null };
  });
  return { labels, profiles, score: result.score };
}

// A pair must cover at least half the pixels of each reference disk, in either order.
function diskLabels(p: number[], radius: number, item: Item, r: Raster, labels: Int32Array) {
  const sx = r.width / item.width,
    sy = r.height / item.height,
    x = Math.round(p[0] * sx),
    y = Math.round(p[1] * sy);
  const rad = Math.max(1, Math.round(radius * Math.min(sx, sy))),
    counts = new Map<number, number>();
  let total = 0;
  for (let dy = -rad; dy <= rad; dy++)
    for (let dx = -rad; dx <= rad; dx++) {
      if (
        dx * dx + dy * dy > rad * rad ||
        x + dx < 0 ||
        y + dy < 0 ||
        x + dx >= r.width ||
        y + dy >= r.height
      )
        continue;
      const id = labels[(y + dy) * r.width + x + dx];
      total++;
      if (id >= 0) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  return new Set([...counts].filter(([, n]) => n * 2 >= total).map(([id]) => id));
}
const rows = [];
for (const item of items) {
  const file = join(root, item.file);
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== item.sha256)
    throw Error('Changed image: ' + item.id);
  const raster = stage1?figureRaster(decode(file,1400)):decode(file);
  for (const method of (stage1 ? ['stage1'] as const : ['A','B','C'] as const)) {
    const start = performance.now(),
      result =
        method==='stage1'?scoreStage1(raster):method === 'A' ? legacy(raster) : analyzeFigure(raster, method === 'B' ? 'kmeans' : 'slic');
    const elapsed = Math.round(performance.now() - start);
    const score = 'score' in result ? result.score : null;
    if (method === 'A' && split === 'development' && score !== historical.get(item.id))
      throw Error('Baseline mismatch on ' + item.id + ': ' + score);
    for (const profile of result.profiles) {
      const shown = profile.warnings.slice(0, 3);
      const refs = item.refs.filter((ref) => ref.expected[profile.mode]);
      const matches = refs.map((ref) => {
        const [a, b] = ref.points.map((p) =>
          diskLabels(p, ref.radius, item, raster, result.labels),
        );
        return shown.map((w) => (a.has(w.a) && b.has(w.b)) || (a.has(w.b) && b.has(w.a)));
      });
      const losses = refs.filter((ref) => ref.expected[profile.mode] === 'loss').length;
      const count = (target: string) =>
        refs.filter((ref, i) => ref.expected[profile.mode] === target && matches[i].some(Boolean))
          .length;
      rows.push({
        item: item.id,
        family: item.family,
        method,
        profile: profile.mode,
        legacyScore: score,
        grade: profile.examined ? concern(profile.strongest?.metric.risk ?? 0) : concern(),
        examined: profile.examined,
        warnings: profile.warnings.length,
        shown: shown.length,
        losses,
        hits: count('loss'),
        retain: refs.length - losses,
        retainFlagged: count('retain'),
        extra: refs.length
          ? shown.filter(
              (_, j) => !matches.some((m, i) => refs[i].expected[profile.mode] === 'loss' && m[j]),
            ).length
          : null,
        runtimeMs: elapsed,
        topPairs: shown.map((w) => [w.a, w.b].join('-')).join('|'),
      });
    }
  }
  console.log('Compared ' + item.id);
}
const headers = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
writeFileSync(
  join(root, (stage1?'stage1-localization-':'comparison-') + split + '.csv'),
  [headers.join(','), ...rows.map((r) => headers.map((h) => r[h] ?? '').join(','))].join('\n') +
    '\n',
);
console.log(stage1?STAGE1_VERSION:FIGURE_VERSION, split, 'key SHA-256', createHash('sha256').update(key).digest('hex'));
