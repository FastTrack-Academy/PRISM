import type { AlphaCompositingMode } from './types';

export type PreprocessedImage = {
  width: number;
  height: number;
  /** Interleaved normalized sRGB values in [0, 1], length = width * height * 3. */
  rgb: Float64Array;
};

/**
 * Compute target dimensions matching PIL Image.thumbnail((maxEdge, maxEdge)):
 * preserves aspect ratio, never upscales, rounds to minimize aspect-ratio error.
 */
export function computeThumbnailDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  const aspect = width / height;
  const roundAspect = (val: number, other: number, horizontal: boolean): number => {
    const lo = Math.max(1, Math.floor(val));
    const hi = Math.max(1, Math.ceil(val));
    if (lo === hi) return lo;
    const errLo = horizontal ? Math.abs(aspect - lo / other) : Math.abs(aspect - other / lo);
    const errHi = horizontal ? Math.abs(aspect - hi / other) : Math.abs(aspect - other / hi);
    return errLo <= errHi ? lo : hi;
  };

  if (width >= height) {
    const targetW = maxEdge;
    const targetH = roundAspect(maxEdge / aspect, targetW, false);
    return { width: targetW, height: targetH };
  }
  const targetH = maxEdge;
  const targetW = roundAspect(maxEdge * aspect, targetH, true);
  return { width: targetW, height: targetH };
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos3(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  return sinc(ax) * sinc(ax / 3);
}

type FilterWeights = {
  left: Int32Array;
  size: Int32Array;
  weights: Float64Array;
  stride: number;
};

/**
 * Precompute 1D Lanczos-3 resampling kernel matching Pillow's Resampling.LANCZOS
 * (support = 3 * max(1, scale), centered at (dst + 0.5) * scale).
 */
function buildLanczosWeights(srcLen: number, dstLen: number): FilterWeights {
  const scale = srcLen / dstLen;
  const filterScale = Math.max(1, scale);
  const support = 3 * filterScale;
  const maxKSize = Math.ceil(support) * 2 + 1;

  const left = new Int32Array(dstLen);
  const size = new Int32Array(dstLen);
  const weights = new Float64Array(dstLen * maxKSize);

  for (let dst = 0; dst < dstLen; dst++) {
    const center = (dst + 0.5) * scale;
    const xmin = Math.max(0, Math.floor(center - support + 0.5));
    const xmax = Math.min(srcLen, Math.floor(center + support + 0.5));
    const count = Math.max(1, xmax - xmin);

    left[dst] = xmin;
    size[dst] = count;

    let sum = 0;
    const base = dst * maxKSize;
    for (let k = 0; k < count; k++) {
      const w = lanczos3((xmin + k - center + 0.5) / filterScale);
      weights[base + k] = w;
      sum += w;
    }
    if (sum !== 0) {
      for (let k = 0; k < count; k++) {
        weights[base + k] /= sum;
      }
    }
  }

  return { left, size, weights, stride: maxKSize };
}

/**
 * Reference-compatible image preprocessing:
 * 1. Alpha-composite RGBA onto black (default, matching prism_stage1.py) or white.
 * 2. Downsample with separable Lanczos-3 to maxEdge (default 640) without upscaling.
 * 3. Quantize to 8-bit sRGB integer grid like PIL then normalize to [0, 1] Float64.
 */
export function preprocessRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxEdge = 640,
  alphaCompositing: AlphaCompositingMode = 'black',
): PreprocessedImage {
  const bg = alphaCompositing === 'white' ? 255 : 0;

  // Step 1: Alpha composite onto background to RGB Uint8 (matching PIL alpha_composite -> convert('RGB'))
  const compRgb = new Uint8Array(width * height * 3);
  for (let p = 0, s = 0, d = 0; p < width * height; p++, s += 4, d += 3) {
    const a = rgba[s + 3];
    if (a === 255) {
      compRgb[d] = rgba[s];
      compRgb[d + 1] = rgba[s + 1];
      compRgb[d + 2] = rgba[s + 2];
    } else if (a === 0) {
      compRgb[d] = bg;
      compRgb[d + 1] = bg;
      compRgb[d + 2] = bg;
    } else {
      const alpha = a / 255;
      const inv = 1 - alpha;
      compRgb[d] = Math.round(rgba[s] * alpha + bg * inv);
      compRgb[d + 1] = Math.round(rgba[s + 1] * alpha + bg * inv);
      compRgb[d + 2] = Math.round(rgba[s + 2] * alpha + bg * inv);
    }
  }

  const target = computeThumbnailDimensions(width, height, maxEdge);
  if (target.width === width && target.height === height) {
    const rgb = new Float64Array(compRgb.length);
    for (let i = 0; i < compRgb.length; i++) rgb[i] = compRgb[i] / 255;
    return { width, height, rgb };
  }

  // Step 2: Separable Lanczos-3 resample (horizontal then vertical)
  const hFilter = buildLanczosWeights(width, target.width);
  const temp = new Float64Array(height * target.width * 3);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width * 3;
    const dstRow = y * target.width * 3;
    for (let x = 0; x < target.width; x++) {
      const l = hFilter.left[x];
      const cnt = hFilter.size[x];
      const wBase = x * hFilter.stride;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < cnt; k++) {
        const w = hFilter.weights[wBase + k];
        const idx = srcRow + (l + k) * 3;
        r += compRgb[idx] * w;
        g += compRgb[idx + 1] * w;
        b += compRgb[idx + 2] * w;
      }
      const outIdx = dstRow + x * 3;
      temp[outIdx] = r;
      temp[outIdx + 1] = g;
      temp[outIdx + 2] = b;
    }
  }

  const vFilter = buildLanczosWeights(height, target.height);
  const rgb = new Float64Array(target.width * target.height * 3);

  for (let y = 0; y < target.height; y++) {
    const t = vFilter.left[y];
    const cnt = vFilter.size[y];
    const wBase = y * vFilter.stride;
    const dstRow = y * target.width * 3;
    for (let x = 0; x < target.width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < cnt; k++) {
        const w = vFilter.weights[wBase + k];
        const idx = (t + k) * target.width * 3 + x * 3;
        r += temp[idx] * w;
        g += temp[idx + 1] * w;
        b += temp[idx + 2] * w;
      }
      const outIdx = dstRow + x * 3;
      // Match PIL uint8 rounding then / 255.0
      rgb[outIdx] = Math.min(255, Math.max(0, Math.round(r))) / 255;
      rgb[outIdx + 1] = Math.min(255, Math.max(0, Math.round(g))) / 255;
      rgb[outIdx + 2] = Math.min(255, Math.max(0, Math.round(b))) / 255;
    }
  }

  return { width: target.width, height: target.height, rgb };
}
