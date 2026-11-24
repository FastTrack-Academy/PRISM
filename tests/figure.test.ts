import {scoreStage1} from '../src/lib/stage1';
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFigure, concern } from '../src/lib/figure';
import type { RGB, Raster } from '../src/lib/types';

function swatches(a: RGB, b: RGB, gap = 0): Raster {
  const width = 96,
    height = 48,
    data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const x = p % width;
    data.set([...(x < 48 ? a : x < 48 + gap ? [255, 255, 255] : b), 255], p * 4);
  }
  return { width, height, data };
}
for (const method of ['kmeans','slic','stage1'] as const) {
  const analyze=(r:Raster)=>method==='stage1'?scoreStage1(r):analyzeFigure(r,method);
  test(method + ' distinguishes single-profile loss and retains the other profiles', () => {
    const cases: [RGB, RGB, string][] = [
      [[190, 50, 50], [60, 93, 45], 'protan'],
      [[189, 75, 69], [112, 136, 73], 'deutan'],
      [[88, 188, 192], [93, 197, 130], 'tritan'],
    ];
    for (const [a, b, mode] of cases) {
      const r = swatches(a, b, 1),
        result = analyze(r);
      for (const p of result.profiles) {
        assert.ok(p.examined > 0);
        assert.equal(p.warnings.length > 0, p.mode === mode);
        if (p.mode !== mode) continue;
        const pair = p.strongest!;
        assert.equal(concern(pair.metric.risk), 'High concern');
        assert.ok(pair.metric.deltaE < pair.normal && pair.metric.retention < 0.6);
        assert.ok([pair.a, pair.b].every((id) => result.labels.includes(id)));
        assert.deepEqual(
          [result.regions[pair.a].color, result.regions[pair.b].color].sort(),
          [a, b].sort(),
        );
      }
    }
  });
  test(method + ' distinguishes retained colors from insufficient evidence', () => {
    const retained = analyze(swatches([25, 80, 180], [230, 125, 30]));
    const monochrome = analyze(swatches([130, 130, 130], [130, 130, 130]));
    assert.ok(retained.profiles.every((p) => p.examined > 0 && p.strongest && !p.warnings.length));
    assert.ok(
      monochrome.profiles.every(
        (p) => p.examined === 0 && !p.strongest && concern() === 'Insufficient evidence',
      ),
    );
  });
}
test('Stage 1 compares across a narrow gap without connecting distant marks', () => {
  const a: RGB = [189, 75, 69],
    b: RGB = [112, 136, 73];
  for (const gap of [2, 12]) {
    const r = swatches(a, b, gap),
      result = scoreStage1(r);
    const p = result.profiles.find((p) => p.mode === 'deutan')!;
    assert.equal(p.warnings.length > 0, gap === 2);
  }
});
