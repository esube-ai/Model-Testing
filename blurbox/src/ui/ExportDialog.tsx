import { useEffect, useId, useRef, useState } from 'react';
import type { ExportFormat, ImageMeta } from '../model/types';
import styles from './ExportDialog.module.css';

interface Props {
  open: boolean;
  meta: ImageMeta;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onExport: (opts: { format: ExportFormat; quality: number; filename: string }) => void;
}

export const EXTENSIONS: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG (lossless)' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
];

/** Removes characters that aren't allowed in file names on common systems. */
export function sanitizeFilename(name: string): string {
  const printable = [...name].filter((c) => c.charCodeAt(0) >= 0x20).join('');
  return printable.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim().slice(0, 200) || 'image-blurred';
}

export function ExportDialog({ open, meta, busy, error, onCancel, onExport }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<ExportFormat>(meta.format);
  const [quality, setQuality] = useState(92);
  const [filename, setFilename] = useState(`${meta.name}-blurred`);
  const formatName = useId();
  const qualityId = useId();
  const nameId = useId();

  // Reset defaults whenever a different image is exported.
  const [forImage, setForImage] = useState(meta);
  if (forImage !== meta) {
    setForImage(meta);
    setFormat(meta.format);
    setFilename(`${meta.name}-blurred`);
  }

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
      aria-labelledby="export-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        method="dialog"
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onExport({ format, quality: quality / 100, filename: sanitizeFilename(filename) });
        }}
      >
        <h2 id="export-title" className={styles.title}>
          Export image
        </h2>
        <p className={styles.meta}>
          Full resolution: {meta.width} × {meta.height} px
        </p>

        <fieldset className={styles.formats}>
          <legend>Format</legend>
          {FORMATS.map((f) => (
            <label key={f.value} className={styles.radio}>
              <input type="radio" name={formatName} value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} />
              {f.label}
            </label>
          ))}
        </fieldset>

        {format !== 'png' && (
          <div className={styles.field}>
            <label htmlFor={qualityId}>Quality</label>
            <input
              id={qualityId}
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              aria-valuetext={`${quality} percent`}
            />
            <output htmlFor={qualityId}>{quality}%</output>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={nameId}>File name</label>
          <div className={styles.filename}>
            <input id={nameId} type="text" value={filename} onChange={(e) => setFilename(e.target.value)} spellCheck={false} autoComplete="off" />
            <span aria-hidden="true">.{EXTENSIONS[format]}</span>
          </div>
        </div>

        <p className={styles.privacy}>
          Hidden areas are flattened into the pixels. All metadata (EXIF, GPS location, camera details, thumbnails) is
          removed. The file is created on this device.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={busy} aria-busy={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
