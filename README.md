# PRISM — Perceptual Recoloring for Inclusive School Materials

A purely frontend Next.js app for exploring textbook color accessibility. Created by Ella; the research notebooks remain in `code resource/`.

## Run locally

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The predev/prebuild scripts copy the PDF worker, fonts, WASM, English OCR model, and OCR worker into `public/vendor/`. They are served from the same origin; no CDN, model API, secrets, or backend is needed.

For a production preview:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4173. This optional local preview server serves the static `out/` directory and mirrors the Netlify security policy; it is not deployed.

## Deploy on Netlify

Connect this repository and use its `netlify.toml`: build command `npm run build`, publish directory `out`, Node 24. No environment secrets or Netlify Functions are required. The Next.js runtime adapter is disabled because the site is a static export. Browser workers and WASM must be served with the included headers. Deployment itself is not performed by this project setup.

## What works

- PDF, JPG, and PNG import, up to 100 MB; paginated thumbnail selection and a maximum of 10 selected pages per run.
- Sequential worker-based processing with progress, cancellation, recoverable per-page errors, and completed-result retention.
- Severity-100 protanopia, deuteranopia, and tritanopia simulations using Machado matrices; zoom and original/simulated comparison.
- Deterministic sampled K-means, connected regions, local adjacency, CIEDE2000 comparisons, English OCR, and experimental 0–100 scoring.
- Numbered issue overlays, measured evidence, source-edit guidance, preserve-first correction search, user approval, and reversion.
- Local report PDF, corrected PDF, and simulated PDF downloads. Unchanged PDF pages are copied; transformed pages are rasterized visual review copies.
- Desktop, tablet, and mobile layouts; keyboard controls and screen-reader labels; methodology and project context routes.

All document content and results stay in tab memory. Refreshing or closing the tab clears the session. No analytics or document persistence are included. Synthetic sample diagrams are original PRISM fixtures; the existing commercial cover images are not included in the public app.

## Research limitations

The score is experimental, not a clinical measure or accessibility certification. See `/methodology/` for formulas, thresholds, weights, and missing-evidence behavior. Region analysis cannot identify semantic objects, establish that nearby labels have the right meaning, or reliably match distant legends. OCR/raster contrast is approximate; photographs and tiny features need manual review. Redundancy currently measures outline/nearby-label evidence, not semantic pattern/shape recognition.

Automatic correction evaluates the three highest-risk color relationships, prioritizing outlines, patterns, then candidate recolors. It excludes detected text-bearing, large, or highly textured regions. Every proposed correction must improve the page score by at least five points and pass a spatial region-correspondence check for new major issues. These guards do not prove semantic correctness. Automatic text editing is deliberately unavailable; text issues get source-edit guidance. The UI always requires review and approval.

Corrected or simulated pages lose selectable text, tags, and original vector structure. Keep the original for assistive technology. The experimental model still needs validation with people who have color vision deficiencies.

## Structure

- `src/app`: the four statically exported routes and global design tokens.
- `src/components`: shared branding/session state, upload surface, selection, document viewer, and review workspace.
- `src/lib`: color math, segmentation/scoring/corrections, local documents, English OCR, sample fixtures, and export.
- `src/workers`: analysis and preview workers; CPU work stays off the UI thread.
- `tests`: numerical regression tests and browser workflow tests.

## Verify

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

Browser tests use an installed Chrome with Playwright. Start `npm run dev` in another terminal, then run `npm run test:e2e`. To exercise the static export and security policy instead, run `npm start`, set `PRISM_TEST_URL=http://127.0.0.1:4173`, and run `npm run test:e2e`.

The browser suite checks upload/selection, real PDF parsing, cancellation/retry, simulations, measured correction approval, downloaded PDF parsing/page preservation, OCR failure fallback, private network behavior, mobile reflow, and axe accessibility scans. Screenshots and downloads are written to the OS temporary directory.

Color tests include published Sharma CIEDE2000 pairs and golden simulation outputs generated from Colorspacious 1.1.2 using the notebook conversion direction. See `tests/engine.test.ts`.

## Design implementation

The interface follows the approved white/ink/blue visual system, editorial upload composition, three-pane desktop review workspace, and mobile page-picker/inspector layout. Intentional data-driven differences: scores/issues are computed, region names use IDs because semantics are unknown, and original reproducible educational fixtures replace the illustrative concept artwork. Corrected whole-PDF export replaces the concept's single-page action, as selected in the implementation plan.
