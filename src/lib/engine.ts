import { clamp, contrastRatio, deltaE, lab, simulateColor } from './color';
import {
  CVD_MODES,
  type RGB,
  type Raster,
  type Region,
  type Box,
  type TextRegion,
  type PageAnalysis,
  type ConfusionIssue,
  type CorrectionProposal,
  type PairMetric,
} from './types';

export const SCORING = {
  version: 'PRISM-0.1.0',
  k: 8,
  maxEdge: 1400,
  minAreaFraction: 0.0005,
  absoluteThreshold: 12,
  retentionThreshold: 0.6,
  minGain: 5,
  maxPages: 10,
} as const;
const distance = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const at = (r: Raster, i: number): RGB => [r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]];
const union = (a: Box, b: Box): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
  height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
});
export const band = (score: number | null) =>
  score === null
    ? 'Not enough evidence'
    : score >= 80
      ? 'Strong'
      : score >= 60
        ? 'Review'
        : 'High confusion risk';

export function pairMetrics(
  a: RGB,
  b: RGB,
): { normal: number; metrics: PairMetric[]; risk: number } {
  const normal = deltaE(a, b);
  const metrics = CVD_MODES.map((mode) => {
    const d = deltaE(simulateColor(a, mode), simulateColor(b, mode));
    const retention = normal < 0.00001 ? 1 : d / normal;
    const risk = 0.7 * clamp((12 - d) / 12) + 0.3 * clamp((0.6 - retention) / 0.6);
    return { mode, deltaE: d, retention, risk };
  });
  return { normal, metrics, risk: Math.max(...metrics.map((m) => m.risk)) };
}

// Deterministic sampled k-means; one int label per pixel, no per-pixel objects.
export function segment(r: Raster): { regions: Region[]; labels: Int32Array } {
  const n = r.width * r.height,
    stride = Math.max(1, Math.floor(n / 10000));
  const sample: RGB[] = [];
  for (let i = 0; i < n; i += stride) sample.push(at(r, i));
  const centers: RGB[] = [sample[0]];
  for (let k = 1; k < SCORING.k; k++) {
    let best = sample[0],
      max = -1;
    for (const p of sample) {
      const d = Math.min(...centers.map((c) => distance(p, c)));
      if (d > max) {
        max = d;
        best = p;
      }
    }
    centers.push([...best]);
  }
  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of sample) {
      let best = 0,
        d = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const q = distance(p, centers[j]);
        if (q < d) {
          d = q;
          best = j;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sums[best][3]++;
    }
    let movement = 0;
    sums.forEach((s, i) => {
      if (s[3]) {
        const c = s.slice(0, 3).map((x) => x / s[3]) as RGB;
        movement += distance(c, centers[i]);
        centers[i] = c;
      }
    });
    if (movement < 0.1) break;
  }
  const clusters = new Uint8Array(n),
    labels = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = 0,
      d = Infinity;
    const p = at(r, i);
    for (let k = 0; k < centers.length; k++) {
      const q = distance(p, centers[k]);
      if (q < d) {
        d = q;
        best = k;
      }
    }
    clusters[i] = best;
  }
  const visited = new Uint8Array(n),
    queue = new Int32Array(n),
    regions: Region[] = [];
  const minArea = Math.max(4, Math.ceil(n * SCORING.minAreaFraction));
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    visited[seed] = 1;
    let x0 = r.width,
      y0 = r.height,
      x1 = 0,
      y1 = 0,
      sr = 0,
      sg = 0,
      sb = 0,
      sq = 0;
    while (head < tail) {
      const p = queue[head++],
        x = p % r.width,
        y = Math.floor(p / r.width),
        c = at(r, p);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      sr += c[0];
      sg += c[1];
      sb += c[2];
      sq += c[0] ** 2 + c[1] ** 2 + c[2] ** 2;
      // Four-connectivity deliberately keeps diagonally touching marks separate.
      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < r.width - 1 ? p + 1 : -1,
        y > 0 ? p - r.width : -1,
        y < r.height - 1 ? p + r.width : -1,
      ];
      for (const q of neighbors)
        if (q >= 0 && !visited[q] && clusters[q] === clusters[seed]) {
          visited[q] = 1;
          queue[tail++] = q;
        }
    }
    if (tail < minArea) continue;
    const id = regions.length,
      color: [number, number, number] = [sr / tail, sg / tail, sb / tail];
    regions.push({
      id,
      area: tail,
      box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
      color,
      variance: Math.max(0, sq / tail - color.reduce((s, v) => s + v * v, 0)),
    });
    for (let q = 0; q < tail; q++) labels[queue[q]] = id;
  }
  return { regions, labels };
}

