import { useEffect, useRef, useState } from 'react';
import type { ImageMeta } from '../model/types';
import type { PreviewSurface } from './surface';
import styles from './CanvasView.module.css';

interface Props {
  meta: ImageMeta;
  surface: PreviewSurface;
}

export function CanvasView({ meta, surface }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = size.width ? Math.min(size.width / meta.width, size.height / meta.height, 1) : 1;
  const tx = (size.width - meta.width * scale) / 2;
  const ty = (size.height - meta.height * scale) / 2;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(surface.composite, tx, ty, meta.width * scale, meta.height * scale);
  }, [meta, surface, size, scale, tx, ty]);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-testid="preview-canvas"
        data-image-width={meta.width}
        data-image-height={meta.height}
        data-view-scale={scale}
        data-view-tx={tx}
        data-view-ty={ty}
      />
    </div>
  );
}
