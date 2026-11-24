'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openLocalFile, sampleDocument, type LocalDocument } from '@/lib/document';
import { concern, type Profile } from '@/lib/figure';
import { riskScore, type Stage1Result } from '@/lib/stage1';
import { figureRaster } from '@/lib/figure-raster';
import { hex } from '@/lib/color';
import { VISION_LABELS, type Box, type Raster } from '@/lib/types';
import { SiteHeader } from './brand';
import { useSession } from './session';
import { FigureView } from './figure-view';
import { FigureCrop } from './figure-crop';
import styles from './figure.module.css';

function cropRaster(source: HTMLCanvasElement, box: Box) {
  const data=source.getContext('2d')!.getImageData(box.x,box.y,box.width,box.height).data;
  return figureRaster({width:box.width,height:box.height,data});
}
function Results({
  raster,
  result,
  runtimeMs,
  mode,
  setMode,
  sim,
  setSim,
}: {
  raster: Raster;
  result: Stage1Result;
  runtimeMs: number;
  mode: Profile;
  setMode: (m: Profile) => void;
  sim: boolean;
  setSim: (v: boolean) => void;
}) {
  const [rank, setRank] = useState(0);
  const profile = result.profiles.find((p) => p.mode === mode)!;
  const scores=result.profiles.map(riskScore).filter((value):value is number=>value!==null);
  const worst=scores.length?Math.max(...scores):null;
  const pair = profile.warnings[rank] ?? profile.strongest;
  return (
    <section aria-label="Figure results">
      <h2>Color risk {worst===null ? '—' : worst+'/100'}</h2>
      <p>Highest of the three simulated profiles. Higher scores mean greater local color confusion.</p>
      <div className={styles.profiles}>
        {result.profiles.map((p) => (
          <button
            key={p.mode}
            aria-pressed={p.mode === mode}
            onClick={() => {
              setMode(p.mode);
              setRank(0);
            }}
          >
            <span>{VISION_LABELS[p.mode]}</span>
            <strong>{concern(p.strongest?.metric.risk)}</strong>
            <small>{riskScore(p)===null?'No score':riskScore(p)+'/100'} · {p.warnings.length} warnings</small>
          </button>
        ))}
      </div>
      <div className={styles.review}>
        <div className={styles.panel}>
          <div className={styles.bar}>
            <h2>{VISION_LABELS[mode]}</h2>
            <label>
              <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />{' '}
              Simulated view
            </label>
          </div>
          <FigureView raster={raster} result={result} pair={pair} mode={mode} simulated={sim} />
        </div>
        <aside className={styles.panel}>
          <h2>Pair evidence</h2>
          <p>
            {profile.examined.toLocaleString()} eligible pairs examined · {raster.width} ×{' '}
            {raster.height} px · {runtimeMs} ms on this device
          </p>
          {profile.warnings.length > 0 && (
            <label className={styles.field}>
              Inspect warning
              <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
                {profile.warnings.map((w, i) => (
                  <option key={w.a + '-' + w.b} value={i}>
                    {i + 1}. {concern(w.metric.risk)} · regions {w.a + 1} and {w.b + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pair ? (
            <>
              <div className={styles.swatches}>
                {[pair.a, pair.b].map((id, i) => (
                  <span key={id}>
                    <i style={{ background: hex(result.regions[id].color) }} />
                    {i ? 'B · dashed' : 'A · solid'}
                    <small>{hex(result.regions[id].color)}</small>
                  </span>
                ))}
              </div>
              <dl className={styles.metrics}>
                <dt>Original distance</dt>
                <dd>{pair.normal.toFixed(1)} ΔE</dd>
                <dt>Simulated distance</dt>
                <dd>{pair.metric.deltaE.toFixed(1)} ΔE</dd>
                <dt>Separation retained</dt>
                <dd>{Math.round(100 * pair.metric.retention)}%</dd>
              </dl>
              <p>
                {pair.examples} neighboring region pair{pair.examples === 1 ? '' : 's'} represented by this
                pair.
              </p>
            </>
          ) : (
            <p>
              Insufficient evidence. No eligible pair of distinct colors was measured in this crop.
            </p>
          )}
          <p className={styles.note}>
            This grade measures color separation. Check labels, shapes, and patterns separately when
            judging whether a reader can complete the task.
          </p>
        </aside>
      </div>
    </section>
  );
}
function Run({ source }: { source: HTMLCanvasElement }) {
  const whole = { x: 0, y: 0, width: source.width, height: source.height };
  const [box, setBox] = useState<Box>(whole),
    [cropping, setCropping] = useState(false);
  const [mode, setMode] = useState<Profile>('deutan'),
    [sim, setSim] = useState(false);
  const [measurement, setMeasurement] = useState<{
      raster: Raster;
      result: Stage1Result;
      runtimeMs: number;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (cropping) return;
    let worker: Worker | undefined;
    try {
      const raster = cropRaster(source, box);
      worker = new Worker(new URL('../workers/figure.worker.ts', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (data.error) setError(data.error);
        else setMeasurement({ raster, result: data.result, runtimeMs: data.runtimeMs });
        worker?.terminate();
      };
      worker.onerror = (e) => {
        setError(e.message || 'Figure analysis failed.');
        worker?.terminate();
      };
      worker.postMessage({ raster });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Figure analysis failed.');
    }
    return () => worker?.terminate();
  }, [source, box, cropping]);
  function reset() {
    setMeasurement(null);
    setError('');
  }
  return (
    <>
      <div className={styles.tools}>
        <button
          className="button"
          onClick={() => {
            reset();
            setCropping(!cropping);
          }}
        >
          {cropping ? 'Cancel crop' : 'Select a crop'}
        </button>
        {(box.width !== source.width || box.height !== source.height) && (
          <button
            className="button"
            onClick={() => {
              reset();
              setBox(whole);
              setCropping(false);
            }}
          >
            Use whole page
          </button>
        )}
      </div>
      {cropping ? (
        <FigureCrop
          source={source}
          onApply={(b) => {
            reset();
            setBox(b);
            setCropping(false);
          }}
        />
      ) : error ? (
        <p role="alert">{error}</p>
      ) : measurement ? (
        <Results {...measurement} mode={mode} setMode={setMode} sim={sim} setSim={setSim} />
      ) : (
        <p role="status">Measuring color pairs…</p>
      )}
    </>
  );
}
function PageFigure({ doc, num }: { doc: LocalDocument; num: number }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    doc
      .render(num, 1400)
      .then((c) => {
        if (live) setSource(c);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [doc, num]);
  return error ? (
    <p role="alert">{error}</p>
  ) : source ? (
    <Run source={source} />
  ) : (
    <p role="status">Rendering page…</p>
  );
}
function OpenFigure({ doc }: { doc: LocalDocument }) {
  const [page, setPage] = useState(1);
  return (
    <>
      <div className={styles.bar}>
        <h2>{doc.name}</h2>
        {doc.count > 1 && (
          <label>
            Page{' '}
            <input
              type="number"
              min={1}
              max={doc.count}
              value={page}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isInteger(n) && n >= 1 && n <= doc.count) setPage(n);
              }}
            />{' '}
            of {doc.count}
          </label>
        )}
      </div>
      <PageFigure key={page} doc={doc} num={page} />
      <details><summary>Legacy textbook tools</summary><Link href="/analyze/" className="textLink">
        Open the original page score and text review
      </Link></details>
    </>
  );
}
export default function FigureLab() {
  const { document: doc, setDocument } = useSession(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  async function open(file?: File) {
    setBusy(true);
    setError('');
    try {
      if (!file) {
        await setDocument(sampleDocument());
      } else {
        await setDocument(await openLocalFile(file));
      }
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="figure" />
      <main id="main" className={styles.main}>
        <h1>Figure color analysis</h1>
        <p className={styles.lede}>
          Upload a figure or try the sample for an automatic color-risk score.
        </p>
        <div className={styles.tools}>
          <label className="button">
            Choose a figure or PDF
            <input
              className={styles.upload}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void open(f);
              }}
            />
          </label>
          <button disabled={busy} className="button" onClick={() => void open()}>
            Try the sample diagram
          </button>
        </div>
        {busy && <p role="status">Opening figure…</p>}
        {error && <p role="alert">{error}</p>}
        {doc && <OpenFigure key={revision} doc={doc} />}
      </main>
    </>
  );
}
