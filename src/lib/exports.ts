import type { LocalDocument } from './document';
import { blobOf, canvasOf, rasterOf } from './document';
import {
  CVD_TYPES,
  getProvisionalRiskBand,
  RESEARCH_DISCLAIMERS,
  serializePairEvidenceCsv,
  serializeResultsJson,
  serializeScoresCsv,
  simulateRgbaBuffer,
  type CvdType,
  type PcciAnalysisResult,
} from './pcci';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const safePdfText = (s: string) =>
  s
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u0394/g, 'Delta ')
    .replace(/\u03c4/g, 'tau')
    .replace(/\u00d7/g, 'x')
    .replace(/\u2265/g, '>=')
    .replace(/[^\x20-\x7e\n]/g, '');

const slug = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'prism';

export function exportScoresCsv(results: PcciAnalysisResult[], docName: string) {
  const csv = serializeScoresCsv(results);
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug(docName)}-pcci-scores.csv`);
}

export function exportPairEvidenceCsv(
  results: PcciAnalysisResult[],
  docName: string,
  filterCvd?: CvdType,
) {
  const csv = serializePairEvidenceCsv(results, filterCvd);
  const suffix = filterCvd ? `-${filterCvd.toLowerCase()}` : '';
  download(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${slug(docName)}-pcci-pairs${suffix}.csv`,
  );
}

export function exportResultsJson(results: PcciAnalysisResult[], docName: string) {
  const json = serializeResultsJson(results);
  download(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    `${slug(docName)}-pcci-results.json`,
  );
}

/**
 * Render a publication-ready four-image simulation comparison PNG (Original | Deuteranopia | Protanopia | Tritanopia)
 * with numerical PCCI scores, proportional risk bars, version tag, and research disclaimer.
 */
