import { fitMiniBatchKMeansLab } from './kmeans';
import type { KSelectionDiagnostics, KSelectionMode } from './types';

export type SelectOptimalKOptions = {
  mode: Exclude<KSelectionMode, 'fixed'>;
  maxK: number;
  maxSamples: number;
  seed: number;
  nInit: number;
  batchSize: number;
};

/**
 * Candidate K grid spanning [2 .. maxK] efficiently so browser runtime stays fast (~150-350ms).
 */
export function buildCandidateKs(maxK: number, uniqueCount: number): number[] {
  const cap = Math.min(maxK, uniqueCount);
  if (cap <= 2) return [Math.max(1, cap)];
  const base = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48];
  const ks = base.filter((k) => k <= cap);
  if (ks[ks.length - 1] !== cap) ks.push(cap);
  return ks;
}

/**
 * Compute within-cluster sum of squared errors (inertia / SSE) in CIELAB space
 * on a deterministic sample for a fitted clustering result.
 */
function computeSampleInertia(
  sample: Float64Array,
  centroids: Array<[number, number, number]>,
  sampleLabels: Int32Array,
): number {
  const n = sampleLabels.length;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const c = centroids[sampleLabels[i]];
    const p = i * 3;
    const dL = sample[p] - c[0];
    const da = sample[p + 1] - c[1];
    const db = sample[p + 2] - c[2];
    sse += dL * dL + da * da + db * db;
  }
  return sse;
}

/**
 * Compute mean Silhouette coefficient on a deterministic subsample (up to 600 points)
 * in CIELAB space. Exact O(m^2) on m <= 600 takes < 2ms in V8!
 */
function computeMeanSilhouette(
  sample: Float64Array,
  sampleLabels: Int32Array,
  k: number,
  maxEvalPoints = 600,
): number {
  const n = sampleLabels.length;
  if (k <= 1 || n <= k) return 0;

  const stride = Math.max(1, Math.floor(n / maxEvalPoints));
  const evalIdx: number[] = [];
  for (let i = 0; i < n && evalIdx.length < maxEvalPoints; i += stride) {
    evalIdx.push(i);
  }
  const m = evalIdx.length;
  if (m <= k) return 0;

  const clusterSums = new Float64Array(k);
  const clusterCounts = new Int32Array(k);
  let totalSil = 0;
  let validPoints = 0;

  for (let a = 0; a < m; a++) {
    const idxA = evalIdx[a];
    const lblA = sampleLabels[idxA];
    const pA = idxA * 3;
    const LA = sample[pA];
    const aA = sample[pA + 1];
    const bA = sample[pA + 2];

    clusterSums.fill(0);
    clusterCounts.fill(0);

    for (let b = 0; b < m; b++) {
      if (a === b) continue;
      const idxB = evalIdx[b];
      const lblB = sampleLabels[idxB];
      const pB = idxB * 3;
      const d = Math.hypot(LA - sample[pB], aA - sample[pB + 1], bA - sample[pB + 2]);
      clusterSums[lblB] += d;
      clusterCounts[lblB]++;
    }

    if (clusterCounts[lblA] === 0) {
      // Singleton cluster in subsample -> silhouette = 0 by definition
      validPoints++;
      continue;
    }

    const intra = clusterSums[lblA] / clusterCounts[lblA];
    let nearestInter = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === lblA || clusterCounts[c] === 0) continue;
      const meanDist = clusterSums[c] / clusterCounts[c];
      if (meanDist < nearestInter) nearestInter = meanDist;
    }

    if (!Number.isFinite(nearestInter)) continue;
    const denom = Math.max(intra, nearestInter);
    totalSil += denom > 0 ? (nearestInter - intra) / denom : 0;
    validPoints++;
  }

  return validPoints > 0 ? totalSil / validPoints : 0;
}

/**
 * Kneedle / maximum perpendicular distance elbow detector on the normalized (K, inertia) curve.
 * Draws the chord from the first candidate (K_min, SSE_max) to the last candidate (K_max, SSE_min)
 * in normalized [0, 1]^2 coordinates and selects the K maximizing distance below the chord.
 */
