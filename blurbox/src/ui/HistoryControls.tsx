import styles from './HistoryControls.module.css';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = mac ? '⌘' : 'Ctrl+';

export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <div className={styles.group} role="group" aria-label="History">
      <button
        type="button"
        className={styles.btn}
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo (${MOD}Z)`}
        aria-keyshortcuts="Control+Z Meta+Z"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />
        </svg>
        <span>Undo</span>
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={onRedo}
        disabled={!canRedo}
        title={`Redo (Shift+${MOD}Z)`}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3" />
        </svg>
        <span>Redo</span>
      </button>
    </div>
  );
}
