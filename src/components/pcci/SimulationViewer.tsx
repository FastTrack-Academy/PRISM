'use client';
import { useEffect, useRef, useState } from 'react';
import { Columns2, Eye, Grid2x2, Layers, LoaderCircle, Minus, Plus, Sparkles } from 'lucide-react';
import {
  CVD_TYPES,
  getProvisionalRiskBand,
  type CvdType,
  type PcciAnalysisResult,
  type PcciColorPair,
} from '@/lib/pcci';
import type { LocalDocument } from '@/lib/document';
import { rasterOf } from '@/lib/document';
import type { SimWorkerResponse } from '@/workers/sim.worker';
import styles from './dashboard.module.css';

export type SimulationCache = {
  pageNumber: number;
  width: number;
  height: number;
  originalCanvas: HTMLCanvasElement;
  simulations: Record<CvdType, Uint8ClampedArray>;
};

type ViewMode = 'side-by-side' | 'four-up';

type OverlayStats = {
  pctA: number;
  pctB: number;
  pctProx: number;
};

/**
 * Draw a high-visibility, CVD-accessible cluster & proximity localization overlay:
 * - Spotlight shadow dims unselected background pixels so risk zones pop immediately.
 * - Thick double-halo contours (white outer halo + bold core stroke) stay crisp on dark & light images.
 * - Cluster A: solid cobalt-cyan contour + -45° stripes + "A" badge
 * - Cluster B: dashed vivid magenta contour + +45° stripes + "B" badge
 * - Spatial proximity (A near B across PCCI offsets 2, 8, 16, 32 px): gold-yellow + 1px dark rim
 */
