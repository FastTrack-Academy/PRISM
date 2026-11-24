# Stage 1 · Color separation in images

**Research question.** Which pairs of colors in a textbook figure or picture become substantially harder to distinguish under simulations of protanopia, deuteranopia, and tritanopia?

**Hypothesis.** The two ordinary red–green challenge plates will produce stronger local loss warnings than the demonstration plate under the protanopia and deuteranopia simulations. Treat the reverse plate separately because its pattern can emerge. The photographs and educational figures explore whether comparable losses occur in classroom material.

## Image bank

[Study assignments](study-bank.json) reference the original files by their IDs in the [source manifest](manifest.json). The active bank contains 12 images: one control plate, two challenge plates, one exploratory reverse plate, two photographs and six educational figures. Each educational or photographic source contributes its original version once. Eight cue-added variants are reserved alongside their original IDs for a future paired experiment. The suffixes “good” and “bad” are historical task-design labels.

The eight gallery charts previously evaluated in the figure experiment are supplemental comparison data. Unregistered textbook pages in the images directory are candidates for later sampling. These sources are outside the current 20-image pilot assignment.

## Method and evidence

1. Use the recorded figure or photo crop, or the whole image for a plate. Crop coordinates are original pixels in left, top, right, bottom order, with right and bottom exclusive. The crops remove surrounding prompts, captions and legends from the educational cards. Ordinary marks inside a plot contribute pixels.
2. Resize to a maximum edge of 700 pixels, then find connected color regions with the existing deterministic K-means method. The algorithm receives only the raster. Captions, task answers, class names and human-marked sample points are excluded from its inputs.
3. Measure each eligible nearby pair in the original and under each simulation. Record both color distances (ΔE00), the fraction retained, the strongest pair's colors, the grade, and the number of eligible pairs and distinct warnings. The Figure Lab uses the same experimental pair-risk cutoffs of 0.2 and 0.5. A missing eligible pair yields insufficient evidence. Each profile can select a different strongest pair.
4. Compare the control and challenge plates by profile. Report the reverse plate separately, and report the educational figures and photographs by source. Several figures reuse palettes, so a count of warnings or of image/profile rows is not a count of independent observations. Use the known-color swatch tests as numerical controls. The provisional good/bad labels describe reading tasks and are unsuitable as Stage 1 ground truth.

Run `npm run benchmark:stage1` from the repository root (project Node dependencies, Python and Pillow). The output is [stage1-colors.csv](stage1-colors.csv). Run `npm test` for the color and figure controls.

## Scope statement for the science fair

> Stage 1 measures the loss of color separation between nearby image regions under three simulated CVD profiles. A warning identifies a pair for inspection. The study does not establish whether a person can read a numeral, identify a wetland, or complete a textbook question. It does not assess whether text, icons, patterns, outlines or region boundaries communicate the same information.

The wetland map illustrates the boundary. On the original map, the strongest deuteranopia pair goes from 46.42 ΔE to 2.58 ΔE, retaining about 6% of its original separation. That result describes the colors. The effect of writing WETLAND inside a region is a separate question.

## Stage 2 · Deferred cue study

Use each of the eight original/cue-added pairs to test whether a reader can recover the intended distinction when color separation is weak. Retain Stage 1's measurement of the original colors and record cue effectiveness as a separate outcome. Compare labels, icons, patterns and visible boundaries at the same size and task. Some existing variants change several cues together; isolating the effect of one cue requires a variant that changes only that cue. The earlier task-reading prototype provides exploratory work for this phase. Previously examined variants are development examples; independent validation requires new source figures.
