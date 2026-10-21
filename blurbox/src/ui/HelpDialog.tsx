import { useEffect, useRef } from 'react';
import { SHORTCUT_GROUPS } from './shortcuts';
import styles from './HelpDialog.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="help-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className={styles.head}>
        <h2 id="help-title">Keyboard shortcuts</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close keyboard shortcuts">
          ×
        </button>
      </div>
      <div className={styles.groups}>
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`sc-${g.title}`}>
            <h3 id={`sc-${g.title}`}>{g.title}</h3>
            <dl className={styles.list}>
              {g.items.map((it) => (
                <div key={it.label} className={styles.row}>
                  <dt>
                    {it.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span aria-hidden="true"> + </span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{it.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className={styles.touch}>
        On touch screens: draw with one finger, pinch to zoom, and drag with two fingers to pan.
      </p>
    </dialog>
  );
}
