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

type ViewMode = 'four-up' | 'side-by-side';

type OverlayStats = {
  pctA: number;
  pctB: number;
  pctProx: number;
};

/**
 * Draw a high-visibility, CVD-accessible cluster & proximity localization overlay:
 * - Optional spotlight shadow dims unselected background pixels so risk zones pop immediately.
 * - Multi-pixel thick double-halo contours (white outer halo + bold core stroke) stay crisp
 *   on both dark and light backgrounds and at any zoom scale.
 * - Vivid non-red/green-only encoding:
 *     Cluster A: Cobalt-cyan solid contour + -45° stripes
 *     Cluster B: Vivid magenta dashed contour + +45° stripes
 *     Spatial proximity (A near B): High-luminance gold-yellow fill + bold black/white double ring
 * - High-contrast pill badges ("A", "B") anchored on the largest visual concentration of each cluster.
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

  // Classify every pixel: 0 = background, 1 = A, 2 = B, 3 = spatially proximate (A near B or B near A)
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

  // Track coarse grid density (16x16 bins) to anchor A and B callout badges onto real regions
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

  // Build thickened border + outer halo detection using 2-pixel neighborhood
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
        // Crisp white outer halo immediately around any highlighted region for contrast on dark backgrounds
        if (hasTargetWithin(x, y, 2)) {
          out[o] = 255;
          out[o + 1] = 255;
          out[o + 2] = 255;
          out[o + 3] = Math.min(245, Math.round(opacity * 245));
        } else if (dimAlpha > 0) {
          // Spotlight shadow over non-selected areas
          out[o] = 10;
          out[o + 1] = 18;
          out[o + 2] = 36;
          out[o + 3] = dimAlpha;
        }
        continue;
      }

      const isThickEdge = hasDiffWithin(x, y, cls, 2);

      if (cls === 3) {
        // Spatially proximate zone: bright gold-yellow (#FFD400) with crisp 1px navy rim so even thin seams glow clearly
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
        // Cluster A: vivid cobalt-cyan (#006EFF) bold solid outline + bold -45° stripes
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
        // Cluster B: vivid magenta-rose (#E10E7C) bold dashed outline + bold +45° stripes
        const dash = ((x + y) % 14) < 9;
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

  // Draw crisp high-contrast anchor pill badges ("A" and "B") at peak density regions
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
  const [viewMode, setViewMode] = useState<ViewMode>('four-up');
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

  // Render full-resolution original & all 3 CVD simulations in a Web Worker once per page
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

  // Paint canvases whenever cache, viewMode, or selectedCvd changes
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

  // Paint risk localization overlay when active
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

  // Synchronized scroll/pan in side-by-side mode
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
    <section className={styles.panel} aria-labelledby="sim-viewer-heading">
      <div className={styles.panelHeader}>
        <h2 id="sim-viewer-heading">
          <Eye size={18} aria-hidden="true" />
          CVD Simulation Viewer
        </h2>

        <div className={styles.viewerToolbar}>
          <div className={styles.segmented} role="group" aria-label="Simulation layout">
            <button
              type="button"
              aria-pressed={viewMode === 'four-up'}
              onClick={() => setViewMode('four-up')}
            >
              <Grid2x2 size={14} aria-hidden="true" />
              4-image comparison
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'side-by-side'}
              onClick={() => setViewMode('side-by-side')}
            >
              <Columns2 size={14} aria-hidden="true" />
              Original vs {selectedCvd}
            </button>
          </div>

          {viewMode === 'side-by-side' && (
            <>
              <div className={styles.segmented} role="group" aria-label="Selected CVD simulation">
                {CVD_TYPES.map((cvd) => (
                  <button
                    key={cvd}
                    type="button"
                    aria-pressed={selectedCvd === cvd}
                    onClick={() => onSelectCvd(cvd)}
                  >
                    {cvd}
                  </button>
                ))}
              </div>
              <div className={styles.zoomGroup} role="group" aria-label="Zoom controls">
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={zoom <= 50}
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                >
                  <Minus size={14} />
                </button>
                <span>{zoom}%</span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  disabled={zoom >= 250}
                  onClick={() => setZoom((z) => Math.min(250, z + 25))}
                >
                  <Plus size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.panelBody}>
        {busy && (
          <div className={styles.statusNotice} role="status">
            <LoaderCircle size={17} className={styles.spin} />
            <span>Rendering full-resolution Machado (2009) &amp; Brettel (1997) simulations…</span>
          </div>
        )}
        {error && (
          <p className="errorMessage" role="alert">
            {error}
          </p>
        )}

        {!busy && !error && viewMode === 'four-up' && (
          <div className={styles.fourUpGrid}>
            <div className={styles.simCard}>
              <div className={styles.simCardHead}>
                <span>Original</span>
                <span className="note">{showOverlay ? 'Localized overlay' : 'Reference'}</span>
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
                <span className={styles.simScoreValue}>Reference image</span>
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
                      style={{ minHeight: 24, padding: 0, fontSize: 11 }}
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
                    <div className={styles.riskBarTrack} aria-hidden="true">
                      <div
                        className={`${styles.riskBarFill} ${
                          band.level === 'low'
                            ? styles.barLow
                            : band.level === 'moderate'
                              ? styles.barModerate
                              : band.level === 'elevated'
                                ? styles.barElevated
                                : styles.barHigh
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                      />
                    </div>
                    <span className={styles.simScoreSub}>{band.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!busy && !error && viewMode === 'side-by-side' && (
          <div className={styles.sideBySideGrid}>
            <div className={styles.sidePane}>
              <div className={styles.simCardHead}>
                <span>Original</span>
                <span className="note">Synchronized pan &amp; zoom ({zoom}%)</span>
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

        {/* Risk localization controls & accessible legend (Section 7.F) */}
        <div className={styles.localizationBar}>
          <div className={styles.localizationTop}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showOverlay}
                disabled={activeClusterA === null}
                onChange={(e) => onShowOverlayChange(e.target.checked)}
              />
              <Layers size={15} aria-hidden="true" />
              Show risk localization overlay on original image
            </label>

            {showOverlay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <label className={styles.checkboxLabel} style={{ fontSize: 12, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={dimBackground}
                    onChange={(e) => setDimBackground(e.target.checked)}
                  />
                  <Sparkles size={14} aria-hidden="true" />
                  Dim background (spotlight)
                </label>
                <label className={styles.opacityControl}>
                  Overlay intensity ({Math.round(overlayOpacity * 100)}%)
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
            <>
              <div className={styles.legendRow}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendChip} ${styles.legendA}`} />
                  <strong>A</strong> · Cluster #{activeClusterA + 1} (
                  {result.clusters[activeClusterA]?.hex})
                  {overlayStats ? ` · ${overlayStats.pctA.toFixed(1)}%` : ''} — solid cobalt contour
                </span>
                {activeClusterB !== null && (
                  <>
                    <span className={styles.legendItem}>
                      <span className={`${styles.legendChip} ${styles.legendB}`} />
                      <strong>B</strong> · Cluster #{activeClusterB + 1} (
                      {result.clusters[activeClusterB]?.hex})
                      {overlayStats ? ` · ${overlayStats.pctB.toFixed(1)}%` : ''} — dashed magenta
                      contour
                    </span>
                    <span className={styles.legendItem}>
                      <span className={`${styles.legendChip} ${styles.legendProx}`} />
                      <strong>Spatially proximate</strong>
                      {overlayStats ? ` (${overlayStats.pctProx.toFixed(1)}% of image)` : ''} —
                      gold highlight + navy halo where A &amp; B appear near each other
                    </span>
                  </>
                )}
              </div>
              <p className="note" style={{ margin: 0 }}>
                Overlay distinguishes where selected colour clusters appear versus where they occur
                in spatial proximity. These masks locate colour clusters only—they do not identify
                semantic content or establish validated inaccessible regions.
              </p>
            </>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              {activeClusterA !== null
                ? 'Enable the overlay (or click “Inspect” on any colour pair below) to spotlight where the selected colours appear and where they are spatially proximate.'
                : 'Select a colour pair below or a palette cluster to inspect its spatial locations.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
