import styles from './CompareButton.module.css';

interface Props {
  active: boolean;
  onChange: (showOriginal: boolean) => void;
}

/** Press and hold (pointer, Space or Enter) to see the original image. */
export function CompareButton({ active, onChange }: Props) {
  return (
    <button
      type="button"
      className={styles.btn}
      aria-pressed={active}
      aria-keyshortcuts="\"
      title="Hold to show the original (\)"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          onChange(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') onChange(false);
      }}
      onBlur={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {active ? 'Showing original' : 'Hold to compare'}
    </button>
  );
}
