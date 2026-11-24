# PRISM: context-first review workflow

Proposal dated 2 November 2026. This refines the pair-review workflow; it is not an implemented capability or a validated accessibility classifier.

## Design decision

Use page layout and linked context regions before detailed color-region analysis. This is a better hypothesis for mixed educational pages than treating every page fragment as equally eligible for comparison. Evaluate that hypothesis against the existing full OCR-enabled pipeline.

Distinguish two operations:

1. **Document layout analysis:** identify chart panels, figures, photos, text blocks, legends, and captions, usually with boxes and relationships. This supplies the first level of context.
2. **Fine visual segmentation:** identify colored regions, strokes, dashes, markers, and text/background relationships within the appropriate region. Existing K-means plus connected components can start this stage; SLIC superpixels would be a separate experimental alternative.

Generic semantic categories alone are insufficient. Two different charts can both be labelled chart while serving different tasks. A shared legend may sit outside both charts. A photograph can share a red hue with an unrelated line without creating a meaningful comparison.

## Six application stages

### 1. Map the page

Retain the full source page and its coordinate system. Propose layout regions with IDs, type, source bounds, and a quality/uncertainty flag. Use native PDF text positions and available image/vector information; supplement with OCR, spacing, rules, and borders. These signals do not guarantee correct boundaries.

First implementation: let the user confirm or draw the chart/figure boxes. An optional trained document-layout model can be evaluated later. Avoid making a large segmentation model a prerequisite for the prototype.

Keep unassigned or ambiguous content visible. Permit overlapping regions and parent regions. If a crop cuts through a figure or loses a legend, allow it to expand or revert to the larger parent region.

### 2. Preserve context links

Build a record for each region with its associated caption, legend, labels, task, parent figure, and linked panels. A shared legend is one source object referenced by multiple panels. Duplicate views may display it, but should not be counted as independent evidence.

Treat a region boundary as a way to prioritize comparisons, not proof that comparisons across it are irrelevant. Allow links for shared legends, diagrams with external labels, paired before/after panels, and tasks explicitly requiring comparison across plots.

If an association is uncertain, preserve alternative links or request human confirmation. Do not let an uncertain nearest-caption heuristic silently define the meaning of a figure.

### 3. Analyze local details

Analyze each region using its source pixels at a suitable detail resolution. Retain its position and scale on the page. Enlargement can help detect a dash, but cannot establish that the dash was visible at the intended reading size.

Extract colors and connected fragments; preserve small dashes and markers; group compatible fragments into objects using continuity, width, and spacing. Keep separate series separate. Preserve gaps and original masks. Measure CVD separation per profile, text/background contrast where supported, and candidate non-color cues.

Route checks by content type. Charts need series/legend comparisons; text needs foreground/background checks; photographs require an identification task before detailed color changes can be interpreted as an information barrier. Poor color separation in a photograph alone does not establish a task failure.

Local clustering may allocate colors more usefully to a small chart than page-wide clustering, but can still merge important shades. Verify critical pair measurements against source pixels and evaluate this choice rather than assuming improvement.

### 4. Build a candidate bank

Propose relationships within regions and across explicit context links. Include adjacent risky colors, separate chart series, foreground/background pairs, legend associations, and uncertain structural cases.

Do not require every relationship to exceed a color-risk threshold. A missed thin line, failed extraction, or unclear legend can warrant review without a high numeric risk. Audit lower-ranked and unflagged regions during evaluation to estimate the misses.

Each candidate stores the source IDs, task, reason for proposal, measurements, source-region quality, context links, and verification status. Rank deterministically and preserve the number of candidates omitted by the review budget.

### 5. Review unresolved meaning

Use rules immediately where they have sufficient evidence. Use SmolVLM for unresolved contextual questions about selected candidates, with a shared-context crop, complete legend/caption where relevant, OCR evidence, and task. Include a labelled simulated detail when needed; the model does not generate the numerical color simulation.

Ask short questions: is distinguishing A/B required, which visible cue identifies each object, and does the cue match the legend? Allow unknown. Treat embedded document text as content, not model instructions.

Validate output schema and source IDs. Verify style/contrast claims with supported measurements or explicit human review. Unsupported semantic judgments remain suggestions. Model-only claims that something is irrelevant do not silently delete a warning.

Use a total page budget, not a fresh unlimited budget for every crop. A proposed initial budget is five reviewed relationships per page, with at most one follow-up per pair. Cache using the image, boundaries, links, task, profile, OCR, model, prompt, and rule versions. Boundary or task edits invalidate affected results.

### 6. Report results on the original page

Map reviewed evidence back to the original page coordinates. Let the user inspect the crop and its linked context, adjust boundaries, add a missed relationship, and distinguish automated decisions from manual confirmations.

Use the pair-review proposal's provisional concern grades: 0 lower concern, 1 demonstrated partial mitigation, 2 probable barrier, U unresolved. Unknown cue effectiveness is U, not partial mitigation. Grades remain conditional on task, profile, and viewing size.

Report high-concern relationships, unresolved cases, reviewed/proposed pair counts, and incomplete/ambiguous regions. These are processing coverage indicators, not proof that all meaningful relationships were detected. Do not average a serious failure away with many easy regions or classify unreviewed blocks as accessible.

## Example

A page contains two ecology charts, a shared legend, a leaf photograph, and explanatory text. Layout analysis separates these regions. Both charts retain a link to the shared legend. The leaf photograph's red pixels are not automatically paired with red chart strokes. Within each chart, a solid Forest curve and dashed Meadow curve are grouped and compared. The model may propose that line style supplies an alternative cue; the system verifies style distinction and the legend match before assigning lower concern for the stated task. Cross-chart comparisons remain available when the task requires them.

## Failure handling and repeatability

- Missing/ambiguous region: expand to parent context or mark unresolved.
- Missing legend or caption: keep association unknown; permit correction.
- Unsupported WebGPU/model: retain measured evidence; contextual assessment is unavailable.
- Timeout, invalid response, or budget reached: U, with explicit incomplete coverage.
- Same input/configuration: fixed region ordering and tie-breaking, pinned model/processor/runtime/rules, greedy generation, and cached evidence. Test repeatability on the demonstration device; do not promise identical outputs across all hardware.
- Native source and target viewing size are retained throughout. Measurement pixels do not include annotation overlays.

## Evaluation and implementation priorities

Start with user-confirmed layout regions and the existing color engine. This tests whether context partitioning helps before investing in an automatic layout model. Add grouping, candidate inspection, and a VLM experiment in stages consistent with the teaching roadmap.

Compare the full current pipeline, context-first rules alone, and context-first rules plus SmolVLM using identical tasks, OCR, rendering, and time budgets. Record manual assistance explicitly.

Add tests for two unrelated charts with identical colors, a shared external legend, multi-panel figures, text on colored backgrounds, a chart beside a photograph, a caption spanning panels, and a crop that clips a legend. Measure missed regions and missed context links before candidate recall, grouping errors, cue-association errors, incorrect reassurance, unresolved rate, and latency. The current 20 images are development material; fresh source-separated pages are needed for an unseen comparison.

## References

[Docling's document representation](https://docling-project.github.io/docling/concepts/docling_document/) illustrates the distinction between document items and their hierarchy. It is a conceptual reference here, not a proposal to run Docling's Python pipeline in the browser. [SmolVLM-500M](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct) remains an inference candidate whose suitability for this rubric must be tested.
