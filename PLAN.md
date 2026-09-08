# PRISM Frontend MVP Plan

## Summary

Build PRISM as a privacy-first Next.js application for educators and science-fair judges. Users upload a PDF, JPG, or PNG; select up to 10 pages; receive explainable color-accessibility scores, three color-vision simulations, highlighted problem regions, preserve-first correction suggestions, and downloadable reports/corrected PDFs.

Use a fully static Next.js App Router export deployed from Netlify’s `out/` directory. No files, analysis results, API keys, serverless functions, accounts, or databases leave the browser. This architecture is supported by [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports) and [Netlify’s Next.js hosting](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## Product and UX

- Implement four static routes: `/` for upload, `/analyze` for the workspace, `/methodology` for scoring details, and `/about` for limitations and project context.
- Accept PDFs up to 100 MB and JPG/PNG images. Parse PDF thumbnails locally, then require selection of at most 10 pages before analysis.
- Follow the approved concepts exactly:
  - [Upload screen](C:/Users/61913/.codex/generated_images/01a07e86-e590-7d21-b0f0-e1d44a5f1210/exec-50d162c7-ebc1-4d27-a217-f6811e03b5d4.png)
  - [Desktop results](C:/Users/61913/.codex/generated_images/01a07e86-e590-7d21-b0f0-e1d44a5f1210/exec-b71130ad-f6a4-4e86-9fc3-7238cb7e1a05.png)
  - [Mobile results](C:/Users/61913/.codex/generated_images/01a07e86-e590-7d21-b0f0-e1d44a5f1210/exec-e1fdd9cd-ecd4-46a5-acfe-7d2af9b02db5.png)
- Desktop workspace: page rail, central zoomable document canvas, CVD tabs/split comparison, and issue inspector. Mobile: horizontal page picker, document canvas, scrollable simulation tabs, and bottom-sheet inspector.
- Analysis flow: upload → choose pages → process with per-page progress and cancel → review score/issues → preview selected fix → approve or revert → export.
- Report both each page’s score and a selection average. Call it a “textbook score” only when every page in the document was analyzed.
- Provide Original, Protanopia, Deuteranopia, and Tritanopia views, while clearly stating that simulations are approximations and the score is experimental—not medical or clinically validated.
- Meet WCAG 2.2 AA for the website itself: keyboard operation, visible focus, 44px touch targets, accessible progress announcements, reduced-motion support, and no color-only status communication. Use 4.5:1 normal-text and 3:1 large-text/non-text contrast baselines from [W3C guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).

## Analysis and Correction Engine

- Render PDF pages locally with PDF.js, which exposes browser-based page loading and canvas rendering ([PDF.js examples](https://mozilla.github.io/pdf.js/examples/)). Analyze a downsampled copy with a maximum 1,400px long edge while keeping a higher-resolution render for viewing/export.
- Run intensive work in dedicated Web Workers. Dynamically load PDF, OCR, and export packages only after upload so the landing page stays lightweight.
- Port the notebook baseline into TypeScript:
  - Fixed `K=8` sampled K-means palette extraction.
  - Connected-components splitting so distant objects with the same color remain separate.
  - Remove regions below 0.05% of page area, build four-neighbor adjacency, and compare only region pairs sharing a meaningful boundary.
  - Simulate severity-100 protan, deutan, and tritan vision and validate results against golden outputs generated from the existing Colorspacious notebooks.
  - Compute CIEDE2000 distance and separation-retention ratios for each adjacent pair.
  - Run English OCR through one reusable browser worker; Tesseract.js supports browser/WebAssembly workers and reuse across images ([Tesseract.js](https://github.com/naptha/tesseract.js)).
- Calculate the experimental page score:
  - `Overall = round(0.60 × Separation + 0.25 × Contrast + 0.15 × Redundancy)`.
  - For each adjacent pair and CVD type: `absoluteRisk = clamp((12 − simulatedΔE)/12)` and `retentionRisk = clamp((0.60 − simulatedΔE/normalΔE)/0.60)`.
  - Pair risk is the worst CVD result of `0.70 × absoluteRisk + 0.30 × retentionRisk`, weighted by shared-boundary length and smaller-region area. Separation is `100 × (1 − weighted mean risk)`.
  - Contrast scores OCR text/background relationships against 4.5:1 or 3:1 and important graphical boundaries against 3:1.
  - Redundancy checks whether risky relationships also have a strong outline, texture/pattern, shape marker, or nearby text label; risky color-only relationships receive zero redundancy credit.
  - Score bands: 80–100 “Strong,” 60–79 “Review,” and 0–59 “High confusion risk.” Keep all constants in a versioned scoring configuration for later calibration.
- Generate preserve-first fixes in this order: dark outline, pattern/shape cue, text/background contrast adjustment, then minimal recoloring.
- For recoloring, evaluate the notebook’s candidate palette using `J = 0.65 × residual risk + 0.25 × normalized color change + 0.10 × changed area`. Offer a fix only if it improves the predicted page score by at least five points and creates no new major issue.
- Never apply corrections automatically. Each issue supports preview, approve, revert, and before/after CVD comparison.
- Export:
  - A PRISM report PDF containing methodology version, selected-page scores, issue evidence, recommendations, and limitations.
  - A corrected full PDF in which approved selected pages are replaced with flattened page images while unselected pages remain copied from the original. Corrected pages may lose searchable/selectable text; disclose this before download.
  - Create PDFs locally with `pdf-lib`, which supports browser-side image embedding and serialization ([pdf-lib browser usage](https://github.com/Hopding/pdf-lib/blob/master/README.md?plain=1)).

## Interfaces and Architecture

- Use strict TypeScript, CSS Modules with shared design tokens, custom accessible primitives, and a consistent line-icon family. Avoid a general UI kit so the implementation can match the accepted concepts precisely.
- Keep raw files, canvases, object URLs, results, and corrections in memory only. Revoke object URLs and release page canvases as soon as they are no longer needed.
- Define stable domain contracts:
  - `AnalysisConfig`: selected pages, CVD modes, English OCR, analysis resolution, scoring-version identifier.
  - `PageAnalysis`: page number, overall/component scores, confidence, issues, simulation handles, processing duration.
  - `ConfusionIssue`: region pair/masks, bounding box, affected CVD modes, ΔE values, retention ratios, severity, explanation, suggestions.
  - `CorrectionProposal`: outline/pattern/contrast/recolor operation, parameters, expected score delta, visual-change cost, approval state.
  - `AnalysisSession`: document metadata, queue/progress state, page results, selection summary, worker errors.
- Use a typed worker protocol: `START_SESSION`, `ANALYZE_PAGE`, `PAGE_PROGRESS`, `PAGE_RESULT`, `CANCEL`, and `ERROR`.
- Handle corrupted/password-protected PDFs, unsupported formats, files over 100 MB, more than 10 selected pages, worker/OCR failures, insufficient memory, and export failures with recoverable messages. Preserve completed page results if a later page fails.
- If OCR or redundancy detection has insufficient evidence, mark the component confidence as low instead of silently presenting it as certain.
- Use the notebook-generated synthetic diagrams as public demo fixtures. Do not ship the supplied commercial textbook cover publicly unless usage rights are confirmed.

## Test Plan and Acceptance Criteria

- Unit-test RGB/Lab conversion, CIEDE2000 reference pairs, CVD matrices against Python/Colorspacious golden fixtures, clustering determinism, adjacency, scoring bands, correction optimization, and worker cancellation.
- Test the synthetic notebook diagrams for known red/green conflicts, distant same-color regions, weak captions, patterned alternatives, safe pages, and pages containing photos rather than diagrams.
- Integration-test PDF/image upload, page selection enforcement, sequential processing, progress, CVD tabs, split/slider view, issue overlays, approve/revert, report export, and corrected full-PDF reconstruction.
- Verify corrupted and encrypted PDFs, OCR with no detected text, worker crashes, repeated analyses, mobile memory pressure, and navigation/reload behavior.
- Run Playwright tests at desktop, tablet, and mobile sizes; compare screenshots with all three approved concepts and fix visual drift before handoff.
- Run automated accessibility checks plus manual keyboard, screen-reader labeling, zoom, high-contrast, and reduced-motion checks.
- Performance acceptance: the interface remains responsive throughout analysis; only one full-resolution page and one analysis buffer are retained at a time; heavy libraries are absent from the initial landing bundle.
- Deployment acceptance: `npm run build` produces a static `out/` directory, Netlify serves all four routes, workers/WASM load from the same origin, and browser network inspection confirms that uploaded document contents never leave the device.

## Assumptions

- MVP analysis is limited to 10 user-selected pages per run.
- OCR is English-only.
- Suggestions prioritize preservation over maximum recoloring.
- The “AI” claim refers to explainable unsupervised computer vision and OCR; generative AI, SAM, hosted models, semantic object naming, user accounts, saved history, collaboration, and cloud storage are deferred.
- Scoring constants are an explicit experimental baseline to be calibrated later against synthetic test cases and ratings from people with relevant color-vision deficiencies.
