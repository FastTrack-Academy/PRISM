'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Info,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Brand, SiteHeader } from './brand';
import { useSession } from './session';
import {
  DEFAULT_PCCI_CONFIG,
  RESEARCH_DISCLAIMERS,
  type CvdType,
  type PcciColorPair,
} from '@/lib/pcci';
import { blobOf, type LocalDocument } from '@/lib/document';
import { RiskScoreCards } from './pcci/RiskScoreCards';
import { SimulationViewer, type SimulationCache } from './pcci/SimulationViewer';
import { WhyThisScore } from './pcci/WhyThisScore';
import { PaletteExplorer } from './pcci/PaletteExplorer';
import { PdfSummaryTable } from './pcci/PdfSummaryTable';
import { ResearchParamsPanel } from './pcci/ResearchParamsPanel';
import styles from './pcci/dashboard.module.css';

function Thumb({ doc, page, blob }: { doc: LocalDocument; page: number; blob?: Blob }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    let url = '';
    (async () => {
      try {
        let b = blob;
        if (!b) {
          const c = await doc.render(page, 175, { preserveAlpha: false, background: 'white' });
          b = await blobOf(c, 'image/jpeg', 0.78);
          c.width = c.height = 0;
        }
        if (live) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      } catch {}
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, page, blob]);

  return src ? <img src={src} alt="" /> : <FileText size={26} aria-hidden="true" />;
}

