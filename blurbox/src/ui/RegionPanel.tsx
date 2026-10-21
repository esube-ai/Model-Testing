import type { Dispatch } from 'react';
import { settingsOf, type Ranges, type RegionSettings } from '../model/defaults';
import type { EditorAction } from '../model/editor';
import { shapeLabel } from '../model/geometry';
import type { Region } from '../model/types';
import { MethodControls } from './MethodControls';
import styles from './RegionPanel.module.css';

interface Props {
  regions: Region[];
  selectedId: string | null;
  dispatch: Dispatch<EditorAction>;
  onDelete: (id: string) => void;
  settings: RegionSettings;
  ranges: Ranges;
  onSettings: (patch: Partial<RegionSettings>, field: string) => void;
}

const METHOD_LABEL = { blur: 'Blur', pixelate: 'Pixelate', fill: 'Fill' } as const;

export function regionName(regions: Region[], r: Region): string {
  return `${shapeLabel(r.shape)} ${regions.indexOf(r) + 1}`;
}

export function RegionPanel({ regions, selectedId, dispatch, onDelete, settings, ranges, onSettings }: Props) {
  const selected = regions.find((r) => r.id === selectedId) ?? null;
  return (
    <section className={styles.panel} aria-labelledby="regions-heading">
      <h2 id="regions-heading" className={styles.heading}>
        Regions <span className={styles.count}>({regions.length})</span>
      </h2>
      {regions.length === 0 ? (
        <p className={styles.hint}>Draw a rectangle, ellipse or brush stroke over the parts to hide.</p>
      ) : (
        <ul className={styles.list} aria-label="Regions">
          {regions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={r.id === selectedId}
                onClick={() => dispatch({ type: 'select', id: r.id === selectedId ? null : r.id })}
                data-testid="region-item"
              >
                {regionName(regions, r)} · {METHOD_LABEL[r.method]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className={styles.selected} data-testid="region-settings">
          <h3 className={styles.subheading}>{regionName(regions, selected)}</h3>
          <MethodControls value={settingsOf(selected)} ranges={ranges} onChange={onSettings} />
          <button type="button" className={styles.danger} onClick={() => onDelete(selected.id)} aria-keyshortcuts="Delete">
            Delete region
          </button>
        </div>
      )}
      {!selected && (
        <div className={styles.selected} data-testid="new-region-settings">
          <h3 className={styles.subheading}>New regions</h3>
          <MethodControls value={settings} ranges={ranges} onChange={onSettings} />
        </div>
      )}
    </section>
  );
}
