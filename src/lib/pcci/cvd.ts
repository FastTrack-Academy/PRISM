import { clamp01, linearToSrgb, srgbToLinear } from './colorspace';
import type { CvdType, NormalizedRgb } from './types';

/**
 * Exact linear-light RGB dichromacy matrices from prism_stage1.py:
 * - Deuteranopia & Protanopia: Machado, Oliveira & Fernandes (2009), severity 1.0
 * - Tritanopia: Brettel, Viénot & Mollon (1997), two-plane projection
 */
export const MACHADO_DEUTERANOPIA: readonly number[] = [
  0.367322, 0.860646, -0.227968,
  0.280085, 0.672501, 0.047413,
  -0.01182, 0.04294, 0.968881,
];

export const MACHADO_PROTANOPIA: readonly number[] = [
  0.152286, 1.052583, -0.204868,
  0.114503, 0.786281, 0.099216,
  -0.003882, -0.048116, 1.051998,
];

export const BRETTEL_TRITANOPIA_PLANE_1: readonly number[] = [
  1.01354, 0.14268, -0.15622,
  -0.01181, 0.87561, 0.13619,
  0.07707, 0.81208, 0.11085,
];

export const BRETTEL_TRITANOPIA_PLANE_2: readonly number[] = [
  0.93337, 0.19999, -0.13336,
  0.05809, 0.82565, 0.11626,
  -0.37923, 1.13825, 0.24098,
];

export const BRETTEL_TRITANOPIA_NORMAL: readonly [number, number, number] = [
  7.92482, -5.66475, -2.26007,
];

// Precomputed 8-bit sRGB -> linear LUT for fast full-resolution raster simulation
const SRGB_U8_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  SRGB_U8_TO_LINEAR[i] = srgbToLinear(i / 255);
}

/**
 * Simulate full dichromacy for a single normalized sRGB color in [0..1].
 * Pipeline: sRGB -> Linear RGB -> CVD transformation -> Gamut clipping [0,1] -> sRGB.
 */
export function simulateRgb01(rgb: NormalizedRgb, cvdType: CvdType): NormalizedRgb {
  const lr = srgbToLinear(rgb[0]);
  const lg = srgbToLinear(rgb[1]);
  const lb = srgbToLinear(rgb[2]);

  let m: readonly number[];
  if (cvdType === 'Tritanopia') {
    const dot =
      lr * BRETTEL_TRITANOPIA_NORMAL[0] +
      lg * BRETTEL_TRITANOPIA_NORMAL[1] +
      lb * BRETTEL_TRITANOPIA_NORMAL[2];
    m = dot >= 0 ? BRETTEL_TRITANOPIA_PLANE_1 : BRETTEL_TRITANOPIA_PLANE_2;
  } else if (cvdType === 'Deuteranopia') {
    m = MACHADO_DEUTERANOPIA;
  } else {
    m = MACHADO_PROTANOPIA;
  }

  const or = clamp01(m[0] * lr + m[1] * lg + m[2] * lb);
  const og = clamp01(m[3] * lr + m[4] * lg + m[5] * lb);
  const ob = clamp01(m[6] * lr + m[7] * lg + m[8] * lb);

  return [linearToSrgb(or), linearToSrgb(og), linearToSrgb(ob)];
}

/**
 * Simulate an 8-bit RGB triple [0..255] using the exact same CVD model.
 */
export function simulateRgb255(
  rgb: [number, number, number],
  cvdType: CvdType,
): [number, number, number] {
  const out = simulateRgb01([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], cvdType);
  return [
    Math.round(clamp01(out[0]) * 255),
    Math.round(clamp01(out[1]) * 255),
    Math.round(clamp01(out[2]) * 255),
  ];
}

/**
 * Simulate an RGBA ImageData buffer at full resolution without mutating the input.
 * Uses the exact same Machado/Brettel linear-light pipeline as PCCI scoring.
 */
export function simulateRgbaBuffer(
  data: Uint8ClampedArray,
  cvdType: CvdType,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const isTritan = cvdType === 'Tritanopia';
  const mFixed = cvdType === 'Deuteranopia' ? MACHADO_DEUTERANOPIA : MACHADO_PROTANOPIA;
  const tn0 = BRETTEL_TRITANOPIA_NORMAL[0];
  const tn1 = BRETTEL_TRITANOPIA_NORMAL[1];
  const tn2 = BRETTEL_TRITANOPIA_NORMAL[2];

  for (let i = 0; i < data.length; i += 4) {
    const lr = SRGB_U8_TO_LINEAR[data[i]];
    const lg = SRGB_U8_TO_LINEAR[data[i + 1]];
    const lb = SRGB_U8_TO_LINEAR[data[i + 2]];

    const m = isTritan
      ? lr * tn0 + lg * tn1 + lb * tn2 >= 0
        ? BRETTEL_TRITANOPIA_PLANE_1
        : BRETTEL_TRITANOPIA_PLANE_2
      : mFixed;

    const or = clamp01(m[0] * lr + m[1] * lg + m[2] * lb);
    const og = clamp01(m[3] * lr + m[4] * lg + m[5] * lb);
    const ob = clamp01(m[6] * lr + m[7] * lg + m[8] * lb);

    out[i] = Math.round(linearToSrgb(or) * 255);
    out[i + 1] = Math.round(linearToSrgb(og) * 255);
    out[i + 2] = Math.round(linearToSrgb(ob) * 255);
    out[i + 3] = data[i + 3];
  }
  return out;
}
