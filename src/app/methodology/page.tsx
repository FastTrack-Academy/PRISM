import Link from 'next/link';
import { SiteHeader } from '@/components/brand';
import { PCCI_ALGORITHM_VERSION } from '@/lib/pcci';

export const metadata = { title: 'How scoring works — PRISM PCCI Methodology' };

export default function Methodology() {
  return (
    <>
      <SiteHeader active="methodology" />
      <main id="main" className="article">
        <h1>A score you can look inside.</h1>
        <p className="lede">
          PRISM computes the <strong>Perceptual Color Confusion Index (PCCI)</strong>—an
          experimental, explainable measure of whether originally distinguishable colours in
          educational imagery lose perceptual separation under simulated Colour Vision Deficiency
          (CVD).
        </p>

        <h2>Two dimensions of educational accessibility</h2>
        <p>
          PRISM separates educational colour accessibility into two distinct dimensions:
        </p>
        <ol>
          <li>
            <strong>Perceptual colour confusion (implemented now via PCCI):</strong> whether
            distinct colours in an image collapse toward each other under simulated dichromacy.
          </li>
          <li>
            <strong>Contextual information accessibility (future work):</strong> whether text
            labels, symbols, shapes, patterns, borders, or legends compensate for colour confusion.
          </li>
        </ol>
        <p>
          PCCI intentionally measures <em>only</em> the first dimension. OCR, text recognition,
          border heuristics, and semantic assumptions do not modify PCCI scores.
        </p>

        <h2>Established scientific foundations vs. proposed PCCI methodology</h2>
        <table>
          <thead>
            <tr>
              <th>Pipeline stage</th>
              <th>Classification</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Perceptual colour space</td>
              <td>Established colour science</td>
              <td>Normalized sRGB → Linear RGB → CIE XYZ (D65) → CIELAB</td>
            </tr>
            <tr>
              <td>Representative palette extraction</td>
              <td>Established ML (Sculley, 2010)</td>
              <td>MiniBatch K-means in CIELAB space (K = 24, 50,000 samples, batch 4,096)</td>
            </tr>
            <tr>
              <td>Dichromacy simulation</td>
              <td>Established vision models</td>
              <td>
                Machado et al. (2009) for Deuteranopia &amp; Protanopia; Brettel et al. (1997)
                two-plane projection for Tritanopia in linear-light RGB
              </td>
            </tr>
            <tr>
              <td>Perceptual colour difference</td>
              <td>Established colour science</td>
              <td>Complete CIEDE2000 (ΔE₀₀) formula (Sharma et al., 2005)</td>
            </tr>
            <tr>
              <td>Pairwise confusion risk</td>
              <td>Proposed PCCI methodology</td>
              <td>
                Multiplicative loss × remaining-distance penalty: r = L × exp(−(D_cvd / τ)²)
              </td>
            </tr>
            <tr>
              <td>Spatial &amp; frequency weighting</td>
              <td>Proposed PCCI methodology</td>
              <td>
                Equal 50/50 blend of global cluster frequency (p_i × p_j) and multi-scale local
                spatial co-occurrence (offsets 2, 8, 16, 32 px across 4 directions)
              </td>
            </tr>
            <tr>
              <td>Image-level aggregation</td>
              <td>Proposed PCCI methodology</td>
              <td>Weighted upper-tail mean over top 10% of cumulative eligible pair weight</td>
            </tr>
          </tbody>
        </table>

        <h2>Step 1: Image preprocessing &amp; CIELAB colour space</h2>
        <p>
          The full-resolution image is preserved for visual inspection and export. For computation,
          PRISM creates an aspect-preserving copy with a maximum edge of <code>640 px</code>{' '}
          (without upscaling smaller images) using separable Lanczos-3 downsampling. In
          reference-compatible mode, transparent pixels are alpha-composited onto black to match
          the Python reference implementation (<code>prism_stage1.py</code>). Pixel values are
          normalized to <code>[0, 1]</code> sRGB and converted to perceptually uniform{' '}
          <strong>CIELAB</strong> using the D65 white point.
        </p>

        <h2>Step 2: Representative colour extraction (MiniBatch K-means)</h2>
        <p>
          Complex educational illustrations can contain hundreds of thousands of unique RGB values
          due to anti-aliasing and JPEG compression. PRISM fits{' '}
          <strong>MiniBatch K-means</strong> (Sculley, 2010) directly in CIELAB space with default
          settings <code>K = 24</code>, up to <code>50,000</code> randomly sampled pixels (fixed
          seed <code>42</code>), <code>3</code> k-means++ initializations, and batch size{' '}
          <code>4,096</code>. When an image contains fewer than 24 unique sampled colours,{' '}
          <code>K</code> is reduced automatically. Every computational pixel is assigned to its
          nearest centroid, producing both a compact colour palette and a spatial cluster-label
          mask. Fitted CIELAB centroids are converted back to gamut-clipped sRGB before distance
          computation to match the reference pipeline.
        </p>

        <h2>Step 3: Physiological CVD simulations</h2>
        <p>
          PRISM generates three independent full-dichromacy simulations in{' '}
          <strong>linear-light RGB</strong> (never gamma-encoded RGB), following the sequence{' '}
          <code>sRGB → Linear RGB → CVD transform → Clip [0, 1] → sRGB</code>:
        </p>
        <ul>
          <li>
            <strong>Deuteranopia:</strong> Machado, Oliveira, and Fernandes (2009), severity 1.0.
          </li>
          <li>
            <strong>Protanopia:</strong> Machado, Oliveira, and Fernandes (2009), severity 1.0.
          </li>
          <li>
            <strong>Tritanopia:</strong> Brettel, Viénot, and Mollon (1997) two-plane projection
            split by the linear-RGB separation normal <code>[7.92482, −5.66475, −2.26007]</code>.
          </li>
        </ul>
        <p>
          The exact same transformation functions power both the PCCI scoring engine and every
          displayed or exported simulated image.
        </p>

        <h2>Step 4 &amp; 5: CIEDE2000 &amp; multiplicative pairwise PCCI risk</h2>
        <p>
          For every pair of distinct representative clusters <code>(i, j)</code>, PRISM computes
          the full <strong>CIEDE2000</strong> perceptual distance (Sharma et al., 2005) between the
          original colours <code>D_original(i, j)</code> and between the simulated colours{' '}
          <code>D_cvd(i, j)</code>. A pair is eligible when <code>D_original ≥ 10</code> and both
          clusters individually occupy at least <code>0.5%</code> (<code>0.005</code>) of
          computational image pixels. Neutral colours are not excluded if they meet these
          thresholds.
        </p>
        <p className="formula">
          L = max(0, 1 − D_cvd / D_original)
          <br />
          A = exp(−(D_cvd / τ)²) &nbsp;&nbsp;(default τ = 12)
          <br />r = L × A &nbsp;&nbsp;∈ [0, 1]
        </p>
        <p>
          Because this formulation is <strong>multiplicative</strong>, a colour pair only receives
          high risk when it <em>both</em> loses a large fraction of its original separation (high{' '}
          <code>L</code>) <em>and</em> ends up perceptually close under CVD (small{' '}
          <code>D_cvd</code>, high <code>A</code>). Pairs that shift in appearance while remaining
          clearly distinguishable keep low pairwise risk.
        </p>

        <h2>Step 6–8: Global frequency &amp; multi-scale local spatial weighting</h2>
        <p>
          Not all colour pairs matter equally in a page layout. PRISM combines two normalized
          weighting mechanisms over eligible pairs:
        </p>
        <ul>
          <li>
            <strong>Global weight:</strong> <code>G(i, j) = p_i × p_j</code>, where{' '}
            <code>p_i</code> and <code>p_j</code> are cluster pixel proportions.
          </li>
          <li>
            <strong>Local spatial weight:</strong> symmetrized pixel-pair co-occurrence measured on
            the cluster-label mask across four spatial offsets (<code>2, 8, 16, 32 px</code>) and
            four directions—horizontal <code>(0, s)</code>, vertical <code>(s, 0)</code>, main
            diagonal <code>(s, s)</code>, and opposite diagonal <code>(s, −s)</code>. Offsets
            larger than the image dimensions are skipped without division by zero.
          </li>
        </ul>
        <p className="formula">
          W(i, j) = 0.5 × normalized_G(i, j) + 0.5 × normalized_S(i, j)
        </p>
        <p>
          The combined weights are normalized to sum to 1 across eligible pairs. If only one branch
          has measurable evidence (for example on a very small image), that branch alone is used.
        </p>

        <h2>Step 9: Weighted upper-tail aggregation</h2>
        <p>
          A textbook page often contains many unaffected background/text colour pairs alongside one
          critical red-green diagram conflict. Simple global averages dilute localized conflicts,
          while a raw maximum can overreact to tiny clusters. PRISM therefore aggregates eligible
          pairs using a <strong>weighted upper-tail mean</strong>:
        </p>
        <ol>
          <li>Sort all eligible colour pairs in descending order of pairwise risk <code>r</code>.</li>
          <li>
            Accumulate normalized pair weights <code>W</code> until exactly <code>10%</code> (
            <code>q = 0.10</code>) of <strong>cumulative pair weight</strong> (not 10% of pair
            count) has been selected, taking only the required fractional weight of the boundary
            pair.
          </li>
          <li>Compute the weighted mean risk over that 10% weight mass and multiply by 100.</li>
        </ol>
        <p className="formula">PCCI = 100 × WeightedTopMean_10%(r, W) &nbsp;&nbsp;∈ [0, 100]</p>
        <p>
          PRISM also reports two supplementary statistics per CVD type: <strong>Mean risk</strong>{' '}
          (<code>100 × Σ r × W</code>) and <strong>High-risk pair-weight share</strong> (
          <code>100 × Σ W</code> for pairs with <code>r ≥ 0.5</code>, which represents a share of
          eligible pair weight—not a percentage of image pixels).
        </p>

        <h2>Interpreting PCCI scores</h2>
        <p>
          PRISM produces three independent 0–100 scores—Deuteranopia, Protanopia, and
          Tritanopia—and never averages them into a single accessibility grade. Higher scores
          indicate greater estimated colour-confusion risk.
        </p>
        <table>
          <thead>
            <tr>
              <th>PCCI Score</th>
              <th>Provisional label (experimental default)</th>
              <th>Suggested interpretation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0 – &lt;20</td>
              <td>Low detected risk</td>
              <td>
                Lower estimated colour-confusion risk under the current model; still verify labels
                and fine details.
              </td>
            </tr>
            <tr>
              <td>20 – &lt;40</td>
              <td>Moderate risk</td>
              <td>
                Some colour relationships lose separation; inspect the top pairs in “Why this
                score?”.
              </td>
            </tr>
            <tr>
              <td>40 – &lt;60</td>
              <td>Elevated risk</td>
              <td>
                Substantial simulated perceptual collapse among weighted colour pairs; verify
                compensatory cues.
              </td>
            </tr>
            <tr>
              <td>60 – 100</td>
              <td>High risk</td>
              <td>
                Strong simulated confusion risk across top-weighted pairs; prioritize inspection
                and non-colour cues.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          When no colour pairs meet the eligibility thresholds (for example, a monochrome image),
          PRISM reports <code>0.0</code> together with an explicit <code>no-eligible-pairs</code>{' '}
          status. Zero detected risk is not proof of accessibility.
        </p>

        <h2>Experimental limitations &amp; disclaimers</h2>
        <ul>
          <li>
            PCCI scores are experimental estimates of potential colour confusion—not probabilities,
            medical diagnoses, or validated accessibility certifications.
          </li>
          <li>
            Full-dichromacy simulations approximate typical dichromat colour shifts and cannot
            reproduce every individual’s perception or anomalous trichromacy.
          </li>
          <li>
            Current parameters (<code>K = 24</code>, <code>τ = 12</code>, <code>q = 0.10</code>)
            and interpretation bands are research defaults and have not been clinically calibrated
            against human study ratings.
          </li>
          <li>
            A high PCCI score does not establish educational inaccessibility if text labels,
            patterns, or shapes clearly convey the same information; conversely, a low PCCI score
            does not guarantee comprehension.
          </li>
          <li>
            Because MiniBatch K-means uses randomized sampling and initialization, browser
            TypeScript clustering and Python <code>scikit-learn</code> clustering can produce
            small score variations (typically &lt; 2 points) on complex images even with identical
            scoring math.
          </li>
        </ul>

        <h2>References</h2>
        <ol>
          <li>
            Sculley, D. (2010). <em>Web-scale k-means clustering</em>. Proceedings of the 19th
            International Conference on World Wide Web (WWW &apos;10), 1177–1178.
          </li>
          <li>
            Machado, G. M., Oliveira, M. M., &amp; Fernandes, L. A. F. (2009).{' '}
            <em>A physiologically-based model for simulation of color vision deficiency</em>. IEEE
            Transactions on Visualization and Computer Graphics, 15(6), 1291–1298.
          </li>
          <li>
            Brettel, H., Viénot, F., &amp; Mollon, J. D. (1997).{' '}
            <em>Computerized simulation of color appearance for dichromats</em>. Journal of the
            Optical Society of America A, 14(10), 2647–2655.
          </li>
          <li>
            Sharma, G., Wu, W., &amp; Dalal, E. N. (2005).{' '}
            <em>
              The CIEDE2000 color-difference formula: Implementation notes, supplementary test
              data, and mathematical observations
            </em>
            . Color Research &amp; Application, 30(1), 21–30.
          </li>
          <li>
            Stevens, S. et al. (2024).{' '}
            <em>
              Identifying images in the biology literature that are problematic for people with a
              color-vision deficiency
            </em>
            . eLife / bioRxiv literature accessibility study.
          </li>
        </ol>

        <p className="note" style={{ marginTop: 28 }}>
          Algorithm version: <code>{PCCI_ALGORITHM_VERSION}</code>
        </p>

        <Link href="/" className="button primary" style={{ marginTop: 12 }}>
          Analyze an image or PDF
        </Link>
      </main>
    </>
  );
}
