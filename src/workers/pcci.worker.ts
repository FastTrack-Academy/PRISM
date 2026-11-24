import {
  extractPcciFeatures,
  scorePcciFromFeatures,
  type PcciAnalysisResult,
  type PcciConfig,
  type PcciIntermediateFeatures,
} from '../lib/pcci';

export type PcciWorkerRequest =
  | {
      type: 'ANALYZE';
      id: string;
      imageName: string;
      pageNumber: number;
      width: number;
      height: number;
      data: Uint8ClampedArray;
      config: PcciConfig;
    }
  | {
      type: 'RESCORE';
      id: string;
      imageName: string;
      pageNumber: number;
      config: PcciConfig;
    }
  | { type: 'CLEAR_CACHE' }
  | { type: 'CANCEL' };

export type PcciWorkerResponse =
  | { type: 'PROGRESS'; id: string; message: string }
  | {
      type: 'RESULT';
      id: string;
      result: PcciAnalysisResult;
      labels: Int32Array;
      compWidth: number;
      compHeight: number;
    }
  | { type: 'ERROR'; id: string; message: string };

const featureCache = new Map<string, PcciIntermediateFeatures>();

const send = (msg: PcciWorkerResponse, transfer?: Transferable[]) => {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, { transfer });
  } else {
    self.postMessage(msg);
  }
};

self.onmessage = (event: MessageEvent<PcciWorkerRequest>) => {
  const req = event.data;

  if (req.type === 'CANCEL') {
    featureCache.clear();
    self.close();
    return;
  }

  if (req.type === 'CLEAR_CACHE') {
    featureCache.clear();
    return;
  }

  try {
    if (req.type === 'ANALYZE') {
      const started = performance.now();
      send({ type: 'PROGRESS', id: req.id, message: 'Preprocessing & extracting CIELAB clusters' });
      const features = extractPcciFeatures(
        { width: req.width, height: req.height, data: req.data },
        req.config,
      );
      featureCache.set(req.id, features);

      send({
        type: 'PROGRESS',
        id: req.id,
        message: 'Computing CIEDE2000 distances & PCCI risk scores',
      });
      const elapsed = performance.now() - started;
      const result = scorePcciFromFeatures(features, req.config, {
        imageName: req.imageName,
        pageNumber: req.pageNumber,
        processingTimeMs: elapsed,
      });

      // Send a copy of labels so the worker keeps its cached features intact for fast rescoring
      const labelsCopy = new Int32Array(features.labels);
      send(
        {
          type: 'RESULT',
          id: req.id,
          result,
          labels: labelsCopy,
          compWidth: features.computationalDimensions.width,
          compHeight: features.computationalDimensions.height,
        },
        [labelsCopy.buffer],
      );
      return;
    }

    if (req.type === 'RESCORE') {
      const features = featureCache.get(req.id);
      if (!features) {
        send({ type: 'ERROR', id: req.id, message: 'Cached features unavailable; re-run analysis.' });
        return;
      }
      const started = performance.now();
      const result = scorePcciFromFeatures(features, req.config, {
        imageName: req.imageName,
        pageNumber: req.pageNumber,
        processingTimeMs: 0,
      });
      result.processingTimeMs = performance.now() - started;
      const labelsCopy = new Int32Array(features.labels);
      send(
        {
          type: 'RESULT',
          id: req.id,
          result,
          labels: labelsCopy,
          compWidth: features.computationalDimensions.width,
          compHeight: features.computationalDimensions.height,
        },
        [labelsCopy.buffer],
      );
    }
  } catch (error) {
    send({
      type: 'ERROR',
      id: req.id,
      message: error instanceof Error ? error.message : 'PCCI analysis worker failed.',
    });
  }
};
