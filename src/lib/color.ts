import type { RGB, Vision, Raster } from './types';
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const linear = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
const encoded = (n: number) => (n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055);
// Machado, Oliveira & Fernandes (2009), severity 100. Linear-light sRGB.
const matrices: Record<Exclude<Vision, 'original'>, number[]> = {
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritan: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
};
const linearLUT = Array.from({ length: 256 }, (_, i) => linear(i / 255));
export function simulateColor(rgb: RGB, mode: Vision): RGB {
  if (mode === 'original') return [...rgb];
  const m = matrices[mode];
  const [r, g, b] = rgb.map((c) => linearLUT[Math.round(clamp(c, 0, 255))]);
  return [0, 3, 6].map((i) =>
    Math.floor(clamp(encoded(m[i] * r + m[i + 1] * g + m[i + 2] * b)) * 255 + 1e-8),
  ) as RGB;
}
export function simulateRaster(raster: Raster, mode: Vision): Raster {
  const output = new Uint8ClampedArray(raster.data);
  if (mode !== 'original')
    for (let i = 0; i < output.length; i += 4) {
      const c = simulateColor([output[i], output[i + 1], output[i + 2]], mode);
      output[i] = c[0];
      output[i + 1] = c[1];
      output[i + 2] = c[2];
    }
  return { width: raster.width, height: raster.height, data: output };
}
export function lab(rgb: RGB): RGB {
  const [r, g, b] = rgb.map((c) => linear(c / 255));
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : (v * (24389 / 27)) / 116 + 16 / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE2000(a: RGB, b: RGB): number {
  const rad = Math.PI / 180,
    deg = 180 / Math.PI;
  const c1 = Math.hypot(a[1], a[2]),
    c2 = Math.hypot(b[1], b[2]),
    cb = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a[1],
    ap2 = (1 + g) * b[1];
  const cp1 = Math.hypot(ap1, a[2]),
    cp2 = Math.hypot(ap2, b[2]);
  const hue = (y: number, x: number) => (Math.atan2(y, x) * deg + 360) % 360;
  const h1 = cp1 === 0 ? 0 : hue(a[2], ap1),
    h2 = cp2 === 0 ? 0 : hue(b[2], ap2);
  const dl = b[0] - a[0],
    dc = cp2 - cp1;
  let dh = h2 - h1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);
  const lbar = (a[0] + b[0]) / 2,
    cbar = (cp1 + cp2) / 2;
  let hbar = h1 + h2;
  if (cp1 * cp2 !== 0)
    hbar = Math.abs(h1 - h2) <= 180 ? hbar / 2 : hbar < 360 ? (hbar + 360) / 2 : (hbar - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos((hbar - 30) * rad) +
    0.24 * Math.cos(2 * hbar * rad) +
    0.32 * Math.cos((3 * hbar + 6) * rad) -
    0.2 * Math.cos((4 * hbar - 63) * rad);
  const sl = 1 + (0.015 * (lbar - 50) ** 2) / Math.sqrt(20 + (lbar - 50) ** 2),
    sc = 1 + 0.045 * cbar,
    sh = 1 + 0.015 * cbar * t;
  const rt =
    -2 *
    Math.sqrt(cbar ** 7 / (cbar ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hbar - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dl / sl) ** 2 + (dc / sc) ** 2 + (dH / sh) ** 2 + rt * (dc / sc) * (dH / sh));
}
export const deltaE = (a: RGB, b: RGB) => deltaE2000(lab(a), lab(b));
export function contrastRatio(a: RGB, b: RGB) {
  const l = (c: RGB) =>
    0.2126 * linear(c[0] / 255) + 0.7152 * linear(c[1] / 255) + 0.0722 * linear(c[2] / 255);
  const x = l(a),
    y = l(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const hex = (color: RGB) =>
  '#' + color.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
