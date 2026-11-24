'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Box } from '@/lib/types';
import styles from './figure.module.css';

export function FigureCrop({
  source,
  onApply,
}: {
  source: HTMLCanvasElement;
  onApply: (box: Box) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    start = useRef<number[] | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, width: source.width, height: source.height });
  useEffect(() => {
    canvas.current!.getContext('2d')!.drawImage(source, 0, 0);
  }, [source]);
  function point(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(source.width, Math.round(((e.clientX - rect.left) * source.width) / rect.width)),
      ),
      Math.max(
        0,
        Math.min(source.height, Math.round(((e.clientY - rect.top) * source.height) / rect.height)),
      ),
    ];
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const [x, y] = point(e),
      [sx, sy] = start.current;
    setBox({
      x: Math.min(x, sx),
      y: Math.min(y, sy),
      width: Math.abs(x - sx),
      height: Math.abs(y - sy),
    });
  }
  const valid =
    Object.values(box).every(Number.isInteger) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= source.width &&
    box.y + box.height <= source.height;
  return (
    <section className={styles.panel}>
      <h2>Select a figure</h2>
      <p>Drag a rectangle around the figure, or enter its pixel coordinates.</p>
      <div
        className={styles.crop}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = point(e);
        }}
        onPointerMove={move}
        onPointerUp={(e) => {
          move(e);
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <canvas
          ref={canvas}
          width={source.width}
          height={source.height}
          aria-label="Source page for cropping"
        />
        <div
          style={{
            left: (box.x / source.width) * 100 + '%',
            top: (box.y / source.height) * 100 + '%',
            width: (box.width / source.width) * 100 + '%',
            height: (box.height / source.height) * 100 + '%',
          }}
        />
      </div>
      <div className={styles.tools}>
        {(['x', 'y', 'width', 'height'] as const).map((k) => (
          <label key={k}>
            {k.toUpperCase()}{' '}
            <input
              type="number"
              min={k === 'x' || k === 'y' ? 0 : 1}
              value={Number.isFinite(box[k]) ? box[k] : ''}
              onChange={(e) => setBox({ ...box, [k]: e.target.valueAsNumber })}
            />
          </label>
        ))}
        <button className="button primary" disabled={!valid} onClick={() => onApply(box)}>
          Analyze crop
        </button>
      </div>
    </section>
  );
}
