// Read unnamed patches with the same on-device English model as the web app.
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorker, PSM } from 'tesseract.js';
const [directory, output] = process.argv.slice(2);
const results = {};
const worker = await createWorker('eng', 1, {
  langPath: path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  cacheMethod: 'none',
});
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.png')) continue;
    try {
      const { data } = await worker.recognize(path.join(directory, file), {}, { blocks: true });
      results[file] = (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, confidence: w.confidence }))),
        ),
      );
    } catch {
      results[file] = null;
    }
  }
  await writeFile(output, JSON.stringify(results));
} finally {
  await worker.terminate();
}
