import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { concern } from '../src/lib/figure';
import {scoreStage1,riskScore,STAGE1_VERSION} from '../src/lib/stage1';
import { hex } from '../src/lib/color';
import {figureRaster} from '../src/lib/figure-raster';
import { decode } from './benchmark-raster';
import bank from '../benchmark/study-bank.json';
import manifest from '../benchmark/manifest.json';

const root = join(process.cwd(), 'benchmark');
const images = new Map(manifest.items.map((item) => [item.id, item]));
const assigned = bank.flatMap((row) => (row.stage2 ? [row.original, row.stage2] : [row.original]));
if (
  new Set(assigned).size !== assigned.length ||
  assigned.length !== images.size ||
  assigned.some((id) => !images.has(id))
) {
  throw Error('Every pilot image must have exactly one place in the study bank.');
}
const cropped=process.argv.includes('--crop');
const rows = [];
for (const { original, role, crop, stage2 } of bank) {
  const item = images.get(original)!;
  if (stage2 && (!item.pair_id || images.get(stage2)?.pair_id !== item.pair_id))
    throw Error('Mismatched variants: ' + original);
  if (crop) {
    const [left, top, right, bottom] = crop;
    if (
      crop.length !== 4 ||
      !crop.every(Number.isInteger) ||
      left < 0 ||
      top < 0 ||
      left >= right ||
      top >= bottom ||
      right > item.width ||
      bottom > item.height
    )
      throw Error('Invalid figure crop: ' + original);
  }
  const file = join(root, item.file);
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== item.sha256)
    throw Error('Changed image: ' + original);
  const raster = figureRaster(decode(file, 1400, cropped?crop:undefined));
  const result = scoreStage1(raster);
  for (const profile of result.profiles) {
    const pair = profile.strongest;
    rows.push({
      image: original,
      role,
      profile: profile.mode,
      version: STAGE1_VERSION,
      risk_score: riskScore(profile),
      width: raster.width,
      height: raster.height,
      pairs: profile.examined,
      warnings: profile.warnings.length,
      grade: concern(pair?.metric.risk),
      color_a: pair ? hex(result.regions[pair.a].color) : '',
      color_b: pair ? hex(result.regions[pair.b].color) : '',
      original_delta_e: pair?.normal.toFixed(2),
      simulated_delta_e: pair?.metric.deltaE.toFixed(2),
      retained_fraction: pair?.metric.retention.toFixed(3),
    });
  }
}
const columns = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
const lines = rows.map((row) => columns.map((col) => row[col] ?? '').join(','));
writeFileSync(join(root, cropped?'stage1-crops.csv':'stage1-colors.csv'), [columns.join(','), ...lines].join('\n') + '\n');
console.log(
  `Measured ${bank.length} original images across ${rows.length} image/profile combinations.`,
);
