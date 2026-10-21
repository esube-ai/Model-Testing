import { HANDLES, handlePosition, shapeBounds } from '../model/geometry';
import type { Region } from '../model/types';
import type { Size, View } from './viewTransform';
import styles from './RegionOverlay.module.css';

interface Props {
  regions: Region[];
  selectedId: string | null;
  view: View;
  viewport: Size;
  brushCursor: { x: number; y: number; size: number } | null;
  coarse: boolean;
}

function ShapeEl({ region, view, className }: { region: Region; view: View; className: string }) {
  const s = region.shape;
  const k = view.scale;
  if (s.kind === 'rect') {
    return <rect className={className} x={s.x * k + view.tx} y={s.y * k + view.ty} width={s.w * k} height={s.h * k} />;
  }
  if (s.kind === 'ellipse') {
    return (
      <ellipse
        className={className}
        cx={(s.x + s.w / 2) * k + view.tx}
        cy={(s.y + s.h / 2) * k + view.ty}
        rx={(s.w / 2) * k}
        ry={(s.h / 2) * k}
      />
    );
  }
  const p = s.points;
  let d = `M${p[0] * k + view.tx} ${p[1] * k + view.ty}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i] * k + view.tx} ${p[i + 1] * k + view.ty}`;
  if (p.length === 2) d += 'l0.01 0';
  return <path className={`${className} ${styles.brush}`} d={d} strokeWidth={Math.max(1, s.size * k)} />;
}

/** Outlines and handles for regions, drawn in screen space so lines stay crisp at any zoom. */
export function RegionOverlay({ regions, selectedId, view, viewport, brushCursor, coarse }: Props) {
  const selected = regions.find((r) => r.id === selectedId);
  const hs = coarse ? 16 : 10;
  return (
    <svg className={styles.overlay} width={viewport.width} height={viewport.height} aria-hidden="true" data-testid="region-overlay">
      {regions.map((r) => (
        <g key={r.id} data-region-id={r.id} data-selected={r.id === selectedId} data-shape={r.shape.kind}>
          <ShapeEl region={r} view={view} className={styles.outlineDark} />
          <ShapeEl region={r} view={view} className={r.id === selectedId ? styles.outlineSelected : styles.outlineLight} />
        </g>
      ))}
      {selected &&
        (() => {
          const b = shapeBounds(selected.shape);
          const k = view.scale;
          return (
            <g data-testid="selection-handles">
              <rect className={styles.bounds} x={b.x * k + view.tx} y={b.y * k + view.ty} width={b.w * k} height={b.h * k} />
              {HANDLES.map((h) => {
                const p = handlePosition(b, h);
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    className={styles.handle}
                    x={p.x * k + view.tx - hs / 2}
                    y={p.y * k + view.ty - hs / 2}
                    width={hs}
                    height={hs}
                    rx={2}
                  />
                );
              })}
            </g>
          );
        })()}
      {brushCursor && (
        <circle
          className={styles.brushCursor}
          cx={brushCursor.x * view.scale + view.tx}
          cy={brushCursor.y * view.scale + view.ty}
          r={Math.max(2, (brushCursor.size / 2) * view.scale)}
        />
      )}
    </svg>
  );
}
