import type { Tool } from '../model/types';
import { ToolIcon } from './icons';
import styles from './Toolbar.module.css';

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', key: 'E' },
  { tool: 'brush', label: 'Brush', key: 'B' },
  { tool: 'pan', label: 'Pan', key: 'H' },
];

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
  brushSize: number;
  brushRange: [number, number];
  onBrushSize: (n: number) => void;
}

export function Toolbar({ tool, onTool, brushSize, brushRange, onBrushSize }: Props) {
  return (
    <div className={styles.toolbar}>
      <fieldset className={styles.tools}>
        <legend className="visually-hidden">Tool</legend>
        {TOOLS.map((t) => (
          <label key={t.tool} className={styles.tool} title={`${t.label} (${t.key})`} data-active={tool === t.tool}>
            <input
              type="radio"
              name="tool"
              value={t.tool}
              checked={tool === t.tool}
              onChange={() => onTool(t.tool)}
              className={styles.radio}
              aria-keyshortcuts={t.key}
            />
            <ToolIcon tool={t.tool} />
            <span className={styles.toolLabel}>{t.label}</span>
          </label>
        ))}
      </fieldset>
      {tool === 'brush' && (
        <label className={styles.brushSize}>
          <span>Brush size</span>
          <input
            type="range"
            min={brushRange[0]}
            max={brushRange[1]}
            value={brushSize}
            onChange={(e) => onBrushSize(Number(e.target.value))}
            aria-keyshortcuts="[ ]"
            aria-valuetext={`${brushSize} pixels`}
          />
          <output>{brushSize}px</output>
        </label>
      )}
    </div>
  );
}
