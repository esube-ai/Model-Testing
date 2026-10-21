export type Tool = 'select' | 'rect' | 'ellipse' | 'brush' | 'pan';

export interface RectShape {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An ellipse inscribed in its bounding box. */
export interface EllipseShape {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A freehand stroke: flat [x0, y0, x1, y1, …] path of a round brush `size` pixels wide. */
export interface BrushShape {
  kind: 'brush';
  points: number[];
  size: number;
}

export type Shape = RectShape | EllipseShape | BrushShape;

export type HideMethod = 'blur' | 'pixelate' | 'fill';
export type EdgeMode = 'hard' | 'feather';

/**
 * A region to hide. Geometry is in full-resolution image pixels. Every method keeps its own
 * setting so switching methods back and forth does not lose them.
 */
export interface Region {
  id: string;
  shape: Shape;
  method: HideMethod;
  /** Gaussian sigma in image pixels. */
  blurSigma: number;
  /** Pixelation block edge in image pixels. */
  pixelBlock: number;
  /** CSS hex color, #rrggbb. */
  fillColor: string;
  /** Feathering applies to blur only: the effect fades (never to zero) toward the rim, inside the shape. */
  edge: EdgeMode;
  featherWidth: number;
}

export interface ImageMeta {
  name: string;
  /** Upright dimensions of the working image (after EXIF orientation and any downscale). */
  width: number;
  height: number;
  /** Upright dimensions of the file as stored, before any downscale. */
  sourceWidth: number;
  sourceHeight: number;
  downscaled: boolean;
  format: 'jpeg' | 'png' | 'webp';
  hasAlpha: boolean;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';
