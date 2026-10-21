import styles from './ZoomControls.module.css';

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onFit, onActualSize }: Props) {
  const pct = Math.round(scale * 100);
  return (
    <div className={styles.group} role="group" aria-label="Zoom">
      <button type="button" className={styles.btn} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
        −
      </button>
      <output className={styles.level} aria-label={`Zoom level ${pct}%`} data-testid="zoom-level">
        {pct}%
      </output>
      <button type="button" className={styles.btn} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
        +
      </button>
      <button type="button" className={styles.btn} onClick={onFit} title="Fit to screen (Ctrl/Cmd+0)">
        Fit
      </button>
      <button type="button" className={styles.btn} onClick={onActualSize} title="Actual size (Ctrl/Cmd+1)">
        100%
      </button>
    </div>
  );
}
