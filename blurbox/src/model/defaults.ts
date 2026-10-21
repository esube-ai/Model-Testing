import type { EdgeMode, HideMethod, Region, Shape } from './types';

/** Settings applied to newly drawn regions (the last ones the user picked). */
export interface RegionSettings {
  method: HideMethod;
  blurSigma: number;
  pixelBlock: number;
  fillColor: string;
  edge: EdgeMode;
  featherWidth: number;
}

export interface Ranges {
  blurSigma: [number, number];
  pixelBlock: [number, number];
  featherWidth: [number, number];
  brushSize: [number, number];
}

/** Slider ranges scale with the image so the controls feel the same on a 1 MP and a 50 MP photo. */
export function rangesFor(width: number, height: number): Ranges {
  const long = Math.max(width, height);
  return {
    blurSigma: [2, Math.max(40, Math.round(long / 25))],
    pixelBlock: [2, Math.max(48, Math.round(long / 12))],
    featherWidth: [1, Math.max(32, Math.round(long / 30))],
    brushSize: [2, Math.max(120, Math.round(long / 6))],
  };
}

export function defaultSettings(width: number, height: number): RegionSettings {
  const long = Math.max(width, height);
  return {
    method: 'blur',
    blurSigma: Math.max(6, Math.round(long / 120)),
    pixelBlock: Math.max(8, Math.round(long / 60)),
    fillColor: '#000000',
    edge: 'hard',
    featherWidth: Math.max(4, Math.round(long / 100)),
  };
}

export function defaultBrushSize(width: number, height: number): number {
  return Math.max(12, Math.round(Math.max(width, height) / 30));
}

export function makeRegion(id: string, shape: Shape, s: RegionSettings): Region {
  return { id, shape, ...s };
}

export function settingsOf(r: Region): RegionSettings {
  return {
    method: r.method,
    blurSigma: r.blurSigma,
    pixelBlock: r.pixelBlock,
    fillColor: r.fillColor,
    edge: r.edge,
    featherWidth: r.featherWidth,
  };
}