function Selection({ doc }: { doc: LocalDocument }) {
  const session = useSession();
  const [selected, setSelected] = useState<number[]>(doc.count === 1 ? [1] : []);
  const [batch, setBatch] = useState(0);
  const [range, setRange] = useState('');
  const [error, setError] = useState('');

  const pages = Array.from(
    { length: Math.min(12, doc.count - batch * 12) },
    (_, i) => batch * 12 + i + 1,
  );

  function toggle(n: number) {
    setError('');
    if (selected.includes(n)) setSelected(selected.filter((p) => p !== n));
    else if (selected.length < 10) setSelected([...selected, n]);
    else setError('You can analyze up to 10 pages per run. Deselect a page first.');
  }

  function selectRange() {
    const result = new Set<number>();
    for (const part of range.split(',')) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) {
        setError('Use page numbers or ranges, such as 1, 3-5.');
        return;
      }
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end > doc.count || end < start || end - start > 10) {
        setError(`Choose valid page numbers between 1 and ${doc.count}, up to 10 total.`);
        return;
      }
      for (let p = start; p <= end; p++) result.add(p);
    }
    if (result.size > 10) {
      setError('Choose no more than 10 pages.');
      return;
    }
    setSelected([...result]);
    setError('');
  }

  return (
    <>
      <SiteHeader active="analyze" />
      <main id="main" className={styles.selection}>
        <Link href="/" className="textLink" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={16} />
          Choose a different file
        </Link>
        <div className={styles.selectionHeading}>
          <div>
            <h1>Choose the pages to analyze.</h1>
            <p>
              {doc.name} · {doc.count} {doc.count === 1 ? 'page' : 'pages'}
            </p>
          </div>
          <LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p className="note" style={{ fontSize: 13 }}>
          Select up to 10 pages to compute independent Deuteranopia, Protanopia, and Tritanopia PCCI
          risk scores locally in your browser.
        </p>

        <div className={styles.selectionTools}>
          <div>
            <label htmlFor="page-range">Page numbers</label>
            <input
              id="page-range"
              value={range}
              placeholder="e.g. 1, 3–5"
              onChange={(e) => setRange(e.target.value.replace(/–/g, '-'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') selectRange();
              }}
            />
            <button type="button" className="button" onClick={selectRange} disabled={!range}>
              Select
            </button>
          </div>
          <button
            type="button"
            className="textLink"
            onClick={() => {
              setSelected(pages.slice(0, 10));
              setError('');
            }}
          >
            Select first {Math.min(10, pages.length)} on this view
          </button>
        </div>

        {error && (
          <p role="alert" className="errorMessage">
            {error}
          </p>
        )}

        <div className={styles.pageGrid}>
          {pages.map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.pageOption} ${selected.includes(n) ? styles.selectedPage : ''}`}
              aria-pressed={selected.includes(n)}
              aria-label={`Select page ${n}`}
              onClick={() => toggle(n)}
            >
              <div className={styles.selectionThumb}>
                <Thumb doc={doc} page={n} />
                <span className={styles.checkbox}>
                  {selected.includes(n) && <Check size={14} />}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Page {n}</span>
            </button>
          ))}
        </div>

        {doc.count > 12 && (
          <div className={styles.pagination}>
            <button
              type="button"
              className="button"
              disabled={!batch}
              onClick={() => setBatch((b) => b - 1)}
            >
              <ChevronLeft size={17} />
              Previous
            </button>
            <span className="note" style={{ fontSize: 13 }}>
              Pages {batch * 12 + 1}–{Math.min(doc.count, batch * 12 + 12)} of {doc.count}
            </span>
            <button
              type="button"
              className="button"
              disabled={batch * 12 + 12 >= doc.count}
              onClick={() => setBatch((b) => b + 1)}
            >
              Next
              <ChevronRight size={17} />
            </button>
          </div>
        )}

        <div className={styles.selectionFooter}>
          <span>
            <strong>{selected.length}</strong> of 10 pages selected
          </span>
          <button
            type="button"
            className="button primary"
            disabled={!selected.length || session.busy}
            onClick={() => void session.analyzePages(selected)}
          >
            Analyze selected pages
            <ArrowRight size={17} />
          </button>
        </div>

        <p className="note" style={{ marginTop: 14 }}>
          Your document stays in tab memory and is never uploaded to a server.
        </p>
      </main>
    </>
  );
}

export default function Workspace() {
  const session = useSession();
  const { document: doc, records, config } = session;

  const [pageIndex, setPageIndex] = useState(0);
  const [selectedCvd, setSelectedCvd] = useState<CvdType>('Deuteranopia');
  const [selectedPair, setSelectedPair] = useState<PcciColorPair | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [simCache, setSimCache] = useState<SimulationCache | null>(null);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const autoAnalyzedDoc = useRef<LocalDocument | null>(null);

  // Auto-analyze single-page images immediately upon entering /analyze/
  useEffect(() => {
    if (
      doc &&
      doc.count === 1 &&
      autoAnalyzedDoc.current !== doc &&
      !records.length &&
      !session.busy &&
      !session.total
    ) {
      autoAnalyzedDoc.current = doc;
      void session.analyzePages([1]);
    }
  }, [doc, records.length, session]);

  const record = records[Math.min(pageIndex, Math.max(0, records.length - 1))];

  // Reset selected pair/cluster when active page or CVD changes
  useEffect(() => {
    if (!record) {
      setSelectedPair(null);
      setSelectedClusterId(null);
      return;
    }
    const topPair = record.analysis.cvd[selectedCvd].pairs[0] ?? null;
    setSelectedPair(topPair);
    setSelectedClusterId(null);
  }, [record, selectedCvd]);

  useEffect(() => {
    setPageIndex(0);
    setSelectedCvd('Deuteranopia');
  }, [doc]);

  if (!doc) {
    return (
      <>
        <SiteHeader active="analyze" />
        <main id="main" className="emptyState">
          <FileText size={38} strokeWidth={1.4} />
          <h1>Start with an image or textbook.</h1>
          <p>
            Choose a JPG, PNG, or PDF to compute independent Deuteranopia, Protanopia, and
            Tritanopia PCCI scores locally in your browser.
          </p>
          <Link href="/" className="button primary">
            Choose a file
            <ArrowRight size={18} />
          </Link>
        </main>
      </>
    );
  }

  if (doc.count > 1 && !records.length && !session.busy && !session.total) {
    return <Selection doc={doc} />;
  }

  const allResults = records.map((r) => r.analysis);

  async function runExport(label: string, fn: () => Promise<void> | void) {
    setExportError('');
    setExporting(label);
    try {
      await fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting('');
    }
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <Brand compact />
          <div className={styles.docMeta}>
            <FileText size={17} aria-hidden="true" />
            <span className={styles.docName} title={doc.name}>
              {doc.name}
            </span>
            <span className={styles.docBadge}>
              {records.length} / {doc.count} {doc.count === 1 ? 'page' : 'pages'} analyzed
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Link
            href="/methodology/"
            className="button subtle"
            style={{ fontSize: 13 }}
          >
            <Info size={15} aria-hidden="true" />
            Methodology
          </Link>
          <Link
            className="button outline"
            href="/"
            onClick={() => {
              if (session.busy) session.cancel();
            }}
          >
            <Plus size={15} aria-hidden="true" />
            New analysis
          </Link>
          <button
            type="button"
            className="button primary"
            disabled={!records.length || session.busy || !!exporting}
            onClick={() =>
              void runExport('Preparing PDF report…', async () => {
                const { exportPcciReportPdf } = await import('@/lib/exports');
                await exportPcciReportPdf(doc, allResults);
              })
            }
          >
            <Download size={15} aria-hidden="true" />
            Export PDF report
          </button>
        </div>
      </header>

      <div className={styles.bodyLayout}>
        {doc.count > 1 && records.length > 0 && (
          <aside className={styles.pageRail} aria-label="Analyzed pages">
            <div className={styles.pageRailHeader}>
              <span>Analyzed pages</span>
              <span>
                {records.length} / {session.total || records.length}
              </span>
            </div>
            <div className={styles.pageList}>
              {records.map((r, idx) => (
                <button
                  key={r.pageNumber}
                  type="button"
                  className={`${styles.railItem} ${idx === pageIndex ? styles.railItemActive : ''}`}
                  aria-current={idx === pageIndex ? 'page' : undefined}
                  aria-label={`Inspect page ${r.pageNumber}`}
                  onClick={() => setPageIndex(idx)}
                >
                  <div className={styles.railThumbWrap}>
                    <div className={styles.railThumbBox}>
                      <Thumb doc={doc} page={r.pageNumber} blob={r.thumbnail} />
                    </div>
                    <div className={styles.railScores}>
                      <strong>Page {r.pageNumber}</strong>
                      <span>D: {r.analysis.cvd.Deuteranopia.pcciScore.toFixed(1)}</span>
                      <span>P: {r.analysis.cvd.Protanopia.pcciScore.toFixed(1)}</span>
                      <span>T: {r.analysis.cvd.Tritanopia.pcciScore.toFixed(1)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className={styles.railFooter}>
              <ShieldCheck size={15} aria-hidden="true" />
              <span>Browser-local · private</span>
            </div>
          </aside>
        )}

        <main id="main" className={styles.mainScroll}>
          {/* Progress / Status / Error banners */}
          <div className={styles.bannerRow}>
            {(session.busy || session.recalculating) && (
              <div className={styles.progressBox}>
                <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                <span role="status" style={{ fontSize: 13, fontWeight: 600 }}>
                  {session.status || 'Analyzing…'}
                </span>
                {session.busy && (
                  <>
                    <span className="note">
                      {session.completed} / {session.total}
                    </span>
                    <progress value={session.completed} max={Math.max(1, session.total)} />
                    <button type="button" className="button" onClick={session.cancel}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {!session.busy && !session.recalculating && session.status && (
              <span className="visuallyHidden" role="status">
                {session.status}
              </span>
            )}

            {session.errors.map((err, i) => (
              <p key={i} className="errorMessage" role="alert" style={{ margin: 0 }}>
                {err}
              </p>
            ))}

            {exportError && (
              <p className="errorMessage" role="alert" style={{ margin: 0 }}>
                {exportError}
              </p>
            )}

            {exporting && (
              <div className={styles.statusNotice} role="status">
                <LoaderCircle size={16} className={styles.spin} />
                <span>{exporting}</span>
              </div>
            )}

            {record && !record.analysis.isDefaultConfig && (
              <div className={styles.customBanner} role="status">
                <div>
                  <FlaskConical size={16} aria-hidden="true" />
                  <span>
                    <strong>Non-default experimental parameters active</strong> (K={config.k}, τ=
                    {config.tau}, min ΔE₀₀={config.minOriginalDeltaE}, min freq=
                    {(config.minClusterFrequency * 100).toFixed(2)}%, global=
                    {Math.round(config.globalWeight * 100)}%, q=
                    {Math.round(config.tailProportion * 100)}%, alpha={config.alphaCompositing}).
                  </span>
                </div>
                <button
                  type="button"
                  className="button"
                  style={{ minHeight: 34, padding: '5px 11px', fontSize: 12 }}
                  disabled={session.busy || session.recalculating}
                  onClick={() => void session.updateConfig({ ...DEFAULT_PCCI_CONFIG })}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Reset defaults
                </button>
              </div>
            )}
          </div>

          {!record ? (
            <div className={styles.waitingBox}>
              {session.busy ? (
                <>
                  <LoaderCircle size={32} className={styles.spin} />
                  <h1>Running PCCI analysis locally.</h1>
                  <p>
                    Downsampling to 640 px (Lanczos-3), extracting CIELAB clusters via MiniBatch
                    K-means, and evaluating Deuteranopia, Protanopia, and Tritanopia risk.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle size={32} />
                  <h1>No pages completed.</h1>
                  <p>You can choose pages again or upload another image or PDF.</p>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      autoAnalyzedDoc.current = null;
                      void session.setDocument(doc);
                    }}
                  >
                    {doc.count > 1 ? 'Choose pages again' : 'Retry analysis'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Active page heading & metadata bar */}
              <div className={styles.sectionTop}>
                <div>
                  <h1
                    style={{
                      margin: 0,
                      fontFamily: 'Georgia, serif',
                      fontSize: 26,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {doc.count > 1 ? `Page ${record.pageNumber}` : doc.name}
                  </h1>
                  <p className="note" style={{ margin: '4px 0 0' }}>
                    Original: {record.analysis.originalDimensions.width} ×{' '}
                    {record.analysis.originalDimensions.height} px · Computational:{' '}
                    {record.analysis.computationalDimensions.width} ×{' '}
                    {record.analysis.computationalDimensions.height} px ·{' '}
                    {record.analysis.clusterCount} clusters · {record.analysis.eligiblePairCount}{' '}
                    eligible pairs · {record.analysis.processingTimeMs.toFixed(0)} ms ·{' '}
                    {record.analysis.algorithmVersion}
                  </p>
                </div>

                {doc.count > 1 && records.length > 1 && (
                  <div className={styles.zoomGroup} aria-label="Analyzed page navigation">
                    <button
                      type="button"
                      aria-label="Previous analyzed page"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ minWidth: 72 }}>
                      Page {record.pageNumber} / {doc.count}
                    </span>
                    <button
                      type="button"
                      aria-label="Next analyzed page"
                      disabled={pageIndex >= records.length - 1}
                      onClick={() => setPageIndex((i) => Math.min(records.length - 1, i + 1))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {record.analysis.status === 'no-eligible-pairs' && (
                <div className={styles.statusNotice} role="status">
                  <Info size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{record.analysis.statusMessage}</span>
                </div>
              )}

              {/* 1. Three independent PCCI risk score cards (Section 7.B) */}
              <RiskScoreCards
                result={record.analysis}
                selectedCvd={selectedCvd}
                onSelectCvd={setSelectedCvd}
              />

              {/* 2. CVD Simulation Viewer + Risk Localization Overlay (Section 7.C & 7.F) */}
              <SimulationViewer
                doc={doc}
                result={record.analysis}
                labels={record.labels}
                compWidth={record.compWidth}
                compHeight={record.compHeight}
                selectedCvd={selectedCvd}
                onSelectCvd={setSelectedCvd}
                selectedPair={selectedPair}
                selectedClusterId={selectedClusterId}
                showOverlay={showOverlay}
                onShowOverlayChange={setShowOverlay}
                onSimCacheReady={setSimCache}
              />

              {/* 3. Explainable colour-pair analysis: "Why this score?" (Section 7.D) */}
              <WhyThisScore
                result={record.analysis}
                selectedCvd={selectedCvd}
                selectedPair={selectedPair}
                onSelectPair={(pair) => {
                  setSelectedClusterId(null);
                  setSelectedPair(pair);
                  setShowOverlay(true);
                }}
              />

              {/* 4. Extracted CIELAB palette explorer (Section 7.E) */}
              <PaletteExplorer
                result={record.analysis}
                selectedCvd={selectedCvd}
                selectedClusterId={selectedClusterId}
                onSelectCluster={(id) => {
                  setSelectedClusterId(id);
                  if (id !== null) setShowOverlay(true);
                }}
              />

              {/* 5. Multi-page PDF summary & sortable table (Section 7.G) */}
              <PdfSummaryTable
                records={records}
                totalDocPages={doc.count}
                activePageIndex={pageIndex}
                onSelectPageIndex={(idx) => setPageIndex(idx)}
              />

              {/* 6. Experimental Research Mode (Section 7.I) */}
              <ResearchParamsPanel
                config={config}
                busy={session.busy || session.recalculating}
                onApply={(next) => session.updateConfig(next)}
              />

              {/* 7. Export controls (Section 11) */}
              <section className={styles.panel} aria-labelledby="exports-heading">
                <div className={styles.panelHeader}>
                  <h2 id="exports-heading">
                    <Download size={18} aria-hidden="true" />
                    Export Analysis Results
                  </h2>
                  <span className="note">
                    All exports include algorithm version ({record.analysis.algorithmVersion}),
                    parameters, and research disclaimers.
                  </span>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.exportGrid}>
                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting}
                      onClick={() =>
                        void runExport('Exporting scores CSV…', async () => {
                          const { exportScoresCsv } = await import('@/lib/exports');
                          exportScoresCsv(allResults, doc.name);
                        })
                      }
                    >
                      <FileSpreadsheet size={15} aria-hidden="true" />
                      Scores CSV
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting}
                      onClick={() =>
                        void runExport('Exporting colour-pair evidence CSV…', async () => {
                          const { exportPairEvidenceCsv } = await import('@/lib/exports');
                          exportPairEvidenceCsv(allResults, doc.name);
                        })
                      }
                    >
                      <FileSpreadsheet size={15} aria-hidden="true" />
                      Colour-pair evidence CSV
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting}
                      onClick={() =>
                        void runExport('Exporting complete JSON…', async () => {
                          const { exportResultsJson } = await import('@/lib/exports');
                          exportResultsJson(allResults, doc.name);
                        })
                      }
                    >
                      <FileCode2 size={15} aria-hidden="true" />
                      Complete JSON
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting || !simCache}
                      onClick={() =>
                        void runExport('Rendering 4-image comparison PNG…', async () => {
                          if (!simCache) return;
                          const { exportFourUpComparisonPng } = await import('@/lib/exports');
                          await exportFourUpComparisonPng(
                            simCache.originalCanvas,
                            simCache.simulations,
                            simCache.width,
                            simCache.height,
                            record.analysis,
                            doc.name,
                          );
                        })
                      }
                    >
                      <FileImage size={15} aria-hidden="true" />
                      4-image comparison PNG
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting}
                      onClick={() =>
                        void runExport('Preparing PDF report…', async () => {
                          const { exportPcciReportPdf } = await import('@/lib/exports');
                          await exportPcciReportPdf(doc, allResults);
                        })
                      }
                    >
                      <FileText size={15} aria-hidden="true" />
                      PDF report
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={!!exporting}
                      onClick={() =>
                        void runExport(`Rendering ${selectedCvd} simulated PDF…`, async () => {
                          const { exportSimulatedPdf } = await import('@/lib/exports');
                          await exportSimulatedPdf(
                            doc,
                            records.map((r) => r.pageNumber),
                            selectedCvd,
                            setExporting,
                          );
                        })
                      }
                    >
                      <Download size={15} aria-hidden="true" />
                      Simulated PDF ({selectedCvd})
                    </button>
                  </div>
                </div>
              </section>

              {/* 8. Required Research Disclaimers (Section 12) */}
              <section className={styles.disclaimerBox} aria-label="Research disclaimers">
                <h3>Research Disclaimers &amp; Scope</h3>
                <ul>
                  {RESEARCH_DISCLAIMERS.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
