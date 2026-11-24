# PRISM — Perceptual Color Confusion Index (PCCI)

**PRISM** (*Perceptual Recoloring for Inclusive School Materials*) is a browser-local Next.js scientific web application for estimating colour-confusion risks in educational images and textbook PDFs for individuals with Colour Vision Deficiency (CVD).

All computation runs locally in the user's browser using Web Workers—no account, external AI API, or document upload to any server is required.

---

## Scientific architecture

PRISM separates educational accessibility into two dimensions:

1. **Perceptual colour confusion (implemented via PCCI):** whether originally distinguishable colours collapse toward each other under simulated full dichromacy.
2. **Contextual information accessibility (future work):** whether text labels, symbols, shapes, patterns, borders, or legends compensate for colour confusion.

PCCI produces **three independent 0–100 risk scores**—**Deuteranopia**, **Protanopia**, and **Tritanopia**—where higher scores indicate greater estimated colour-confusion risk. OCR, text recognition, and heuristic redundancy checks do not modify PCCI scores.

### Algorithm pipeline (`PCCI-1.0.0-stage1`)

1. **Preprocessing (`src/lib/pcci/preprocess.ts`)**: Preserves original high-resolution imagery for visualization/export. Creates a computational image downsampled with separable **Lanczos-3** to a maximum edge of `640 px` (aspect preserved, never upscaled). Transparent pixels are composited onto black in reference-compatible mode (matching `prism_stage1.py`).
2. **Colour space (`src/lib/pcci/colorspace.ts`)**: Normalized `[0, 1]` sRGB → Linear RGB → CIE XYZ (D65) → CIELAB (`skimage.color`-compatible matrices and transfer functions).
3. **Representative colour extraction (`src/lib/pcci/kmeans.ts`)**: Deterministic **MiniBatch K-means** (Sculley, 2010) in CIELAB space (`K = 24`, max `50,000` sampled pixels, seed `42`, `n_init = 3`, `batch_size = 4,096`, automatic K reduction when fewer than 24 unique colours exist). Fitted Lab centroids are converted back to gamut-clipped sRGB prior to distance evaluation.
4. **Physiological CVD simulation (`src/lib/pcci/cvd.ts`)**: Applied in linear-light RGB (`sRGB → Linear → CVD → Clip [0, 1] → sRGB`):
   - **Deuteranopia**: Machado, Oliveira & Fernandes (2009), severity 1.0.
   - **Protanopia**: Machado, Oliveira & Fernandes (2009), severity 1.0.
   - **Tritanopia**: Brettel, Viénot & Mollon (1997), two-plane projection.
   The exact same functions drive both scoring and displayed/exported simulations.
5. **CIEDE2000 & Pairwise PCCI risk (`src/lib/pcci/ciede2000.ts`, `src/lib/pcci/risk.ts`)**: Complete CIEDE2000 (Sharma et al., 2005). Eligible pairs require `D_original ≥ 10` and both clusters occupying `≥ 0.5%` (`0.005`) of pixels. Multiplicative pairwise risk:
   - `L = max(0, 1 - D_cvd / D_original)`
   - `A = exp(-(D_cvd / τ)²)` (`τ = 12`)
   - `r = L × A`
6. **Global & local spatial weighting (`src/lib/pcci/spatial.ts`)**:
   - Global frequency weight `G(i, j) = p_i × p_j`
   - Multi-scale spatial co-occurrence `S(i, j)` across offsets `2, 8, 16, 32 px` in four directions `(0, s)`, `(s, 0)`, `(s, s)`, `(s, -s)` (skipping offsets larger than image dimensions to avoid division by zero)
   - Combined weight `W = 0.5 × norm(G) + 0.5 × norm(S)`, renormalized to 1.
7. **Weighted upper-tail aggregation (`src/lib/pcci/risk.ts`)**:
   - `PCCI = 100 × WeightedTopMean_10%(r, W)` over the top **10% of cumulative eligible pair weight** (not pair count), including exact fractional weight at the boundary.
   - Supplementary metrics: weighted mean risk (`100 × Σ r × W`) and high-risk pair-weight share (`100 × Σ W` for `r ≥ 0.5`, representing eligible pair weight share rather than image pixel percentage).

