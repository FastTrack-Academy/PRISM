import { srgb01ToLab } from './colorspace';
import type { LabColor, NormalizedRgb } from './types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const POW25_7 = Math.pow(25, 7);

/**
 * Complete CIEDE2000 colour-difference formula (Sharma, Wu & Dalal, 2005)
 * with kL = kC = kH = 1, matching skimage.color.deltaE_ciede2000.
 */
export function ciede2000(lab1: LabColor, lab2: LabColor): number {
  const L1 = lab1[0];
  const a1 = lab1[1];
  const b1 = lab1[2];
  const L2 = lab2[0];
  const a2 = lab2[1];
  const b2 = lab2[2];

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = 0.5 * (C1 + C2);
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  let h1p = C1p === 0 ? 0 : Math.atan2(b1, a1p) * RAD_TO_DEG;
  if (h1p < 0) h1p += 360;
  let h2p = C2p === 0 ? 0 : Math.atan2(b2, a2p) * RAD_TO_DEG;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  const Cprod = C1p * C2p;
  let dhp = 0;
  if (Cprod !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }

  const dHp = 2 * Math.sqrt(Cprod) * Math.sin((dhp * DEG_TO_RAD) / 2);

  const Lbarp = 0.5 * (L1 + L2);
  const Cbarp = 0.5 * (C1p + C2p);

  let Hbarp: number;
  if (Cprod === 0) {
    Hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    Hbarp = 0.5 * (h1p + h2p);
  } else if (h1p + h2p < 360) {
    Hbarp = 0.5 * (h1p + h2p + 360);
  } else {
    Hbarp = 0.5 * (h1p + h2p - 360);
  }

  const T =
    1 -
    0.17 * Math.cos((Hbarp - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * Hbarp * DEG_TO_RAD) +
    0.32 * Math.cos((3 * Hbarp + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * Hbarp - 63) * DEG_TO_RAD);

  const dTheta = 30 * Math.exp(-Math.pow((Hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));

  const L50Sq = (Lbarp - 50) * (Lbarp - 50);
  const SL = 1 + (0.015 * L50Sq) / Math.sqrt(20 + L50Sq);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * DEG_TO_RAD) * RC;

  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  const sumSq = termL * termL + termC * termC + termH * termH + RT * termC * termH;
  return sumSq <= 0 ? 0 : Math.sqrt(sumSq);
}

/**
 * Compute symmetric k x k CIEDE2000 distance matrix for a palette of normalized sRGB colours,
 * matching prism_stage1.py `distances(rgb)`.
 */
export function paletteDistanceMatrix(paletteRgb: readonly NormalizedRgb[]): Float64Array {
  const k = paletteRgb.length;
  const labs: LabColor[] = paletteRgb.map(srgb01ToLab);
  const matrix = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const d = ciede2000(labs[i], labs[j]);
      matrix[i * k + j] = d;
      matrix[j * k + i] = d;
    }
  }
  return matrix;
}
