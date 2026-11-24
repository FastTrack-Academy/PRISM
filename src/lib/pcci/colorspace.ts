import type { LabColor, NormalizedRgb } from './types';

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * sRGB (0..1) to linear-light RGB (0..1), IEC 61966-2-1 transfer function
 * matching prism_stage1.py and scikit-image rgb2xyz.
 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Linear-light RGB (0..1) to sRGB (0..1), matching prism_stage1.py and scikit-image xyz2rgb.
 */
export function linearToSrgb(c: number): number {
  const clamped = clamp01(c);
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

// Exact scikit-image 0.22 colorconv.xyz_from_rgb and its matrix inverse rgb_from_xyz (D65 2° observer)
const XYZ_FROM_RGB = [
  0.412453, 0.35758, 0.180423,
  0.212671, 0.71516, 0.072169,
  0.019334, 0.119193, 0.950227,
] as const;

const RGB_FROM_XYZ = [
  3.2404813432005266, -1.5371515162713185, -0.4985363261688878,
  -0.9692549499965682, 1.8759900014898907, 0.0415559265582928,
  0.0556466391351772, -0.2040413383665112, 1.0573110696453443,
] as const;

// D65 2-degree reference white used by skimage.color.xyz2lab / lab2xyz
const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;

const LAB_EPSILON = 0.008856;
const LAB_LINEAR_SCALE = 7.787;
const LAB_OFFSET = 16 / 116;

function xyzF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : LAB_LINEAR_SCALE * t + LAB_OFFSET;
}

function xyzFInv(t: number): number {
  return t > 0.20689655172413793 // 6 / 29, matching skimage._lab2xyz (t > 0.2068966)
    ? t * t * t
    : (t - LAB_OFFSET) / LAB_LINEAR_SCALE;
}

/**
 * Convert normalized sRGB [0..1] to CIELAB (D65, 2°), matching skimage.color.rgb2lab.
 */
export function srgb01ToLab(rgb: NormalizedRgb): LabColor {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  const x = (XYZ_FROM_RGB[0] * r + XYZ_FROM_RGB[1] * g + XYZ_FROM_RGB[2] * b) / D65_X;
  const y = (XYZ_FROM_RGB[3] * r + XYZ_FROM_RGB[4] * g + XYZ_FROM_RGB[5] * b) / D65_Y;
  const z = (XYZ_FROM_RGB[6] * r + XYZ_FROM_RGB[7] * g + XYZ_FROM_RGB[8] * b) / D65_Z;

  const fx = xyzF(x);
  const fy = xyzF(y);
  const fz = xyzF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Convert CIELAB (D65, 2°) to normalized sRGB [0..1] with gamut clipping, matching skimage.color.lab2rgb.
 */
export function labToSrgb01(lab: LabColor): NormalizedRgb {
  const fy = (lab[0] + 16) / 116;
  const fx = lab[1] / 500 + fy;
  const fz = fy - lab[2] / 200;

  const x = Math.max(0, xyzFInv(fx)) * D65_X;
  const y = Math.max(0, xyzFInv(fy)) * D65_Y;
  const z = Math.max(0, xyzFInv(fz)) * D65_Z;

  const rLin = RGB_FROM_XYZ[0] * x + RGB_FROM_XYZ[1] * y + RGB_FROM_XYZ[2] * z;
  const gLin = RGB_FROM_XYZ[3] * x + RGB_FROM_XYZ[4] * y + RGB_FROM_XYZ[5] * z;
  const bLin = RGB_FROM_XYZ[6] * x + RGB_FROM_XYZ[7] * y + RGB_FROM_XYZ[8] * z;

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)];
}

/**
 * Batch convert an interleaved normalized sRGB buffer [r0,g0,b0,...] into an interleaved Lab buffer.
 */
export function rgbBufferToLabBuffer(rgb: Float64Array): Float64Array {
  const out = new Float64Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = srgbToLinear(rgb[i]);
    const g = srgbToLinear(rgb[i + 1]);
    const b = srgbToLinear(rgb[i + 2]);

    const x = (XYZ_FROM_RGB[0] * r + XYZ_FROM_RGB[1] * g + XYZ_FROM_RGB[2] * b) / D65_X;
    const y = (XYZ_FROM_RGB[3] * r + XYZ_FROM_RGB[4] * g + XYZ_FROM_RGB[5] * b) / D65_Y;
    const z = (XYZ_FROM_RGB[6] * r + XYZ_FROM_RGB[7] * g + XYZ_FROM_RGB[8] * b) / D65_Z;

    const fx = xyzF(x);
    const fy = xyzF(y);
    const fz = xyzF(z);

    out[i] = 116 * fy - 16;
    out[i + 1] = 500 * (fx - fy);
    out[i + 2] = 200 * (fy - fz);
  }
  return out;
}

/**
 * Format normalized sRGB [0..1] as uppercase #RRGGBB, matching prism_stage1.py.
 */
export function rgb01ToHex(rgb: NormalizedRgb): string {
  const r = Math.min(255, Math.max(0, Math.round(rgb[0] * 255)));
  const g = Math.min(255, Math.max(0, Math.round(rgb[1] * 255)));
  const b = Math.min(255, Math.max(0, Math.round(rgb[2] * 255)));
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  ).toUpperCase();
}
