import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
const destination = path.resolve('public/vendor');
await mkdir(destination, { recursive: true });
await cp(
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  path.join(destination, 'pdf.worker.min.mjs'),
);
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${folder}`, path.join(destination, folder), {
    recursive: true,
  });
}
await cp(
  'node_modules/tesseract.js/dist/worker.min.js',
  path.join(destination, 'ocr-worker.min.js'),
);
await mkdir(path.join(destination, 'ocr-core'), { recursive: true });
for (const filename of await readdir('node_modules/tesseract.js-core')) {
  if (filename.endsWith('.wasm') || filename.endsWith('.wasm.js')) {
    await cp(
      `node_modules/tesseract.js-core/${filename}`,
      path.join(destination, 'ocr-core', filename),
    );
  }
}
await cp(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  path.join(destination, 'eng.traineddata.gz'),
);
console.log('PDF and English OCR assets prepared for same-origin, private processing.');