type Edge = { a: number; b: number; boundary: number; cue: number };
function edgesFor(r: Raster, labels: Int32Array, regions: Region[]): Edge[] {
  const map = new Map<string, Edge>();
  const add = (p: number, q: number, cue: number) => {
    let a = labels[p],
      b = labels[q];
    if (a < 0 || b < 0 || a === b) return;
    if (a > b) [a, b] = [b, a];
    const key = `${a}:${b}`,
      edge = map.get(key) || { a, b, boundary: 0, cue: 0 };
    edge.boundary++;
    edge.cue += cue;
    map.set(key, edge);
  };
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const p = y * r.width + x;
      if (x + 1 < r.width) add(p, p + 1, 0);
      if (y + 1 < r.height) add(p, p + r.width, 0);
      // Also compare regions across thin strokes that segmentation filtered out.
      if (labels[p] >= 0)
        for (const step of [1, r.width]) {
          const end = step === 1 ? Math.min(5, r.width - 1 - x) : Math.min(5, r.height - 1 - y);
          for (let d = 2; d <= end; d++) {
            const q = p + step * d;
            if (labels[q] < 0) continue;
            if (labels[q] !== labels[p]) {
              const mid = at(r, p + step * Math.floor(d / 2));
              const ca = regions[labels[p]].color,
                cb = regions[labels[q]].color;
              const cue = contrastRatio(mid, ca) >= 3 && contrastRatio(mid, cb) >= 3 ? 1 : 0;
              if (cue || labels[p + step] < 0) add(p, q, cue);
            }
            break;
          }
        }
    }
  return [...map.values()].filter(
    (e) => e.boundary >= Math.max(3, Math.min(r.width, r.height) * 0.003),
  );
}
function textContrast(r: Raster, t: TextRegion) {
  const colors: RGB[] = [];
  const box = t.box;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(r.height, box.y + box.height); y += 2)
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(r.width, box.x + box.width); x += 2)
      colors.push(at(r, y * r.width + x));
  if (colors.length < 5) return null;
  colors.sort((a, b) => a.reduce((s, v) => s + v, 0) - b.reduce((s, v) => s + v, 0));
  const dark = colors[Math.floor(colors.length * 0.1)],
    light = colors[Math.floor(colors.length * 0.9)];
  return contrastRatio(dark, light);
}

