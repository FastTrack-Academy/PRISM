export type CvdType = 'Deuteranopia' | 'Protanopia' | 'Tritanopia';

export const CVD_TYPES: readonly CvdType[] = [
  'Deuteranopia',
  'Protanopia',
  'Tritanopia',
] as const;

export type VisionView = 'Original' | CvdType;

export const PCCI_ALGORITHM_VERSION = 'PCCI-1.0.0-stage1';

export type AlphaCompositingMode = 'black' | 'white';

export type PcciConfig = {
  /** Maximum edge length for computational downsampling (default 640). */
  maxEdge: number;
  /** Maximum number of representative Lab colour clusters K (default 24). */
  k: number;
  /** Maximum sampled pixels for MiniBatch K-means fitting (default 50000). */
  maxSamples: number;
  /** Deterministic PRNG seed (default 42). */
  seed: number;
  /** Number of k-means++ initializations (default 3). */
  nInit: number;
  /** Mini-batch size (default 4096). */
  batchSize: number;
  /** Remaining-distance penalty scale tau in CIEDE2000 units (default 12). */
  tau: number;
  /** Minimum original CIEDE2000 distance for an eligible pair (default 10). */
  minOriginalDeltaE: number;
  /** Minimum pixel frequency per cluster for eligibility (default 0.005). */
  minClusterFrequency: number;
  /** Spatial co-occurrence pixel offsets (default [2, 8, 16, 32]). */
  spatialOffsets: readonly number[];
  /** Mixing weight for global frequency branch (default 0.5; local gets 1 - globalWeight). */
  globalWeight: number;
  /** Upper-tail cumulative weight proportion q (default 0.10). */
  tailProportion: number;
  /** Alpha compositing background ('black' matches prism_stage1.py reference). */
  alphaCompositing: AlphaCompositingMode;
};

export const DEFAULT_PCCI_CONFIG: PcciConfig = {
  maxEdge: 640,
  k: 24,
  maxSamples: 50000,
  seed: 42,
  nInit: 3,
  batchSize: 4096,
  tau: 12,
  minOriginalDeltaE: 10,
  minClusterFrequency: 0.005,
  spatialOffsets: [2, 8, 16, 32],
  globalWeight: 0.5,
  tailProportion: 0.1,
  alphaCompositing: 'black',
};

export type NormalizedRgb = [number, number, number];
export type LabColor = [number, number, number];

export type PcciCluster = {
  id: number;
  /** CIELAB centroid [L*, a*, b*] from MiniBatch K-means. */
  lab: LabColor;
  /** Representative sRGB in [0, 1] obtained by converting centroid Lab -> sRGB. */
  rgb: NormalizedRgb;
  /** Uppercase #RRGGBB HEX string. */
  hex: string;
  /** Number of computational pixels assigned to this cluster. */
  pixelCount: number;
  /** Relative pixel frequency in [0, 1]. */
  frequency: number;
  /** Whether frequency >= minClusterFrequency. */
  eligible: boolean;
};

export type SimulatedClusterColor = {
  clusterId: number;
  originalRgb: NormalizedRgb;
  originalHex: string;
  simulatedRgb: NormalizedRgb;
  simulatedHex: string;
  frequency: number;
};

export type PcciColorPair = {
  clusterA: number;
  clusterB: number;
  originalHexA: string;
  originalHexB: string;
  simulatedHexA: string;
  simulatedHexB: string;
  originalDeltaE: number;
  simulatedDeltaE: number;
  /** Relative distinguishability loss L in [0, 1]. */
  relativeLoss: number;
  /** Remaining-distance penalty A = exp(-(D_cvd / tau)^2) in (0, 1]. */
  remainingDistancePenalty: number;
  /** Combined multiplicative pairwise risk r = L * A in [0, 1]. */
  pairwiseRisk: number;
  /** Normalized global pair weight (unique unordered pair, sums to 1 across eligible pairs when >0). */
  globalWeight: number;
  /** Normalized local spatial pair weight (unique unordered pair, sums to 1 across eligible pairs when >0). */
  localWeight: number;
  /** Final combined normalized pair weight (unique unordered pair, sums to 1 across eligible pairs). */
  combinedWeight: number;
  /** Weighted contribution to mean risk: pairwiseRisk * combinedWeight. */
  weightedContribution: number;
  /** Fraction of this pair's combined weight included inside the top-q upper tail. */
  tailIncludedWeight: number;
};

export type CvdAnalysisResult = {
  cvdType: CvdType;
  /** PCCI risk score in [0, 100]. Higher = greater estimated colour-confusion risk. */
  pcciScore: number;
  /** Weighted mean risk across all eligible pairs in [0, 100]. */
  meanRisk: number;
  /** Share (%) of eligible pair weight with pairwiseRisk >= 0.5 (not percentage of image pixels). */
  highRiskPairWeightShare: number;
  /** Number of unique eligible cluster pairs (i < j). */
  eligiblePairCount: number;
  /** All eligible unique pairs sorted by pairwiseRisk descending. */
  pairs: PcciColorPair[];
  /** Simulated palette for all extracted clusters under this CVD type. */
  simulatedPalette: SimulatedClusterColor[];
  /** Optional identifier or object URL for a rendered simulation preview. */
  simulationImageRef?: string;
};

