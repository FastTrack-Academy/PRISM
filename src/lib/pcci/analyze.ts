import { paletteDistanceMatrix } from './ciede2000';
import { labToSrgb01, rgb01ToHex, rgbBufferToLabBuffer } from './colorspace';
import { simulateRgb01 } from './cvd';
import { fitMiniBatchKMeansLab } from './kmeans';
import { selectOptimalKLab } from './kselect';
import { preprocessRgba } from './preprocess';
import { aggregateWeightedUpperTail, computePairwiseRisk } from './risk';
import {
  combinePairWeights,
  computeGlobalRawWeights,
  computeLocalRawWeights,
} from './spatial';
import {
  CVD_TYPES,
  DEFAULT_PCCI_CONFIG,
  PCCI_ALGORITHM_VERSION,
  RESEARCH_DISCLAIMERS,
  isDefaultPcciConfig,
  type CvdAnalysisResult,
  type CvdType,
  type NormalizedRgb,
  type PcciAnalysisResult,
  type PcciCluster,
  type PcciColorPair,
  type PcciConfig,
  type PcciIntermediateFeatures,
  type SimulatedClusterColor,
} from './types';

export type RgbaInput = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/**
 * Stage 1 (cacheable): Preprocess RGBA -> Lab -> MiniBatch K-means -> palette -> d0 & spatial matrices.
 * Separating feature extraction allows rapid parameter sweeps (tau, minDeltaE, minFreq, globalWeight,
 * tailProportion) without rerunning clustering.
 */
export function extractPcciFeatures(
  input: RgbaInput,
  config: PcciConfig = DEFAULT_PCCI_CONFIG,
): PcciIntermediateFeatures {
  const prep = preprocessRgba(
    input.data,
    input.width,
    input.height,
    config.maxEdge,
    config.alphaCompositing,
  );

  const flatLab = rgbBufferToLabBuffer(prep.rgb);

  let targetK = config.k;
  let kSelection: PcciIntermediateFeatures['kSelection'];
  if (config.kSelectionMode !== 'fixed') {
    kSelection = selectOptimalKLab(flatLab, {
      mode: config.kSelectionMode,
      maxK: config.k,
      maxSamples: config.maxSamples,
      seed: config.seed,
      nInit: config.nInit,
      batchSize: config.batchSize,
    });
    targetK = kSelection.selectedK;
  }

  const km = fitMiniBatchKMeansLab(flatLab, {
    k: targetK,
    maxSamples: config.maxSamples,
    seed: config.seed,
    nInit: config.nInit,
    batchSize: config.batchSize,
  });

  const totalPixels = prep.width * prep.height;
  const frequencies = new Float64Array(km.k);
  const paletteRgb: NormalizedRgb[] = [];
  const clusters: PcciCluster[] = [];

  for (let c = 0; c < km.k; c++) {
    // Match prism_stage1.py: palette = lab2rgb(km.cluster_centers_[None, :, :])[0]
    const rgb = labToSrgb01(km.centroids[c]);
    const freq = totalPixels > 0 ? km.counts[c] / totalPixels : 0;
    frequencies[c] = freq;
    paletteRgb.push(rgb);
    clusters.push({
      id: c,
      lab: km.centroids[c],
      rgb,
      hex: rgb01ToHex(rgb),
      pixelCount: km.counts[c],
      frequency: freq,
      eligible: freq >= config.minClusterFrequency,
    });
  }

  const d0 = paletteDistanceMatrix(paletteRgb);
  const globalRaw = computeGlobalRawWeights(frequencies);
  const { localRaw, validCombos } = computeLocalRawWeights(
    km.labels,
    prep.width,
    prep.height,
    km.k,
    config.spatialOffsets,
  );

  return {
    originalDimensions: { width: input.width, height: input.height },
    computationalDimensions: { width: prep.width, height: prep.height },
    k: km.k,
    kSelection,
    clusters,
    labels: km.labels,
    d0,
    globalRaw,
    localRaw,
    validSpatialCombos: validCombos,
  };
}

/**
 * Build PcciIntermediateFeatures directly from frozen centroids/palette and label image
 * (used for exact-parity unit & regression testing against Python intermediate outputs).
 */
