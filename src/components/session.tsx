'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LocalDocument } from '@/lib/document';
import { blobOf, rasterOf } from '@/lib/document';
import {
  DEFAULT_PCCI_CONFIG,
  type PcciAnalysisResult,
  type PcciConfig,
} from '@/lib/pcci';
import type { PcciWorkerResponse } from '@/workers/pcci.worker';

export type PcciPageRecord = {
  pageNumber: number;
  analysis: PcciAnalysisResult;
  labels: Int32Array;
  compWidth: number;
  compHeight: number;
  thumbnail: Blob;
};

type State = {
  document: LocalDocument | null;
  config: PcciConfig;
  records: PcciPageRecord[];
  busy: boolean;
  recalculating: boolean;
  status: string;
  completed: number;
  total: number;
  errors: string[];
  setDocument: (doc: LocalDocument) => Promise<void>;
  analyzePages: (pages: number[], overrideConfig?: PcciConfig) => Promise<void>;
  updateConfig: (nextConfig: PcciConfig) => Promise<void>;
  cancel: () => void;
};

const Context = createContext<State | null>(null);

export const useSession = () => {
  const context = useContext(Context);
  if (!context) throw new Error('Session provider missing');
  return context;
};

function requiresReclustering(a: PcciConfig, b: PcciConfig): boolean {
  return (
    a.k !== b.k ||
    a.maxEdge !== b.maxEdge ||
    a.maxSamples !== b.maxSamples ||
    a.seed !== b.seed ||
    a.nInit !== b.nInit ||
    a.batchSize !== b.batchSize ||
    a.alphaCompositing !== b.alphaCompositing ||
    a.spatialOffsets.length !== b.spatialOffsets.length ||
    a.spatialOffsets.some((v, i) => v !== b.spatialOffsets[i])
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [document, setDoc] = useState<LocalDocument | null>(null);
  const [config, setConfig] = useState<PcciConfig>({ ...DEFAULT_PCCI_CONFIG });
  const [records, setRecords] = useState<PcciPageRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [status, setStatus] = useState('');
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const job = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const rejectWorker = useRef<((e: Error) => void) | null>(null);
  const busyRef = useRef(false);
  const documentRef = useRef<LocalDocument | null>(null);
  const configRef = useRef<PcciConfig>({ ...DEFAULT_PCCI_CONFIG });
  const recordsRef = useRef<PcciPageRecord[]>([]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const ensureWorker = () => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/pcci.worker.ts', import.meta.url));
    }
    return workerRef.current;
  };

  const resetWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const cancel = () => {
    job.current++;
    resetWorker();
    rejectWorker.current?.(new Error('Cancelled'));
    rejectWorker.current = null;
    busyRef.current = false;
    setBusy(false);
    setRecalculating(false);
    setStatus('Analysis cancelled. Completed pages remain available.');
  };

  useEffect(
    () => () => {
      job.current++;
      resetWorker();
      void documentRef.current?.destroy();
    },
    [],
  );

  async function setDocument(doc: LocalDocument) {
    cancel();
    if (documentRef.current !== doc) await documentRef.current?.destroy();
    documentRef.current = doc;
    setDoc(doc);
    setRecords([]);
    setErrors([]);
    setCompleted(0);
    setTotal(0);
    setStatus(
      doc.count === 1 ? 'Ready to analyze image.' : 'Choose up to 10 pages to analyze.',
    );
  }

  function runWorkerPage(
    active: Worker,
    id: string,
    payload: Parameters<Worker['postMessage']>[0],
    transfer: Transferable[],
    onProgress: (message: string) => void,
  ): Promise<{
    result: PcciAnalysisResult;
    labels: Int32Array;
    compWidth: number;
    compHeight: number;
  }> {
    return new Promise((resolve, reject) => {
      rejectWorker.current = reject;
      const timeout = setTimeout(() => {
        active.terminate();
        workerRef.current = null;
        reject(new Error('This page exceeded the two-minute analysis limit.'));
      }, 120000);
      active.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || 'PCCI analysis worker failed.'));
      };
      active.onmessage = (event: MessageEvent<PcciWorkerResponse>) => {
        const message = event.data;
        if (message.id !== id) return;
        if (message.type === 'PROGRESS') {
          onProgress(message.message);
        } else {
          clearTimeout(timeout);
          rejectWorker.current = null;
          if (message.type === 'ERROR') reject(new Error(message.message));
          else
            resolve({
              result: message.result,
              labels: message.labels,
              compWidth: message.compWidth,
              compHeight: message.compHeight,
            });
        }
      };
      active.postMessage(payload, transfer);
    });
  }

  async function analyzePages(pages: number[], overrideConfig?: PcciConfig) {
    const doc = documentRef.current;
    if (!doc || busyRef.current) return;
    const activeConfig = overrideConfig ?? configRef.current;
    if (overrideConfig) {
      configRef.current = activeConfig;
      setConfig(activeConfig);
    }

    const selected = [...new Set(pages)].sort((a, b) => a - b);
    if (
      !selected.length ||
      selected.length > 10 ||
      selected.some((n) => n < 1 || n > doc.count)
    ) {
      setErrors(['Select between 1 and 10 valid pages.']);
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setRecords([]);
    setErrors([]);
    setCompleted(0);
    setTotal(selected.length);
    const token = ++job.current;

    resetWorker();
    const active = ensureWorker();

    try {
      for (const pageNumber of selected) {
        if (job.current !== token) break;
        let canvas: HTMLCanvasElement | null = null;
        try {
          setStatus(`Rendering page ${pageNumber}`);
          // Preserve raw RGBA alpha for images so PCCI handles reference-compatible black compositing
          // and separable Lanczos-3 downsampling at 640px.
          const renderMax = doc.kind === 'image' ? Infinity : 1600;
          canvas = await doc.render(pageNumber, renderMax, {
            preserveAlpha: doc.kind === 'image',
          });
          if (job.current !== token) break;

          const raster = rasterOf(canvas);
          const id = `p-${pageNumber}`;
          const imageName = doc.count > 1 ? `${doc.name} (Page ${pageNumber})` : doc.name;

          const workerOutput = await runWorkerPage(
            ensureWorker(),
            id,
            {
              type: 'ANALYZE',
              id,
              imageName,
              pageNumber,
              width: raster.width,
              height: raster.height,
              data: raster.data,
              config: activeConfig,
            },
            [raster.data.buffer],
            (msg) => {
              if (job.current === token) setStatus(`Page ${pageNumber}: ${msg}`);
            },
          );
          if (job.current !== token) break;

          const thumb = window.document.createElement('canvas');
          thumb.width = 142;
          thumb.height = Math.max(1, Math.round((canvas.height / canvas.width) * 142));
          const tctx = thumb.getContext('2d')!;
          tctx.fillStyle = activeConfig.alphaCompositing === 'white' ? '#ffffff' : '#000000';
          tctx.fillRect(0, 0, thumb.width, thumb.height);
          tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
          const thumbnail = await blobOf(thumb, 'image/jpeg', 0.82);
          thumb.width = thumb.height = 0;

          setRecords((prev) => [
            ...prev,
            {
              pageNumber,
              analysis: workerOutput.result,
              labels: workerOutput.labels,
              compWidth: workerOutput.compWidth,
              compHeight: workerOutput.compHeight,
              thumbnail,
            },
          ]);
        } catch (error) {
          if (job.current !== token) break;
          setErrors((prev) => [
            ...prev,
            `Page ${pageNumber}: ${error instanceof Error ? error.message : 'Unable to analyze this page.'}`,
          ]);
          resetWorker();
        } finally {
          if (canvas) canvas.width = canvas.height = 0;
        }
        if (job.current === token) setCompleted((prev) => prev + 1);
      }
    } finally {
      if (job.current === token) {
        // Keep worker alive with cached features for fast experimental parameter rescoring!
        void active;
        busyRef.current = false;
        setBusy(false);
        setStatus('Analysis completed locally');
      }
    }
  }

  async function updateConfig(nextConfig: PcciConfig) {
    const prevConfig = configRef.current;
    configRef.current = nextConfig;
    setConfig(nextConfig);

    const currentRecords = recordsRef.current;
    const doc = documentRef.current;
    if (!doc || !currentRecords.length) return;

    if (requiresReclustering(prevConfig, nextConfig)) {
      const pageNums = currentRecords.map((r) => r.pageNumber);
      await analyzePages(pageNums, nextConfig);
      return;
    }

    // Fast path: rescore cached features without rerunning MiniBatch K-means!
    if (busyRef.current) return;
    busyRef.current = true;
    setRecalculating(true);
    setStatus('Recalculating PCCI scores with updated parameters…');
    const token = ++job.current;

    try {
      const updated: PcciPageRecord[] = [];
      for (const rec of currentRecords) {
        if (job.current !== token) break;
        const id = `p-${rec.pageNumber}`;
        const imageName =
          doc.count > 1 ? `${doc.name} (Page ${rec.pageNumber})` : doc.name;
        try {
          const out = await runWorkerPage(
            ensureWorker(),
            id,
            {
              type: 'RESCORE',
              id,
              imageName,
              pageNumber: rec.pageNumber,
              config: nextConfig,
            },
            [],
            () => {},
          );
          updated.push({
            ...rec,
            analysis: out.result,
            labels: out.labels,
            compWidth: out.compWidth,
            compHeight: out.compHeight,
          });
        } catch {
          // Fallback to full re-analysis if worker cache was reset
          busyRef.current = false;
          setRecalculating(false);
          await analyzePages(
            currentRecords.map((r) => r.pageNumber),
            nextConfig,
          );
          return;
        }
      }
      if (job.current === token) {
        setRecords(updated);
        setStatus('Recalculation complete');
      }
    } finally {
      if (job.current === token) {
        busyRef.current = false;
        setRecalculating(false);
      }
    }
  }

  return (
    <Context.Provider
      value={{
        document,
        config,
        records,
        busy,
        recalculating,
        status,
        completed,
        total,
        errors,
        setDocument,
        analyzePages,
        updateConfig,
        cancel,
      }}
    >
      {children}
    </Context.Provider>
  );
}
