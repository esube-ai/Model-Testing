import type { Tool } from '../model/types';

const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function ToolIcon({ tool }: { tool: Tool }) {
  switch (tool) {
    case 'select':
      return <svg {...common}><path d="M5 3l14 8-6 2-3 6z" /></svg>;
    case 'rect':
      return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="1" /></svg>;
    case 'ellipse':
      return <svg {...common}><ellipse cx="12" cy="12" rx="8" ry="6" /></svg>;
    case 'brush':
      return <svg {...common}><path d="M4 20c3 0 4-2 4-4s2-3 3-3M14 4l6 6-7 7-6-6z" /></svg>;
    case 'pan':
      return <svg {...common}><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>;
  }
}
