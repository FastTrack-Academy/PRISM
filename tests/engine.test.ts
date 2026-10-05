import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaE2000, deltaE, contrastRatio, simulateColor } from '../src/lib/color';
import { segment, evaluate, pairMetrics, applyCorrections, band } from '../src/lib/engine';
import type { Raster, CorrectionProposal } from '../src/lib/types';
function fixture(w = 120, h = 80): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
function fill(r: Raster, x: number, y: number, w: number, h: number, c: number[]) {
  for (let dy = y; dy < y + h; dy++)
    for (let dx = x; dx < x + w; dx++) {
      const i = (dy * r.width + dx) * 4;
      r.data.set([...c, 255], i);
    }
}
test('CIEDE2000 matches published Sharma reference pairs', () => {
  for (const [a, b, expected] of [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  ] as [number[], number[], number][]) {
    assert.ok(
      Math.abs(
        deltaE2000(a as [number, number, number], b as [number, number, number]) - expected,
      ) < 0.0001,
    );
  }
});
test('identity, contrast limits, and simulation endpoints', () => {
  assert.equal(deltaE([24, 70, 110], [24, 70, 110]), 0);
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  for (const mode of ['protan', 'deutan', 'tritan'] as const) {
    assert.deepEqual(simulateColor([0, 0, 0], mode), [0, 0, 0]);
    assert.ok(simulateColor([255, 255, 255], mode).every((c) => c >= 254));
  }
  assert.equal(band(null), 'Not enough evidence');
});
test('severity-100 simulation matches Colorspacious 1.1.2 golden outputs within one rounding unit', () => {
  // Generated with the notebooks' cspace_convert(rgb, sRGB1+CVD, sRGB1), clipped then uint8.
  const colors = [
    [191, 73, 64],
    [109, 131, 62],
    [25, 80, 180],
    [230, 125, 30],
    [0, 0, 0],
    [255, 255, 255],
    [45, 150, 70],
    [55, 120, 205],
  ] as [number, number, number][];
  const golden = {
    protan: [
      [104, 96, 62],
      [137, 123, 55],
      [0, 93, 183],
      [156, 137, 2],
      [0, 0, 0],
      [255, 254, 254],
      [151, 136, 62],
      [79, 127, 208],
    ],
    deutan: [
      [133, 121, 60],
      [134, 122, 66],
      [0, 79, 178],
      [181, 161, 28],
      [0, 0, 0],
      [254, 254, 255],
      [138, 127, 75],
      [53, 113, 203],
    ],
    tritan: [
      [209, 47, 71],
      [113, 125, 115],
      [0, 105, 121],
      [252, 101, 107],
      [0, 0, 0],
      [254, 254, 254],
      [0, 146, 131],
      [0, 139, 152],
    ],
  };
  for (const mode of ['protan', 'deutan', 'tritan'] as const)
    colors.forEach((color, i) =>
      simulateColor(color, mode).forEach((value, j) =>
        assert.ok(Math.abs(value - golden[mode][i][j]) <= 1),
      ),
    );
});
test('red/green conflict loses separation in deutan simulation', () => {
  const p = pairMetrics([191, 73, 64], [109, 131, 62]);
  assert.ok(p.metrics.find((m) => m.mode === 'deutan')!.retention < 0.3);
  assert.ok(p.risk > 0.4);
});
test('segmentation is deterministic and keeps disconnected same-color objects separate', () => {
  const r = fixture();
  fill(r, 10, 10, 20, 20, [190, 60, 60]);
  fill(r, 80, 10, 20, 20, [190, 60, 60]);
  const a = segment(r),
    b = segment(r);
  assert.deepEqual(a.labels, b.labels);
  assert.notEqual(a.labels[11 * r.width + 11], a.labels[11 * r.width + 81]);
});
test('blank page is unscored; measured conflicts yield traceable issues', () => {
  const blank = fixture(),
    a = segment(blank);
  assert.equal(evaluate(blank, a.regions, a.labels, [], 1).score, null);
  const r = fixture();
  fill(r, 10, 10, 45, 50, [191, 73, 64]);
  fill(r, 55, 10, 45, 50, [109, 131, 62]);
  const s = segment(r);
  const result = evaluate(r, s.regions, s.labels, [], 1);
  const colorIssue = result.issues.find((i) => i.kind === 'color');
  assert.ok(colorIssue);
  assert.equal(colorIssue.regionIds.length, 2);
  assert.notEqual(colorIssue.regionIds[0], colorIssue.regionIds[1]);
  assert.ok(result.score !== null);
  assert.ok(result.warnings.some((w) => w.includes('not assessed')));
});
test('approved regional correction preserves other disconnected regions and original bytes', () => {
  const r = fixture();
  fill(r, 10, 10, 20, 20, [190, 60, 60]);
  fill(r, 80, 10, 20, 20, [190, 60, 60]);
  const s = segment(r),
    a = evaluate(r, s.regions, s.labels, [], 1),
    before = r.data.slice();
  const id = s.labels[15 * r.width + 15];
  const fix: CorrectionProposal = {
    id: 'fix',
    issueId: 'test',
    regionId: id,
    kind: 'recolor',
    color: [20, 60, 180],
    label: 'Recolor',
    description: 'test',
    gain: 5,
    score: 80,
    changeCost: 20,
  };
  const changed = applyCorrections(r, a, [fix]);
  assert.deepEqual(r.data, before);
  assert.deepEqual(
    [...changed.data.slice((15 * r.width + 85) * 4, (15 * r.width + 85) * 4 + 3)],
    [190, 60, 60],
  );
  assert.deepEqual(
    [...changed.data.slice((15 * r.width + 15) * 4, (15 * r.width + 15) * 4 + 3)],
    [20, 60, 180],
  );
});
