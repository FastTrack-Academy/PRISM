import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateWeightedUpperTail,
  analyzeImagePcci,
  ciede2000,
  combinePairWeights,
  computeGlobalRawWeights,
  computeLocalRawWeights,
  computePairwiseRisk,
  computeThumbnailDimensions,
  CVD_TYPES,
  labToSrgb01,
  linearToSrgb,
  preprocessRgba,
  rgb01ToHex,
  simulateRgb01,
  srgb01ToLab,
  srgbToLinear,
  type NormalizedRgb,
} from '../src/lib/pcci';

function makeSolidImage(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

function makeVerticalStripes(
  width: number,
  height: number,
  colors: Array<[number, number, number, number]>,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  const stripeW = width / colors.length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = Math.min(colors.length - 1, Math.floor(x / stripeW));
      const c = colors[idx];
      const o = (y * width + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c[3];
    }
  }
  return { width, height, data };
}

test('sRGB <-> linear RGB conversions match IEC 61966-2-1 and round-trip accurately', () => {
  assert.equal(srgbToLinear(0), 0);
  assert.equal(srgbToLinear(1), 1);
  assert.ok(Math.abs(srgbToLinear(0.04045) - 0.04045 / 12.92) < 1e-12);
  assert.ok(Math.abs(srgbToLinear(0.5) - Math.pow(0.555 / 1.055, 2.4)) < 1e-12);

  assert.equal(linearToSrgb(0), 0);
  assert.ok(Math.abs(linearToSrgb(1) - 1) < 1e-12);
  assert.equal(linearToSrgb(-0.2), 0);
  assert.ok(Math.abs(linearToSrgb(1.4) - 1) < 1e-12);

  for (let i = 0; i <= 255; i++) {
    const s = i / 255;
    const roundTrip = linearToSrgb(srgbToLinear(s));
    assert.ok(Math.abs(roundTrip - s) < 1e-10, `round-trip mismatch at ${i}: ${roundTrip} vs ${s}`);
  }
});

test('sRGB <-> CIELAB (D65) conversions match expected endpoints and round-trip', () => {
  const blackLab = srgb01ToLab([0, 0, 0]);
  assert.ok(Math.abs(blackLab[0]) < 1e-9);
  assert.ok(Math.abs(blackLab[1]) < 1e-9);
  assert.ok(Math.abs(blackLab[2]) < 1e-9);

  const whiteLab = srgb01ToLab([1, 1, 1]);
  assert.ok(Math.abs(whiteLab[0] - 100) < 0.02);
  assert.ok(Math.abs(whiteLab[1]) < 0.02);
  assert.ok(Math.abs(whiteLab[2]) < 0.02);

  const samples: NormalizedRgb[] = [
    [0.75, 0.28, 0.25],
    [0.44, 0.53, 0.29],
    [0.12, 0.45, 0.88],
    [0.95, 0.85, 0.22],
    [0.5, 0.5, 0.5],
  ];
  for (const rgb of samples) {
    const rt = labToSrgb01(srgb01ToLab(rgb));
    for (let ch = 0; ch < 3; ch++) {
      assert.ok(Math.abs(rt[ch] - rgb[ch]) < 1e-6);
    }
  }
});

