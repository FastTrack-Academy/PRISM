export type RGB = [number, number, number];
export type Vision = 'original' | 'protan' | 'deutan' | 'tritan';
export const VISION_LABELS: Record<Vision, string> = {
  original: 'Original',
  protan: 'Protanopia',
  deutan: 'Deuteranopia',
  tritan: 'Tritanopia',
};
export const CVD_MODES = ['protan', 'deutan', 'tritan'] as const;
export type Box = { x: number; y: number; width: number; height: number };
export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type TextRegion = { box: Box; text: string; confidence: number; large: boolean };
export type AnalysisConfig = {
  version: string;
  maxEdge: number;
  maxPages: number;
  ocr: 'eng';
  selectedPages: number[];
};
export type Region = { id: number; area: number; box: Box; color: RGB; variance: number };
export type PairMetric = {
  mode: Exclude<Vision, 'original'>;
  deltaE: number;
  retention: number;
  risk: number;
};
export type CorrectionKind = 'outline' | 'pattern' | 'contrast' | 'recolor';
export type CorrectionProposal = {
  id: string;
  issueId: string;
  regionId: number;
  kind: CorrectionKind;
  color: RGB;
  label: string;
  description: string;
  gain: number;
  score: number;
  changeCost: number;
};
export type ConfusionIssue = {
  id: string;
  kind: 'color' | 'text';
  regionIds: number[];
  box: Box;
  title: string;
  description: string;
  severity: 'Major' | 'Moderate';
  risk: number;
  normalDeltaE: number;
  metrics: PairMetric[];
  contrast?: number;
  threshold?: number;
  hasCue: boolean;
  suggestions: CorrectionProposal[];
};
export type PageAnalysis = {
  pageNumber: number;
  width: number;
  height: number;
  score: number | null;
  examinedColorPairs?: number;
  separation: number | null;
  contrast: number | null;
  redundancy: number | null;
  confidence: 'Exploratory' | 'Limited';
  issues: ConfusionIssue[];
  warnings: string[];
  regions: Region[];
  labels: Int32Array;
  textRegions: TextRegion[];
  duration: number;
  version: string;
};
export type PageRecord = {
  analysis: PageAnalysis;
  thumbnail: Blob;
  approved: CorrectionProposal[];
};
export type WorkerRequest =
  | {
      type: 'ANALYZE_PAGE';
      id: string;
      pageNumber: number;
      raster: Raster;
      textRegions: TextRegion[];
      warnings: string[];
    }
  | { type: 'CANCEL' };
export type WorkerResponse =
  | { type: 'PAGE_PROGRESS'; id: string; message: string }
  | { type: 'PAGE_RESULT'; id: string; result: PageAnalysis }
  | { type: 'ERROR'; id: string; message: string };