export type AnalysisStatus = 'ok' | 'no-eligible-pairs' | 'error';

export type PcciAnalysisResult = {
  imageName: string;
  pageNumber?: number;
  originalDimensions: { width: number; height: number };
  computationalDimensions: { width: number; height: number };
  algorithmVersion: string;
  config: PcciConfig;
  isDefaultConfig: boolean;
  processingTimeMs: number;
  status: AnalysisStatus;
  statusMessage: string;
  clusterCount: number;
  eligiblePairCount: number;
  clusters: PcciCluster[];
  cvd: Record<CvdType, CvdAnalysisResult>;
  /** Serializable disclaimers embedded in exports. */
  disclaimers: readonly string[];
};

export type PcciIntermediateFeatures = {
  originalDimensions: { width: number; height: number };
  computationalDimensions: { width: number; height: number };
  k: number;
  clusters: PcciCluster[];
  /** Per-pixel cluster ID of length compWidth * compHeight. */
  labels: Int32Array;
  /** k x k symmetric original CIEDE2000 distance matrix (row-major Float64Array). */
  d0: Float64Array;
  /** k x k symmetric global outer-product frequency matrix (raw, unmasked). */
  globalRaw: Float64Array;
  /** k x k symmetric local multi-scale co-occurrence matrix (raw, unmasked). */
  localRaw: Float64Array;
  /** Number of valid (offset, direction) combinations included in localRaw. */
  validSpatialCombos: number;
};

export type RiskBand = {
  label: string;
  shortLabel: string;
  level: 'low' | 'moderate' | 'elevated' | 'high';
  range: string;
  description: string;
};

export function getProvisionalRiskBand(score: number, status: AnalysisStatus = 'ok'): RiskBand {
  if (status === 'no-eligible-pairs') {
    return {
      label: 'No eligible colour pairs',
      shortLabel: 'No eligible pairs',
      level: 'low',
      range: '0.0',
      description:
        'No colour pairs met the minimum perceptual distance and area thresholds. This does not prove accessibility.',
    };
  }
  if (score < 20) {
    return {
      label: 'Low detected risk',
      shortLabel: 'Low',
      level: 'low',
      range: '0 – <20',
      description: 'Experimental default band: lower estimated colour-confusion risk.',
    };
  }
  if (score < 40) {
    return {
      label: 'Moderate risk',
      shortLabel: 'Moderate',
      level: 'moderate',
      range: '20 – <40',
      description: 'Experimental default band: moderate estimated colour-confusion risk.',
    };
  }
  if (score < 60) {
    return {
      label: 'Elevated risk',
      shortLabel: 'Elevated',
      level: 'elevated',
      range: '40 – <60',
      description: 'Experimental default band: elevated estimated colour-confusion risk.',
    };
  }
  return {
    label: 'High risk',
    shortLabel: 'High',
    level: 'high',
    range: '60 – 100',
    description: 'Experimental default band: high estimated colour-confusion risk.',
  };
}

export const RESEARCH_DISCLAIMERS: readonly string[] = [
  'PRISM provides experimental estimates of potential colour confusion, not clinical diagnoses or accessibility certifications.',
  'A computational CVD simulation cannot exactly reproduce every individual’s visual experience.',
  'A high PCCI score does not necessarily establish educational inaccessibility.',
  'A low PCCI score does not guarantee educational accessibility.',
  'Current scoring parameters and risk bands are experimental research defaults and have not been clinically calibrated.',
  'Contextual comprehension and compensatory visual cues (text labels, symbols, shapes, patterns, legends) require separate assessment.',
] as const;

export function isDefaultPcciConfig(config: PcciConfig): boolean {
  return (
    config.maxEdge === DEFAULT_PCCI_CONFIG.maxEdge &&
    config.k === DEFAULT_PCCI_CONFIG.k &&
    config.maxSamples === DEFAULT_PCCI_CONFIG.maxSamples &&
    config.seed === DEFAULT_PCCI_CONFIG.seed &&
    config.nInit === DEFAULT_PCCI_CONFIG.nInit &&
    config.batchSize === DEFAULT_PCCI_CONFIG.batchSize &&
    Math.abs(config.tau - DEFAULT_PCCI_CONFIG.tau) < 1e-9 &&
    Math.abs(config.minOriginalDeltaE - DEFAULT_PCCI_CONFIG.minOriginalDeltaE) < 1e-9 &&
    Math.abs(config.minClusterFrequency - DEFAULT_PCCI_CONFIG.minClusterFrequency) < 1e-9 &&
    Math.abs(config.globalWeight - DEFAULT_PCCI_CONFIG.globalWeight) < 1e-9 &&
    Math.abs(config.tailProportion - DEFAULT_PCCI_CONFIG.tailProportion) < 1e-9 &&
    config.alphaCompositing === DEFAULT_PCCI_CONFIG.alphaCompositing &&
    config.spatialOffsets.length === DEFAULT_PCCI_CONFIG.spatialOffsets.length &&
    config.spatialOffsets.every((v, i) => v === DEFAULT_PCCI_CONFIG.spatialOffsets[i])
  );
}
