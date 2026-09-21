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
          investigate how textbook colors can make learning easier—or harder.
        </p>
        <h2>A research project, made approachable</h2>
        <p>
          Created by Ella, PRISM began with Python experiments exploring pixels, color clustering,
          vision simulation, and spatial regions. This website brings those ideas into an
          interactive workspace for teachers, students, and science-fair reviewers.
        </p>
        <p>
          The current system combines unsupervised color clustering, English text recognition, and
          explicit color-science measurements. It does not understand a diagram’s scientific
          meaning. Its findings are starting points for review.
        </p>
        <h2>Your textbook stays with you</h2>
        <p>
          Your file is processed in your browser. There are no accounts, document uploads to a
          server, analytics, or stored document history. PDF and OCR processing resources load from
          this website; your textbook content is never sent with those requests.
        </p>
        <p>
          Files and results exist only in this tab’s memory. Download your report or corrected copy
          before closing or refreshing the tab.
        </p>
        <h2>Designed for a thoughtful first step</h2>
        <p>
          Analyze up to 10 pages at a time from one PDF, JPG, or PNG under 100 MB. Diagrams, charts,
          and maps are useful starting points. Photographs, tiny details, complex scanned layouts,
          and non-English text are more difficult to assess reliably.
        </p>
        <p>
          Color vision varies among individuals and viewing conditions. A simulation cannot
          reproduce exactly what another person sees. Involving people with color vision
          deficiencies in evaluation is essential to developing the research further.
        </p>
        <Link href="/methodology/" className="button outline">
          Read the scoring methodology
        </Link>
      </main>
    </>
  );
}