function drawLocalizationOverlay(
  canvas: HTMLCanvasElement,
  labels: Int32Array,
  compW: number,
  compH: number,
  clusterA: number,
  clusterB: number | null,
  opacity: number,
  dimBackground: boolean,
  spatialRadius = 16,
): OverlayStats {
  canvas.width = compW;
  canvas.height = compH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, compW, compH);

  const total = compW * compH;
  if (total === 0) return { pctA: 0, pctB: 0, pctProx: 0 };

  const mask = new Uint8Array(total);
  const proxOffsets = [2, 8, 16, Math.min(32, spatialRadius * 2)];
  const dirs: Array<[number, number]> = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];

  const isProximate = (x: number, y: number, target: number): boolean => {
    for (const s of proxOffsets) {
      for (const [dy, dx] of dirs) {
        const nx = x + dx * s;
        const ny = y + dy * s;
        if (nx >= 0 && nx < compW && ny >= 0 && ny < compH) {
          if (labels[ny * compW + nx] === target) return true;
        }
      }
    }
    return false;
  };

  let countA = 0;
  let countB = 0;
  let countProx = 0;

  const bins = 16;
  const binA = new Int32Array(bins * bins);
  const binB = new Int32Array(bins * bins);

  for (let y = 0; y < compH; y++) {
    const by = Math.min(bins - 1, Math.floor((y * bins) / compH));
    for (let x = 0; x < compW; x++) {
      const idx = y * compW + x;
      const lbl = labels[idx];
      if (lbl === clusterA) {
        countA++;
        const bx = Math.min(bins - 1, Math.floor((x * bins) / compW));
        binA[by * bins + bx]++;
        if (clusterB !== null && isProximate(x, y, clusterB)) {
          mask[idx] = 3;
          countProx++;
        } else {
          mask[idx] = 1;
        }
      } else if (clusterB !== null && lbl === clusterB) {
        countB++;
        const bx = Math.min(bins - 1, Math.floor((x * bins) / compW));
        binB[by * bins + bx]++;
        if (isProximate(x, y, clusterA)) {
          mask[idx] = 3;
          countProx++;
        } else {
          mask[idx] = 2;
        }
      }
    }
  }

  const hasDiffWithin = (x: number, y: number, cls: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= compH) return true;
      const row = ny * compW;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= compW) return true;
        if (mask[row + nx] !== cls) return true;
      }
    }
    return false;
  };

  const hasTargetWithin = (x: number, y: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= compH) continue;
      const row = ny * compW;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= compW) continue;
        if (mask[row + nx] !== 0) return true;
      }
    }
    return false;
  };

  const img = ctx.createImageData(compW, compH);
  const out = img.data;

  const dimAlpha = dimBackground ? Math.round(Math.min(185, 95 + opacity * 75)) : 0;
  const fillAlpha = Math.round(Math.min(230, opacity * 195));
  const proxFillAlpha = Math.round(Math.min(245, 70 + opacity * 170));
  const strokeAlpha = Math.min(255, Math.round(130 + opacity * 125));

  for (let y = 0; y < compH; y++) {
    const row = y * compW;
    for (let x = 0; x < compW; x++) {
      const idx = row + x;
      const cls = mask[idx];
      const o = idx * 4;

      if (cls === 0) {
        if (hasTargetWithin(x, y, 2)) {
          out[o] = 255;
          out[o + 1] = 255;
          out[o + 2] = 255;
          out[o + 3] = Math.min(245, Math.round(opacity * 245));
        } else if (dimAlpha > 0) {
          out[o] = 10;
          out[o + 1] = 18;
          out[o + 2] = 36;
          out[o + 3] = dimAlpha;
        }
        continue;
      }

      if (cls === 3) {
        const isThinEdge = hasDiffWithin(x, y, cls, 1);
        if (isThinEdge) {
          out[o] = 11;
          out[o + 1] = 22;
          out[o + 2] = 51;
          out[o + 3] = 255;
        } else {
          out[o] = 255;
          out[o + 1] = 212;
          out[o + 2] = 0;
          out[o + 3] = proxFillAlpha;
        }
      } else if (cls === 1) {
        const isThickEdge = hasDiffWithin(x, y, cls, 2);
        if (isThickEdge) {
          out[o] = 0;
          out[o + 1] = 98;
          out[o + 2] = 245;
          out[o + 3] = strokeAlpha;
        } else {
          const stripe = (x + y) % 8 < 3;
          out[o] = stripe ? 0 : 120;
          out[o + 1] = stripe ? 140 : 205;
          out[o + 2] = 255;
          out[o + 3] = stripe ? fillAlpha : Math.round(fillAlpha * 0.42);
        }
      } else {
        const isThickEdge = hasDiffWithin(x, y, cls, 2);
        const dash = (x + y) % 14 < 9;
        if (isThickEdge && dash) {
          out[o] = 216;
          out[o + 1] = 14;
          out[o + 2] = 118;
          out[o + 3] = strokeAlpha;
        } else {
          const stripe = (x - y + 8000) % 8 < 3;
          out[o] = 240;
          out[o + 1] = stripe ? 28 : 135;
          out[o + 2] = stripe ? 140 : 196;
          out[o + 3] = stripe ? fillAlpha : Math.round(fillAlpha * 0.42);
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  const drawBadge = (binCounts: Int32Array, text: string, bg: string) => {
    let bestBin = -1;
    let bestVal = 0;
    for (let i = 0; i < binCounts.length; i++) {
      if (binCounts[i] > bestVal) {
        bestVal = binCounts[i];
        bestBin = i;
      }
    }
    if (bestBin < 0 || bestVal < 4) return;
    const bx = bestBin % bins;
    const by = Math.floor(bestBin / bins);
    const cx = Math.min(compW - 18, Math.max(18, Math.round(((bx + 0.5) * compW) / bins)));
    const cy = Math.min(compH - 18, Math.max(18, Math.round(((by + 0.5) * compH) / bins)));
    const r = Math.max(11, Math.min(16, Math.round(Math.min(compW, compH) * 0.032)));

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 1.15)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  };

  drawBadge(binA, 'A', '#005de8');
  if (clusterB !== null) {
    drawBadge(binB, 'B', '#c20c6a');
  }

  return {
    pctA: (countA / total) * 100,
    pctB: (countB / total) * 100,
    pctProx: (countProx / total) * 100,
  };
}

export function SimulationViewer({
  doc,
  result,
  labels,
  compWidth,
  compHeight,
  selectedCvd,
  onSelectCvd,
  selectedPair,
  selectedClusterId,
  showOverlay,
  onShowOverlayChange,
  onSimCacheReady,
}: {
  doc: LocalDocument;
  result: PcciAnalysisResult;
  labels: Int32Array;
  compWidth: number;
  compHeight: number;
  selectedCvd: CvdType;
  onSelectCvd: (cvd: CvdType) => void;
  selectedPair: PcciColorPair | null;
  selectedClusterId: number | null;
  showOverlay: boolean;
  onShowOverlayChange: (show: boolean) => void;
  onSimCacheReady: (cache: SimulationCache | null) => void;
}) {
  // Default to Side-by-Side (Original + Active CVD) so user sees localized overlay & simulation in one glance
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [zoom, setZoom] = useState(100);
  const [overlayOpacity, setOverlayOpacity] = useState(0.85);
  const [dimBackground, setDimBackground] = useState(true);
  const [overlayStats, setOverlayStats] = useState<OverlayStats | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [cache, setCache] = useState<SimulationCache | null>(null);

  const fourOrigRef = useRef<HTMLCanvasElement>(null);
  const fourDeutRef = useRef<HTMLCanvasElement>(null);
  const fourProtRef = useRef<HTMLCanvasElement>(null);
  const fourTritRef = useRef<HTMLCanvasElement>(null);
  const fourOverlayRef = useRef<HTMLCanvasElement>(null);

  const sideOrigRef = useRef<HTMLCanvasElement>(null);
  const sideSimRef = useRef<HTMLCanvasElement>(null);
  const sideOverlayRef = useRef<HTMLCanvasElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const pageNumber = result.pageNumber ?? 1;
  const bgMode = result.config.alphaCompositing;

  useEffect(() => {
    let live = true;
    const worker = new Worker(new URL('../../workers/sim.worker.ts', import.meta.url));
    setBusy(true);
    setError('');
    setCache(null);
    onSimCacheReady(null);

    (async () => {
      try {
        const displayMax = doc.kind === 'image' ? 1600 : 1400;
        const origCanvas = await doc.render(pageNumber, displayMax, {
          preserveAlpha: false,
          background: bgMode,
        });
        if (!live) {
          origCanvas.width = origCanvas.height = 0;
          return;
        }
        const raster = rasterOf(origCanvas);
        const copyBuf = new Uint8ClampedArray(raster.data);

        worker.onmessage = (e: MessageEvent<SimWorkerResponse>) => {
          if (!live) return;
          if ('error' in e.data) {
            setError(e.data.error);
            setBusy(false);
            return;
          }
          const nextCache: SimulationCache = {
            pageNumber,
            width: e.data.width,
            height: e.data.height,
            originalCanvas: origCanvas,
            simulations: e.data.simulations,
          };
          setCache(nextCache);
          onSimCacheReady(nextCache);
          setBusy(false);
        };
        worker.onerror = () => {
          if (live) {
            setError('Unable to generate full-resolution CVD simulations.');
            setBusy(false);
          }
        };
        worker.postMessage(
          {
            id: `sim-${pageNumber}`,
            width: raster.width,
            height: raster.height,
            data: copyBuf,
          },
          [copyBuf.buffer],
        );
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : 'Unable to render page.');
          setBusy(false);
        }
      }
    })();

    return () => {
      live = false;
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, bgMode]);

  useEffect(() => {
    if (!cache) return;
    const paintRgb = (target: HTMLCanvasElement | null, buf: Uint8ClampedArray) => {
      if (!target) return;
      target.width = cache.width;
      target.height = cache.height;
      target
        .getContext('2d')!
        .putImageData(new ImageData(new Uint8ClampedArray(buf), cache.width, cache.height), 0, 0);
    };
    const paintOrig = (target: HTMLCanvasElement | null) => {
      if (!target) return;
      target.width = cache.width;
      target.height = cache.height;
      target.getContext('2d')!.drawImage(cache.originalCanvas, 0, 0);
    };

    if (viewMode === 'four-up') {
      paintOrig(fourOrigRef.current);
      paintRgb(fourDeutRef.current, cache.simulations.Deuteranopia);
      paintRgb(fourProtRef.current, cache.simulations.Protanopia);
      paintRgb(fourTritRef.current, cache.simulations.Tritanopia);
    } else {
      paintOrig(sideOrigRef.current);
      paintRgb(sideSimRef.current, cache.simulations[selectedCvd]);
    }
  }, [cache, viewMode, selectedCvd]);

  const activeClusterA =
    selectedClusterId !== null
      ? selectedClusterId
      : selectedPair
        ? selectedPair.clusterA
        : null;
  const activeClusterB =
    selectedClusterId !== null ? null : selectedPair ? selectedPair.clusterB : null;

  useEffect(() => {
    const target = viewMode === 'four-up' ? fourOverlayRef.current : sideOverlayRef.current;
    if (!target) return;
    if (!showOverlay || activeClusterA === null || !labels.length) {
      target.width = 1;
      target.height = 1;
      setOverlayStats(null);
      return;
    }
    const stats = drawLocalizationOverlay(
      target,
      labels,
      compWidth,
      compHeight,
      activeClusterA,
      activeClusterB,
      overlayOpacity,
      dimBackground,
    );
    setOverlayStats(stats);
  }, [
    showOverlay,
    activeClusterA,
    activeClusterB,
    labels,
    compWidth,
    compHeight,
    overlayOpacity,
    dimBackground,
    viewMode,
    cache,
  ]);

  const syncScroll = (source: 'left' | 'right') => {
    if (syncingRef.current) return;
    const from = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const to = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (!from || !to) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    to.scrollTop = from.scrollTop;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const cvdRefs: Record<CvdType, React.RefObject<HTMLCanvasElement | null>> = {
    Deuteranopia: fourDeutRef,
    Protanopia: fourProtRef,
    Tritanopia: fourTritRef,
  };

  return (
    <section className={styles.viewerPanel} aria-labelledby="sim-viewer-heading">
      <div className={styles.panelToolbar}>
        <h2 id="sim-viewer-heading">
          <Eye size={16} aria-hidden="true" />
          CVD Simulation Viewer
        </h2>

        <div className={styles.viewerToolbarRight}>
          <div className={styles.segmented} role="group" aria-label="Simulation layout">
            <button
              type="button"
              aria-pressed={viewMode === 'side-by-side'}
              onClick={() => setViewMode('side-by-side')}
            >
              <Columns2 size={13} aria-hidden="true" />
              Original vs {selectedCvd}
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'four-up'}
              onClick={() => setViewMode('four-up')}
            >
              <Grid2x2 size={13} aria-hidden="true" />
              4-image comparison
            </button>
          </div>

          {viewMode === 'side-by-side' && (
            <div className={styles.zoomGroup} role="group" aria-label="Zoom controls">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 50}
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
              >
                <Minus size={13} />
              </button>
              <span>{zoom}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 250}
                onClick={() => setZoom((z) => Math.min(250, z + 25))}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.viewerStageArea}>
        {busy && (
          <div className={styles.statusNotice} role="status" style={{ margin: 'auto' }}>
            <LoaderCircle size={16} className={styles.spin} />
            <span>Rendering full-resolution Machado (2009) &amp; Brettel (1997) simulations…</span>
          </div>
        )}
        {error && (
          <p className="errorMessage" role="alert">
            {error}
          </p>
        )}

        {!busy && !error && viewMode === 'side-by-side' && (
          <div className={styles.sideBySideGrid}>
            <div className={styles.sidePane}>
              <div className={styles.simCardHead}>
                <span>Original</span>
                <span className="note">
                  {showOverlay ? 'Localized overlay active' : `${result.originalDimensions.width} × ${result.originalDimensions.height} px`}
                </span>
              </div>
              <div
                ref={leftScrollRef}
                className={styles.sideScroll}
                onScroll={() => syncScroll('left')}
                tabIndex={0}
                role="region"
                aria-label="Original image viewport"
              >
                <div className={styles.sideStage} style={{ width: `${zoom}%` }}>
                  <canvas
                    ref={sideOrigRef}
                    role="img"
                    aria-label={`Original ${result.imageName}`}
                  />
                  {showOverlay && (
                    <canvas
                      ref={sideOverlayRef}
                      className={styles.overlayCanvas}
                      aria-label="Risk localization mask overlay"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className={styles.sidePane}>
              <div className={styles.simCardHead}>
                <span>{selectedCvd} simulation</span>
                <strong>PCCI {result.cvd[selectedCvd].pcciScore.toFixed(1)} / 100</strong>
              </div>
              <div
                ref={rightScrollRef}
                className={styles.sideScroll}
                onScroll={() => syncScroll('right')}
                tabIndex={0}
                role="region"
                aria-label={`${selectedCvd} simulation viewport`}
              >
                <div className={styles.sideStage} style={{ width: `${zoom}%` }}>
                  <canvas
                    ref={sideSimRef}
                    role="img"
                    aria-label={`${selectedCvd} simulation of ${result.imageName}`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {!busy && !error && viewMode === 'four-up' && (
          <div className={styles.fourUpGrid}>
            <div className={styles.simCard}>
              <div className={styles.simCardHead}>
                <span>Original</span>
                <span className="note">{showOverlay ? 'Localized' : 'Reference'}</span>
              </div>
              <div className={styles.simCanvasWrap}>
                <canvas
                  ref={fourOrigRef}
                  role="img"
                  aria-label={`Original ${result.imageName}`}
                />
                {showOverlay && (
                  <canvas
                    ref={fourOverlayRef}
                    className={styles.overlayCanvas}
                    aria-label="Cluster localization overlay"
                  />
                )}
              </div>
              <div className={styles.simCardFoot}>
                <span className={styles.simScoreValue}>Reference</span>
                <span className={styles.simScoreSub}>
                  {result.originalDimensions.width} × {result.originalDimensions.height} px
                </span>
              </div>
            </div>

            {CVD_TYPES.map((cvd) => {
              const score = result.cvd[cvd].pcciScore;
              const band = getProvisionalRiskBand(score, result.status);
              const active = selectedCvd === cvd;
              return (
                <div
                  key={cvd}
                  className={`${styles.simCard} ${active ? styles.simCardActive : ''}`}
                >
                  <div className={styles.simCardHead}>
                    <span>{cvd}</span>
                    <button
                      type="button"
                      className="textLink"
                      style={{ minHeight: 20, padding: 0, fontSize: 11 }}
                      onClick={() => onSelectCvd(cvd)}
                    >
                      {active ? 'Selected' : 'Inspect'}
                    </button>
                  </div>
                  <div className={styles.simCanvasWrap}>
                    <canvas
                      ref={cvdRefs[cvd]}
                      role="img"
                      aria-label={`${cvd} full dichromacy simulation of ${result.imageName}`}
                    />
                  </div>
                  <div className={styles.simCardFoot}>
                    <span className={styles.simScoreValue}>{score.toFixed(1)} / 100</span>
                    <span className={styles.simScoreSub}>{band.shortLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Risk localization controls pinned cleanly beneath the viewer */}
      <div className={styles.localizationBar}>
        <div className={styles.localizationTop}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showOverlay}
              disabled={activeClusterA === null}
              onChange={(e) => onShowOverlayChange(e.target.checked)}
            />
            <Layers size={14} aria-hidden="true" />
            Show risk localization overlay
          </label>

          {showOverlay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label className={styles.checkboxLabel} style={{ fontSize: 11.5, fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={dimBackground}
                  onChange={(e) => setDimBackground(e.target.checked)}
                />
                <Sparkles size={13} aria-hidden="true" />
                Dim background
              </label>
              <label className={styles.opacityControl}>
                Intensity ({Math.round(overlayOpacity * 100)}%)
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                />
              </label>
            </div>
          )}
        </div>

        {showOverlay && activeClusterA !== null ? (
          <div className={styles.legendRow}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendChip} ${styles.legendA}`} />
              <strong>A</strong> ({result.clusters[activeClusterA]?.hex}
              {overlayStats ? `, ${overlayStats.pctA.toFixed(1)}%` : ''})
            </span>
            {activeClusterB !== null && (
              <>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendChip} ${styles.legendB}`} />
                  <strong>B</strong> ({result.clusters[activeClusterB]?.hex}
                  {overlayStats ? `, ${overlayStats.pctB.toFixed(1)}%` : ''})
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendChip} ${styles.legendProx}`} />
                  <strong>Proximate</strong>
                  {overlayStats ? ` (${overlayStats.pctProx.toFixed(1)}%)` : ''}
                </span>
              </>
            )}
            <span className="note" style={{ fontSize: 10.5 }}>
              · Colour cluster mask only (not semantic inaccessibility)
            </span>
          </div>
        ) : (
          <p className="note" style={{ margin: 0, fontSize: 11 }}>
            Click any confusing colour pair on the right to spotlight where it appears on the image.
          </p>
        )}
      </div>
    </section>
  );
}