export function evaluate(
  r: Raster,
  regions: Region[],
  labels: Int32Array,
  texts: TextRegion[],
  pageNumber: number,
): PageAnalysis {
  const issues: ConfusionIssue[] = [],
    edges = edgesFor(r, labels, regions);
  let riskSum = 0,
    weightSum = 0,
    cueSum = 0,
    riskyWeight = 0,
    contrastSum = 0,
    contrastWeight = 0;
  let examinedColorPairs = 0;
  for (const e of edges) {
    const a = regions[e.a],
      b = regions[e.b];
    const pair = pairMetrics(a.color, b.color);
    // Ignore already-indistinguishable shades and neutral/neutral boundaries for CVD risk.
    const chroma = (c: RGB) => Math.hypot(...lab(c).slice(1));
    if (pair.normal < 3 || Math.max(chroma(a.color), chroma(b.color)) < 12) continue;
    examinedColorPairs++;
    const weight = e.boundary * Math.sqrt(Math.min(a.area, b.area));
    const outlineFraction = e.cue / e.boundary;
    const hasOutline = outlineFraction >= 0.4;
    const nearLabel = texts.some(
      (t) =>
        t.confidence >= 75 &&
        [a, b].some(
          (q) =>
            t.box.x < q.box.x + q.box.width + 8 &&
            t.box.x + t.box.width > q.box.x - 8 &&
            t.box.y < q.box.y + q.box.height + 8 &&
            t.box.y + t.box.height > q.box.y - 8,
        ),
    );
    const hasCue = hasOutline || nearLabel;
    riskSum += pair.risk * weight;
    weightSum += weight;
    const cr = contrastRatio(a.color, b.color);
    contrastSum += Math.min(1, cr / 3) * weight;
    contrastWeight += weight;
    if (pair.risk >= 0.2) {
      riskyWeight += weight;
      cueSum += (hasCue ? 1 : 0) * weight;
      issues.push({
        id: `p${pageNumber}-r${e.a}-${e.b}`,
        kind: 'color',
        regionIds: [e.a, e.b],
        box: union(a.box, b.box),
        title: `Regions ${e.a + 1} and ${e.b + 1} lose separation`,
        description: `Two nearby colors become harder to distinguish in at least one simulation. ${hasCue ? 'A possible outline or nearby label was detected; check that it conveys the meaning.' : 'Add an outline, pattern, or explicit label so color is not the only cue.'}`,
        severity: pair.risk >= 0.5 ? 'Major' : 'Moderate',
        risk: pair.risk,
        normalDeltaE: pair.normal,
        metrics: pair.metrics,
        hasCue,
        suggestions: [],
      });
    }
  }
  // Text is an independent measured sample; give equal weight to each confident word box.
  let textSum = 0,
    textCount = 0;
  for (const t of texts) {
    if (t.confidence < 65) continue;
    const cr = textContrast(r, t);
    if (cr === null) continue;
    const threshold = t.large ? 3 : 4.5;
    textSum += Math.min(1, cr / threshold);
    textCount++;
    if (cr < threshold)
      issues.push({
        id: `p${pageNumber}-t${textCount}`,
        kind: 'text',
        regionIds: [],
        box: t.box,
        title: `Low-contrast text: “${t.text.slice(0, 36)}”`,
        description: `Estimated text contrast is ${cr.toFixed(2)}:1; the reference target is ${threshold}:1. Raster sampling and OCR can be imperfect. Review the original text before editing.`,
        severity: cr < 3 ? 'Major' : 'Moderate',
        risk: 1 - cr / threshold,
        normalDeltaE: 0,
        metrics: [],
        contrast: cr,
        threshold,
        hasCue: false,
        suggestions: [],
      });
  }
  const separation = weightSum ? 100 * (1 - riskSum / weightSum) : regions.length > 1 ? 100 : null;
  const graphicsContrast = contrastWeight ? contrastSum / contrastWeight : null;
  const contrast = textCount
    ? 100 *
      (graphicsContrast === null
        ? textSum / textCount
        : (textSum / textCount) * 0.7 + graphicsContrast * 0.3)
    : graphicsContrast === null
      ? null
      : graphicsContrast * 100;
  const redundancy = riskyWeight ? (100 * cueSum) / riskyWeight : separation !== null ? 100 : null;
  const components = [
    [separation, 0.6],
    [contrast, 0.25],
    [redundancy, 0.15],
  ];
  const denom = components.reduce((s, [v, w]) => s + (v === null ? 0 : w!), 0);
  const score = denom
    ? Math.round(components.reduce((s, [v, w]) => s + (v === null ? 0 : v * w!), 0) / denom)
    : null;
  const warnings = [
    'Experimental score; semantic meaning and non-adjacent legend relationships require human review.',
    'Redundancy uses outline and nearby-label heuristics; pattern and shape meaning are not automatically verified.',
  ];
  if (!textCount)
    warnings.push('Text contrast was not assessed: no confident English text measurements.');
  if (regions.some((region) => region.variance > 1800))
    warnings.push(
      'Textured or photographic content detected. Region-mean color estimates may be unreliable.',
    );
  if (score === null) warnings.push('Not enough distinct content to produce a score.');
  return {
    pageNumber,
    width: r.width,
    height: r.height,
    score,
    separation,
    examinedColorPairs,
    contrast,
    redundancy,
    confidence: textCount ? 'Exploratory' : 'Limited',
    issues: issues.sort((a, b) => b.risk - a.risk),
    warnings,
    regions,
    labels,
    textRegions: texts,
    duration: 0,
    version: SCORING.version,
  };
}

export function applyCorrections(
  r: Raster,
  analysis: PageAnalysis,
  fixes: CorrectionProposal[],
): Raster {
  const data = new Uint8ClampedArray(r.data),
    sx = r.width / analysis.width,
    sy = r.height / analysis.height;
  const labelAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= analysis.width || y >= analysis.height
      ? -1
      : analysis.labels[y * analysis.width + x];
  for (const fix of fixes)
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        const ax = Math.min(analysis.width - 1, Math.floor(x / sx)),
          ay = Math.min(analysis.height - 1, Math.floor(y / sy));
        if (labelAt(ax, ay) !== fix.regionId) continue;
        const edge = [
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
        ].some(([dx, dy]) => labelAt(ax + dx, ay + dy) !== fix.regionId);
        if (fix.kind === 'outline' && !edge) continue;
        if (fix.kind === 'pattern' && (ax + ay) % 14 > 2 && !edge) continue;
        const i = (y * r.width + x) * 4;
        data[i] = fix.color[0];
        data[i + 1] = fix.color[1];
        data[i + 2] = fix.color[2];
      }
  return { width: r.width, height: r.height, data };
}

export function remeasure(r: Raster, baseline: PageAnalysis): PageAnalysis {
  // Re-segment so scores reflect actual changed pixels, not hypothetical gains.
  const { regions, labels } = segment(r);
  return evaluate(r, regions, labels, baseline.textRegions, baseline.pageNumber);
}

