# PRISM teaching and implementation roadmap

Prepared 2 November 2026. Planning assumption: 3–4 student hours per week, with teacher support for scaffolding, asset preparation, and unfamiliar code. No science fair deadline has been specified.

## What counts as a complete project

The core project takes eight active weeks (24–32 student hours). Its question is: **Can explicit grouping and non-color cues improve a color-based warning system on selected educational charts?**

A complete core submission includes an explainable color-risk detector, a narrowly scoped grouping method, a comparison against the original method, an error analysis, and a working browser demonstration. A successful experiment may find limited improvement or expose failures. Passing every target is not a condition for presenting an honest scientific result.

Deep learning is an optional four-week extension (12–16 hours). Its separate question is: **Does a small vision-language model add useful contextual evidence beyond explicit rules?** The core project remains presentable if the model is slow, inaccurate, or incompatible with the demonstration laptop.

The scope for the core is selected chart crops with two series and visible legends. A person may select the chart crop and relevant pair. Record that assistance in the method and demonstration. Automatic interpretation of arbitrary textbooks, photographs, posters, crossing curves, and dense scientific figures is future work.

## Starting point, checked against the repository

- `src/lib/engine.ts` currently uses deterministic color K-means with eight centers, followed by four-connected components. It is not a SLIC superpixel implementation. If the students have learned superpixels, compare the ideas explicitly rather than naming these algorithms interchangeably.
- Regions below 0.05% of page area are removed. Investigate what that does to small dashes and markers.
- Numerical color tests, CVD simulations, adjacent-region comparisons, OCR integration, and an experimental combined score already exist.
- The 20-image development bank contains four plates, four nature variants from two photographs, four original textbook figures, four original scientific posters, and four original humanities posters. The labels are design expectations, not participant ground truth. Variants from one source are not independent examples.
- `benchmark/score-baseline.csv` is a 700 px diagnostic run without OCR. It cannot serve as the full application's baseline. The first sprint should record the actual application pipeline as well, using identical settings for later comparisons.
- The pipeline poster illustrates a proposal. Object grouping, verified cue associations, and VLM review are future milestones, not completed capabilities.

## Calendar and milestones

Example calendar starts Monday 9 November 2026. The 21 December–3 January pause is an optional holiday allowance, not an assumed school calendar. Shift the dates to actual class availability. If a sprint needs more time, spend the optional model weeks on the core.

| Sprint | Dates | Learning focus | Implementation deliverable | Evidence to present |
| --- | --- | --- | --- | --- |
| 1 · Explain the baseline | Nov 9–22 | Color distance, simulation, measurements versus conclusions | Record the existing full app outputs; make a comparison sheet; expose per-pair evidence for a few examples | Explain three successes and three failures; repeat a run with the same settings |
| 2 · Find candidate problems | Nov 23–Dec 6 | Segmentation, thresholds, recall and false alarms | Preserve small fragments for inspection; compare region-area settings; allow selection of distant pairs within one chart crop | Which important pairs were retained, which were missed, and how many extra warnings appeared? |
| 3 · Group one curve | Dec 7–20 | Geometry, connected components, object identity | Group dashes using endpoint distance, direction, stroke width, and chart boundaries; retain original masks | Correct grouping examples plus deliberate wrong-merge challenges |
| Pause / catch-up | Dec 21–Jan 3 | Optional | No new required feature | Catch up or take a break |
| 4 · Recognize useful cues | Jan 4–17 | Rules, alternative cues, controlled experiments | Detect solid/dashed differences on selected objects; verify legend style where possible; return unknown otherwise; integrate and document the core | Compare original, grouping-only, and grouping-plus-cues results on frozen examples; produce the core poster/demo |
| 5 · Optional model experiment | Jan 18–31 | What a pretrained model does; inference, prompts, uncertainty | Try one small browser VLM on fixed crops; ask a few narrow questions; validate outputs; measure loading and inference | Does it identify the intended relationship and cite the right evidence? Include failures |
| 6 · Optional bounded integration | Feb 1–14 | Ablation experiments, cost versus benefit | Let validated model evidence inform unresolved comparisons; enforce a call budget and an unknown result on failure | Compare rules alone against rules plus VLM on fresh examples; report correctness, unresolved cases, and time |

The core milestone is 17 January in this calendar. The optional extension ends 14 February. These are planning dates, not commitments to untested model performance.

## A realistic weekly rhythm

Use the same structure each week so students can see progress:

- 30 minutes: teach one concept and predict what it will do to an example.
- 75 minutes: implement or modify one small part with support.
- 45 minutes: run a fixed set of examples and inspect failures.
- 30 minutes: write the result and explain it to a classmate.
- Optional extra hour: debugging, source-image preparation, or catching up.