export function findElbowK(points: Array<{ k: number; inertia: number }>): number {
  if (points.length === 0) return 2;
  if (points.length <= 2) return points[points.length - 1].k;

  const first = points[0];
  const last = points[points.length - 1];
  const kSpan = last.k - first.k || 1;
  const sseSpan = first.inertia - last.inertia;
  if (sseSpan <= 1e-9) return first.k;

  let bestK = points[0].k;
  let bestDist = -Infinity;

  // Normalized chord runs from (0, 1) to (1, 0), so x + y = 1.
  // Perpendicular distance below the chord for point (xn, yn) is proportional to (1 - xn - yn).
  for (const pt of points) {
    const xn = (pt.k - first.k) / kSpan;
    const yn = (pt.inertia - last.inertia) / sseSpan;
    const dist = 1 - xn - yn;
    if (dist > bestDist) {
      bestDist = dist;
      bestK = pt.k;
    }
  }

  return bestK;
}

/**
 * Select an optimal cluster count K in CIELAB space using either:
 *  - 'elbow': Kneedle maximum-curvature point on the within-cluster SSE curve
 *  - 'silhouette': Maximum mean Silhouette score across candidate K values
 */
export function selectOptimalKLab(
  flatLab: Float64Array,
  options: SelectOptimalKOptions,
): KSelectionDiagnostics {
  const totalPixels = Math.floor(flatLab.length / 3);
  if (totalPixels <= 1) {
    return {
      mode: options.mode,
      selectedK: Math.max(1, totalPixels),
      candidates: [],
      rationale: 'Image has at most one pixel.',
    };
  }

  // Deterministic diagnostic subsample (up to 6,000 pixels) for fast curve evaluation
  const evalCount = Math.min(6000, totalPixels);
  const stride = Math.max(1, Math.floor(totalPixels / evalCount));
  const evalPoints: number[] = [];
  const uniqueSet = new Set<string>();
  for (let i = 0; i < totalPixels && evalPoints.length < evalCount; i += stride) {
    evalPoints.push(i);
    const p = i * 3;
    uniqueSet.add(`${flatLab[p]}|${flatLab[p + 1]}|${flatLab[p + 2]}`);
  }

  const uniqueCount = uniqueSet.size;
  const subLab = new Float64Array(evalPoints.length * 3);
  for (let i = 0; i < evalPoints.length; i++) {
    const src = evalPoints[i] * 3;
    subLab[i * 3] = flatLab[src];
    subLab[i * 3 + 1] = flatLab[src + 1];
    subLab[i * 3 + 2] = flatLab[src + 2];
  }

  if (uniqueCount <= 2) {
    return {
      mode: options.mode,
      selectedK: Math.max(1, uniqueCount),
      candidates: [{ k: Math.max(1, uniqueCount), inertia: 0, silhouette: 0 }],
      rationale: `Only ${uniqueCount} unique colour${uniqueCount === 1 ? '' : 's'} detected in sample.`,
    };
  }

  const candidateKs = buildCandidateKs(options.maxK, uniqueCount);
  const candidates: Array<{ k: number; inertia: number; silhouette: number }> = [];

  for (const k of candidateKs) {
    const km = fitMiniBatchKMeansLab(subLab, {
      k,
      maxSamples: evalPoints.length,
      seed: options.seed,
      nInit: Math.min(2, options.nInit),
      batchSize: Math.min(options.batchSize, evalPoints.length),
      maxIter: 40,
    });
    const inertia = computeSampleInertia(subLab, km.centroids, km.labels);
    const silhouette =
      options.mode === 'silhouette' ? computeMeanSilhouette(subLab, km.labels, km.k) : 0;
    candidates.push({ k: km.k, inertia, silhouette });
  }

  if (options.mode === 'elbow') {
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    const prev = candidates[candidates.length - 2];
    const isExactSmallPalette =
      uniqueCount <= options.maxK &&
      last.k === uniqueCount &&
      last.inertia < 1e-6 &&
      prev &&
      first.inertia > 0 &&
      prev.inertia / first.inertia > 0.05;
    const selectedK = isExactSmallPalette ? last.k : findElbowK(candidates);
    return {
      mode: 'elbow',
      selectedK,
      candidates,
      rationale: isExactSmallPalette
        ? `Selected exact K = ${selectedK} matching all ${uniqueCount} distinct image colours (zero CIELAB SSE).`
        : `Selected K = ${selectedK} via Kneedle elbow point on the CIELAB inertia curve (range 2–${candidateKs[candidateKs.length - 1]}).`,
    };
  }

  // Silhouette mode: pick K with highest mean Silhouette score
  let best = candidates[0];
  for (const cand of candidates) {
    if (cand.silhouette > best.silhouette) best = cand;
  }
  return {
    mode: 'silhouette',
    selectedK: best.k,
    candidates,
    rationale: `Selected K = ${best.k} maximizing CIELAB mean Silhouette score (${best.silhouette.toFixed(3)}).`,
  };
}
