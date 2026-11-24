import type { LabColor } from './types';

export type MiniBatchKMeansOptions = {
  k: number;
  maxSamples: number;
  seed: number;
  nInit: number;
  batchSize: number;
  maxIter?: number;
  maxNoImprovement?: number;
  reassignmentRatio?: number;
};

export type MiniBatchKMeansResult = {
  k: number;
  /** Centroids in CIELAB space, length k. */
  centroids: LabColor[];
  /** Per-pixel cluster assignments in [0, k-1], length = totalPixels. */
  labels: Int32Array;
  /** Per-cluster pixel counts across the full image, length = k. */
  counts: Int32Array;
};

/**
 * Deterministic PRNG (Mulberry32) for reproducible sampling and k-means++ initialization.
 */
function createRng(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nextInt = (maxExclusive: number): number => Math.floor(next() * maxExclusive);
  return { next, nextInt };
}

/**
 * Sample `m` unique indices from `[0, n)` without replacement using partial Fisher-Yates / map swap.
 */
function sampleIndicesWithoutReplacement(
  n: number,
  m: number,
  nextInt: (max: number) => number,
): Int32Array {
  if (m >= n) {
    const all = new Int32Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    return all;
  }
  const out = new Int32Array(m);
  const swaps = new Map<number, number>();
  for (let i = 0; i < m; i++) {
    const j = i + nextInt(n - i);
    const valJ = swaps.has(j) ? swaps.get(j)! : j;
    const valI = swaps.has(i) ? swaps.get(i)! : i;
    out[i] = valJ;
    swaps.set(j, valI);
  }
  return out;
}

/**
 * Greedy k-means++ initialization matching scikit-learn's `_kmeans_plusplus`.
 */
function kmeansPlusPlus(
  data: Float64Array,
  indices: Int32Array,
  k: number,
  rng: { next: () => number; nextInt: (m: number) => number },
): Float64Array {
  const n = indices.length;
  const centers = new Float64Array(k * 3);
  const nLocalTrials = 2 + Math.floor(Math.log(k));

  // Pick first center uniformly at random
  const firstIdx = indices[rng.nextInt(n)] * 3;
  centers[0] = data[firstIdx];
  centers[1] = data[firstIdx + 1];
  centers[2] = data[firstIdx + 2];

  const closestDistSq = new Float64Array(n);
  let currentPot = 0;
  for (let i = 0; i < n; i++) {
    const p = indices[i] * 3;
    const dL = data[p] - centers[0];
    const da = data[p + 1] - centers[1];
    const db = data[p + 2] - centers[2];
    const d2 = dL * dL + da * da + db * db;
    closestDistSq[i] = d2;
    currentPot += d2;
  }

  const candIds = new Int32Array(nLocalTrials);

  for (let c = 1; c < k; c++) {
    if (currentPot <= 0) {
      const pick = indices[rng.nextInt(n)] * 3;
      centers[c * 3] = data[pick];
      centers[c * 3 + 1] = data[pick + 1];
      centers[c * 3 + 2] = data[pick + 2];
      continue;
    }

    // Draw nLocalTrials candidates proportional to closestDistSq
    for (let t = 0; t < nLocalTrials; t++) {
      const target = rng.next() * currentPot;
      let cum = 0;
      let chosen = n - 1;
      for (let i = 0; i < n; i++) {
        cum += closestDistSq[i];
        if (cum >= target) {
          chosen = i;
          break;
        }
      }
      candIds[t] = chosen;
    }

    let bestCandidate = candIds[0];
    let bestPot = Infinity;
    for (let t = 0; t < nLocalTrials; t++) {
      const cp = indices[candIds[t]] * 3;
      const cL = data[cp];
      const ca = data[cp + 1];
      const cb = data[cp + 2];
      let pot = 0;
      for (let i = 0; i < n; i++) {
        const p = indices[i] * 3;
        const dL = data[p] - cL;
        const da = data[p + 1] - ca;
        const db = data[p + 2] - cb;
        const d2 = dL * dL + da * da + db * db;
        pot += d2 < closestDistSq[i] ? d2 : closestDistSq[i];
      }
      if (pot < bestPot) {
        bestPot = pot;
        bestCandidate = candIds[t];
      }
    }

    const bp = indices[bestCandidate] * 3;
    const bL = data[bp];
    const ba = data[bp + 1];
    const bb = data[bp + 2];
    centers[c * 3] = bL;
    centers[c * 3 + 1] = ba;
    centers[c * 3 + 2] = bb;

    currentPot = 0;
    for (let i = 0; i < n; i++) {
      const p = indices[i] * 3;
      const dL = data[p] - bL;
      const da = data[p + 1] - ba;
      const db = data[p + 2] - bb;
      const d2 = dL * dL + da * da + db * db;
      if (d2 < closestDistSq[i]) closestDistSq[i] = d2;
      currentPot += closestDistSq[i];
    }
  }

  return centers;
}

