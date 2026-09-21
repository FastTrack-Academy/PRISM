import type { TextRegion } from './types';
import type { Worker } from 'tesseract.js';
let workerPromise: Promise<Worker> | null = null;
export async function recognizeText(
  canvas: HTMLCanvasElement,
  onProgress: (text: string) => void,
): Promise<TextRegion[]> {
  if (!workerPromise) {
    onProgress('Loading English text recognition');
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        workerPath: '/vendor/ocr-worker.min.js',
        corePath: '/vendor/ocr-core',
        langPath: '/vendor',
        cacheMethod: 'none',
        workerBlobURL: false,
      }),
    );
  }
  try {
    const worker = await workerPromise;
    onProgress('Reading English text');
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const result: TextRegion[] = [];
    for (const block of data.blocks || [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines)
          for (const word of line.words) {
            // Ignore diagram marks hallucinated as isolated punctuation or one-letter words.
            if (!/[a-zA-Z]{2}/.test(word.text) || word.confidence < 75) continue;
            result.push({
              text: word.text,
              confidence: word.confidence,
              large: false,
              box: {
                x: word.bbox.x0,
                y: word.bbox.y0,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0,
              },
            });
          }
    return result;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}
export async function terminateOCR() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending)
    try {
      await (await pending).terminate();
    } catch {
      /* Already terminated or failed to load. */
    }
}
