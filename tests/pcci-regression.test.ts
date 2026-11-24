import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeImagePcci,
  CVD_TYPES,
  featuresFromFrozenPaletteAndLabels,
  scorePcciFromFeatures,
  type NormalizedRgb,
} from '../src/lib/pcci';

const DEFAULT_BUNDLE_DIR = 'C:/Users/61913/Downloads/prism_pcci_reference_bundle';
const bundleDir = process.env.PRISM_REFERENCE_DIR || DEFAULT_BUNDLE_DIR;
const hasReferenceBundle =
  fs.existsSync(path.join(bundleDir, 'prism_stage1_results.csv')) &&
  fs.existsSync(path.join(bundleDir, 'prism_stage1.py'));

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
  const map = new Map<string, { score: number; mean: number; share: number }>();
  for (let i = 1; i < lines.length; i++) {
    const [image, cvd, score, mean, share] = lines[i].split(',');
    map.set(`${image}|${cvd}`, {
      score: Number(score),
      mean: Number(mean),
      share: Number(share),
    });
  }
  return map;
}

function decodeRgbaViaPython(filePath: string) {
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

test(
  'frozen-intermediate parity matches Python reference to floating-point tolerance',
  { skip: !hasReferenceBundle },
  () => {
    const refCsv = parseReferenceCsv(path.join(bundleDir, 'prism_stage1_results.csv'));
    const pyCode = `
import sys, json, base64
import numpy as np
from skimage.color import rgb2lab, lab2rgb
from sklearn.cluster import MiniBatchKMeans
sys.path.insert(0, sys.argv[1])
import prism_stage1 as ps
out = {}
for name, fname in ps.FILES.items():
    rgb = ps.load(sys.argv[1] + '/' + fname)
    lab = rgb2lab(rgb)
    h, w = lab.shape[:2]
    flat = lab.reshape(-1, 3)
    rng = np.random.default_rng(42)
    sample = flat[rng.choice(len(flat), min(50000, len(flat)), replace=False)]
    k = min(24, len(np.unique(sample, axis=0)))
    km = MiniBatchKMeans(n_clusters=k, random_state=42, n_init=3, batch_size=4096).fit(sample)
    labels = km.predict(flat).astype(np.int32)
    palette = lab2rgb(km.cluster_centers_[None, :, :])[0]
    out[name] = {
        "width": w,
        "height": h,
        "palette": palette.tolist(),
        "labels_b64": base64.b64encode(labels.tobytes()).decode("ascii")
    }
print(json.dumps(out))
`;
    const rawOut = execFileSync('python', ['-c', pyCode, bundleDir], {
      maxBuffer: 128 * 1024 * 1024,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(rawOut.trim().split(/\r?\n/).pop()!);

    for (const name of Object.keys(FILES)) {
      const entry = parsed[name];
      const buf = Buffer.from(entry.labels_b64, 'base64');
      const labels = new Int32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const feats = featuresFromFrozenPaletteAndLabels({
        originalDimensions: { width: entry.width, height: entry.height },
        computationalDimensions: { width: entry.width, height: entry.height },
        paletteRgb: entry.palette as NormalizedRgb[],
        labels,
      });
      const res = scorePcciFromFeatures(feats, undefined, { imageName: name });
      for (const cvd of CVD_TYPES) {
        const ref = refCsv.get(`${name}|${cvd}`)!;
        assert.ok(
          Math.abs(res.cvd[cvd].pcciScore - ref.score) < 1e-3,
          `frozen score mismatch on ${name} ${cvd}`,
        );
        assert.ok(
          Math.abs(res.cvd[cvd].meanRisk - ref.mean) < 1e-3,
          `frozen mean mismatch on ${name} ${cvd}`,
        );
        assert.ok(
          Math.abs(res.cvd[cvd].highRiskPairWeightShare - ref.share) < 1e-6,
          `frozen share mismatch on ${name} ${cvd}`,
        );
      }
    }
  },
);

test(
  'end-to-end 9-image regression meets accuracy target and qualitative sanity checks',
  { skip: !hasReferenceBundle },
  () => {
    const refCsv = parseReferenceCsv(path.join(bundleDir, 'prism_stage1_results.csv'));
    const results = new Map<string, ReturnType<typeof analyzeImagePcci>['result']>();
    const errors: number[] = [];

    for (const [name, filename] of Object.entries(FILES)) {
      const rgba = decodeRgbaViaPython(path.join(bundleDir, filename));
      const { result } = analyzeImagePcci(rgba, {}, { imageName: name });
      results.set(name, result);

      for (const cvd of CVD_TYPES) {
        const ref = refCsv.get(`${name}|${cvd}`)!.score;
        const err = Math.abs(result.cvd[cvd].pcciScore - ref);
        errors.push(err);
        if (name !== 'Food and health') {
          assert.ok(
            err < 2.0,
            `${name} ${cvd}: got ${result.cvd[cvd].pcciScore.toFixed(2)}, ref ${ref.toFixed(2)} (err ${err.toFixed(2)})`,
          );
        }
      }
    }

    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
    assert.ok(mae < 2.0, `Expected MAE < 2.0 across all 27 scores, got ${mae.toFixed(3)}`);

    // Qualitative sanity checks (Section 10)
    const ish01 = results.get('Ishihara 01')!;
    assert.ok(ish01.cvd.Deuteranopia.pcciScore < 15 && ish01.cvd.Protanopia.pcciScore < 15);

    const ish19 = results.get('Ishihara 19')!;
    assert.ok(ish19.cvd.Deuteranopia.pcciScore > 60 && ish19.cvd.Protanopia.pcciScore > 55);

    const landMap = results.get('Land-use map')!;
    assert.ok(landMap.cvd.Deuteranopia.pcciScore > landMap.cvd.Tritanopia.pcciScore + 50);

    const food = results.get('Food and health')!;
    assert.ok(
      food.cvd.Tritanopia.pcciScore > 45 &&
        food.cvd.Tritanopia.pcciScore > food.cvd.Deuteranopia.pcciScore + 30,
    );

    const nightSky = results.get('Night sky')!;
    assert.ok(
      nightSky.cvd.Deuteranopia.pcciScore < 15 &&
        nightSky.cvd.Protanopia.pcciScore < 15 &&
        nightSky.cvd.Tritanopia.pcciScore < 15,
    );
  },
);
