import type { RGB, Vision, Raster } from './types';
import {
  ciede2000,
  clamp01,
  linearToSrgb,
  simulateRgb255,
  simulateRgbaBuffer,
  srgb01ToLab,
  srgbToLinear,
  type CvdType,
} from './pcci';

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const VISION_TO_CVD: Record<Exclude<Vision, 'original'>, CvdType> = {
  deutan: 'Deuteranopia',
  protan: 'Protanopia',
  tritan: 'Tritanopia',
};

/**
 * Simulate full dichromacy using the authoritative PCCI CVD models:
 * - Deuteranopia & Protanopia: Machado, Oliveira & Fernandes (2009), severity 1.0
 * - Tritanopia: Brettel, Viénot & Mollon (1997), two-plane linear-light projection
 */
export function simulateColor(rgb: RGB, mode: Vision): RGB {
  if (mode === 'original') return [...rgb];
  return simulateRgb255(rgb, VISION_TO_CVD[mode]);
}

export function simulateRaster(raster: Raster, mode: Vision): Raster {
  if (mode === 'original') {
    return {
      width: raster.width,
      height: raster.height,
      data: new Uint8ClampedArray(raster.data),
    };
  }
  return {
    width: raster.width,
    height: raster.height,
    data: simulateRgbaBuffer(raster.data, VISION_TO_CVD[mode]),
  };
}

export function lab(rgb: RGB): RGB {
  return srgb01ToLab([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]);
}

export function deltaE2000(a: RGB, b: RGB): number {
  return ciede2000(a, b);
}

export const deltaE = (a: RGB, b: RGB) => deltaE2000(lab(a), lab(b));

export function contrastRatio(a: RGB, b: RGB) {
  const l = (c: RGB) =>
    0.2126 * srgbToLinear(clamp01(c[0] / 255)) +
    0.7152 * srgbToLinear(clamp01(c[1] / 255)) +
    0.0722 * srgbToLinear(clamp01(c[2] / 255));
  const x = l(a),
    y = l(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const hex = (color: RGB) =>
  '#' +
  color
    .map((c) => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

export { linearToSrgb, srgbToLinear };
