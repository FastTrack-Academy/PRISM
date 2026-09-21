import type { LocalDocument } from './document';
import { blobOf, canvasOf, rasterOf } from './document';
import { applyCorrections, band } from './engine';
import { simulateRaster } from './color';
import type { PageRecord, Vision } from './types';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const safe = (s: string) =>
  s
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\n]/g, '');
export async function exportReport(doc: LocalDocument, records: PageRecord[]) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const record of records) {
    const a = record.analysis;
    let page = pdf.addPage([595, 842]),
      y = 790;
    const line = (text: string, strong = false, size = 11) => {
      if (y < 58) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(safe(text), {
        x: 45,
        y,
        size,
        font: strong ? bold : font,
        color: rgb(0.08, 0.13, 0.22),
      });
      y -= size + 9;
    };
    const paragraph = (text: string) => {
      const words = safe(text).split(/\s+/);
      let row = '';
      for (const word of words) {
        if (font.widthOfTextAtSize(row + ' ' + word, 10) > 500) {
          line(row, false, 10);
          row = word;
        } else row += (row ? ' ' : '') + word;
      }
      if (row) line(row, false, 10);
    };
    line('PRISM | Color accessibility report', true, 20);
    paragraph(doc.name);
    line(
      `Page ${a.pageNumber} of ${doc.count} | Original: ${a.score ?? 'N/A'} / 100 | ${band(a.score)}`,
      true,
      15,
    );
    line(`Model: ${a.version} | ${a.confidence} | ${records.length} selected pages`);
    line(
      `Separation: ${a.separation?.toFixed(0) ?? 'N/A'} | Contrast: ${a.contrast?.toFixed(0) ?? 'N/A'} | Redundancy: ${a.redundancy?.toFixed(0) ?? 'N/A'}`,
    );
    paragraph(
      'Score = 60% separation + 25% contrast + 15% redundancy. Available weights are normalized when a measurement is absent. This experimental score is not an accessibility certification. Simulations approximate color vision differences.',
    );
    for (const warning of a.warnings) paragraph(warning);
    line(`${a.issues.length} issues found`, true, 14);
    for (const issue of a.issues) {
      line(`${issue.severity}: ${issue.title}`, true, 10);
      paragraph(issue.description);
      paragraph(
        `Location in ${a.width} x ${a.height} analysis pixels: x=${issue.box.x}, y=${issue.box.y}, width=${issue.box.width}, height=${issue.box.height}.`,
      );
      for (const m of issue.metrics)
        paragraph(
          `${m.mode}: Delta E ${m.deltaE.toFixed(2)}, retention ${(m.retention * 100).toFixed(1)}%.`,
        );
      paragraph(
        issue.suggestions.length
          ? issue.suggestions
              .map((s) => `${s.label} (individually tested +${s.gain} points)`)
              .join('; ')
          : 'Manual review: add explicit labels or adjust the original source artwork.',
      );
    }
    line('Approved changes', true, 14);
    for (const fix of record.approved) paragraph(fix.label + ' - ' + fix.description);
    if (!record.approved.length) paragraph('No changes approved.');
  }
  download(
    new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }),
    'PRISM-analysis-report.pdf',
  );
}
export async function exportDocument(
  doc: LocalDocument,
  records: PageRecord[],
  mode: Vision,
  onProgress: (message: string) => void,
) {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const original = doc.kind === 'pdf' && doc.bytes ? await PDFDocument.load(doc.bytes) : null;
  for (let n = 1; n <= doc.count; n++) {
    onProgress(`Exporting page ${n} of ${doc.count}`);
    const record = records.find((r) => r.analysis.pageNumber === n);
    const changed = record && (mode !== 'original' || record.approved.length > 0);
    if (original && !changed) {
      const [copied] = await pdf.copyPages(original, [n - 1]);
      pdf.addPage(copied);
      continue;
    }
    const canvas = await doc.render(n, 2200);
    let raster = rasterOf(canvas);
    if (record && mode === 'original')
      raster = applyCorrections(raster, record.analysis, record.approved);
    if (record && mode !== 'original') raster = simulateRaster(raster, mode);
    const rendered = canvasOf(raster);
    const image = await pdf.embedPng(await (await blobOf(rendered)).arrayBuffer());
    let size: [number, number] = [canvas.width * 0.32, canvas.height * 0.32];
    if (original) {
      const p = original.getPage(n - 1);
      const box = p.getCropBox();
      const rotation = ((p.getRotation().angle % 360) + 360) % 360;
      size =
        rotation === 90 || rotation === 270 ? [box.height, box.width] : [box.width, box.height];
    }
    const p = pdf.addPage(size);
    p.setRotation(degrees(0));
    p.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
    canvas.width = canvas.height = rendered.width = rendered.height = 0;
  }
  download(
    new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }),
    `PRISM-${mode === 'original' ? 'corrected' : mode}-textbook.pdf`,
  );
}
