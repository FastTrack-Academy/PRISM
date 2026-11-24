/**
 * Regression runner comparing TypeScript PCCI engine against prism_stage1.py reference results.
 * Runs both:
 *   1. Frozen-intermediate parity check (exact Python palette + labels -> TS scoring).
 *   2. End-to-end raw-RGBA image regression check (TS Lanczos + TS MiniBatchKMeans + TS scoring).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeImagePcci,
  CVD_TYPES,
  featuresFromFrozenPaletteAndLabels,
  scorePcciFromFeatures,
  type CvdType,
  type NormalizedRgb,
} from '../src/lib/pcci';

const DEFAULT_BUNDLE_DIR = 'C:/Users/61913/Downloads/prism_pcci_reference_bundle';
const bundleDir = process.env.PRISM_REFERENCE_DIR || DEFAULT_BUNDLE_DIR;

const FILES: Record<string, string> = {
  Teeth: 'WPB070_p6-11-feature-1030x728.jpg',
  'Night sky': '2013-textbook.png',
  'Characteristics of life':
    'homeschool-middle-school-science-textbook-2nd-edition-sample-Page_1-min.jpg',
  'Food and health': 'images.jpg',
  'Ishihara 01': 'ishihara-01.png',
  'Ishihara 09': 'ishihara-09.png',
  'Ishihara 11': 'ishihara-11.png',
  'Ishihara 19': 'ishihara-19.png',
  'Land-use map': 'textbook-map-bad.png',
};

function parseReferenceCsv(csvPath: string) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const map = new Map<
    string,
    {
      score: number;
      mean: number;
      share: number;
      origDe: number;
      simDe: number;
      c1: string;
      c2: string;
    }
  >();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const [image, cvd, score, mean, share, origDe, simDe, c1, c2] = parts;
    map.set(`${image}|${cvd}`, {
      score: Number(score),
      mean: Number(mean),
      share: Number(share),
      origDe: Number(origDe),
      simDe: Number(simDe),
      c1,
      c2,
    });
  }
  return map;
}

function decodeRgbaViaPython(filePath: string): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const pyCode = `
import sys, base64
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
w, h = im.size
sys.stdout.write(f"{w} {h}\\n")
sys.stdout.write(base64.b64encode(im.tobytes()).decode('ascii'))
`;
  const out = execFileSync('python', ['-c', pyCode, filePath], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  const nl = out.indexOf('\n');
  const [wStr, hStr] = out.slice(0, nl).trim().split(' ');
  const buf = Buffer.from(out.slice(nl + 1), 'base64');
  return {
    width: Number(wStr),
    height: Number(hStr),
    data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength),
  };
}

function getPythonIntermediates(filePath: string): {
  width: number;
  height: number;
  palette: NormalizedRgb[];
  labels: Int32Array;
} {
  const pyCode = `
import sys, json, base64
import numpy as np
from skimage.color import rgb2lab, lab2rgb
from sklearn.cluster import MiniBatchKMeans
sys.path.insert(0, sys.argv[2])
import prism_stage1 as ps
rgb = ps.load(sys.argv[1])
lab = rgb2lab(rgb)
h, w = lab.shape[:2]
flat = lab.reshape(-1, 3)
rng = np.random.default_rng(42)
sample = flat[rng.choice(len(flat), min(50000, len(flat)), replace=False)]
k = min(24, len(np.unique(sample, axis=0)))
km = MiniBatchKMeans(n_clusters=k, random_state=42, n_init=3, batch_size=4096).fit(sample)
labels = km.predict(flat).astype(np.int32)
palette = lab2rgb(km.cluster_centers_[None, :, :])[0]
print(json.dumps({
  "width": w,
  "height": h,
  "palette": palette.tolist(),
  "labels_b64": base64.b64encode(labels.tobytes()).decode("ascii")
}))
`;
  const out = execFileSync('python', ['-c', pyCode, filePath, bundleDir], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  // Last line is JSON (ignore any earlier warnings on stdout if present)
  const jsonLine = out.trim().split(/\r?\n/).pop()!;
  const parsed = JSON.parse(jsonLine);
  const buf = Buffer.from(parsed.labels_b64, 'base64');
  const labels = new Int32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return {
    width: parsed.width,
    height: parsed.height,
    palette: parsed.palette,
    labels,
  };
}

const refCsv = parseReferenceCsv(path.join(bundleDir, 'prism_stage1_results.csv'));

console.log('=== 1. FROZEN-INTERMEDIATE PARITY CHECK (Python palette+labels -> TS scoring) ===');
let maxFrozenScoreErr = 0;
let maxFrozenMeanErr = 0;
let maxFrozenShareErr = 0;

for (const [name, filename] of Object.entries(FILES)) {
  const fp = path.join(bundleDir, filename);
  const inter = getPythonIntermediates(fp);
  const feats = featuresFromFrozenPaletteAndLabels({
    originalDimensions: { width: inter.width, height: inter.height },
    computationalDimensions: { width: inter.width, height: inter.height },
    paletteRgb: inter.palette,
    labels: inter.labels,
  });
  const res = scorePcciFromFeatures(feats, undefined, { imageName: name });
  for (const cvd of CVD_TYPES) {
    const ref = refCsv.get(`${name}|${cvd}`)!;
    const got = res.cvd[cvd];
    const sErr = Math.abs(got.pcciScore - ref.score);
    const mErr = Math.abs(got.meanRisk - ref.mean);
    const shErr = Math.abs(got.highRiskPairWeightShare - ref.share);
    if (sErr > maxFrozenScoreErr) maxFrozenScoreErr = sErr;
    if (mErr > maxFrozenMeanErr) maxFrozenMeanErr = mErr;
    if (shErr > maxFrozenShareErr) maxFrozenShareErr = shErr;
  }
}
console.log(
  `Frozen max |score err| = ${maxFrozenScoreErr.toExponential(3)}, max |mean err| = ${maxFrozenMeanErr.toExponential(3)}, max |share err| = ${maxFrozenShareErr.toExponential(3)}`,
);

console.log('\n=== 2. END-TO-END REGRESSION CHECK (Raw RGBA -> TS PCCI vs Python reference) ===');
console.log(
  'Image'.padEnd(26) +
    'CVD'.padEnd(14) +
    'Ref'.padStart(8) +
    'TS'.padStart(8) +
    '|Err|'.padStart(8) +
    'Time(ms)'.padStart(10),
);
console.log('-'.repeat(74));

const errs: number[] = [];
const perImageRows: Array<{
  image: string;
  cvd: CvdType;
  ref: number;
  ts: number;
  err: number;
  timeMs: number;
}> = [];

for (const [name, filename] of Object.entries(FILES)) {
  const fp = path.join(bundleDir, filename);
  const rgba = decodeRgbaViaPython(fp);
  const { result } = analyzeImagePcci(rgba, {}, { imageName: name });
  for (const cvd of CVD_TYPES) {
    const ref = refCsv.get(`${name}|${cvd}`)!.score;
    const ts = result.cvd[cvd].pcciScore;
    const err = Math.abs(ts - ref);
    errs.push(err);
    perImageRows.push({ image: name, cvd, ref, ts, err, timeMs: result.processingTimeMs });
    console.log(
      name.padEnd(26) +
        cvd.padEnd(14) +
        ref.toFixed(2).padStart(8) +
        ts.toFixed(2).padStart(8) +
        err.toFixed(2).padStart(8) +
        result.processingTimeMs.toFixed(0).padStart(10),
    );
  }
}

const mae = errs.reduce((a, b) => a + b, 0) / errs.length;
const maxErr = Math.max(...errs);
const over2 = errs.filter((e) => e >= 2).length;
console.log('-'.repeat(74));
console.log(
  `End-to-end 27 scores: MAE = ${mae.toFixed(3)}, Max |Err| = ${maxErr.toFixed(3)}, >= 2.0 pts: ${over2}/27`,
);
