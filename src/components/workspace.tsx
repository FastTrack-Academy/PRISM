'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Info,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  Scan,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Brand, SiteHeader } from './brand';
import { useSession } from './session';
import { band } from '@/lib/engine';
import { hex } from '@/lib/color';
import {
  VISION_LABELS,
  type ConfusionIssue,
  type CorrectionProposal,
  type PageRecord,
  type Vision,
} from '@/lib/types';
import { blobOf, rasterOf, type LocalDocument } from '@/lib/document';
import styles from './workspace.module.css';

function Thumb({ doc, page, blob }: { doc: LocalDocument; page: number; blob?: Blob }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true,
      url = '';
    (async () => {
      try {
        let b = blob;
        if (!b) {
          const c = await doc.render(page, 175);
          b = await blobOf(c, 'image/jpeg', 0.75);
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
  // User-local object URLs intentionally bypass Next's image loader.
  return src ? <img src={src} alt="" /> : <FileText size={30} aria-hidden="true" />;
}
function Score({ value, small = false }: { value: number | null; small?: boolean }) {
  return (
    <div className={`${styles.score} ${small ? styles.smallScore : ''}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#e5e9f0" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="var(--blue)"
          strokeWidth="4"
          strokeDasharray={`${(value ?? 0) * 1.131} 113.1`}
          transform="rotate(-90 22 22)"
          strokeLinecap="round"
        />
      </svg>
      <strong>{value ?? '—'}</strong>
      <span>/ 100</span>
    </div>
  );
}

function Selection({ doc }: { doc: LocalDocument }) {
  const session = useSession(),
    [selected, setSelected] = useState<number[]>(doc.count === 1 ? [1] : []),
    [batch, setBatch] = useState(0),
    [range, setRange] = useState(''),
    [error, setError] = useState('');
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
      const start = Number(match[1]),
        end = Number(match[2] || match[1]);
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
        <Link href="/" className={styles.back}>
          <ArrowLeft size={17} />
          Choose a different file
        </Link>
        <div className={styles.selectionHeading}>
          <div>
            <h1>Choose the pages to explore.</h1>
            <p>
              {doc.name}{' '}
              <span>
                · {doc.count} {doc.count === 1 ? 'page' : 'pages'}
              </span>
            </p>
          </div>
          <LockKeyhole size={26} strokeWidth={1.5} />
        </div>
        <p className={styles.selectionHelp}>
          Start with diagrams, charts, or maps. Select up to 10 pages for this analysis.
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
            <button className="button" onClick={selectRange} disabled={!range}>
              Select
            </button>
          </div>
          <button
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
              className={`${styles.pageOption} ${selected.includes(n) ? styles.selectedPage : ''}`}
              aria-pressed={selected.includes(n)}
              aria-label={`Select page ${n}`}
              onClick={() => toggle(n)}
            >
              <div className={styles.selectionThumb}>
                <Thumb doc={doc} page={n} />
                <span className={styles.checkbox}>
                  {selected.includes(n) && <Check size={15} />}
                </span>
              </div>
              <span>Page {n}</span>
            </button>
          ))}
        </div>
        {doc.count > 12 && (
          <div className={styles.pagination}>
            <button className="button" disabled={!batch} onClick={() => setBatch((b) => b - 1)}>
              <ChevronLeft size={18} />
              Previous
            </button>
            <span>
              Pages {batch * 12 + 1}–{Math.min(doc.count, batch * 12 + 12)} of {doc.count}
            </span>
            <button
              className="button"
              disabled={batch * 12 + 12 >= doc.count}
              onClick={() => setBatch((b) => b + 1)}
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <div className={styles.selectionFooter}>
          <span>
            <strong>{selected.length}</strong> of 10 pages selected
          </span>
          <button
            className="button primary"
            disabled={!selected.length || session.busy}
            onClick={() => void session.analyzePages(selected)}
          >
            Analyze selected pages
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="note">
          Your file stays in this tab. Closing or refreshing the tab clears your session.
        </p>
      </main>
    </>
  );
}

function Viewer({
  doc,
  record,
  mode,
  issue,
  preview,
  compare,
  onMeasurement,
}: {
  doc: LocalDocument;
  record: PageRecord;
  mode: Vision;
  issue?: ConfusionIssue;
  preview: CorrectionProposal | null;
  compare: boolean;
  onMeasurement: (score: number | null, major: number) => void;
}) {
  const original = useRef<HTMLCanvasElement>(null),
    display = useRef<HTMLCanvasElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    [fitWidth, setFitWidth] = useState(600),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [zoom, setZoom] = useState(100),
    [split, setSplit] = useState(50);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const padding = window.innerWidth > 950 ? 44 : 16;
      const width = el.clientWidth - padding;
      setFitWidth(
        window.innerWidth > 950
          ? Math.min(
              width,
              ((el.clientHeight - 24) * record.analysis.width) / record.analysis.height,
            )
          : width,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [record.analysis]);
  const fixes = preview
    ? [...record.approved.filter((f) => f.regionId !== preview.regionId), preview]
    : record.approved;
  const key = fixes.map((f) => f.id).join(',');
  useEffect(() => {
    let live = true;
    const worker = new Worker(new URL('../workers/view.worker.ts', import.meta.url));
    setBusy(true);
    setError('');
    (async () => {
      try {
        const c = await doc.render(record.analysis.pageNumber, 1400);
        if (!live) {
          c.width = c.height = 0;
          return;
        }
        const r = rasterOf(c);
        if (original.current) {
          original.current.width = r.width;
          original.current.height = r.height;
          original.current.getContext('2d')!.drawImage(c, 0, 0);
        }
        c.width = c.height = 0;
        worker.onmessage = (e) => {
          if (!live) return;
          if (e.data.error) {
            setError(e.data.error);
            setBusy(false);
            return;
          }
          const { raster, score, major } = e.data;
          const canvas = display.current;
          if (canvas) {
            canvas.width = raster.width;
            canvas.height = raster.height;
            canvas
              .getContext('2d')!
              .putImageData(
                new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
                0,
                0,
              );
          }
          setBusy(false);
          onMeasurement(score, major);
        };
        worker.onerror = () => {
          if (live) {
            setBusy(false);
            setError('The preview could not be rendered. Choose another page and try again.');
          }
        };
        worker.postMessage({ raster: r, analysis: record.analysis, fixes, mode }, [r.data.buffer]);
      } catch (e) {
        if (live) {
          setBusy(false);
          setError(e instanceof Error ? e.message : 'Unable to display page.');
        }
      }
    })();
    return () => {
      live = false;
      worker.terminate();
    };
    // Fix IDs identify immutable proposals, so changing the array alone need not rerender pixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, record.analysis, mode, key]);
  const a = record.analysis;
  const box =
    issue?.kind === 'color'
      ? a.regions[issue.regionIds.reduce((x, y) => (a.regions[x].area < a.regions[y].area ? x : y))]
          .box
      : issue?.box;
  return (
    <div className={styles.viewer}>
      <div className={styles.viewerTitle}>
        <h1>Page {a.pageNumber}</h1>
        <span>
          {preview
            ? 'Correction preview'
            : record.approved.length
              ? 'Approved changes'
              : VISION_LABELS[mode]}
        </span>
        <div className={styles.zoom}>
          <button
            aria-label="Zoom out"
            disabled={zoom <= 75}
            onClick={() => setZoom((z) => z - 25)}
          >
            <Minus size={16} />
          </button>
          <span>{zoom}%</span>
          <button
            aria-label="Zoom in"
            disabled={zoom >= 200}
            onClick={() => setZoom((z) => z + 25)}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div
        ref={scroll}
        className={styles.canvasScroll}
        tabIndex={0}
        role="region"
        aria-label="Textbook page, scroll to read"
      >
        <div
          className={styles.paper}
          style={{ width: (fitWidth * zoom) / 100, aspectRatio: `${a.width}/${a.height}` }}
        >
          <canvas
            ref={original}
            className={styles.originalCanvas}
            role="img"
            aria-label={`Original textbook page ${a.pageNumber}`}
          />
          <canvas
            ref={display}
            style={{ clipPath: compare ? `inset(0 0 0 ${split}%)` : undefined }}
            role="img"
            aria-label={`${VISION_LABELS[mode]} ${preview || record.approved.length ? 'corrected ' : ''}page ${a.pageNumber}`}
          />
          {compare && (
            <div className={styles.splitLine} style={{ left: `${split}%` }}>
              <span>‹ ›</span>
            </div>
          )}
          {box && (
            <div
              className={styles.issueOutline}
              style={{
                left: `${(box.x / a.width) * 100}%`,
                top: `${(box.y / a.height) * 100}%`,
                width: `${(box.width / a.width) * 100}%`,
                height: `${(box.height / a.height) * 100}%`,
              }}
            >
              <span>{a.issues.indexOf(issue!) + 1}</span>
            </div>
          )}
          {busy && (
            <div className={styles.canvasLoading}>
              <LoaderCircle size={23} className={styles.spin} />
              <span>Preparing page…</span>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="errorMessage" role="alert">
          {error}
        </p>
      )}
      {compare && (
        <div className={styles.compareSlider}>
          <span>Original</span>
          <input
            type="range"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Comparison divider"
          />
          <span>{preview ? 'Preview' : VISION_LABELS[mode]}</span>
        </div>
      )}
    </div>
  );
}

function Breakdown({ record }: { record: PageRecord }) {
  return (
    <div className={styles.breakdown}>
      <h3>
        Score breakdown{' '}
        <Link href="/methodology/" aria-label="Read scoring methodology">
          <Info size={15} />
        </Link>
      </h3>
      {[
        ['Separation', record.analysis.separation],
        ['Contrast', record.analysis.contrast],
        ['Redundancy', record.analysis.redundancy],
      ].map(([name, value]) => (
        <div className={styles.metric} key={name}>
          <span>{name}</span>
          <div className={styles.bar}>
            <div style={{ width: `${value ?? 0}%` }} />
          </div>
          <strong>
            {value === null ? 'N/A' : Math.round(Number(value))}
            <span>{value === null ? '' : ' / 100'}</span>
          </strong>
        </div>
      ))}
      <p className="note">{record.analysis.confidence} evidence · original page</p>
    </div>
  );
}

export default function Workspace() {
  const session = useSession(),
    { document: doc, records } = session;
  const [pageIndex, setPageIndex] = useState(0),
    [issueIndex, setIssueIndex] = useState(0),
    [mode, setMode] = useState<Vision>('original'),
    [compare, setCompare] = useState(false),
    [preview, setPreview] = useState<CorrectionProposal | null>(null),
    [measurement, setMeasurement] = useState<{ score: number | null; major: number } | null>(null),
    [exporting, setExporting] = useState(''),
    [exportError, setExportError] = useState(''),
    [exportMode, setExportMode] = useState<Vision>('original'),
    [inspectorOpen, setInspectorOpen] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const record = records[Math.min(pageIndex, records.length - 1)],
    issue = record?.analysis.issues[issueIndex];
  useEffect(() => {
    setIssueIndex(0);
    setPreview(null);
    setMeasurement(null);
  }, [pageIndex]);
  useEffect(() => {
    setPageIndex(0);
    setIssueIndex(0);
    setPreview(null);
    setMeasurement(null);
  }, [doc]);
  if (!doc)
    return (
      <>
        <SiteHeader />
        <main id="main" className="emptyState">
          <FileText size={38} strokeWidth={1.4} />
          <h1>Start with a textbook.</h1>
          <p>
            Choose a PDF or page image to explore its colors. Documents stay in memory, so a
            refreshed tab starts a new session.
          </p>
          <Link href="/" className="button primary">
            Choose a textbook
            <ArrowRight size={18} />
          </Link>
        </main>
      </>
    );
  if (!records.length && !session.busy && !session.total) return <Selection doc={doc} />;
  const scored = records.filter((r) => r.analysis.score !== null),
    average = scored.length
      ? Math.round(scored.reduce((s, r) => s + r.analysis.score!, 0) / scored.length)
      : null;
  const hasApproved = records.some((r) => r.approved.length > 0);
  async function report() {
    setExportError('');
    setExporting('Preparing report');
    try {
      const { exportReport } = await import('@/lib/exports');
      await exportReport(doc!, records);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Report export failed.');
    } finally {
      setExporting('');
    }
  }
  async function exportPDF() {
    dialog.current?.close();
    setExportError('');
    setExporting('Preparing document');
    try {
      const { exportDocument } = await import('@/lib/exports');
      await exportDocument(doc!, records, exportMode, setExporting);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Document export failed.');
    } finally {
      setExporting('');
    }
  }
  function showPreview(fix: CorrectionProposal) {
    if (preview?.id === fix.id) return;
    setMeasurement(null);
    setPreview(fix);
    setCompare(true);
  }
  const canApprove =
    preview &&
    measurement &&
    record &&
    measurement.score !== null &&
    record.analysis.score !== null &&
    measurement.score >= record.analysis.score + 5 &&
    measurement.major === 0;
  return (
    <div className={styles.workspace}>
      <header className={styles.appHeader}>
        <div className={styles.brandCell}>
          <Brand compact />
        </div>
        <div className={styles.documentName}>
          <FileText size={19} />
          <span title={doc.name}>{doc.name}</span>
        </div>
        <div className={styles.overall}>
          <span>{scored.length === doc.count ? 'Textbook score' : 'Selection average'}</span>
          <Score small value={average} />
          <Link href="/methodology/" aria-label="About this experimental score">
            <Info size={15} />
          </Link>
        </div>
        <div className={styles.headerActions}>
          <Link
            className="button outline"
            href="/"
            aria-label="New analysis"
            onClick={() => {
              if (session.busy) session.cancel();
            }}
          >
            <Plus size={17} />
            <span>New analysis</span>
          </Link>
          <button
            className="button primary"
            aria-label="Export report"
            disabled={!records.length || session.busy || !!exporting}
            onClick={() => void report()}
          >
            <Download size={17} />
            <span>Export report</span>
          </button>
        </div>
      </header>
      {(session.busy || session.errors.length > 0 || exportError) && (
        <div className={styles.progressArea}>
          {session.busy && (
            <div className={styles.progressRow}>
              <LoaderCircle size={17} className={styles.spin} />
              <span role="status">{session.status}</span>
              <span>
                {session.completed} / {session.total}
              </span>
              <button className="button" onClick={session.cancel}>
                Cancel
              </button>
              <progress value={session.completed} max={session.total} />
            </div>
          )}
          {session.errors.map((e, i) => (
            <p className="errorMessage" role="alert" key={i}>
              {e}
            </p>
          ))}
          {exportError && (
            <p className="errorMessage" role="alert">
              {exportError}
            </p>
          )}
        </div>
      )}
      <div className={styles.body}>
        <aside className={styles.rail} aria-label="Analyzed pages">
          <h2>
            Pages{' '}
            <span>
              {records.length} / {session.total}
            </span>
          </h2>
          <div className={styles.thumbnails}>
            {records.map((r, i) => (
              <button
                className={`${styles.railPage} ${i === pageIndex ? styles.activePage : ''}`}
                key={r.analysis.pageNumber}
                aria-label={`View page ${r.analysis.pageNumber}, score ${r.analysis.score ?? 'not available'}`}
                aria-current={i === pageIndex ? 'page' : undefined}
                onClick={() => setPageIndex(i)}
              >
                <span>{r.analysis.pageNumber}</span>
                <div>
                  <Thumb doc={doc} page={r.analysis.pageNumber} blob={r.thumbnail} />
                </div>
                <span className={styles.pageScore}>{r.analysis.score ?? '—'}</span>
              </button>
            ))}
          </div>
          <div className={styles.railBottom}>
            <ShieldCheck size={17} />
            <span>On your device</span>
          </div>
        </aside>
        <main id="main" className={styles.center}>
          {!record ? (
            <div className={styles.waiting}>
              {session.busy ? (
                <>
                  <LoaderCircle size={34} className={styles.spin} />
                  <h1>Taking a closer look.</h1>
                  <p>Your first page will appear here as soon as it is ready.</p>
                  <p className="note">
                    English text recognition loads once. Complex pages take longer.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle size={34} />
                  <h1>No pages completed.</h1>
                  <p>Try a smaller file or a different page.</p>
                  <button className="button primary" onClick={() => void session.setDocument(doc)}>
                    Choose pages again
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className={styles.toolbar}>
                <div
                  className={styles.visionTabs}
                  role="group"
                  aria-label="Color vision simulation"
                >
                  {(Object.keys(VISION_LABELS) as Vision[]).map((v) => (
                    <button
                      key={v}
                      aria-pressed={mode === v}
                      className={mode === v ? styles.activeTab : ''}
                      onClick={() => {
                        if (mode === v) return;
                        setMeasurement(null);
                        setMode(v);
                      }}
                    >
                      <Eye size={16} />
                      {VISION_LABELS[v]}
                    </button>
                  ))}
                </div>
                <div className={styles.pageNav}>
                  <button
                    aria-label="Previous analyzed page"
                    disabled={!pageIndex}
                    onClick={() => setPageIndex((i) => i - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    {record.analysis.pageNumber} / {doc.count}
                  </span>
                  <button
                    aria-label="Next analyzed page"
                    disabled={pageIndex >= records.length - 1}
                    onClick={() => setPageIndex((i) => i + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <Viewer
                doc={doc}
                record={record}
                mode={mode}
                issue={issue}
                preview={preview}
                compare={compare}
                onMeasurement={(score, major) => setMeasurement({ score, major })}
              />
              <div className={styles.viewerFooter}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                  />
                  <span />
                  Compare view
                </label>
                <span className={styles.simulationNote}>Simulations are approximations</span>
              </div>
            </>
          )}
        </main>
        {record && (
          <aside className={styles.inspector} aria-label="Page issue inspector">
            <button
              className={styles.inspectorToggle}
              onClick={() => setInspectorOpen((v) => !v)}
              aria-expanded={inspectorOpen}
            >
              <span>Inspector</span>
              <ChevronDown size={17} />
            </button>
            <div className={inspectorOpen ? styles.inspectorContent : styles.inspectorClosed}>
              <div className={styles.pageSummary}>
                <div>
                  <span>Page {record.analysis.pageNumber} · original score</span>
                  <strong>{band(record.analysis.score)}</strong>
                </div>
                <Score small value={record.analysis.score} />
              </div>
              <h2 className={styles.issueHeading}>
                {record.analysis.issues.length} potential{' '}
                {record.analysis.issues.length === 1 ? 'issue' : 'issues'}{' '}
                <AlertTriangle size={19} />
              </h2>
              <div className={styles.issueList}>
                {record.analysis.issues.map((item, i) => (
                  <button
                    key={item.id}
                    className={`${styles.issueRow} ${i === issueIndex ? styles.activeIssue : ''}`}
                    onClick={() => {
                      setIssueIndex(i);
                      setPreview(null);
                      if (preview) setMeasurement(null);
                    }}
                    aria-pressed={i === issueIndex}
                  >
                    <span className={styles.issueNumber}>{i + 1}</span>
                    <span>
                      {item.title}
                      <small>
                        <AlertTriangle size={12} />
                        {item.severity}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              {!issue && (
                <p className="note">
                  No issues were detected by these checks. Review the page yourself: a high score
                  does not guarantee accessibility.
                </p>
              )}
              {issue && (
                <div className={styles.issueDetail}>
                  <div className={styles.issueCounter}>
                    <span>
                      Issue {issueIndex + 1} of {record.analysis.issues.length}
                    </span>
                    <div>
                      <button
                        aria-label="Previous issue"
                        disabled={!issueIndex}
                        onClick={() => {
                          setIssueIndex((i) => i - 1);
                          setPreview(null);
                        }}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        aria-label="Next issue"
                        disabled={issueIndex >= record.analysis.issues.length - 1}
                        onClick={() => {
                          setIssueIndex((i) => i + 1);
                          setPreview(null);
                        }}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                  <h3>Why it’s a problem</h3>
                  <p>{issue.description}</p>
                  {issue.metrics.length > 0 && (
                    <details className={styles.evidence}>
                      <summary>Measured evidence</summary>
                      <p>Original ΔE: {issue.normalDeltaE.toFixed(1)}</p>
                      {issue.metrics.map((m) => (
                        <p key={m.mode}>
                          {VISION_LABELS[m.mode]}: ΔE {m.deltaE.toFixed(1)} ·{' '}
                          {(m.retention * 100).toFixed(0)}% retained
                        </p>
                      ))}
                      <div className={styles.swatches}>
                        {issue.regionIds.map((id) => (
                          <span key={id}>
                            <i style={{ background: hex(record.analysis.regions[id].color) }} />
                            {hex(record.analysis.regions[id].color)}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                  <h3>Recommendation</h3>
                  {issue.suggestions.length ? (
                    issue.suggestions.map((fix) => (
                      <div key={fix.id} className={styles.suggestion}>
                        <div className={styles.suggestionCopy}>
                          <Layers size={28} strokeWidth={1.3} />
                          <div>
                            <h4>{fix.label}</h4>
                            <p>{fix.description}</p>
                            <span className={styles.gain}>
                              Individually tested: +{fix.gain} points
                            </span>
                          </div>
                        </div>
                        <button
                          className="button primary"
                          disabled={
                            session.busy || record.approved.some((item) => item.id === fix.id)
                          }
                          onClick={() => showPreview(fix)}
                        >
                          <Eye size={17} />
                          {record.approved.some((item) => item.id === fix.id)
                            ? 'Change approved'
                            : 'Preview fix'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className={styles.manualSuggestion}>
                      <Scan size={25} />
                      <div>
                        <strong>Review the original artwork</strong>
                        <p>
                          {issue.kind === 'text'
                            ? 'Increase text/background contrast in the source document. Automatic text editing is unavailable.'
                            : 'Add explicit labels, outlines, or different line patterns in the source artwork. No safe automatic change met the improvement threshold.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {preview && (
                    <div className={styles.previewApproval}>
                      <strong>Review this change</strong>
                      <p>
                        {measurement
                          ? `Measured preview score: ${measurement.score ?? 'N/A'} / 100`
                          : 'Rechecking the combined changes…'}
                      </p>
                      {measurement && !canApprove && (
                        <p className="note">
                          This combination does not meet the improvement and regression checks. Try
                          another change.
                        </p>
                      )}
                      <div>
                        <button
                          className="button primary"
                          disabled={!canApprove}
                          onClick={() => {
                            session.approve(record.analysis.pageNumber, preview);
                            setPreview(null);
                          }}
                        >
                          Approve change
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            setPreview(null);
                            setMeasurement(null);
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {record.approved.length > 0 && (
                <div className={styles.approved}>
                  <h3>
                    <CheckCircle2 size={16} />
                    Approved changes
                  </h3>
                  {record.approved.map((f) => (
                    <div key={f.id}>
                      <span>{f.label}</span>
                      <button
                        aria-label={`Revert ${f.label}`}
                        onClick={() => {
                          session.revert(record.analysis.pageNumber, f.id);
                          setPreview(null);
                          setMeasurement(null);
                        }}
                      >
                        <RotateCcw size={15} />
                      </button>
                    </div>
                  ))}
                  {measurement && !preview && (
                    <p className="note">Corrected score: {measurement.score ?? 'N/A'} / 100</p>
                  )}
                </div>
              )}
              <button
                className="button outline"
                disabled={!hasApproved || session.busy || !!exporting}
                onClick={() => {
                  setExportMode('original');
                  dialog.current?.showModal();
                }}
              >
                <Download size={17} />
                Download corrected PDF
              </button>
              <button
                className="textLink"
                disabled={session.busy || !!exporting}
                onClick={() => {
                  setExportMode(mode === 'original' ? 'deutan' : mode);
                  dialog.current?.showModal();
                }}
              >
                Download simulated PDF
                <ArrowRight size={15} />
              </button>
              <Breakdown record={record} />
              <details className={styles.limitations}>
                <summary>Analysis notes & limitations</summary>
                {record.analysis.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <p>
                  {record.analysis.version} · {(record.analysis.duration / 1000).toFixed(1)} seconds
                  of visual analysis
                </p>
              </details>
              <div className={styles.methodology}>
                <span>Methodology</span>
                <Link href="/methodology/">
                  How this score is calculated <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </aside>
        )}
      </div>
      <footer className={styles.statusBar}>
        <CheckCircle2 size={19} />
        <span role="status">{exporting || session.status}</span>
        <span className={styles.sessionNote}>Session clears on refresh</span>
      </footer>
      <dialog ref={dialog} className={styles.exportDialog}>
        <div className={styles.dialogHeading}>
          <h2>
            {exportMode === 'original'
              ? 'Export your corrected textbook'
              : 'Export a color vision simulation'}
          </h2>
          <button
            className="button subtle"
            aria-label="Close export dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          {exportMode === 'original'
            ? 'Pages with approved changes become images. Other PDF pages are copied from your original.'
            : 'Only analyzed pages are simulated. Other PDF pages are copied from your original.'}
        </p>
        <p className="note">
          Transformed pages lose selectable text and document tags. Keep your original for reading
          and assistive technology. This download is a visual review copy.
        </p>
        {exportMode !== 'original' && (
          <label className={styles.exportSelect}>
            Simulation
            <select value={exportMode} onChange={(e) => setExportMode(e.target.value as Vision)}>
              <option value="protan">Protanopia</option>
              <option value="deutan">Deuteranopia</option>
              <option value="tritan">Tritanopia</option>
            </select>
          </label>
        )}
        <div className={styles.dialogActions}>
          <button className="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="button primary" onClick={() => void exportPDF()}>
            <Download size={17} />
            Download PDF
          </button>
        </div>
      </dialog>
    </div>
  );
}
