import { lab } from './color';
import type { Raster, Region, RGB } from './types';

// SLIC assigns pixels to local centers using Lab color and image coordinates.
// Splitting disconnected islands keeps every returned mask spatially connected.
export function slic(r: Raster, spacing: number) {
  const { width, height, data } = r;
  const n = width * height,
    colors = new Float32Array(3 * n);
  const cache = new Map<number, RGB>();
  for (let p = 0; p < n; p++) {
    const i = p * 4,
      key = data[i] * 65536 + data[i + 1] * 256 + data[i + 2];
    let value = cache.get(key);
    if (!value) {
      value = lab([data[i], data[i + 1], data[i + 2]]);
      if (cache.size < 8192) cache.set(key, value);
    }
    colors.set(value, 3 * p);
  }
  const centers: number[][] = [];
  for (let top = 0; top < height; top += spacing)
    for (let left = 0; left < width; left += spacing) {
      const x = Math.floor((left + Math.min(width - 1, left + spacing - 1)) / 2);
      const y = Math.floor((top + Math.min(height - 1, top + spacing - 1)) / 2);
      const i = 3 * (y * width + x);
      centers.push([colors[i], colors[i + 1], colors[i + 2], x, y]);
    }
  const labels = new Int32Array(n),
    best = new Float64Array(n);
  const spatialWeight = (10 / spacing) ** 2;
  for (let iteration = 0; iteration < 5; iteration++) {
    best.fill(Infinity);
    for (let id = 0; id < centers.length; id++) {
      const [l, a, b, cx, cy] = centers[id];
      for (
        let y = Math.max(0, Math.ceil(cy - spacing));
        y <= Math.min(height - 1, Math.floor(cy + spacing));
        y++
      ) {
        for (
          let x = Math.max(0, Math.ceil(cx - spacing));
          x <= Math.min(width - 1, Math.floor(cx + spacing));
          x++
        ) {
          const p = y * width + x,
            i = p * 3;
          const dist =
            (colors[i] - l) ** 2 +
            (colors[i + 1] - a) ** 2 +
            (colors[i + 2] - b) ** 2 +
            spatialWeight * ((x - cx) ** 2 + (y - cy) ** 2);
          if (dist < best[p]) {
            best[p] = dist;
            labels[p] = id;
          }
        }
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0, 0, 0]);
    for (let p = 0; p < n; p++) {
      const s = sums[labels[p]],
        i = p * 3;
      s[0] += colors[i];
      s[1] += colors[i + 1];
      s[2] += colors[i + 2];
      s[3] += p % width;
      s[4] += Math.floor(p / width);
      s[5]++;
    }
    sums.forEach((s, id) => {
      if (s[5]) centers[id] = s.slice(0, 5).map((v) => v / s[5]);
    });
  }
  const regions: Region[] = [],
    connected = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n),
    queue = new Int32Array(n);
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const cluster = labels[seed],
      rgb: RGB = [0, 0, 0];
    let count = 1,
      left = width,
      right = 0,
      top = height,
      bottom = 0,
      squares = 0;
    queue[0] = seed;
    visited[seed] = 1;
    function visit(q: number) {
      if (!visited[q] && labels[q] === cluster) {
        visited[q] = 1;
        queue[count++] = q;
      }
    }
    for (let head = 0; head < count; head++) {
      const p = queue[head],
        x = p % width,
        y = Math.floor(p / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let ch = 0; ch < 3; ch++) {
        const v = data[p * 4 + ch];
        rgb[ch] += v;
        squares += v * v;
      }
      if (x > 0) visit(p - 1);
      if (x + 1 < width) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y + 1 < height) visit(p + width);
    }
    if (count < 4) continue;
    const id = regions.length,
      color = rgb.map((v) => v / count) as RGB;
    regions.push({
      id,
      area: count,
      color,
      variance: Math.max(0, squares / count - color.reduce((s, v) => s + v * v, 0)),
      box: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
    });
    for (let i = 0; i < count; i++) connected[queue[i]] = id;
  }
  return { regions, labels: connected };
}