At each sprint review, the student shows one improvement, one remaining failure, one measurement, and the next hypothesis. Assess their explanation separately from whether the feature improved the result.

## Sprint requirements and boundaries

### Sprint 1: an explainable baseline is good enough

Student task: choose three pairs of colors, predict which CVD simulation will reduce their separation, and compare the prediction to measurements. Trace one highlighted issue from pixels to colors to pair risk.

Implementation: freeze the current scoring version and record input ID, image hash, analysis resolution, OCR availability, CVD mode, score components, issues, and processing time. Use existing app results and report exports first; a new batch runner is optional if manual recording is enough. Keep the older no-OCR results as a separately named diagnostic.

Done: existing mathematical reference checks pass; repeated runs on the same configuration agree within a recorded tolerance; the student can explain why a high score does not prove readability. No score-weight fitting yet.

### Sprint 2: potential problems are good enough

Student task: vary one area threshold and plot the number of retained dashes or candidate pairs against the number of extra fragments. Discuss the tradeoff instead of looking for one magic threshold.

Implementation: retain small fragments before later grouping, with a configurable resource limit. Add a way to inspect or manually select two distant objects in the same chart. Record manually supplied relationships separately from automatically generated ones. Keep source masks so a warning can be traced to its evidence.

Done: on a small annotated challenge set, the expected difficult color pairs can be found and the misses are counted. Unrelated extra candidates are acceptable at this stage if reported. A resource cap or extraction failure must not silently become a safe result.

Defer: automatic legend matching and judgments about whether color carries essential meaning.

### Sprint 3: one supported object type is good enough

Student task: decide by hand which dashes belong together, then turn their reasoning into explicit geometric conditions.

Implementation: support separated straight or gently curved dashed series inside a supplied chart crop. Store an object as a list of fragment IDs plus its measured style. Do not paint over the gaps. Keep separate series separate even when they have the same color or function. Use fixed tie-breaking; ambiguous crossings return unknown.

Done: show that a supported dashed series becomes one object; show that nearby parallel series and separate chart panels do not merge. Report counts of correct groups, incorrect merges, and unresolved groups. Teacher-created crossing examples can demonstrate appropriate abstention.

Defer: arbitrary photographs, general semantic segmentation, dense crossing curves, and completely automatic page layout analysis.

### Sprint 4: a limited, auditable rule is good enough

Student task: compare the same chart with color-only series, distinct line styles, and mismatched legend styles. Predict which modification adds useful information.

Implementation: measure repeated gaps along the selected curve; distinguish clear solid/dashed cases. Check the corresponding legend sample when its association is supplied or unambiguous. Credit a cue only when it distinguishes the relevant objects and matches the legend. Keep unclear associations unknown. Marker-shape recognition and automatic text-label matching are stretch goals.

Use three task-level outputs: likely confusion, verified alternative cue/lower risk, and needs review. Report measured color risk independently. Preserve the legacy score as an experimental baseline rather than fitting a new universal score to the 20 examples.

Done: evaluate the frozen core on new examples, document its assisted inputs, make a short demonstration, and write a claim limited to the observed results. If task ratings from people with CVD are available, report those separately. Without them, describe the result as validation of cue detection and rule behavior, not validation of human accessibility.

### Sprints 5–6: model help must earn its place

Start only when students can explain the core pipeline and its failure cases. Teacher preparation includes a browser-compatible model configuration and a tested demo laptop. The initial candidate is SmolVLM-500M; model choice remains a hypothesis to evaluate.

Ask narrow questions: do A and B represent different series, which visible legend labels belong to them, and is the relationship unclear? Supply fixed crops and OCR text. Require evidence references, validate object IDs, and reject malformed answers. Treat text inside uploaded images as content rather than instructions to the model.

Use pinned model and runtime versions, fixed preprocessing, greedy decoding, and recorded prompts. Repeat on the actual demo device; do not promise identical neural results across all hardware. Cache by input and configuration. Record cold loading separately from warm inference.

Begin with one context call per chart and at most two follow-ups. This is an engineering budget to test, not a measured optimum. When the budget expires or the model fails, return unknown. The model does not produce the numerical color measurements or override unsupported cue claims.

Done: compare the model-assisted system to the same rules-only system with the same crops, OCR, and tasks. A useful result requires evidence of benefit on fresh cases, acceptable time on the demo device, and no hidden increase in incorrectly reassuring outputs. If the benefit is absent, present that result and keep the model as an experimental branch.

## Different stages need different benchmarks

Do not reduce all stages to one good/bad image label. A geometry error, a missed candidate, and a misunderstood task are different failures.

