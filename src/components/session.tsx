'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LocalDocument } from '@/lib/document';
import { blobOf, rasterOf } from '@/lib/document';
import type {
  PageAnalysis,
  PageRecord,
  CorrectionProposal,
  WorkerResponse,
  TextRegion,
} from '@/lib/types';
import { SCORING } from '@/lib/engine';

type State = {
  document: LocalDocument | null;
  records: PageRecord[];
  busy: boolean;
  status: string;
  completed: number;
  total: number;
  errors: string[];
  setDocument: (doc: LocalDocument) => Promise<void>;
  analyzePages: (pages: number[]) => Promise<void>;
  cancel: () => void;
  approve: (page: number, fix: CorrectionProposal) => void;
  revert: (page: number, id?: string) => void;
};
const Context = createContext<State | null>(null);
export const useSession = () => {
  const context = useContext(Context);
  if (!context) throw new Error('Session provider missing');
  return context;
};
export function SessionProvider({ children }: { children: ReactNode }) {
  const [document, setDoc] = useState<LocalDocument | null>(null),
    [records, setRecords] = useState<PageRecord[]>([]);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [completed, setCompleted] = useState(0),
    [total, setTotal] = useState(0),
    [errors, setErrors] = useState<string[]>([]);
  const job = useRef(0),
    worker = useRef<Worker | null>(null),
    rejectWorker = useRef<((e: Error) => void) | null>(null),
    busyRef = useRef(false),
    documentRef = useRef<LocalDocument | null>(null);
  const cancel = () => {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    rejectWorker.current?.(new Error('Cancelled'));
    rejectWorker.current = null;
    void import('@/lib/ocr').then((m) => m.terminateOCR());
    busyRef.current = false;
    setBusy(false);
    setStatus('Analysis cancelled. Completed pages are available.');
  };
  useEffect(
    () => () => {
      job.current++;
      worker.current?.terminate();
      void documentRef.current?.destroy();
      void import('@/lib/ocr').then((m) => m.terminateOCR());
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
    setStatus('Choose up to 10 pages to analyze.');
  }
  async function analyzePages(pages: number[]) {
    if (!document || busyRef.current) return;
    const selected = [...new Set(pages)].sort((a, b) => a - b);
    if (
      !selected.length ||
      selected.length > 10 ||
      selected.some((n) => n < 1 || n > document.count)
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
    worker.current = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url));
    try {
      for (const number of selected) {
        if (job.current !== token) break;
        let canvas: HTMLCanvasElement | null = null;
        try {
          setStatus(`Rendering page ${number}`);
          canvas = await document.render(number, SCORING.maxEdge);
          if (job.current !== token) break;
          let textRegions: TextRegion[] = [],
            warnings: string[] = [];
          try {
            textRegions = await document.nativeText(number, canvas.width, canvas.height);
            if (!textRegions.length) {
              const { recognizeText } = await import('@/lib/ocr');
              textRegions = await recognizeText(canvas, (message) => {
                if (job.current === token) setStatus(`Page ${number}: ${message}`);
              });
            }
          } catch {
            warnings = [
              'English text recognition was unavailable. Visual-region analysis continued.',
            ];
          }
          if (job.current !== token) break;
          const raster = rasterOf(canvas);
          const analysis = await new Promise<PageAnalysis>((resolve, reject) => {
            rejectWorker.current = reject;
            const active = worker.current!;
            const timeout = setTimeout(() => {
              active.terminate();
              reject(
                new Error('This page exceeded the two-minute analysis limit. Try a simpler page.'),
              );
            }, 120000);
            active.onerror = (event) => {
              clearTimeout(timeout);
              reject(new Error(event.message || 'Analysis worker failed.'));
            };
            active.onmessage = (event: MessageEvent<WorkerResponse>) => {
              const message = event.data;
              if (message.id !== String(number)) return;
              if (message.type === 'PAGE_PROGRESS') setStatus(`Page ${number}: ${message.message}`);
              else {
                clearTimeout(timeout);
                rejectWorker.current = null;
                if (message.type === 'ERROR') reject(new Error(message.message));
                else resolve(message.result);
              }
            };
            active.postMessage(
              {
                type: 'ANALYZE_PAGE',
                id: String(number),
                pageNumber: number,
                raster,
                textRegions,
                warnings,
              },
              [raster.data.buffer],
            );
          });
          if (job.current !== token) break;
          const thumb = window.document.createElement('canvas');
          thumb.width = 142;
          thumb.height = Math.round((canvas.height / canvas.width) * 142);
          thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
          const thumbnail = await blobOf(thumb, 'image/jpeg', 0.8);
          thumb.width = thumb.height = 0;
          setRecords((prev) => [...prev, { analysis, thumbnail, approved: [] }]);
        } catch (error) {
          if (job.current !== token) break;
          setErrors((prev) => [
            ...prev,
            `Page ${number}: ${error instanceof Error ? error.message : 'Unable to analyze this page.'}`,
          ]);
          worker.current?.terminate();
          worker.current = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url));
        } finally {
          if (canvas) canvas.width = canvas.height = 0;
        }
        if (job.current === token) setCompleted((prev) => prev + 1);
      }
    } finally {
      if (job.current === token) {
        worker.current?.terminate();
        worker.current = null;
        busyRef.current = false;
        setBusy(false);
        setStatus('Analysis completed locally');
        void import('@/lib/ocr').then((m) => m.terminateOCR());
      }
    }
  }
  function approve(page: number, fix: CorrectionProposal) {
    setRecords((prev) =>
      prev.map((r) =>
        r.analysis.pageNumber !== page
          ? r
          : { ...r, approved: [...r.approved.filter((f) => f.regionId !== fix.regionId), fix] },
      ),
    );
  }
  function revert(page: number, id?: string) {
    setRecords((prev) =>
      prev.map((r) =>
        r.analysis.pageNumber !== page
          ? r
          : { ...r, approved: id ? r.approved.filter((f) => f.id !== id) : [] },
      ),
    );
  }
  return (
    <Context.Provider
      value={{
        document,
        records,
        busy,
        status,
        completed,
        total,
        errors,
        setDocument,
        analyzePages,
        cancel,
        approve,
        revert,
      }}
    >
      {children}
    </Context.Provider>
  );
}
