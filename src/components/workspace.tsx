'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  HelpCircle,
  Info,
  LoaderCircle,
  LockKeyhole,
  Palette,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
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

type InspectorTab = 'pairs' | 'palette' | 'pages' | 'params';

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
        <Link
          href="/"
          className="textLink"
          style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
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
  const [showOverlay, setShowOverlay] = useState(true);
  const [activeTab, setActiveTab] = useState<InspectorTab>('pairs');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [simCache, setSimCache] = useState<SimulationCache | null>(null);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const autoAnalyzedDoc = useRef<LocalDocument | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export popover on outside click or Escape
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

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
    setActiveTab('pairs');
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
  const isMultiPage = doc.count > 1 || records.length > 1;

  async function runExport(label: string, fn: () => Promise<void> | void) {
    setExportMenuOpen(false);
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
      {/* Compact top app bar with document controls and Export menu */}
      <header className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <Brand compact />
          <div className={styles.docMeta}>
            <FileText size={16} aria-hidden="true" />
            <span className={styles.docName} title={doc.name}>
              {doc.name}
            </span>
            {record && isMultiPage && (
              <div className={styles.zoomGroup} aria-label="Analyzed page navigation">
                <button
                  type="button"
                  aria-label="Previous analyzed page"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ minWidth: 64 }}>
                  p. {record.pageNumber}/{doc.count}
                </span>
                <button
                  type="button"
                  aria-label="Next analyzed page"
                  disabled={pageIndex >= records.length - 1}
                  onClick={() => setPageIndex((i) => Math.min(records.length - 1, i + 1))}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            {!isMultiPage && record && (
              <span className={styles.docBadge}>
                {record.analysis.originalDimensions.width} ×{' '}
                {record.analysis.originalDimensions.height} px
              </span>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          <Link href="/methodology/" className="button subtle">
            <Info size={14} aria-hidden="true" />
            Methodology
          </Link>
          <Link
            className="button outline"
            href="/"
            onClick={() => {
              if (session.busy) session.cancel();
            }}
          >
            <Plus size={14} aria-hidden="true" />
            New file
          </Link>

          <div className={styles.exportMenu} ref={exportMenuRef}>
            <button
              type="button"
              className="button primary"
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              disabled={!records.length || session.busy || !!exporting}
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              <Download size={14} aria-hidden="true" />
              Export
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            {exportMenuOpen && record && (
              <div className={styles.exportPopover} role="menu" aria-label="Export analysis results">
                <button
                  type="button"
                  role="menuitem"
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
                  role="menuitem"
                  onClick={() =>
                    void runExport('Exporting colour-pair CSV…', async () => {
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
                  role="menuitem"
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
                <div className={styles.exportDivider} />
                <button
                  type="button"
                  role="menuitem"
                  disabled={!simCache}
                  onClick={() =>
                    void runExport('Rendering 4-image PNG…', async () => {
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
                  role="menuitem"
                  onClick={() =>
                    void runExport('Preparing PDF report…', async () => {
                      const { exportPcciReportPdf } = await import('@/lib/exports');
                      await exportPcciReportPdf(doc, allResults);
                    })
                  }
                >
                  <FileText size={15} aria-hidden="true" />
                  PDF analysis report
                </button>
                <button
                  type="button"
                  role="menuitem"
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
                <div className={styles.exportDivider} />
                <div className={styles.exportMeta}>
                  Includes version ({record.analysis.algorithmVersion}), parameters, and research
                  disclaimers.
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Compact contextual banners (only shown when active) */}
      {(session.busy ||
        session.recalculating ||
        session.errors.length > 0 ||
        exportError ||
        exporting ||
        (record && !record.analysis.isDefaultConfig) ||
        (record && record.analysis.status === 'no-eligible-pairs')) && (
        <div className={styles.bannerStrip}>
          {(session.busy || session.recalculating) && (
            <div className={styles.progressBox}>
              <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
              <span role="status" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {session.status || 'Analyzing…'}
              </span>
              {session.busy && (
                <>
                  <span className="note">
                    {session.completed} / {session.total}
                  </span>
                  <progress value={session.completed} max={Math.max(1, session.total)} />
                  <button
                    type="button"
                    className="button"
                    style={{ minHeight: 30, padding: '4px 10px', fontSize: 12 }}
                    onClick={session.cancel}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {session.errors.map((err, i) => (
            <p key={i} className="errorMessage" role="alert" style={{ margin: 0, padding: '8px 12px' }}>
              {err}
            </p>
          ))}

          {exportError && (
            <p className="errorMessage" role="alert" style={{ margin: 0, padding: '8px 12px' }}>
              {exportError}
            </p>
          )}

          {exporting && (
            <div className={styles.statusNotice} role="status">
              <LoaderCircle size={15} className={styles.spin} />
              <span>{exporting}</span>
            </div>
          )}

          {record && !record.analysis.isDefaultConfig && (
            <div className={styles.customBanner} role="status">
              <div>
                <FlaskConical size={15} aria-hidden="true" />
                <span>
                  <strong>Non-default experimental parameters active</strong> (
                  {config.kSelectionMode === 'fixed'
                    ? `K=${config.k}`
                    : `Auto ${config.kSelectionMode} -> K*=${record.analysis.clusterCount}`}
                  , τ={config.tau}, min ΔE₀₀={config.minOriginalDeltaE}, q=
                  {Math.round(config.tailProportion * 100)}%).
                </span>
              </div>
              <button
                type="button"
                className="button"
                style={{ minHeight: 28, padding: '3px 9px', fontSize: 11.5 }}
                disabled={session.busy || session.recalculating}
                onClick={() => void session.updateConfig({ ...DEFAULT_PCCI_CONFIG })}
              >
                <RotateCcw size={12} aria-hidden="true" />
                Reset defaults
              </button>
            </div>
          )}

          {record && record.analysis.status === 'no-eligible-pairs' && (
            <div className={styles.statusNotice} role="status">
              <Info size={15} aria-hidden="true" />
              <span>{record.analysis.statusMessage}</span>
            </div>
          )}
        </div>
      )}

      {!session.busy && !session.recalculating && session.status && (
        <span className="visuallyHidden" role="status">
          {session.status}
        </span>
      )}

      {!record ? (
        <main id="main" className={styles.waitingWrap}>
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
        </main>
      ) : (
        <>
          {/* Compact 3-CVD Risk Switcher Bar — always visible above the split workbench */}
          <RiskScoreCards
            result={record.analysis}
            selectedCvd={selectedCvd}
            onSelectCvd={setSelectedCvd}
          />

          {/* Main Split-Screen Cockpit: Viewer (Left) + Tabbed Inspector (Right) */}
          <main id="main" className={styles.workbench}>
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

            <aside className={styles.inspectorPanel} aria-label="Score evidence inspector">
              <div className={styles.inspectorTabs} role="tablist" aria-label="Inspector sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'pairs'}
                  onClick={() => setActiveTab('pairs')}
                >
                  <HelpCircle size={13} aria-hidden="true" />
                  Why this score?
                  <span className={styles.inspectorTabCount}>
                    {record.analysis.cvd[selectedCvd].eligiblePairCount}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'palette'}
                  onClick={() => setActiveTab('palette')}
                >
                  <Palette size={13} aria-hidden="true" />
                  Palette
                  <span className={styles.inspectorTabCount}>{record.analysis.clusterCount}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'params'}
                  onClick={() => setActiveTab('params')}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  Params
                </button>

                {isMultiPage && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'pages'}
                    onClick={() => setActiveTab('pages')}
                  >
                    <FileSpreadsheet size={13} aria-hidden="true" />
                    Pages
                    <span className={styles.inspectorTabCount}>{records.length}</span>
                  </button>
                )}
              </div>

              <div className={styles.inspectorBody} role="tabpanel">
                {activeTab === 'pairs' && (
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
                )}

                {activeTab === 'palette' && (
                  <PaletteExplorer
                    result={record.analysis}
                    selectedCvd={selectedCvd}
                    selectedClusterId={selectedClusterId}
                    onSelectCluster={(id) => {
                      setSelectedClusterId(id);
                      if (id !== null) setShowOverlay(true);
                    }}
                  />
                )}

                {activeTab === 'params' && (
                  <ResearchParamsPanel
                    config={config}
                    kSelection={record.analysis.kSelection}
                    busy={session.busy || session.recalculating}
                    onApply={(next) => session.updateConfig(next)}
                  />
                )}

                {activeTab === 'pages' && isMultiPage && (
                  <PdfSummaryTable
                    records={records}
                    totalDocPages={doc.count}
                    activePageIndex={pageIndex}
                    onSelectPageIndex={(idx) => setPageIndex(idx)}
                  />
                )}
              </div>
            </aside>
          </main>

          {/* Slim pinned footer with research disclaimers */}
          <footer className={styles.disclaimerBar}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} aria-hidden="true" />
              Browser-local ({record.analysis.algorithmVersion}) · Experimental colour-confusion
              estimates, not clinical diagnoses or accessibility certifications.
            </span>

            <details className={styles.disclaimerDetails}>
              <summary>Research disclaimers &amp; scope</summary>
              <div className={styles.disclaimerDrawer}>
                <h3>Research Disclaimers &amp; Scope</h3>
                <ul>
                  {RESEARCH_DISCLAIMERS.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </details>
          </footer>
        </>
      )}
    </div>
  );
}