export function featuresFromFrozenPaletteAndLabels(params: {
  originalDimensions: { width: number; height: number };
  computationalDimensions: { width: number; height: number };
  paletteRgb: NormalizedRgb[];
  labels: Int32Array;
  config?: Partial<PcciConfig>;
}): PcciIntermediateFeatures {
  const cfg: PcciConfig = { ...DEFAULT_PCCI_CONFIG, ...params.config };
  const k = params.paletteRgb.length;
  const totalPixels = params.labels.length;
  const counts = new Int32Array(k);
  for (let i = 0; i < totalPixels; i++) {
    const lbl = params.labels[i];
    if (lbl >= 0 && lbl < k) counts[lbl]++;
  }
  const frequencies = new Float64Array(k);
  const clusters: PcciCluster[] = [];
  for (let c = 0; c < k; c++) {
    const freq = totalPixels > 0 ? counts[c] / totalPixels : 0;
    frequencies[c] = freq;
    const rgb = params.paletteRgb[c];
    clusters.push({
      id: c,
      lab: [0, 0, 0],
      rgb,
      hex: rgb01ToHex(rgb),
      pixelCount: counts[c],
      frequency: freq,
      eligible: freq >= cfg.minClusterFrequency,
    });
  }

  const d0 = paletteDistanceMatrix(params.paletteRgb);
  const globalRaw = computeGlobalRawWeights(frequencies);
  const { localRaw, validCombos } = computeLocalRawWeights(
    params.labels,
    params.computationalDimensions.width,
    params.computationalDimensions.height,
    k,
    cfg.spatialOffsets,
  );

  return {
    originalDimensions: params.originalDimensions,
    computationalDimensions: params.computationalDimensions,
    k,
    clusters,
    labels: params.labels,
    d0,
    globalRaw,
    localRaw,
    validSpatialCombos: validCombos,
  };
}

/**
 * Stage 2 (fast, <5ms): Compute all 3 independent CVD PCCI scores & explainable pair evidence
 * from extracted intermediate features and the active configuration.
 */
