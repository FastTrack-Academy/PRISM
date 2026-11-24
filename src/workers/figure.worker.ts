import { scoreStage1 } from '../lib/stage1';
import type { Raster } from '../lib/types';

self.onmessage = ({ data }: MessageEvent<{ raster: Raster }>) => {
  try {
    const start = performance.now();
    const result = scoreStage1(data.raster);
    self.postMessage(
      { result, runtimeMs: Math.round(performance.now() - start) },
      { transfer: [result.labels.buffer] },
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Could not analyze the figure.',
    });
  }
};