export function hasNewMajorIssue(next: PageAnalysis, baseline: PageAnalysis): boolean {
  const counts = new Map<number, Map<number, number>>();
  for (let i = 0; i < next.labels.length; i += 3) {
    const a = next.labels[i],
      b = baseline.labels[i];
    if (a < 0 || b < 0) continue;
    const row = counts.get(a) || new Map<number, number>();
    row.set(b, (row.get(b) || 0) + 1);
    counts.set(a, row);
  }
  const correspondence = new Map<number, number>();
  for (const [id, row] of counts) {
    let best = -1,
      count = 0;
    for (const [b, n] of row)
      if (n > count) {
        best = b;
        count = n;
      }
    correspondence.set(id, best);
  }
  return next.issues.some((issue) => {
    if (issue.severity !== 'Major') return false;
    if (issue.kind === 'text')
      return !baseline.issues.some(
        (old) => old.kind === 'text' && old.id === issue.id && old.severity === 'Major',
      );
    const mapped = issue.regionIds.map((id) => correspondence.get(id));
    if (new Set(mapped).size !== mapped.length) return true;
    return !baseline.issues.some(
      (old) =>
        old.kind === 'color' &&
        old.severity === 'Major' &&
        mapped.every((id) => id !== undefined && old.regionIds.includes(id)),
    );
  });
}

export function analyze(
  r: Raster,
  pageNumber: number,
  textRegions: TextRegion[],
  warnings: string[],
  progress: (message: string) => void,
): PageAnalysis {
  const started = performance.now();
  progress('Finding colors and connected regions');
  const { regions, labels } = segment(r);
  progress('Measuring simulated color separation');
  const result = evaluate(r, regions, labels, textRegions, pageNumber);
  result.warnings.push(...warnings);
  // Limit expensive candidate search to the 3 highest-risk color relationships.
  const candidates: RGB[] = [
    [25, 80, 180],
    [230, 125, 30],
    [135, 70, 180],
    [35, 180, 190],
    [55, 55, 55],
    [200, 55, 150],
  ];
  const targetIssues = result.issues.filter((i) => i.kind === 'color').slice(0, 3);
  for (const issue of targetIssues) {
    progress(
      `Testing preserve-first fixes (${targetIssues.indexOf(issue) + 1}/${targetIssues.length})`,
    );
    const regionId = issue.regionIds.reduce((a, b) => (regions[a].area < regions[b].area ? a : b));
    const region = regions[regionId];
    // Photos, large backgrounds and text-bearing areas require manual redesign.
    if (
      region.variance > 1800 ||
      region.area > r.width * r.height * 0.3 ||
      textRegions.some(
        (t) =>
          t.box.x >= region.box.x &&
          t.box.x <= region.box.x + region.box.width &&
          t.box.y >= region.box.y &&
          t.box.y <= region.box.y + region.box.height,
      )
    )
      continue;
    const proposals: {
      kind: CorrectionProposal['kind'];
      color: RGB;
      label: string;
      description: string;
    }[] = [
      {
        kind: 'outline',
        color: [20, 27, 43],
        label: 'Add a dark outline',
        description:
          'Add a 2-pixel inner outline around this region, preserving its interior color.',
      },
      {
        kind: 'pattern',
        color: [20, 27, 43],
        label: 'Add a striped pattern',
        description: 'Add diagonal stripes and an outline to give this region a non-color cue.',
      },
      ...candidates.map((color) => ({
        kind: 'recolor' as const,
        color,
        label: 'Adjust the region color',
        description:
          'Replace only this connected region; review related keys and labels before approving.',
      })),
    ];
    let bestRecolor: CorrectionProposal | null = null,
      bestJ = Infinity;
    for (const p of proposals) {
      const fix: CorrectionProposal = {
        ...p,
        id: `${issue.id}-${p.kind}-${p.color.join('-')}`,
        issueId: issue.id,
        regionId,
        gain: 0,
        score: 0,
        changeCost: p.kind === 'recolor' ? deltaE(region.color, p.color) : 0,
      };
      const modified = applyCorrections(r, result, [fix]);
      const next = remeasure(modified, result);
      const gain = (next.score ?? 0) - (result.score ?? 0);
      // A new major issue in the modified region is grounds to reject a proposal.
      const regressions = hasNewMajorIssue(next, result);
      if (gain < SCORING.minGain || regressions) continue;
      fix.gain = gain;
      fix.score = next.score!;
      if (p.kind !== 'recolor') {
        issue.suggestions.push(fix);
        break;
      }
      const j =
        0.65 * (1 - fix.score / 100) +
        0.25 * clamp(fix.changeCost / 100) +
        (0.1 * region.area) / (r.width * r.height);
      if (j < bestJ) {
        bestJ = j;
        bestRecolor = fix;
      }
    }
    if (!issue.suggestions.length && bestRecolor) issue.suggestions.push(bestRecolor);
  }
  result.duration = performance.now() - started;
  return result;
}
