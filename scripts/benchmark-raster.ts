import { spawnSync } from 'node:child_process';
import type { Raster } from '../src/lib/types';

export function decode(file: string, maxEdge = 700, crop?: readonly number[]): Raster {
  const script = [
    'from PIL import Image',
    'import sys,struct',
    'im=Image.open(sys.argv[1]).convert("RGBA")',
    'im=im.crop(tuple(map(int,sys.argv[3:]))) if len(sys.argv)>3 else im',
    'im.thumbnail((int(sys.argv[2]),int(sys.argv[2])), Image.Resampling.LANCZOS)',
    'sys.stdout.buffer.write(struct.pack("<II",im.width,im.height)+im.tobytes())',
  ].join(';');
  const process = spawnSync(
    'python',
    ['-c', script, file, String(maxEdge), ...(crop ?? []).map(String)],
    {
      maxBuffer: maxEdge * maxEdge * 4 + 1024,
    },
  );
  if (process.status !== 0) {
    throw new Error(`${file}: ${process.stderr.toString()}`);
  }
  const bytes = process.stdout;
  const width = bytes.readUInt32LE(0);
  const height = bytes.readUInt32LE(4);
  return { width, height, data: new Uint8ClampedArray(bytes.subarray(8)) };
}
