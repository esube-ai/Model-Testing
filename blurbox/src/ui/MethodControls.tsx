import { useId } from 'react';
import type { Ranges, RegionSettings } from '../model/defaults';
import type { EdgeMode, HideMethod } from '../model/types';
import styles from './MethodControls.module.css';

interface Props {
  value: RegionSettings;
  ranges: Ranges;
  /** `field` identifies the control so consecutive changes (slider drags) become one undo step. */
  onChange: (patch: Partial<RegionSettings>, field: string) => void;
}

const METHODS: { value: HideMethod; label: string; key: string }[] = [
  { value: 'blur', label: 'Blur', key: '1' },
  { value: 'pixelate', label: 'Pixelate', key: '2' },
  { value: 'fill', label: 'Solid fill', key: '3' },
];

function Slider(props: {
  label: string;
  value: number;
  range: [number, number];
  unit: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.slider}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={props.range[0]}
        max={props.range[1]}
        step={1}
        value={Math.round(props.value)}
        aria-valuetext={`${Math.round(props.value)} ${props.unit}`}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{Math.round(props.value)}</output>
    </div>
  );
}

export function MethodControls({ value, ranges, onChange }: Props) {
  const name = useId();
  const edgeName = useId();
  const colorId = useId();
  const tipId = useId();
  return (
    <div className={styles.controls}>
      <fieldset className={styles.group} aria-describedby={tipId}>
        <legend>Hide method</legend>
        <div className={styles.segmented}>
          {METHODS.map((m) => (
            <label key={m.value} className={styles.segment} data-active={value.method === m.value}>
              <input
                type="radio"
                name={name}
                value={m.value}
                checked={value.method === m.value}
                onChange={() => onChange({ method: m.value }, 'method')}
                aria-keyshortcuts={m.key}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p id={tipId} className={styles.tip} role="note">
        <strong>Tip:</strong> blur and pixelation of small text can sometimes be partly reversed. For passwords,
        account numbers and other sensitive text, use <strong>Solid fill</strong>.
      </p>

      {value.method === 'blur' && (
        <>
          <Slider
            label="Blur strength"
            value={value.blurSigma}
            range={ranges.blurSigma}
            unit="pixels"
            onChange={(n) => onChange({ blurSigma: n }, 'blurSigma')}
          />
          <fieldset className={styles.group}>
            <legend>Edge</legend>
            <div className={styles.segmented}>
              {(['hard', 'feather'] as EdgeMode[]).map((e) => (
                <label key={e} className={styles.segment} data-active={value.edge === e}>
                  <input
                    type="radio"
                    name={edgeName}
                    value={e}
                    checked={value.edge === e}
                    onChange={() => onChange({ edge: e }, 'edge')}
                  />
                  <span>{e === 'hard' ? 'Hard' : 'Feathered'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {value.edge === 'feather' && (
            <Slider
              label="Feather width"
              value={value.featherWidth}
              range={ranges.featherWidth}
              unit="pixels"
              onChange={(n) => onChange({ featherWidth: n }, 'featherWidth')}
            />
          )}
        </>
      )}

      {value.method === 'pixelate' && (
        <Slider
          label="Block size"
          value={value.pixelBlock}
          range={ranges.pixelBlock}
          unit="pixels"
          onChange={(n) => onChange({ pixelBlock: n }, 'pixelBlock')}
        />
      )}

      {value.method === 'fill' && (
        <div className={styles.color}>
          <label htmlFor={colorId}>Fill colour</label>
          <input
            id={colorId}
            type="color"
            value={value.fillColor}
            onChange={(e) => onChange({ fillColor: e.target.value }, 'fillColor')}
          />
          <code>{value.fillColor}</code>
        </div>
      )}
    </div>
  );
}
