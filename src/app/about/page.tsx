import Link from 'next/link';
import { SiteHeader } from '@/components/brand';

export const metadata = { title: 'About — PRISM' };

export default function About() {
  return (
    <>
      <SiteHeader active="about" />
      <main id="main" className="article">
        <h1>
          More ways to see.
          <br />
          More ways to learn.
        </h1>
        <p className="lede">
          PRISM stands for Perceptual Recoloring for Inclusive School Materials. It helps educators
          and researchers investigate potential colour-confusion risks in educational images and
          textbook pages for individuals with Colour Vision Deficiency (CVD).
        </p>

        <h2>Scientific architecture</h2>
        <p>
          Created by Ella, PRISM evolved from Python colour-science experiments into an interactive,
          reproducible browser application implementing the{' '}
          <strong>Perceptual Color Confusion Index (PCCI)</strong>.
        </p>
        <p>
          PRISM distinguishes two dimensions of educational accessibility: (1){' '}
          <em>perceptual colour confusion</em>—whether originally distinct colours collapse under
          simulated dichromacy—and (2) <em>contextual information accessibility</em>—whether labels,
          symbols, shapes, patterns, and legends compensate for colour confusion. The current
          application focuses strictly on an explainable, reproducible implementation of the first
          dimension, generating independent 0–100 PCCI risk scores for Deuteranopia, Protanopia,
          and Tritanopia.
        </p>

        <h2>Privacy-first, browser-local processing</h2>
        <p>
          Every step—PDF rendering, Lanczos-3 downsampling, CIELAB MiniBatch K-means clustering,
          Machado &amp; Brettel CVD simulation, CIEDE2000 scoring, and CSV/JSON/PNG/PDF export—runs
          locally inside your browser using Web Workers. No account, external AI API, server
          upload, or analytics tracking is required.
        </p>
        <p>
          Files and analysis results remain strictly in tab memory. Download your CSV, JSON, PNG,
          or PDF exports before closing or refreshing the tab.
        </p>

        <h2>Research scope &amp; future work</h2>
        <p>
          PRISM provides experimental estimates, not clinical diagnoses or accessibility
          certifications. A high PCCI score does not establish that a diagram is inaccessible if
          alternative visual cues convey the same information, and a low PCCI score does not
          guarantee accessibility. Future research will explore human calibration studies with
          individuals who have CVD as well as multimodal contextual assessment of labels, legends,
          and patterns.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <Link href="/methodology/" className="button primary">
            Read the PCCI methodology
          </Link>
          <Link href="/" className="button outline">
            Analyze an image or PDF
          </Link>
        </div>

        <details style={{ marginTop: 34, fontSize: 13, color: 'var(--muted)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            Archived / experimental prototypes (separate from PCCI)
          </summary>
          <p style={{ marginTop: 10 }}>
            An earlier figure-crop prototype remains available at{' '}
            <Link href="/figure/">/figure/</Link> for historical comparison. It is separate from the
            PCCI scoring engine and does not influence PCCI results.
          </p>
        </details>
      </main>
    </>
  );
}