test('CIEDE2000 matches published Sharma, Wu & Dalal (2005) reference examples', () => {
  // Table 1 from Sharma et al. (2005) Color Research & Application 30(1):21-30
  const referencePairs: Array<[[number, number, number], [number, number, number], number]> = [
    [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
    [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
    [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
    [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
    [[50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485], 1.0],
    [[50.0, 0.0, 0.0], [50.0, -1.0, 2.0], 2.3669],
    [[50.0, 2.5, 0.0], [50.0, 0.0, -2.5], 4.3065],
    [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];

  for (const [a, b, expected] of referencePairs) {
    const got = ciede2000(a, b);
    assert.ok(
      Math.abs(got - expected) < 0.0005,
      `CIEDE2000(${a}, ${b}) = ${got}, expected ${expected}`,
    );
  }
});

test('CVD transformations: Machado (Deuteranopia, Protanopia) & Brettel two-plane (Tritanopia)', () => {
  // Neutral black & white map to themselves
  for (const cvd of CVD_TYPES) {
    const blk = simulateRgb01([0, 0, 0], cvd);
    const wht = simulateRgb01([1, 1, 1], cvd);
    assert.deepEqual(blk, [0, 0, 0]);
    for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(wht[ch] - 1) < 1e-4);
  }

  // Verify both half-spaces of Brettel Tritanopia separation plane TN = [7.92482, -5.66475, -2.26007]
  // Red-heavy: lin @ TN > 0 -> Plane 1
  const redTrit = simulateRgb01([0.9, 0.2, 0.2], 'Tritanopia');
  // Blue/Green-heavy: lin @ TN < 0 -> Plane 2
  const tealTrit = simulateRgb01([0.1, 0.7, 0.8], 'Tritanopia');
  assert.ok(redTrit[0] > 0.85 && redTrit[1] < 0.35);
  assert.ok(Math.abs(tealTrit[1] - tealTrit[2]) < 0.15);

  // Deuteranopia collapses classic red-green confusion pair (#BE504A vs #708849)
  const redD = simulateRgb01([0xbe / 255, 0x50 / 255, 0x4a / 255], 'Deuteranopia');
  const grnD = simulateRgb01([0x70 / 255, 0x88 / 255, 0x49 / 255], 'Deuteranopia');
  const dOrig = ciede2000(
    srgb01ToLab([0xbe / 255, 0x50 / 255, 0x4a / 255]),
    srgb01ToLab([0x70 / 255, 0x88 / 255, 0x49 / 255]),
  );
  const dDeut = ciede2000(srgb01ToLab(redD), srgb01ToLab(grnD));
  assert.ok(dOrig > 40 && dDeut < 3, `expected severe collapse: orig=${dOrig}, deut=${dDeut}`);
});

test('pairwise PCCI risk handles complete collapse, preserved distinguishability, and threshold', () => {
  // Complete collapse: D_cvd = 0 -> L = 1, A = 1, r = 1
  const collapse = computePairwiseRisk(35, 0, 12, 10);
  assert.equal(collapse.relativeLoss, 1);
  assert.equal(collapse.remainingDistancePenalty, 1);
  assert.equal(collapse.pairwiseRisk, 1);

  // Preserved distinguishability: D_cvd == D_original -> L = 0, r = 0
  const preserved = computePairwiseRisk(35, 35, 12, 10);
  assert.equal(preserved.relativeLoss, 0);
  assert.equal(preserved.pairwiseRisk, 0);

  // Even when half of a large distance is lost (60 -> 30), large remaining D_cvd keeps risk tiny
  const stillDistinguishable = computePairwiseRisk(60, 30, 12, 10);
  assert.ok(stillDistinguishable.relativeLoss === 0.5);
  assert.ok(stillDistinguishable.pairwiseRisk < 0.01);

  // Below minOriginalDeltaE (< 10) -> risk is 0
  const ineligible = computePairwiseRisk(9.9, 0.5, 12, 10);
  assert.equal(ineligible.pairwiseRisk, 0);
});

test('eligibility thresholds, global/local weight normalization, and neutral colours', () => {
  // 3 clusters: 0 (white, 0.50), 1 (black, 0.496), 2 (tiny accent, 0.004 < 0.005)
  const k = 3;
  const freqs = new Float64Array([0.5, 0.496, 0.004]);
  const d0 = new Float64Array([
    0, 100, 50,
    100, 0, 50,
    50, 50, 0,
  ]);
  const globalRaw = computeGlobalRawWeights(freqs);
  // 4x4 label grid with top half 0, bottom half 1
  const labels = new Int32Array(16);
  labels.fill(0, 0, 8);
  labels.fill(1, 8, 16);
  const { localRaw, validCombos } = computeLocalRawWeights(labels, 4, 4, k, [2, 8, 16, 32]);
  // On 4x4, only offset s=2 fits (4 directions), offsets 8/16/32 are skipped safely
  assert.equal(validCombos, 4);

  const w = combinePairWeights(d0, freqs, globalRaw, localRaw, k, 10, 0.005, 0.5);
  // Only neutral pair (0, 1) is eligible — neutral colours are NOT excluded!
  assert.equal(w.eligiblePairCount, 1);
  assert.equal(w.valid[0 * k + 1], 1);
  assert.equal(w.valid[0 * k + 2], 0); // cluster 2 below 0.5% frequency
  assert.equal(w.valid[0 * k + 0], 0); // self-pair excluded

  let gSum = 0;
  let lSum = 0;
  let cSum = 0;
  for (let i = 0; i < k * k; i++) {
    gSum += w.normalizedGlobal[i];
    lSum += w.normalizedLocal[i];
    cSum += w.combined[i];
  }
  assert.ok(Math.abs(gSum - 1) < 1e-12);
  assert.ok(Math.abs(lSum - 1) < 1e-12);
  assert.ok(Math.abs(cSum - 1) < 1e-12);
});

test('weighted upper-tail aggregation handles fractional boundary weights exactly', () => {
  // Prompt specification example: r = [1.0, 0.5], w = [0.05, 0.95], q = 0.10 -> 0.75 -> score 75
  const agg = aggregateWeightedUpperTail([1.0, 0.5], [0.05, 0.95], 0.1);
  assert.ok(Math.abs(agg.tailMean - 0.75) < 1e-12);
  assert.ok(Math.abs(agg.tailMean * 100 - 75) < 1e-10);
  assert.ok(Math.abs(agg.tailIncludedWeights[0] - 0.05) < 1e-12);
  assert.ok(Math.abs(agg.tailIncludedWeights[1] - 0.05) < 1e-12);
  // Unsorted input yields identical result
  const aggUnsorted = aggregateWeightedUpperTail([0.5, 1.0], [0.95, 0.05], 0.1);
  assert.ok(Math.abs(aggUnsorted.tailMean - 0.75) < 1e-12);
  // Mean risk = 1.0 * 0.05 + 0.5 * 0.95 = 0.525
  assert.ok(Math.abs(agg.meanRisk - 0.525) < 1e-12);
  // High risk share (r >= 0.5) = 1.0 (both pairs have r >= 0.5)
  assert.ok(Math.abs(agg.highRiskWeightShare - 1.0) < 1e-12);
});

test('synthetic image: monochromatic image returns zero risk and no-eligible-pairs status', () => {
  const mono = makeSolidImage(80, 60, [120, 160, 200, 255]);
  const { result } = analyzeImagePcci(mono, {}, { imageName: 'monochrome' });
  assert.equal(result.status, 'no-eligible-pairs');
  assert.equal(result.eligiblePairCount, 0);
  assert.equal(result.clusterCount, 1);
  for (const cvd of CVD_TYPES) {
    assert.equal(result.cvd[cvd].pcciScore, 0);
    assert.equal(result.cvd[cvd].meanRisk, 0);
    assert.equal(result.cvd[cvd].highRiskPairWeightShare, 0);
  }
});

test('synthetic image: grayscale image does not produce false-positive CVD-specific risk', () => {
  const gray = makeVerticalStripes(120, 60, [
    [20, 20, 20, 255],
    [95, 95, 95, 255],
    [175, 175, 175, 255],
    [245, 245, 245, 255],
  ]);
  const { result } = analyzeImagePcci(gray, {}, { imageName: 'grayscale' });
  assert.equal(result.status, 'ok');
  for (const cvd of CVD_TYPES) {
    assert.ok(
      result.cvd[cvd].pcciScore < 1.0,
      `grayscale ${cvd} false positive: ${result.cvd[cvd].pcciScore}`,
    );
  }
});

test('synthetic image: blue-orange control palette retains low colour-confusion risk', () => {
  const blueOrange = makeVerticalStripes(120, 60, [
    [0, 114, 178, 255], // Okabe-Ito blue
    [230, 159, 0, 255], // Okabe-Ito orange
    [255, 255, 255, 255],
  ]);
  const { result } = analyzeImagePcci(blueOrange, {}, { imageName: 'blue-orange' });
  assert.equal(result.status, 'ok');
  for (const cvd of CVD_TYPES) {
    assert.ok(
      result.cvd[cvd].pcciScore < 10,
      `blue-orange ${cvd} expected low risk, got ${result.cvd[cvd].pcciScore}`,
    );
  }
});

test('synthetic image: blue-green confusion palette triggers higher Tritanopia risk than red-green', () => {
  // Validated tritanopia blue-green confusion pair (#3A90A8 vs #3E9D7C)
  const tritanPair = makeVerticalStripes(120, 60, [
    [58, 144, 168, 255],
    [62, 157, 124, 255],
  ]);
  const { result } = analyzeImagePcci(tritanPair, {}, { imageName: 'blue-green-tritan' });
  assert.equal(result.status, 'ok');
  const trit = result.cvd.Tritanopia.pcciScore;
  const deut = result.cvd.Deuteranopia.pcciScore;
  const prot = result.cvd.Protanopia.pcciScore;
  assert.ok(
    trit > 50 && trit > deut + 30 && trit > prot + 30,
    `expected Tritanopia >> red-green: trit=${trit}, deut=${deut}, prot=${prot}`,
  );
});

test('synthetic image: very small images, <24 unique colours, transparent PNG compositing, determinism', () => {
  // 1x1 and 2x2 images must never divide by zero or produce NaN
  for (const [w, h] of [
    [1, 1],
    [2, 2],
    [4, 4],
  ]) {
    const tiny = makeVerticalStripes(w, h, [
      [190, 80, 74, 255],
      [112, 136, 73, 255],
    ]);
    const { result } = analyzeImagePcci(tiny, {}, { imageName: `tiny-${w}x${h}` });
    for (const cvd of CVD_TYPES) {
      assert.ok(Number.isFinite(result.cvd[cvd].pcciScore));
      assert.ok(Number.isFinite(result.cvd[cvd].meanRisk));
    }
  }

  // Fewer than 24 unique colours reduces K cleanly
  const fiveColors = makeVerticalStripes(100, 50, [
    [220, 50, 50, 255],
    [50, 180, 75, 255],
    [40, 100, 220, 255],
    [240, 210, 40, 255],
    [255, 255, 255, 255],
  ]);
  const r1 = analyzeImagePcci(fiveColors, {}, { imageName: 'five-colors' }).result;
  const r2 = analyzeImagePcci(fiveColors, {}, { imageName: 'five-colors' }).result;
  assert.equal(r1.clusterCount, 5);
  // Deterministic repeatability
  for (const cvd of CVD_TYPES) {
    assert.equal(r1.cvd[cvd].pcciScore, r2.cvd[cvd].pcciScore);
    assert.equal(r1.cvd[cvd].meanRisk, r2.cvd[cvd].meanRisk);
  }

  // Transparent PNG compositing: reference mode composites onto black; explicit white mode composites onto white
  const transparent = makeSolidImage(10, 10, [255, 0, 0, 0]);
  const blackPrep = preprocessRgba(transparent.data, 10, 10, 640, 'black');
  const whitePrep = preprocessRgba(transparent.data, 10, 10, 640, 'white');
  assert.equal(rgb01ToHex([blackPrep.rgb[0], blackPrep.rgb[1], blackPrep.rgb[2]]), '#000000');
  assert.equal(rgb01ToHex([whitePrep.rgb[0], whitePrep.rgb[1], whitePrep.rgb[2]]), '#FFFFFF');

  // Thumbnail dimensions do not upscale and match PIL ratios
  assert.deepEqual(computeThumbnailDimensions(487, 630, 640), { width: 487, height: 630 });
  assert.deepEqual(computeThumbnailDimensions(1030, 728, 640), { width: 640, height: 452 });
  assert.deepEqual(computeThumbnailDimensions(556, 714, 640), { width: 498, height: 640 });
  assert.deepEqual(computeThumbnailDimensions(1024, 1376, 640), { width: 476, height: 640 });
  assert.deepEqual(computeThumbnailDimensions(1000, 980, 640), { width: 640, height: 627 });
});
