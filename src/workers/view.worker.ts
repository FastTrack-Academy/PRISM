import { applyCorrections, remeasure, hasNewMajorIssue } from '../lib/engine';
import { simulateRaster } from '../lib/color';
import type { Raster, PageAnalysis, CorrectionProposal, Vision } from '../lib/types';
self.onmessage = (
  event: MessageEvent<{
    raster: Raster;
    analysis: PageAnalysis;
    fixes: CorrectionProposal[];
    mode: Vision;
  }>,
) => {
  const { raster, analysis, fixes, mode } = event.data;
  try {
    const edited = fixes.length ? applyCorrections(raster, analysis, fixes) : raster;
    const result = fixes.length ? remeasure(edited, analysis) : analysis;
    const transformed = simulateRaster(edited, mode);
    self.postMessage({
      raster: transformed,
      score: result.score,
      major: hasNewMajorIssue(result, analysis) ? 1 : 0,
    });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : 'Preview failed.' });
  }
};
