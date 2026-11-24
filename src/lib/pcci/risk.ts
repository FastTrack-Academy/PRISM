export type PairwiseRiskMetrics = {
  relativeLoss: number;
  remainingDistancePenalty: number;
  pairwiseRisk: number;
};

/**
 * Multiplicative pairwise PCCI risk for a single pair (matching prism_stage1.py):
 *   L = clamp(1 - D_cvd / max(D_original, 1e-9), 0, 1)
 *   A = exp(-(D_cvd / tau)^2)
 *   r = L * A   (when D_original >= minOriginalDeltaE; otherwise 0)
 */
export function computePairwiseRisk(
  dOriginal: number,
  dCvd: number,
  tau = 12,
  minOriginalDeltaE = 10,
): PairwiseRiskMetrics {
  if (dOriginal < minOriginalDeltaE) {
    return { relativeLoss: 0, remainingDistancePenalty: 0, pairwiseRisk: 0 };
  }
  const rawLoss = 1 - dCvd / Math.max(dOriginal, 1e-9);
  const relativeLoss = rawLoss < 0 ? 0 : rawLoss > 1 ? 1 : rawLoss;
  const scaled = dCvd / tau;
  const remainingDistancePenalty = Math.exp(-(scaled * scaled));
  const pairwiseRisk = relativeLoss * remainingDistancePenalty;
  return { relativeLoss, remainingDistancePenalty, pairwiseRisk };
}

export type TailAggregationResult = {
  /** Weighted upper-tail mean in [0, 1] (multiply by 100 for PCCI score). */
  tailMean: number;
  /** Weighted mean risk across all eligible pairs in [0, 1] (multiply by 100 for %). */
  meanRisk: number;
  /** Share of total eligible pair weight with risk >= 0.5 in [0, 1] (multiply by 100 for %). */
  highRiskWeightShare: number;
  /** Per-input-index weight included in the top-q tail (sums to q when totalWeight > 0). */
  tailIncludedWeights: Float64Array;
};

/**
 * Weighted upper-tail aggregation matching prism_stage1.py `tail_mean(r, w, q=0.10)`.
 *
 * The threshold `q` refers strictly to cumulative normalized pair weight, NOT pair count.
 * When a pair straddles the `q` boundary, only the exact fractional weight needed to reach
 * `q` is included.
 */
export function aggregateWeightedUpperTail(
  risks: ArrayLike<number>,
  weights: ArrayLike<number>,
  q = 0.1,
): TailAggregationResult {
  const n = risks.length;
  const tailIncludedWeights = new Float64Array(n);

  let weightSum = 0;
  for (let i = 0; i < n; i++) {
    if (weights[i] > 0) weightSum += weights[i];
  }
  if (n === 0 || weightSum <= 0 || q <= 0) {
    return { tailMean: 0, meanRisk: 0, highRiskWeightShare: 0, tailIncludedWeights };
  }

  const clampedQ = q > 1 ? 1 : q;

  // Sort indices descending by risk (deterministic tie-break by original index)
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => risks[b] - risks[a] || a - b,
  );

  let cumWeight = 0;
  let tailNumerator = 0;
  let meanRisk = 0;
  let highRiskWeightShare = 0;

  for (let idx = 0; idx < n; idx++) {
    const i = order[idx];
    const wNorm = weights[i] > 0 ? weights[i] / weightSum : 0;
    if (wNorm <= 0) continue;

    const r = risks[i];
    meanRisk += r * wNorm;
    if (r >= 0.5) highRiskWeightShare += wNorm;

    const remaining = clampedQ - cumWeight;
    if (remaining > 0) {
      const take = wNorm < remaining ? wNorm : remaining;
      tailIncludedWeights[i] = take;
      tailNumerator += r * take;
    }
    cumWeight += wNorm;
  }

  return {
    tailMean: tailNumerator / clampedQ,
    meanRisk,
    highRiskWeightShare,
    tailIncludedWeights,
  };
}