export async function exportFourUpComparisonPng(
  originalCanvas: HTMLCanvasElement,
  simulations: Record<CvdType, Uint8ClampedArray>,
  simWidth: number,
  simHeight: number,
  result: PcciAnalysisResult,
  docName: string,
) {
  const pad = 28;
  const gap = 20;
  const headerH = 82;
  const labelH = 32;
  const scoreH = 66;
  const footerH = 44;

  const maxPanelW = 420;
  const panelW = Math.min(maxPanelW, Math.max(240, simWidth));
  const panelH = Math.max(120, Math.round((simHeight / simWidth) * panelW));

  const totalW = pad * 2 + panelW * 4 + gap * 3;
  const totalH = pad + headerH + labelH + panelH + scoreH + footerH + pad;

  const out = document.createElement('canvas');
  out.width = totalW;
  out.height = totalH;
  const ctx = out.getContext('2d')!;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // Title header
  ctx.fillStyle = '#0b1633';
  ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
  ctx.fillText('PRISM | PCCI — CVD Simulation and Risk Scores', pad, pad + 26);

  ctx.fillStyle = '#4b5c77';
  ctx.font = '14px Arial, Helvetica, sans-serif';
  ctx.fillText(
    `${result.imageName}  ·  ${result.algorithmVersion}${result.isDefaultConfig ? '' : ' (Custom experimental config)'}  ·  PCCI (0–100): higher scores indicate greater estimated colour confusion`,
    pad,
    pad + 54,
  );

  const panels: Array<{
    title: string;
    canvas: HTMLCanvasElement;
    score: number | null;
    bandLabel: string;
  }> = [
    { title: 'Original', canvas: originalCanvas, score: null, bandLabel: 'Reference image' },
    ...CVD_TYPES.map((cvdType) => {
      const c = canvasOf({ width: simWidth, height: simHeight, data: simulations[cvdType] });
      const score = result.cvd[cvdType].pcciScore;
      const band = getProvisionalRiskBand(score, result.status);
      return {
        title: cvdType,
        canvas: c,
        score,
        bandLabel: `${band.shortLabel} · Mean ${result.cvd[cvdType].meanRisk.toFixed(1)}`,
      };
    }),
  ];

  const imgTop = pad + headerH + labelH;

  panels.forEach((panel, idx) => {
    const x = pad + idx * (panelW + gap);

    // Column heading
    ctx.fillStyle = '#0b1633';
    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillText(panel.title, x, pad + headerH + 18);

    // Image frame
    ctx.strokeStyle = '#d6dce6';
    ctx.lineWidth = 1;
    ctx.drawImage(panel.canvas, x, imgTop, panelW, panelH);
    ctx.strokeRect(x + 0.5, imgTop + 0.5, panelW - 1, panelH - 1);

    // Score & proportional bar beneath image
    const scoreY = imgTop + panelH + 26;
    if (panel.score === null) {
      ctx.fillStyle = '#4b5c77';
      ctx.font = '14px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Reference image', x + panelW / 2, scoreY);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#0b1633';
      ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${panel.score.toFixed(1)} / 100`, x + panelW / 2, scoreY);

      // Proportional risk bar
      const barW = Math.round(panelW * 0.72);
      const barH = 8;
      const barX = x + Math.round((panelW - barW) / 2);
      const barY = scoreY + 10;
      ctx.fillStyle = '#e5e9f0';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#005de8';
      ctx.fillRect(barX, barY, Math.round(barW * Math.min(1, Math.max(0, panel.score / 100))), barH);

      ctx.fillStyle = '#4b5c77';
      ctx.font = '12px Arial, Helvetica, sans-serif';
      ctx.fillText(panel.bandLabel, x + panelW / 2, barY + 24);
      ctx.textAlign = 'left';
    }

    if (idx > 0) {
      panel.canvas.width = panel.canvas.height = 0;
    }
  });

  // Footer disclaimer
  ctx.fillStyle = '#4b5c77';
  ctx.font = '12px Arial, Helvetica, sans-serif';
  ctx.fillText(
    'Experimental PCCI scores; not clinical probabilities or accessibility certifications. Full dichromacy simulations (Machado 2009; Brettel 1997). Contextual cues require separate assessment.',
    pad,
    totalH - pad,
  );

  const blob = await blobOf(out, 'image/png', 1);
  out.width = out.height = 0;
  download(blob, `${slug(docName)}-pcci-comparison.png`);
}

/**
 * Export a multi-page PDF scientific report summarizing all analyzed pages,
 * the three independent PCCI risk scores, top colour-pair evidence, parameters, and disclaimers.
 */
export async function exportPcciReportPdf(
  doc: LocalDocument,
  results: PcciAnalysisResult[],
) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const addPageWithHelpers = () => {
    let page = pdf.addPage([595, 842]);
    let y = 796;
    const ensure = (needed = 24) => {
      if (y < needed + 42) {
        page = pdf.addPage([595, 842]);
        y = 796;
      }
    };
    const line = (text: string, strong = false, size = 10.5) => {
      ensure(size + 8);
      page.drawText(safePdfText(text), {
        x: 45,
        y,
        size,
        font: strong ? bold : font,
        color: rgb(0.05, 0.09, 0.2),
      });
      y -= size + 7;
    };
    const paragraph = (text: string, size = 9.5) => {
      const words = safePdfText(text).split(/\s+/);
      let row = '';
      for (const word of words) {
        if (font.widthOfTextAtSize((row ? row + ' ' : '') + word, size) > 505) {
          line(row, false, size);
          row = word;
        } else {
          row += (row ? ' ' : '') + word;
        }
      }
      if (row) line(row, false, size);
    };
    return { line, paragraph, gap: (px = 8) => (y -= px) };
  };

  for (const res of results) {
    const { line, paragraph, gap } = addPageWithHelpers();
    line('PRISM | Perceptual Color Confusion Index (PCCI) Report', true, 18);
    paragraph(
      `Document: ${doc.name} | Analyzed ${results.length} of ${doc.count} total page${doc.count === 1 ? '' : 's'}`,
      10,
    );
    line(
      `Page ${res.pageNumber ?? 1} of ${doc.count} | Status: ${res.status} | Version: ${res.algorithmVersion}${res.isDefaultConfig ? '' : ' (Custom parameters)'}`,
      true,
      11,
    );
    paragraph(
      `Original dimensions: ${res.originalDimensions.width} x ${res.originalDimensions.height} px | Computational: ${res.computationalDimensions.width} x ${res.computationalDimensions.height} px | Clusters: ${res.clusterCount} | Eligible pairs: ${res.eligiblePairCount} | Processing: ${res.processingTimeMs.toFixed(0)} ms`,
    );
    gap(6);

    line('Independent CVD Risk Scores (0-100; higher = greater estimated confusion risk)', true, 12);
    for (const cvd of CVD_TYPES) {
      const c = res.cvd[cvd];
      const band = getProvisionalRiskBand(c.pcciScore, res.status);
      line(
        `${cvd}: ${c.pcciScore.toFixed(1)} / 100 (${band.label}) | Weighted mean: ${c.meanRisk.toFixed(1)} | High-risk pair-weight share: ${c.highRiskPairWeightShare.toFixed(1)}%`,
        false,
        10,
      );
    }
    gap(6);

    line('Algorithm Parameters', true, 11);
    const cfg = res.config;
    paragraph(
      `K=${cfg.k}, maxEdge=${cfg.maxEdge}, tau=${cfg.tau}, minOriginalDeltaE=${cfg.minOriginalDeltaE}, minClusterFrequency=${cfg.minClusterFrequency}, globalWeight=${cfg.globalWeight}, localWeight=${(1 - cfg.globalWeight).toFixed(2)}, tailProportion=${cfg.tailProportion}, offsets=[${cfg.spatialOffsets.join(',')}], alphaCompositing=${cfg.alphaCompositing}, seed=${cfg.seed}.`,
    );
    gap(6);

    for (const cvd of CVD_TYPES) {
      const c = res.cvd[cvd];
      line(`Top Eligible Colour Pairs — ${cvd} (showing up to 5 of ${c.eligiblePairCount})`, true, 11);
      if (c.pairs.length === 0) {
        paragraph('No eligible colour pairs met the perceptual distance and area thresholds.');
      } else {
        for (const p of c.pairs.slice(0, 5)) {
          paragraph(
            `${p.originalHexA} vs ${p.originalHexB} (sim: ${p.simulatedHexA} vs ${p.simulatedHexB}) | Delta E: ${p.originalDeltaE.toFixed(2)} -> ${p.simulatedDeltaE.toFixed(2)} | Loss: ${(p.relativeLoss * 100).toFixed(1)}% | Pair risk: ${(p.pairwiseRisk * 100).toFixed(1)} | Weight: ${(p.combinedWeight * 100).toFixed(2)}%`,
          );
        }
      }
      gap(4);
    }

    line('Research Disclaimers', true, 11);
    for (const d of RESEARCH_DISCLAIMERS) {
      paragraph(`- ${d}`, 9);
    }
  }

  download(
    new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }),
    `${slug(doc.name)}-pcci-report.pdf`,
  );
}

/**
 * Export a simulated visual review PDF using the authoritative Machado + Brettel simulations.
 */
export async function exportSimulatedPdf(
  doc: LocalDocument,
  analyzedPageNumbers: number[],
  cvdType: CvdType,
  onProgress: (message: string) => void,
) {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const original = doc.kind === 'pdf' && doc.bytes ? await PDFDocument.load(doc.bytes) : null;
  const analyzedSet = new Set(analyzedPageNumbers);

  for (let n = 1; n <= doc.count; n++) {
    onProgress(`Exporting simulated page ${n} of ${doc.count}`);
    if (original && !analyzedSet.has(n)) {
      const [copied] = await pdf.copyPages(original, [n - 1]);
      pdf.addPage(copied);
      continue;
    }
    const canvas = await doc.render(n, 2000);
    const raster = rasterOf(canvas);
    const simulated = {
      width: raster.width,
      height: raster.height,
      data: simulateRgbaBuffer(raster.data, cvdType),
    };
    const rendered = canvasOf(simulated);
    const image = await pdf.embedPng(await (await blobOf(rendered)).arrayBuffer());
    let size: [number, number] = [canvas.width * 0.36, canvas.height * 0.36];
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
    `${slug(doc.name)}-${cvdType.toLowerCase()}-simulated.pdf`,
  );
}