---

## Validation & Regression Summary

- **Frozen-intermediate parity** (exact Python palette & label masks fed into TypeScript scoring across all 9 reference images / 27 scores): matches Python `prism_stage1.py` within floating-point precision (`max |err| = 3.89 × 10⁻⁵` vs `prism_stage1_results.csv`, `< 10⁻¹⁴` vs local Python).
- **End-to-end 9-image regression** (raw RGBA → TypeScript Lanczos-3 → TypeScript MiniBatch K-means → TypeScript PCCI vs `prism_stage1_results.csv`):
  - **Overall MAE**: `1.18` points across all 27 scores (`139–286 ms` per image in Node/V8).
  - **24 of 27 scores (8 of 9 images)** achieve `< 2.0` points absolute error (MAE `0.69` across those 24 scores).
  - **Documented deviation**: On *Food and health* (`487 × 630`), TypeScript scores (`6.5 / 5.3 / 54.4`) sit inside `scikit-learn`'s own multi-seed clustering variance (`~4.9 / 3.4 / 56.7` across Python seeds `0, 1, 7, 123`), whereas Python `seed=42` splits a marginal pinkish/neutral cluster at `13.3 / 9.5 / 59.1`. No scoring formula was modified to fit this variance.
  - **Small-image edge-case fix**: Spatial co-occurrence skips offsets larger than image width/height and normalizes by the count of valid `(offset, direction)` combinations instead of a hardcoded `16`, preventing division by zero on very small images.

---

## Run Locally

Requires **Node.js 22.13+** (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The `predev`/`prebuild` hook copies same-origin PDF.js worker, fonts, and WASM assets into `public/vendor/`.

### Verify tests, typecheck, and production build

```sh
npm run typecheck
npm test
npm run test:regression   # Runs 9-image parity checks when PRISM_REFERENCE_DIR is present
npm run build
npm start                 # Serves static out/ on http://127.0.0.1:4173
```

---

## Deploy on Netlify

`netlify.toml` is preconfigured for static export:

- **Build command**: `npm run build`
- **Publish directory**: `out`
- **Node version**: `24` (`NETLIFY_NEXT_PLUGIN_SKIP = "true"`)
- **Security headers**: Strict same-origin CSP (`worker-src 'self' blob:`, `'wasm-unsafe-eval'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
- **No backend, secrets, or environment variables** are required. Private reference images and benchmark plates are **not** bundled into the public build.

---

## Project Structure

- `src/lib/pcci/` — Independent, testable PCCI scientific computation modules (`types`, `colorspace`, `cvd`, `ciede2000`, `preprocess`, `kmeans`, `spatial`, `risk`, `analyze`, `serialize`).
- `src/workers/pcci.worker.ts` & `src/workers/sim.worker.ts` — Background Web Workers for clustering/scoring (with intermediate feature caching for fast parameter recalculation) and full-resolution CVD rendering.
- `src/components/pcci/` — Three-score PCCI dashboard, 4-image & side-by-side simulation viewer with risk localization overlay, "Why this score?" colour-pair table, CIELAB palette explorer, multi-page PDF summary table, and experimental research mode panel.
- `src/app/` — Statically exported routes (`/`, `/analyze/`, `/methodology/`, `/about/`, plus archived `/figure/`).
- `tests/pcci.test.ts` & `tests/pcci-regression.test.ts` — Automated unit, synthetic image, and reference regression tests.

---

## Research Limitations & Disclaimers

- PRISM provides **experimental estimates** of potential colour confusion, not clinical diagnoses, probabilities, or accessibility certifications.
- Computational CVD simulations cannot exactly reproduce every individual's visual perception.
- A high PCCI score does not establish educational inaccessibility, and a low PCCI score does not guarantee educational accessibility.
- Current scoring parameters (`K = 24`, `τ = 12`, `q = 0.10`) and provisional risk bands (`0–<20`, `20–<40`, `40–<60`, `60–100`) have not been clinically calibrated.
- Contextual comprehension and compensatory visual cues (text labels, symbols, shapes, patterns, legends) require separate assessment.
