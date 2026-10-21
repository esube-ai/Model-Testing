export interface ShortcutInfo {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutInfo[];
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? '⌘' : 'Ctrl';

/** Single source of truth for the "?" overlay. Handlers live in useShortcuts. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tools',
    items: [
      { keys: ['V'], label: 'Select / move' },
      { keys: ['R'], label: 'Rectangle' },
      { keys: ['E'], label: 'Ellipse' },
      { keys: ['B'], label: 'Brush' },
      { keys: ['H'], label: 'Pan' },
      { keys: ['['], label: 'Smaller brush' },
      { keys: [']'], label: 'Larger brush' },
    ],
  },
  {
    title: 'Regions',
    items: [
      { keys: ['N'], label: 'Add a rectangle in the middle of the view' },
      { keys: ['1'], label: 'Hide with blur' },
      { keys: ['2'], label: 'Hide with pixelate' },
      { keys: ['3'], label: 'Hide with solid fill' },
      { keys: ['Arrows'], label: 'Move selected region (Shift: 10×)' },
      { keys: ['Alt', 'Arrows'], label: 'Resize selected region (Shift: 10×)' },
      { keys: ['.'], label: 'Select next region' },
      { keys: [','], label: 'Select previous region' },
      { keys: ['Delete'], label: 'Delete selected region' },
      { keys: ['Esc'], label: 'Deselect' },
    ],
  },
  {
    title: 'History',
    items: [
      { keys: [MOD, 'Z'], label: 'Undo' },
      { keys: ['Shift', MOD, 'Z'], label: 'Redo' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['+'], label: 'Zoom in' },
      { keys: ['−'], label: 'Zoom out' },
      { keys: [MOD, '0'], label: 'Fit to screen' },
      { keys: [MOD, '1'], label: 'Actual size (100%)' },
      { keys: ['Space', 'drag'], label: 'Pan' },
      { keys: ['\\'], label: 'Hold to show the original' },
    ],
  },
  {
    title: 'File',
    items: [
      { keys: [MOD, 'O'], label: 'Open image' },
      { keys: [MOD, 'S'], label: 'Export' },
      { keys: ['?'], label: 'Show this list' },
    ],
  },
];
