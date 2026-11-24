# PRISM CVD calibration pilot

**Current experiment: Stage 1, color separation only.** Use the [Stage 1 protocol](stage1.md), [image assignments](study-bank.json), and [per-profile measurements](stage1-colors.csv). Eight cue-added images are reserved for Stage 2. The page-score calibration and participant protocol below document earlier exploratory work.

This is a **20-image pilot bank** for checking whether PRISM's page score agrees with the task a reader needs to perform. The figure lab bundles plate 09 as its public-domain demonstration. The rest of the bank stays outside the website. Each image has a task and answer key in [`manifest.json`](manifest.json). The `expected_label` is a **provisional design label**, not a rating from a person with color vision deficiency (CVD).

| Category | Images | Coverage |
| --- | ---: | --- |
| Ishihara plates | 4 | One control, two ordinary red-green challenge plates, one reverse plate |
| Nature photographs | 4 | Two real photographs, each with a color-only and an explicitly marked variant |
| Textbook figures | 4 | Cell transport and land-use map, each as a controlled pair |
| Scientific posters | 4 | Ecology chart and cell-marker image, each as a controlled pair |
| Humanities posters | 4 | Migration timeline and museum route map, each as a controlled pair |

The cell-marker and museum-route pairs use colors selected to stress the tritan simulation. The other controlled pairs focus on protan and deutan ambiguity. The Ishihara plates are **stress cases** for color discrimination. They should not dominate a threshold fitted for educational materials, and digital copies must not be used to diagnose anyone.

## Files and reproducibility

- `images/*.png`: upload-ready benchmark images.
- `contact-sheet.jpg`: quick visual index of all 20 images.
- `sources/*.img`: cached source downloads for the four plates and two photographs. These retain the fetched image bytes; `build-benchmark.py` checks the live Commons license metadata on each rebuild.
- `manifest.json`: image ID, task, answer key, expected label, label basis, target CVD modes, pair ID, source page, license, dimensions, and SHA-256 hash.
- `ratings-template.csv`: blank response form. Give raters the images and task prompts, without the manifest's expected labels or answers.
- `score-baseline.csv`: first diagnostic pass of PRISM 0.1.0.

Build with `python scripts/build-benchmark.py` (Python 3, Pillow, requests). Run the diagnostic scoring pass with `npx tsx scripts/score-benchmark.ts` (also requires Python and Pillow). The diagnostic pass resizes each image to a 700 px maximum edge and calls `segment` and `evaluate` without OCR. It is **not equivalent to the full app pipeline**, which uses up to 1400 px and may include OCR. Keep this setting fixed while comparing changes to the scoring code. Run the app pipeline separately before drawing product conclusions.

## What the first pass found

At the current **80-point “Strong”** threshold, the no-OCR pass disagreed with 11 of the 20 provisional labels: 9 candidate-bad images were scored good, and 2 candidate-good images were scored bad. Notable examples:

| Case | Candidate bad | Candidate good | Why it is useful |
| --- | ---: | ---: | --- |
| Ishihara 74/21 plate | 96 | — | A color-only numeral can get a very high score. |
| Textbook land-use map | 100 | 100 | Adding labels inside the map has no effect on this pass. |
| Ecology chart | 84 | 84 | Direct series names and marker shapes have no effect. |
| Humanities timeline | 100 | 100 | The distant legend relationship is missed. |
| Museum route map | 76 | 73 | The clearer version even scores lower. |

These are **model-to-design disagreements**, not validated false positives or false negatives. The score may change when OCR is included, and the candidate labels still need CVD participant review. The result already shows why changing only the 80-point cutoff cannot solve every case: some paired examples receive identical scores, and one improves for readers while its score falls.

## Human labeling protocol

1. Recruit people with known or self-reported protan, deutan, and tritan CVD; record subtype and severity when known. Include a normal-color-vision comparison group, but do not use its responses as CVD ground truth. Start with at least three CVD reviewers per relevant subtype for a pilot, then increase before fitting a threshold.
2. Show each person **one variant per matched pair**, balanced across people, so the accessible variant does not teach the answer to the color-only variant. Randomize image order. Show the four plates separately; ask whether participants already know them.
3. Ask the task printed on the image. Record the exact answer, correctness against the answer key, response time, difficulty from 1 (easy) to 5 (impossible), whether color was needed, and a short explanation. Use `ratings-template.csv`; copy its rows for each participant.
4. Before fitting, define a **good** image as one where at least 80% of reviewers in the relevant subtype answer correctly with median difficulty at most 2. Define **bad** as at most 50% correct or median difficulty at least 4. Leave the rest **uncertain**. Keep subtype-specific labels; a single pooled label can hide a tritan failure.
5. Review wrong answers and comments. Exclude cases with a flawed question, unclear answer key, prior plate memorization, or a problem unrelated to color. Keep excluded cases in the manifest with a reason.

Do not adjust scoring weights from this 20-image bank alone. Expand it with authentic classroom pages and real posters, preserve source/license records, and split by **source document or matched pair** before tuning. Fit on one split; report sensitivity for bad images, specificity for good images, calibration by score band, and paired score direction on a held-out split. Keep Ishihara results separate from ordinary content results. The central outcome is whether a person can complete the stated task, not whether two pixels differ.

This design follows findings that scientific-image accessibility needs subjective review and that figures can fail when color carries meaning without redundant cues: [Stevens et al., eLife (2024)](https://elifesciences.org/articles/95524), [IEEE visualization study (2026)](https://ieeexplore.ieee.org/document/11268348/), and [PLOS guidance on redundant coding](https://doi.org/10.1371/journal.pcbi.1013657).

## Source and reuse notes

The six external sources are listed per item in the manifest and checked against Wikimedia Commons metadata as public domain at build time. They are [Ishihara plate 1](https://commons.wikimedia.org/wiki/File:Ishihara_1.svg), [plate 9](https://commons.wikimedia.org/wiki/File:Ishihara_9.svg), [plate 11](https://commons.wikimedia.org/wiki/File:Ishihara_11.PNG), [plate 19](https://commons.wikimedia.org/wiki/File:Ishihara_19.PNG), [NPS red and green leaves](https://commons.wikimedia.org/wiki/File:Red_and_Green_(55619730005).jpg), and [NPS sumac and beautyberry](https://commons.wikimedia.org/wiki/File:Sumac_and_Beauty_Berry_(172b20e9-1dfb-47f8-89d1-ee9174131b8b).JPG). The textbook and poster figures are original PRISM fixtures. The Ishihara answer references are the [plate instructions](https://web.stanford.edu/group/vista/wikiupload/0/0a/Ishihara.14.Plate.Instructions.pdf) and the individual Commons descriptions; plate numbering can vary by edition.

The [figure experiment](figure-experiment.md) includes the location-based key, the frozen A/B/C comparison, and the science fair demonstration.
