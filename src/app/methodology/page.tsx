import Link from 'next/link';
import { SiteHeader } from '@/components/brand';
export const metadata = { title: 'How scoring works — PRISM' };
export default function Methodology() {
  return (
    <>
      <SiteHeader active="methodology" />
      <main id="main" className="article">
        <h1>A score you can look inside.</h1>
        <p className="lede">
          PRISM measures potential color confusion. Every score is an experimental estimate with
          evidence you can inspect.
        </p>
        <h2>From pixels to perception</h2>
        <p>
          Pages are rendered at a maximum edge of 1,400 pixels. Sampled K-means finds eight dominant
          colors; connected components separate distant regions that happen to share a color. Very
          small regions below 0.05% of the page are excluded. We compare neighboring regions,
          including pairs separated by thin outlines.
        </p>
        <p>
          Protanopia, deuteranopia, and tritanopia simulations use the severity-100 matrices from{' '}
          <a href="https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html">
            Machado, Oliveira, and Fernandes (2009)
          </a>
          , applied in linear-light sRGB. These are computational approximations, not a view into
          any one person’s experience.
        </p>
        <h2>Three parts, one experimental score</h2>
        <p className="formula">Score = 60% separation + 25% contrast + 15% redundancy</p>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>What it measures</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Separation · 60%</td>
              <td>
                How distinguishable nearby colors remain in the worst of three simulations, measured
                using CIEDE2000 (ΔE).
              </td>
            </tr>
            <tr>
              <td>Contrast · 25%</td>
              <td>
                Estimated light–dark contrast for detected text and colored region boundaries.
              </td>
            </tr>
            <tr>
              <td>Redundancy · 15%</td>
              <td>
                Whether risky color relationships also have a detected outline or nearby label.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          If a component has no measurable evidence, it is shown as N/A and the remaining weights
          are normalized. A blank page receives no overall score. A page with no detected problems
          still needs human review.
        </p>
        <h2>Color-separation risk</h2>
        <p>
          For each pair, absolute risk is <code>clamp((12 − simulated ΔE) / 12)</code>. Retention
          risk is <code>clamp((0.60 − simulated ΔE / original ΔE) / 0.60)</code>. Clamp restricts a
          value to 0–1. We combine these as 70% absolute risk and 30% retention risk, choosing the
          highest risk across the three simulations.
        </p>
        <p>
          Pairs already nearly identical in the original (ΔE below 3) and pairs of neutral colors
          are excluded from this CVD-specific check. Each pair is weighted by its boundary length
          multiplied by the square root of the smaller region’s area. Separation equals 100 × (1 −
          weighted average risk).
        </p>
        <h2>Contrast and non-color cues</h2>
        <p>
          We use native PDF text positions when available and local English OCR otherwise. Text
          contrast is estimated from dark and light pixel samples inside detected text boxes. The
          reference targets are 4.5:1 for ordinary text, 3:1 for native PDF text at least 18 points
          high, and 3:1 for colored graphical boundaries. OCR text uses the conservative 4.5:1
          target.
        </p>
        <p>
          Where both are available, text contributes 70% and graphical boundaries 30% of the
          contrast component. These references come from{' '}
          <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">
            W3C contrast guidance
          </a>
          . Raster samples do not establish WCAG conformance.
        </p>
        <p>
          Redundancy is a heuristic: a nearby label may be unrelated, and an outline may not carry
          the information needed to understand a diagram. Patterns and shape meaning are not
          automatically verified. Relationships between a distant legend and a chart also require
          human review.
        </p>
        <h2>Interpreting the result</h2>
        <table>
          <thead>
            <tr>
              <th>Score</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>80–100 · Strong</td>
              <td>Lower estimated risk under the available checks.</td>
            </tr>
            <tr>
              <td>60–79 · Review</td>
              <td>Potential confusion warrants closer inspection.</td>
            </tr>
            <tr>
              <td>0–59 · High confusion risk</td>
              <td>Prioritize the highlighted regions for review.</td>
            </tr>
          </tbody>
        </table>
        <p>
          These bands and weights are research defaults, not clinically calibrated thresholds. The
          selection average includes only successfully scored pages. It is called a textbook score
          only when every page has a numeric score.
        </p>
        <h2>Corrections that preserve the page</h2>
        <p>
          PRISM tests dark outlines first, then striped patterns, then a small candidate recoloring
          palette. Each candidate is rendered, segmented again, and scored. A suggestion needs at
          least a five-point page improvement and no newly detected major issues. This check can
          miss changes in meaning, so you must preview and approve each change.
        </p>
        <p>
          Recoloring candidates minimize 65% remaining risk, 25% perceptual color change, and 10%
          affected area. Text-bearing regions, large backgrounds, and textured regions are excluded
          from automatic changes. Automatic text editing is unavailable; text issues receive
          source-edit recommendations.
        </p>
        <p>
          Corrected or simulated PDF pages are flattened visual review copies. Unchanged PDF pages
          are copied from the original. Keep the original for selectable text, document tags, and
          assistive technology.
        </p>
        <h2>Version and validation</h2>
        <p>
          Scoring version: <code>PRISM-0.1.0</code>. The implementation is checked against published
          CIEDE2000 examples and Colorspacious simulation outputs. Scientific calibration against
          ratings from people with color vision deficiencies remains future work.
        </p>
        <Link href="/" className="button primary">
          Explore a textbook
        </Link>
      </main>
    </>
  );
}
