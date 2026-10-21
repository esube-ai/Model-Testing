import { describe, expect, it } from 'vitest';
import { DESKTOP_MAX_PIXELS, fitWithin, IOS_MAX_PIXELS, isIOS, maxPixelsForDevice } from '../../src/processing/limits';

const desktop = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140', platform: 'Linux x86_64', maxTouchPoints: 0 };
const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 };

describe('pixel limits', () => {
  it('keeps a 50 MP image at full size on desktop', () => {
    expect(fitWithin(8660, 5774, DESKTOP_MAX_PIXELS)).toEqual({ width: 8660, height: 5774, scale: 1 });
  });

  it('downscales a 50 MP image under the iOS canvas limit, keeping aspect ratio', () => {
    const r = fitWithin(8660, 5774, IOS_MAX_PIXELS);
    expect(r.width * r.height).toBeLessThanOrEqual(IOS_MAX_PIXELS);
    expect(r.width / r.height).toBeCloseTo(8660 / 5774, 2);
    expect(r.scale).toBeLessThan(1);
  });

  it('limits the longest side when asked', () => {
    expect(fitWithin(10000, 100, Infinity, 4096).width).toBe(4096);
  });

  it('detects iOS, including iPadOS desktop mode', () => {
    expect(isIOS(desktop)).toBe(false);
    expect(isIOS(iphone)).toBe(true);
    expect(isIOS(ipad)).toBe(true);
    expect(maxPixelsForDevice(iphone, '')).toBe(IOS_MAX_PIXELS);
    expect(maxPixelsForDevice(desktop, '')).toBe(DESKTOP_MAX_PIXELS);
    expect(maxPixelsForDevice(desktop, '?maxMegapixels=2')).toBe(2_000_000);
  });
});