| Benchmark | Suggested small starting set | Annotation / reference | Main measurement | What it cannot prove |
| --- | --- | --- | --- | --- |
| B0 · Color mathematics | Existing numerical tests plus simple swatches | Published reference values and fixed simulation outputs | Numerical error and repeatability | Human readability |
| B1 · Candidate detection | About 12 simple diagrams: adjacent/distant pairs, tiny marks, neutral controls | Expected object pairs marked by teacher/student | Expected pairs found / expected pairs; extra candidates per image | Whether every proposed pair matters semantically |
| B2 · Grouping | About 12 crops: isolated dashes, parallel series, different widths, crossings, separate panels | Fragment-to-object assignments | Correct groups, wrong merges, unresolved cases | Meaning of the chart |
| B3 · Alternative cues | 6 paired chart designs with and without useful styles; include a misleading legend | Presence of style difference and whether it matches the legend | Verified-cue errors and expected direction of the result | Actual benefit to people with CVD |
| B4 · Context and task | Existing 20-image development bank, then 8–12 new real figures/pages | Reading task, answer key, relevant relationships; participant outcomes if collected | Relationship accuracy, incorrect reassuring outputs, unresolved cases, time | Broad population-level accuracy from a small pilot |

The small sets are learning tools, not statistically sufficient datasets. Cases can serve more than one benchmark if each annotation is appropriate. Student workload should remain small: the teacher can prepare templates and a few deliberately difficult examples.

For each metric, show numerator and denominator. Report '9 of 12 expected pairs found' rather than only '75%'. Report unresolved cases explicitly so the system cannot appear accurate by refusing every example. Separate results by CVD mode and image family when counts permit.

Suggested engineering goals, selected before evaluation, are: no numerical regressions; find at least 9 of 10 preselected difficult relationships in supported diagrams; no wrong merges on the small supported grouping check; and no cue credit for the deliberately mismatched-legend controls. These are proposed classroom targets, not established accessibility thresholds. Missing a target becomes an error-analysis result, not a reason to conceal examples.

## Development examples versus final evidence

The existing 20 images have already been inspected while discussing changes; treat all of them as development material. Do not call them an unseen test set.

Before the final core comparison, have the teacher prepare 8–12 fresh, licensed real figures or pages. Keep all variants, crops, and pages from the same source in one partition. Freeze the code and rules before opening final results. If a failure leads to a code change, that set becomes development material; obtain new examples for the next final claim.

Stage check sets can become teaching examples after review. They must not be repeatedly used for tuning while being described as held out. For the optional VLM extension, reserve a new set or freeze both systems before inspecting a shared comparison set.

Do not assume the provisional 9 good / 11 bad labels are human ground truth. Ishihara plates remain a separately reported stress test. Human accessibility evaluation should follow the teacher's applicable school/fair process; schedule planning early if participants are part of the intended study. The core algorithm experiment can proceed without participant data.

## Implementation order for the mentor

1. Add recording and overlays around the existing evidence before changing score formulas.
2. Separate retained fragments, grouped objects, candidate relationships, and measured cues into explicit data records. Each group must retain its source fragment IDs.
3. Add geometric grouping for selected chart crops. Keep unsupported patterns unresolved.
4. Add one cue detector and one transparent decision rule at a time, comparing against the frozen baseline.
5. Make a static browser demonstration of the core; verify it on the presentation laptop, including an OCR/model-unavailable path and clear coverage information. Netlify publication is a separate release step.
6. Add the optional VLM behind the same evidence interface so the rules-only and model-assisted versions remain directly comparable.

Default to measurement tables and issue-level evidence until enough task data exists to justify a recalibrated 0–100 score. Prioritize the intended claim over feature count.

## What students can reasonably claim at each milestone

- After sprint 1: 'We can measure how selected colors change under CVD simulations.'
- After sprint 2: 'We can flag candidate color relationships and quantify which ones our detector misses.'
- After sprint 3: 'For our supported chart patterns, we can group separated dashes into a single series and report ambiguous cases.'
- After sprint 4: 'We tested whether explicit line-style cues improve our warnings on selected charts.'
- After sprint 6: 'We measured whether a small browser VLM improves contextual decisions beyond our rule-based method.'

For every claim, append the actual sample size, supported content, assistance provided, and observed limitations. A clear explanation of a failure is a useful science fair result.

## First session

1. Open one color-only chart and its version with alternative cues from `benchmark/images`.
2. Ask students to predict whether the color separation changes and whether the reading task becomes easier. These can have different answers.
3. Run the existing full app with OCR, record its output and settings, and compare the prediction to the result.
4. End with one hypothesis: 'Retaining and grouping dashes will help us measure a useful cue that the current region analysis misses.'

Next session: inspect why small dashes disappear or become separate components, then change one threshold and record both benefits and extra noise.
