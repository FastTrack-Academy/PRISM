// Next 16's Windows export can leave route-segment separators as directories.
// The browser requests the dotted filename. Keep the generated copy as well.
import { copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

if (process.platform === 'win32') {
  for (const relative of await readdir('out', { recursive: true })) {
    const parts = relative.split(path.sep);
    const start = parts.findIndex((part) => part.startsWith('__next.'));
    if (start < 0 || start === parts.length - 1 || !relative.endsWith('.txt')) continue;
    const filename = parts.slice(start).join('.');
    await copyFile(
      path.join('out', relative),
      path.join('out', ...parts.slice(0, start), filename),
    );
  }
}
