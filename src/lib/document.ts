import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Raster, TextRegion } from './types';
import { sampleSVG } from './sample';

export type LocalDocument = {
  name: string;
  count: number;
  kind: 'pdf' | 'image' | 'sample';
  bytes: Uint8Array | null;
  render: (page: number, maxEdge: number) => Promise<HTMLCanvasElement>;
  nativeText: (page: number, width: number, height: number) => Promise<TextRegion[]>;
  destroy: () => Promise<void>;
};
export const rasterOf = (c: HTMLCanvasElement): Raster => ({
  width: c.width,
  height: c.height,
  data: c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
    .data,
});
export function canvasOf(r: Raster) {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  c.getContext('2d')!.putImageData(
    new ImageData(new Uint8ClampedArray(r.data), r.width, r.height),
    0,
    0,
  );
  return c;
}
export const blobOf = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.9) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Unable to create image.'))),
      type,
      quality,
    ),
  );
async function renderImage(blob: Blob, maxEdge: number) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * scale));
  c.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}
export async function openLocalFile(file: File): Promise<LocalDocument> {
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose a file smaller than 100 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPDF = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
  const isPNG = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const isJPEG = bytes[0] === 255 && bytes[1] === 216;
  if (!isPDF && !isPNG && !isJPEG) throw new Error('This file is not a valid PDF, JPG, or PNG.');
  if (!isPDF) {
    // Decode before accepting, so corrupted images fail at upload rather than analysis.
    const preview = await renderImage(file, 100);
    preview.width = preview.height = 0;
    return {
      name: file.name,
      count: 1,
      kind: 'image',
      bytes,
      render: (_, max) => renderImage(file, max),
      nativeText: async () => [],
      destroy: async () => {},
    };
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: '/vendor/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/standard_fonts/',
    wasmUrl: '/vendor/wasm/',
  });
  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (e) {
    await task.destroy();
    throw new Error(
      e instanceof Error && e.name === 'PasswordException'
        ? 'Password-protected PDFs are not supported. Choose an unlocked copy.'
        : 'This PDF could not be opened. Try exporting it as a new PDF.',
    );
  }
  return {
    name: file.name,
    count: pdf.numPages,
    kind: 'pdf',
    bytes,
    async render(n, max) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: max / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({
        canvas,
        canvasContext: canvas.getContext('2d')!,
        viewport,
        background: 'rgb(255,255,255)',
      }).promise;
      return canvas;
    },
    async nativeText(n, width, height) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const sx = width / viewport.width,
        sy = height / viewport.height;
      const content = await page.getTextContent();
      const boxes: TextRegion[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const h = Math.hypot(transform[2], transform[3]);
        boxes.push({
          text: item.str,
          confidence: 100,
          large: h >= 18,
          box: {
            x: transform[4] * sx,
            y: (transform[5] - h) * sy,
            width: Math.max(1, item.width * sx),
            height: Math.max(1, h * sy),
          },
        });
      }
      return boxes;
    },
    destroy: async () => {
      await pdf.destroy();
    },
  };
}
export function sampleDocument(): LocalDocument {
  return {
    name: 'Biology · sample textbook',
    count: 3,
    kind: 'sample',
    bytes: null,
    async render(n, max) {
      const svg = sampleSVG(n),
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        const scale = max / 940;
        c.width = Math.round(740 * scale);
        c.height = Math.round(940 * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        return c;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    nativeText: async () => [],
    destroy: async () => {},
  };
}
