/**
 * Compute raw symmetric k x k global colour-pair outer-product matrix:
 * G(i, j) = p_i * p_j
 */
export function computeGlobalRawWeights(frequencies: Float64Array): Float64Array {
  const k = frequencies.length;
  const globalRaw = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    const fi = frequencies[i];
    const row = i * k;
    for (let j = 0; j < k; j++) {
      globalRaw[row + j] = fi * frequencies[j];
    }
  }
  return globalRaw;
}

/**
 * Compute raw symmetric k x k local multi-scale spatial co-occurrence matrix
 * over offsets (default [2, 8, 16, 32]) and 4 directions:
 *   Horizontal (0, s), Vertical (s, 0), Main diagonal (s, s), Opposite diagonal (s, -s).
 *
 * Edge-case guard (documented per README.txt & spec):
 * Skip any (offset, direction) where image dimensions are too small for overlapping pairs,
 * and normalize by the actual number of valid direction-offset combinations (16 for normal images).
 */
export function computeLocalRawWeights(
  labels: Int32Array,
  width: number,
  height: number,
  k: number,
  offsets: readonly number[] = [2, 8, 16, 32],
): { localRaw: Float64Array; validCombos: number } {
  const localRaw = new Float64Array(k * k);
  if (k === 0 || width <= 0 || height <= 0) {
    return { localRaw, validCombos: 0 };
  }

  const combos: Array<[number, number]> = [];
  for (const s of offsets) {
    if (s <= 0) continue;
    const dirs: Array<[number, number]> = [
      [0, s],
      [s, 0],
      [s, s],
      [s, -s],
    ];
    for (const [dy, dx] of dirs) {
      if (height > Math.abs(dy) && width > Math.abs(dx)) {
        combos.push([dy, dx]);
      }
    }
  }

  const validCombos = combos.length;
  if (validCombos === 0) {
    return { localRaw, validCombos: 0 };
  }

  const counts = new Float64Array(k * k);

  for (const [dy, dx] of combos) {
    const yStart = Math.max(0, -dy);
    const yEnd = height - Math.max(0, dy);
    const xStart = Math.max(0, -dx);
    const xEnd = width - Math.max(0, dx);
    const pairCount = (yEnd - yStart) * (xEnd - xStart);
    if (pairCount <= 0) continue;

    counts.fill(0);
    for (let y = yStart; y < yEnd; y++) {
      const rowA = y * width;
      const rowB = (y + dy) * width;
      for (let x = xStart; x < xEnd; x++) {
        const a = labels[rowA + x];
        const b = labels[rowB + x + dx];
        counts[a * k + b]++;
      }
    }

    const denom = 2 * pairCount * validCombos;
    for (let i = 0; i < k; i++) {
      const rowI = i * k;
      for (let j = 0; j < k; j++) {
        localRaw[rowI + j] += (counts[rowI + j] + counts[j * k + i]) / denom;
      }
    }
  }

  return { localRaw, validCombos };
}

export type CombinedWeightsResult = {
  /** Eligibility mask (1 = eligible, 0 = ineligible), symmetric k x k with 0 diagonal. */
  valid: Uint8Array;
  /** Number of unique eligible unordered pairs (i < j). */
  eligiblePairCount: number;
  /** Normalized eligible global weights (k x k symmetric, sum = 1 if global evidence exists else 0). */
  normalizedGlobal: Float64Array;
  /** Normalized eligible local weights (k x k symmetric, sum = 1 if local evidence exists else 0). */
  normalizedLocal: Float64Array;
  /** Final combined normalized weights (k x k symmetric, sum = 1 if evidence exists else 0). */
  combined: Float64Array;
};

/**
 * Apply eligibility thresholds and combine global & local pair weights matching prism_stage1.py:
 *   valid(i, j) = (i !== j) && (d0(i, j) >= minOriginalDeltaE) && (freq[i] >= minFreq) && (freq[j] >= minFreq)
 *   W = gMix * norm(G * valid) + lMix * norm(S * valid), then renormalized to sum to 1.
 * If only one branch has measurable evidence, that branch alone is used after normalization.
 */
export function combinePairWeights(
  d0: Float64Array,
  frequencies: Float64Array,
  globalRaw: Float64Array,
  localRaw: Float64Array,
  k: number,
  minOriginalDeltaE: number,
  minClusterFrequency: number,
  globalMix = 0.5,
): CombinedWeightsResult {
  const n = k * k;
  const valid = new Uint8Array(n);
  const maskedGlobal = new Float64Array(n);
  const maskedLocal = new Float64Array(n);

  let eligiblePairCount = 0;
  let globalSum = 0;
  let localSum = 0;

  for (let i = 0; i < k; i++) {
    if (frequencies[i] < minClusterFrequency) continue;
    for (let j = i + 1; j < k; j++) {
      if (frequencies[j] < minClusterFrequency) continue;
      const ij = i * k + j;
      if (d0[ij] < minOriginalDeltaE) continue;
      const ji = j * k + i;
      valid[ij] = 1;
      valid[ji] = 1;
      eligiblePairCount++;

      const gVal = globalRaw[ij];
      maskedGlobal[ij] = gVal;
      maskedGlobal[ji] = gVal;
      globalSum += 2 * gVal;

      const lVal = localRaw[ij];
      maskedLocal[ij] = lVal;
      maskedLocal[ji] = lVal;
      localSum += 2 * lVal;
    }
  }

  const normalizedGlobal = new Float64Array(n);
  const normalizedLocal = new Float64Array(n);
  const combined = new Float64Array(n);

  if (eligiblePairCount === 0) {
    return { valid, eligiblePairCount, normalizedGlobal, normalizedLocal, combined };
  }

  const hasGlobal = globalSum > 1e-12;
  const hasLocal = localSum > 1e-12;
  const gMix = Math.min(1, Math.max(0, globalMix));
  const lMix = 1 - gMix;

  let combinedSum = 0;
  for (let idx = 0; idx < n; idx++) {
    if (!valid[idx]) continue;
    const ng = hasGlobal ? maskedGlobal[idx] / globalSum : 0;
    const nl = hasLocal ? maskedLocal[idx] / localSum : 0;
    normalizedGlobal[idx] = ng;
    normalizedLocal[idx] = nl;

    let w = gMix * ng + lMix * nl;
    // If the requested branch has zero evidence while the other has evidence, fall back gracefully
    if (gMix > 0 && !hasGlobal && hasLocal) w = nl;
    else if (lMix > 0 && !hasLocal && hasGlobal) w = ng;

    combined[idx] = w;
    combinedSum += w;
  }

  if (combinedSum > 0) {
    for (let idx = 0; idx < n; idx++) {
      combined[idx] /= combinedSum;
    }
  }

  return { valid, eligiblePairCount, normalizedGlobal, normalizedLocal, combined };
}
