import { describe, expect, it } from 'vitest';
import { orientRaster, orientedSize, type Orientation } from '../../src/processing/orientation';
import { createRaster, type Raster } from '../../src/processing/raster';
import { pixel } from '../helpers/fakeImages';

/** 3×2 image whose red channel encodes the pixel index: 0 1 2 / 3 4 5. */
function indexed(): Raster {
  const r = createRaster(3, 2);
  for (let i = 0; i < 6; i++) {
    r.data[i * 4] = i;
    r.data[i * 4 + 3] = 255;
  }
  return r;
}

function grid(r: Raster): number[][] {
  return Array.from({ length: r.height }, (_, y) => Array.from({ length: r.width }, (_, x) => pixel(r, x, y)[0]));
}

describe('EXIF orientation', () => {
  const expected: Record<Orientation, number[][]> = {
    1: [[0, 1, 2], [3, 4, 5]],
    2: [[2, 1, 0], [5, 4, 3]],
    3: [[5, 4, 3], [2, 1, 0]],
    4: [[3, 4, 5], [0, 1, 2]],
    5: [[0, 3], [1, 4], [2, 5]],
    6: [[3, 0], [4, 1], [5, 2]],
    7: [[5, 2], [4, 1], [3, 0]],
    8: [[2, 5], [1, 4], [0, 3]],
  };

  it.each(Object.entries(expected))('orientation %s produces the upright image', (o, want) => {
    const out = orientRaster(indexed(), Number(o) as Orientation);
    expect(grid(out)).toEqual(want);
  });

  it('swaps dimensions only for orientations 5-8', () => {
    expect(orientedSize(1, 4000, 3000)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(3, 4000, 3000)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(6, 4000, 3000)).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize(8, 4000, 3000)).toEqual({ width: 3000, height: 4000 });
  });
});