function computeSubsetInertia(
  data: Float64Array,
  indices: Int32Array,
  centers: Float64Array,
  k: number,
): number {
  let inertia = 0;
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i] * 3;
    const pL = data[p];
    const pa = data[p + 1];
    const pb = data[p + 2];
    let best = Infinity;
    for (let c = 0; c < k; c++) {
      const o = c * 3;
      const dL = pL - centers[o];
      const da = pa - centers[o + 1];
      const db = pb - centers[o + 2];
      const d2 = dL * dL + da * da + db * db;
      if (d2 < best) best = d2;
    }
    inertia += best;
  }
  return inertia;
}

/**
 * MiniBatch K-means clustering in CIELAB space following Sculley (2010) and scikit-learn's
 * MiniBatchKMeans (k-means++ with n_init trials, mini-batch inverse-count updates, low-count
 * center reassignment, EWMA early stopping, and full-image nearest-centroid assignment).
 */
export function fitMiniBatchKMeansLab(
  flatLab: Float64Array,
  options: MiniBatchKMeansOptions,
): MiniBatchKMeansResult {
  const totalPixels = Math.floor(flatLab.length / 3);
  if (totalPixels === 0) {
    return { k: 0, centroids: [], labels: new Int32Array(0), counts: new Int32Array(0) };
  }

  const rng = createRng(options.seed);
  const sampleCount = Math.min(options.maxSamples, totalPixels);
  const sampleIdx = sampleIndicesWithoutReplacement(totalPixels, sampleCount, rng.nextInt);

  // Extract sampled points into contiguous Float64Array and count unique Lab triples
  const sample = new Float64Array(sampleCount * 3);
  const uniqueMap = new Map<string, number>();
  const uniquePoints: LabColor[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const src = sampleIdx[i] * 3;
    const L = flatLab[src];
    const a = flatLab[src + 1];
    const b = flatLab[src + 2];
    sample[i * 3] = L;
    sample[i * 3 + 1] = a;
    sample[i * 3 + 2] = b;

    const key = `${L}|${a}|${b}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, uniquePoints.length);
      uniquePoints.push([L, a, b]);
    }
  }

  const effectiveK = Math.max(1, Math.min(options.k, uniquePoints.length));

  let centers: Float64Array;

  if (effectiveK === uniquePoints.length) {
    // Exact cluster centroids when unique sampled colours <= K
    centers = new Float64Array(effectiveK * 3);
    for (let c = 0; c < effectiveK; c++) {
      centers[c * 3] = uniquePoints[c][0];
      centers[c * 3 + 1] = uniquePoints[c][1];
      centers[c * 3 + 2] = uniquePoints[c][2];
    }
  } else {
    const batchSize = Math.min(options.batchSize, sampleCount);
    const initSize = Math.min(Math.max(3 * batchSize, 3 * effectiveK), sampleCount);

    // Validation set drawn once (matching scikit-learn MiniBatchKMeans.fit)
    const validIndices = new Int32Array(initSize);
    for (let i = 0; i < initSize; i++) validIndices[i] = rng.nextInt(sampleCount);

    // n_init k-means++ initializations on fresh random subsets, keep lowest validation inertia
    let bestCenters: Float64Array | null = null;
    let bestInitInertia = Infinity;

    for (let trial = 0; trial < options.nInit; trial++) {
      const initIndices = sampleIndicesWithoutReplacement(sampleCount, initSize, rng.nextInt);
      const trialCenters = kmeansPlusPlus(sample, initIndices, effectiveK, rng);
      const trialInertia = computeSubsetInertia(sample, validIndices, trialCenters, effectiveK);
      if (trialInertia < bestInitInertia) {
        bestInitInertia = trialInertia;
        bestCenters = trialCenters;
      }
    }
    centers = bestCenters!;

    // Mini-batch optimization loop matching scikit-learn MiniBatchKMeans.fit
    const maxIter = options.maxIter ?? 100;
    const maxNoImprovement = options.maxNoImprovement ?? 10;
    const reassignmentRatio = options.reassignmentRatio ?? 0.01;
    const nSteps = Math.max(1, Math.floor((maxIter * sampleCount) / batchSize));

    const clusterCounts = new Float64Array(effectiveK);
    const batchSum = new Float64Array(effectiveK * 3);
    const batchCount = new Int32Array(effectiveK);
    const batchIndices = new Int32Array(batchSize);

    let ewaInertia: number | null = null;
    let ewaInertiaMin = Infinity;
    let noImprovement = 0;
    let nSinceLastReassign = 0;

    for (let step = 0; step < nSteps; step++) {
      // Draw mini-batch (randint(0, sampleCount, batchSize))
      for (let i = 0; i < batchSize; i++) {
        batchIndices[i] = rng.nextInt(sampleCount);
      }

      batchSum.fill(0);
      batchCount.fill(0);
      let batchInertia = 0;

      // E-step: assign batch points to nearest centroid
      for (let i = 0; i < batchSize; i++) {
        const p = batchIndices[i] * 3;
        const pL = sample[p];
        const pa = sample[p + 1];
        const pb = sample[p + 2];
        let bestC = 0;
        let bestD2 = Infinity;
        for (let c = 0; c < effectiveK; c++) {
          const o = c * 3;
          const dL = pL - centers[o];
          const da = pa - centers[o + 1];
          const db = pb - centers[o + 2];
          const d2 = dL * dL + da * da + db * db;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestC = c;
          }
        }
        batchInertia += bestD2;
        batchCount[bestC]++;
        const bo = bestC * 3;
        batchSum[bo] += pL;
        batchSum[bo + 1] += pa;
        batchSum[bo + 2] += pb;
      }

      // Check _random_reassign() BEFORE updating counts (matching sklearn)
      let hasEmpty = false;
      for (let c = 0; c < effectiveK; c++) {
        if (clusterCounts[c] === 0) {
          hasEmpty = true;
          break;
        }
      }
      nSinceLastReassign += batchSize;
      let doReassign = false;
      if (hasEmpty || nSinceLastReassign >= 10 * effectiveK) {
        nSinceLastReassign = 0;
        doReassign = true;
      }

      // M-step: per-center incremental count-weighted update
      let maxCount = 0;
      for (let c = 0; c < effectiveK; c++) {
        const bc = batchCount[c];
        if (bc > 0) {
          const prev = clusterCounts[c];
          const nextCount = prev + bc;
          const o = c * 3;
          centers[o] = (centers[o] * prev + batchSum[o]) / nextCount;
          centers[o + 1] = (centers[o + 1] * prev + batchSum[o + 1]) / nextCount;
          centers[o + 2] = (centers[o + 2] * prev + batchSum[o + 2]) / nextCount;
          clusterCounts[c] = nextCount;
        }
        if (clusterCounts[c] > maxCount) maxCount = clusterCounts[c];
      }

      // Reassign starved centers uniformly at random from batch (matching sklearn _mini_batch_step)
      if (doReassign && reassignmentRatio > 0 && maxCount > 0) {
        const threshold = maxCount * reassignmentRatio;
        const toReassign: number[] = [];
        for (let c = 0; c < effectiveK; c++) {
          if (clusterCounts[c] < threshold) toReassign.push(c);
        }
        const maxReassign = Math.floor(0.5 * batchSize);
        if (toReassign.length > maxReassign) {
          toReassign.sort((a, b) => clusterCounts[a] - clusterCounts[b]);
          toReassign.length = maxReassign;
        }
        if (toReassign.length > 0) {
          const picks = sampleIndicesWithoutReplacement(batchSize, toReassign.length, rng.nextInt);
          const reassignSet = new Set(toReassign);
          let minKept = Infinity;
          for (let c = 0; c < effectiveK; c++) {
            if (!reassignSet.has(c) && clusterCounts[c] < minKept) {
              minKept = clusterCounts[c];
            }
          }
          const resetCount = Number.isFinite(minKept) ? minKept : 1;
          for (let r = 0; r < toReassign.length; r++) {
            const c = toReassign[r];
            const p = batchIndices[picks[r]] * 3;
            const o = c * 3;
            centers[o] = sample[p];
            centers[o + 1] = sample[p + 1];
            centers[o + 2] = sample[p + 2];
            clusterCounts[c] = resetCount;
          }
        }
      }

      // EWMA batch inertia convergence check (matching sklearn _mini_batch_convergence)
      if (step === 0) continue;

      const normInertia = batchInertia / batchSize;
      if (ewaInertia === null) {
        ewaInertia = normInertia;
      } else {
        const alpha = (batchSize * 2) / (sampleCount + 1);
        const clampedAlpha = alpha > 1 ? 1 : alpha;
        ewaInertia = ewaInertia * (1 - clampedAlpha) + normInertia * clampedAlpha;
      }

      if (ewaInertia < ewaInertiaMin) {
        ewaInertiaMin = ewaInertia;
        noImprovement = 0;
      } else {
        noImprovement++;
        if (noImprovement >= maxNoImprovement) break;
      }
    }
  }

  // Assign every pixel in the computational image to its nearest Lab centroid
  const labels = new Int32Array(totalPixels);
  const counts = new Int32Array(effectiveK);

  for (let i = 0; i < totalPixels; i++) {
    const p = i * 3;
    const pL = flatLab[p];
    const pa = flatLab[p + 1];
    const pb = flatLab[p + 2];
    let bestC = 0;
    let bestD2 = Infinity;
    for (let c = 0; c < effectiveK; c++) {
      const o = c * 3;
      const dL = pL - centers[o];
      const da = pa - centers[o + 1];
      const db = pb - centers[o + 2];
      const d2 = dL * dL + da * da + db * db;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestC = c;
      }
    }
    labels[i] = bestC;
    counts[bestC]++;
  }

  const centroids: LabColor[] = [];
  for (let c = 0; c < effectiveK; c++) {
    centroids.push([centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]]);
  }

  return { k: effectiveK, centroids, labels, counts };
}
