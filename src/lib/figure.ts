import { lab } from './color';
import { segment, pairMetrics } from './engine';
import { slic } from './superpixels';
import { CVD_MODES, type PairMetric, type Raster, type Region, type RGB } from './types';

export type FigureMethod = 'kmeans' | 'slic';
export type Profile = (typeof CVD_MODES)[number];
export type PairEvidence = {
  a: number;
  b: number;
  normal: number;
  metric: PairMetric;
  examples: number;
};
export type ProfileResult = {
  mode: Profile;
  examined: number;
  strongest: PairEvidence | null;
  warnings: PairEvidence[];
};
export type FigureResult = {
  method: FigureMethod;
  spacing: number;
  labels: Int32Array;
  regions: Region[];
  profiles: ProfileResult[];
};
export const FIGURE_VERSION = 'figure-1';
export const reviewRisk = 0.2,
  highRisk = 0.5;
export function concern(risk?: number) {
  if (risk === undefined) return 'Insufficient evidence';
  if (risk >= highRisk) return 'High concern';
  if (risk >= reviewRisk) return 'Review';
  return 'Low measured concern';
}

// At a boundary, look ahead up to one spacing. Skipping the interiors of
// constant-label runs avoids comparing every pixel with every other pixel.
function nearbyPairs(r: Raster, labels: Int32Array, count: number, gap: number) {
  const pairs = new Set<number>();
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
  ]) {
    const limit = Math.floor(gap / Math.hypot(dx, dy)) + 1,
      step = dy * r.width + dx;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        const p = y * r.width + x,
          a = labels[p];
        if (
          a < 0 ||
          x + dx < 0 ||
          x + dx >= r.width ||
          y + dy >= r.height ||
          labels[p + step] === a
        )
          continue;
        let previous = a;
        for (let d = 1; d <= limit; d++) {
          const xx = x + dx * d,
            yy = y + dy * d;
          if (xx < 0 || xx >= r.width || yy >= r.height) break;
          const b = labels[p + d * step];
          if (b >= 0 && b !== a && b !== previous)
            pairs.add(Math.min(a, b) * count + Math.max(a, b));
          previous = b;
        }
      }
  }
  return pairs;
}
const colorBin = (c: RGB) => c.reduce((key, v) => key * 8 + Math.min(7, Math.floor(v / 32)), 0);
export const figureSpacing = (r: Raster) =>
  Math.max(3, Math.round(Math.max(r.width, r.height) / 50));
export function analyzeFigure(r: Raster, method: FigureMethod): FigureResult {
  const spacing = figureSpacing(r);
  const { regions, labels } = method === 'slic' ? slic(r, spacing) : segment(r);
  const groups = CVD_MODES.map(() => new Map<string, PairEvidence>());
  const profiles: ProfileResult[] = CVD_MODES.map((mode) => ({
    mode,
    examined: 0,
    strongest: null,
    warnings: [],
  }));
  const info = regions.map((region) => {
    const [, a, b] = lab(region.color);
    return { chroma: Math.hypot(a, b), bin: colorBin(region.color) };
  });
  for (const key of nearbyPairs(r, labels, regions.length, spacing)) {
    const a = Math.floor(key / regions.length),
      b = key % regions.length;
    if (Math.max(info[a].chroma, info[b].chroma) < 12) continue;
    const first = regions[a],
      second = regions[b],
      comparison = pairMetrics(first.color, second.color);
    if (comparison.normal < 12) continue;
    const p = first.box,
      q = second.box;
    const block = 8 * spacing;
    const tileX = Math.floor((p.x + p.width / 2 + q.x + q.width / 2) / (2 * block));
    const tileY = Math.floor((p.y + p.height / 2 + q.y + q.height / 2) / (2 * block));
    const groupKey = [
      tileX,
      tileY,
      Math.min(info[a].bin, info[b].bin),
      Math.max(info[a].bin, info[b].bin),
    ].join('/');
    comparison.metrics.forEach((m, i) => {
      const profile = profiles[i];
      profile.examined++;
      const pair = { a, b, normal: comparison.normal, metric: m, examples: 1 };
      if (!profile.strongest || m.risk > profile.strongest.metric.risk) profile.strongest = pair;
      if (m.risk < reviewRisk) return;
      const group = groups[i].get(groupKey);
      if (!group) groups[i].set(groupKey, pair);
      else if (m.risk > group.metric.risk) {
        pair.examples = group.examples + 1;
        groups[i].set(groupKey, pair);
      } else group.examples++;
    });
  }
  profiles.forEach((p, i) => {
    p.warnings = [...groups[i].values()].sort(
      (a, b) => b.metric.risk - a.metric.risk || a.a - b.a || a.b - b.b,
    );
    if (p.warnings.length) p.strongest = p.warnings[0];
  });
  return { method, spacing, regions, labels, profiles };
}