export function scorePcciFromFeatures(
  features: PcciIntermediateFeatures,
  config: PcciConfig = DEFAULT_PCCI_CONFIG,
  meta: { imageName: string; pageNumber?: number; processingTimeMs?: number } = {
    imageName: 'Untitled image',
  },
): PcciAnalysisResult {
  const k = features.k;
  const frequencies = new Float64Array(k);
  const paletteRgb: NormalizedRgb[] = new Array(k);
  const clusters: PcciCluster[] = features.clusters.map((c, idx) => {
    frequencies[idx] = c.frequency;
    paletteRgb[idx] = c.rgb;
    return { ...c, eligible: c.frequency >= config.minClusterFrequency };
  });

  const weights = combinePairWeights(
    features.d0,
    frequencies,
    features.globalRaw,
    features.localRaw,
    k,
    config.minOriginalDeltaE,
    config.minClusterFrequency,
    config.globalWeight,
  );

  // Enumerate unique unordered eligible pairs (i < j).
  // Note: In the symmetric k x k matrix, each unordered pair {i, j} appears twice with identical
  // risk and half the unique weight, so uniqueWeight = 2 * combined[i*k + j] sums to 1.0 and gives
  // mathematically identical tail_mean, meanRisk, and highRiskWeightShare to the full k x k matrix.
  const pairIndices: Array<[number, number]> = [];
  const uniqueGlobalW: number[] = [];
  const uniqueLocalW: number[] = [];
  const uniqueCombinedW: number[] = [];

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const idx = i * k + j;
      if (!weights.valid[idx]) continue;
      pairIndices.push([i, j]);
      uniqueGlobalW.push(2 * weights.normalizedGlobal[idx]);
      uniqueLocalW.push(2 * weights.normalizedLocal[idx]);
      uniqueCombinedW.push(2 * weights.combined[idx]);
    }
  }

  const cvdResults = {} as Record<CvdType, CvdAnalysisResult>;

  for (const cvdType of CVD_TYPES) {
    const simPaletteRgb = paletteRgb.map((c) => simulateRgb01(c, cvdType));
    const simPaletteHex = simPaletteRgb.map(rgb01ToHex);
    const dc = paletteDistanceMatrix(simPaletteRgb);

    const simulatedPalette: SimulatedClusterColor[] = clusters.map((c, idx) => ({
      clusterId: c.id,
      originalRgb: c.rgb,
      originalHex: c.hex,
      simulatedRgb: simPaletteRgb[idx],
      simulatedHex: simPaletteHex[idx],
      frequency: c.frequency,
    }));

    const m = pairIndices.length;
    const risks = new Float64Array(m);
    const losses = new Float64Array(m);
    const penalties = new Float64Array(m);

    for (let p = 0; p < m; p++) {
      const [i, j] = pairIndices[p];
      const idx = i * k + j;
      const metrics = computePairwiseRisk(
        features.d0[idx],
        dc[idx],
        config.tau,
        config.minOriginalDeltaE,
      );
      risks[p] = metrics.pairwiseRisk;
      losses[p] = metrics.relativeLoss;
      penalties[p] = metrics.remainingDistancePenalty;
    }

    const agg = aggregateWeightedUpperTail(risks, uniqueCombinedW, config.tailProportion);

    const pairs: PcciColorPair[] = new Array(m);
    for (let p = 0; p < m; p++) {
      const [i, j] = pairIndices[p];
      const idx = i * k + j;
      const cw = uniqueCombinedW[p];
      const r = risks[p];
      pairs[p] = {
        clusterA: i,
        clusterB: j,
        originalHexA: clusters[i].hex,
        originalHexB: clusters[j].hex,
        simulatedHexA: simPaletteHex[i],
        simulatedHexB: simPaletteHex[j],
        originalDeltaE: features.d0[idx],
        simulatedDeltaE: dc[idx],
        relativeLoss: losses[p],
        remainingDistancePenalty: penalties[p],
        pairwiseRisk: r,
        globalWeight: uniqueGlobalW[p],
        localWeight: uniqueLocalW[p],
        combinedWeight: cw,
        weightedContribution: r * cw,
        tailIncludedWeight: agg.tailIncludedWeights[p],
      };
    }

    // Sort highest pairwise risk first (deterministic tie-break by combined weight, then cluster IDs)
    pairs.sort(
      (a, b) =>
        b.pairwiseRisk - a.pairwiseRisk ||
        b.combinedWeight - a.combinedWeight ||
        a.clusterA - b.clusterA ||
        a.clusterB - b.clusterB,
    );

    cvdResults[cvdType] = {
      cvdType,
      pcciScore: 100 * agg.tailMean,
      meanRisk: 100 * agg.meanRisk,
      highRiskPairWeightShare: 100 * agg.highRiskWeightShare,
      eligiblePairCount: m,
      pairs,
      simulatedPalette,
    };
  }

  const hasPairs = weights.eligiblePairCount > 0;
  const status = hasPairs ? 'ok' : 'no-eligible-pairs';
  const statusMessage = hasPairs
    ? `Analyzed ${k} representative CIELAB clusters and ${weights.eligiblePairCount} eligible colour pairs.`
    : 'No eligible colour pairs met the minimum perceptual distance and area frequency thresholds. A score of 0.0 here indicates no eligible pairs were detected—not proof of accessibility.';

  return {
    imageName: meta.imageName,
    pageNumber: meta.pageNumber,
    originalDimensions: features.originalDimensions,
    computationalDimensions: features.computationalDimensions,
    algorithmVersion: PCCI_ALGORITHM_VERSION,
    config: { ...config, spatialOffsets: [...config.spatialOffsets] },
    isDefaultConfig: isDefaultPcciConfig(config),
    processingTimeMs: meta.processingTimeMs ?? 0,
    status,
    statusMessage,
    clusterCount: k,
    kSelection: features.kSelection,
    eligiblePairCount: weights.eligiblePairCount,
    clusters,
    cvd: cvdResults,
    disclaimers: RESEARCH_DISCLAIMERS,
  };
}

/**
 * Full end-to-end PCCI analysis returning both the serializable result and cacheable features.
 */
export function analyzeImagePcci(
  input: RgbaInput,
  partialConfig: Partial<PcciConfig> = {},
  meta: { imageName?: string; pageNumber?: number } = {},
): { result: PcciAnalysisResult; features: PcciIntermediateFeatures } {
  const started = performance.now();
  const config: PcciConfig = { ...DEFAULT_PCCI_CONFIG, ...partialConfig };
  const features = extractPcciFeatures(input, config);
  const elapsed = performance.now() - started;
  const result = scorePcciFromFeatures(features, config, {
    imageName: meta.imageName ?? 'Untitled image',
    pageNumber: meta.pageNumber,
    processingTimeMs: elapsed,
  });
  return { result, features };
}
