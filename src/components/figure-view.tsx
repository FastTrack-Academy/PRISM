'use client';
import { useEffect, useMemo, useRef } from 'react';
import { simulateRaster } from '@/lib/color';
import type { PairEvidence, Profile } from '@/lib/figure';
import type { Raster } from '@/lib/types';
import type {Stage1Result} from '@/lib/stage1';
import styles from './figure.module.css';

// Trace each mask edge into closed loops so a dashed stroke follows the contour.
function outline(r: Raster, result: Stage1Result, id: number) {
  const box = result.regions[id].box,
    edges = new Map<number, number[]>(),
    stride = r.width + 1;
  let anchor = [box.x, box.y],
    best = Infinity;
  function edge(start: number, end: number) {
    const list = edges.get(start);
    if (list) list.push(end);
    else edges.set(start, [end]);
  }
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const p = y * r.width + x;
      if (result.labels[p] !== id) continue;
      const distance = (x - box.x - box.width / 2) ** 2 + (y - box.y - box.height / 2) ** 2;
      if (distance < best) {
        best = distance;
        anchor = [x, y];
      }
      const v = y * stride + x;
      if (y === 0 || result.labels[p - r.width] !== id) edge(v, v + 1);
      if (x === r.width - 1 || result.labels[p + 1] !== id) edge(v + 1, v + stride + 1);
      if (y === r.height - 1 || result.labels[p + r.width] !== id) edge(v + stride + 1, v + stride);
      if (x === 0 || result.labels[p - 1] !== id) edge(v + stride, v);
    }
  const paths: string[] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let p = start;
    paths.push('M' + (p % stride) + ' ' + Math.floor(p / stride));
    do {
      const list = edges.get(p)!;
      const next = list.pop()!;
      if (!list.length) edges.delete(p);
      paths.push('L' + (next % stride) + ' ' + Math.floor(next / stride));
      p = next;
    } while (p !== start);
    paths.push('Z');
  }
  return { path: paths.join(''), anchor };
}
export function FigureView({
  raster,
  result,
  pair,
  mode,
  simulated,
}: {
  raster: Raster;
  result: Stage1Result;
  pair: PairEvidence | null;
  mode: Profile;
  simulated: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = simulated ? simulateRaster(raster, mode) : raster;
    canvas
      .current!.getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
        0,
        0,
      );
  }, [raster, mode, simulated]);
  const masks = useMemo(
    () => (pair ? [outline(raster, result, pair.a), outline(raster, result, pair.b)] : []),
    [raster, result, pair],
  );
  return (
    <div className={styles.picture} style={{ aspectRatio: raster.width + '/' + raster.height }}>
      <canvas
        ref={canvas}
        width={raster.width}
        height={raster.height}
        aria-label={simulated ? 'Simulated figure' : 'Original figure'}
        role="img"
      />
      <svg
        viewBox={'0 0 ' + raster.width + ' ' + raster.height}
        aria-label="Selected region masks, A solid and B dashed"
        role="img"
      >
        {masks.map(({ path, anchor: [x, y] }, i) => {
          const size = Math.max(3, Math.min(16, raster.width / 20, raster.height / 8));
          const left = masks[0].anchor[0] <= masks[1].anchor[0] ? i === 0 : i === 1;
          const lx = Math.max(
            size / 2,
            Math.min(raster.width - size / 2, x + (left ? -1 : 1) * size * 1.8),
          );
          const ly = Math.max(
            size / 2,
            Math.min(raster.height - size / 2, y + (i === 0 ? -1 : 1) * size * 1.6),
          );
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke="white"
                strokeWidth="3.8"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path}
                fill="none"
                stroke="#172338"
                strokeWidth="1.8"
                strokeDasharray={i ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={'M' + x + ' ' + y + 'L' + lx + ' ' + ly}
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={'M' + x + ' ' + y + 'L' + lx + ' ' + ly}
                stroke="#172338"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={lx} cy={ly} r={size * 0.68} stroke="white" fill="#172338" />
              <text
                x={lx}
                y={ly}
                fill="white"
                fontWeight="bold"
                fontSize={size}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {i ? 'B' : 'A'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
