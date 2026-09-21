'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  FileUp,
  FolderOpen,
  LockKeyhole,
  Scan,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { SiteHeader } from './brand';
import { useSession } from './session';
import { VISION_LABELS, type Vision } from '@/lib/types';
import styles from './landing.module.css';

function SamplePreview({ mode }: { mode: Vision }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const { sampleDocument, rasterOf } = await import('@/lib/document');
      const { simulateRaster } = await import('@/lib/color');
      const c = await sampleDocument().render(1, 470);
      const r = simulateRaster(rasterOf(c), mode);
      if (live && canvas.current) {
        canvas.current.width = r.width;
        canvas.current.height = r.height;
        canvas.current
          .getContext('2d')!
          .putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
      }
      c.width = c.height = 0;
    })();
    return () => {
      live = false;
    };
  }, [mode]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`Original sample biology page, ${VISION_LABELS[mode]} ${mode === 'original' ? 'view' : 'simulation'}`}
    />
  );
}
export default function Landing() {
  const { setDocument } = useSession(),
    router = useRouter(),
    input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [drag, setDrag] = useState(false);
  async function open(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const { openLocalFile } = await import('@/lib/document');
      await setDocument(await openLocalFile(file));
      router.push('/analyze/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be opened.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function sample() {
    setBusy(true);
    try {
      const { sampleDocument } = await import('@/lib/document');
      await setDocument(sampleDocument());
      router.push('/analyze/');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="analyze" />
      <main id="main" className={styles.main}>
        <section className={styles.intro} aria-labelledby="intro-title">
          <div className={styles.copy}>
            <h1 id="intro-title">
              See every page <br />
              more clearly.
            </h1>
            <p>
              Upload a textbook PDF or page image to simulate color vision differences, measure
              confusing regions, and review practical fixes.
            </p>
          </div>
          <div className={styles.uploadColumn}>
            <div
              className={`${styles.dropzone} ${drag ? styles.drag : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files.length !== 1) {
                  setError('Please choose one textbook or image at a time.');
                  return;
                }
                void open(e.dataTransfer.files[0]);
              }}
            >
              <div className={styles.uploadIcon}>
                <FileUp size={76} strokeWidth={1} />
                <UploadCloud className={styles.cloud} size={37} strokeWidth={1.5} />
              </div>
              <h2>Drop a PDF, JPG, or PNG here</h2>
              <p className={styles.fileHint}>Up to 100 MB · Analyze up to 10 pages</p>
              <input
                ref={input}
                className="visuallyHidden"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                tabIndex={-1}
                aria-label="Choose textbook file"
                onChange={(e) => void open(e.target.files?.[0])}
              />
              <button
                className="button primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <FolderOpen size={20} />
                {busy ? 'Opening your textbook…' : 'Choose file'}
              </button>
              <p className={styles.privacy}>
                <LockKeyhole size={18} />
                Processed privately in your browser
              </p>
            </div>
            <button className={styles.sampleLink} disabled={busy} onClick={() => void sample()}>
              Try the sample textbook <ArrowRight size={20} />
            </button>
            <div aria-live="polite">
              {error && (
                <p className="errorMessage" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
          <ol className={styles.steps}>
            {[
              {
                icon: FileUp,
                title: 'Upload pages',
                text: 'Add a PDF or image. Pages stay on your device.',
              },
              {
                icon: Eye,
                title: 'Compare simulations',
                text: 'Explore how the same page may appear across color vision differences.',
              },
              {
                icon: Scan,
                title: 'Improve confusing regions',
                text: 'Review flagged areas and get practical suggestions to improve clarity.',
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <Icon size={35} strokeWidth={1.5} />
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.preview} aria-labelledby="preview-title">
          <div className={styles.previewHeader}>
            <h2 id="preview-title">Preview: Visualizing color vision differences</h2>
            <span>
              Sample textbook page <BookOpen size={23} />
            </span>
          </div>
          <div className={styles.previewGrid}>
            {(['original', 'protan', 'deutan', 'tritan'] as Vision[]).map((mode) => (
              <div className={styles.previewCell} key={mode}>
                <h3>
                  <Eye size={19} />
                  {VISION_LABELS[mode]}
                </h3>
                <div className={styles.previewPage}>
                  <SamplePreview mode={mode} />
                </div>
              </div>
            ))}
          </div>
          <div className={styles.previewNote}>
            <Check size={15} /> Actual model simulations of an original PRISM sample · individual
            experiences vary
          </div>
        </section>
        <footer className={styles.footer}>
          <ShieldCheck size={24} strokeWidth={1.5} />
          <span>Educational accessibility analysis — not a medical diagnostic.</span>
        </footer>
      </main>
    </>
  );
}
