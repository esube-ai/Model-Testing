# BlurBox

Hide parts of an image (faces, number plates, addresses, account numbers) entirely in your browser.
Open an image, mark the regions to hide, choose how to hide each one, check the result, and export
a new file in which those regions are permanently destroyed in the pixels.

**Your image never leaves your device.** There is no server, no upload, no analytics and no storage:
the production page is served with a Content-Security-Policy of `connect-src 'none'`, so it *cannot*
make network requests, and a test fails if it makes any after loading.

## Setup

Requirements: Node.js 20+ (tested with Node 22) and npm.

```bash
cd blurbox
npm install
```

The end-to-end tests use Playwright's Chromium. If you don't already have it:
`npx playwright install chromium`.

## Run

```bash
npm run dev       # development server at http://localhost:5173
npm run build     # type-check (tsc) + lint (ESLint, zero warnings) + production build to dist/
npm run preview   # serve the production build at http://localhost:4173
```

`dist/` is a static site. Host it anywhere static files can be served, or open it with `npm run preview`.

## Test

```bash
npm test             # Vitest unit tests (processing, orientation, metadata, history, geometry…)
npm run test:e2e     # Playwright end-to-end tests at 400 px (touch) and 1440 px; builds are served by `vite preview`
npm run lint         # ESLint only
npm run typecheck    # TypeScript only
```

Run `npm run build` before `npm run test:e2e` so the tests exercise the current production build.
The 50-megapixel performance test (`tests/e2e/performance.spec.ts`) needs roughly 2 GB of free memory.

## User guide

### Open an image

- Click **Open image** (or press **Ctrl/⌘ + O**), **drop** a file anywhere on the window, or **paste** an
  image from the clipboard (**Ctrl/⌘ + V**).
- JPEG, PNG and WebP are supported, up to 50 megapixels and beyond on desktop. Phone photos are shown
  upright using their EXIF orientation.
- On iPhone and iPad, Safari can't process images larger than about 16.7 megapixels. Larger images are
  loaded at a reduced size, and BlurBox tells you the size that will be exported.

### Mark regions

| Tool | Key | How |
|---|---|---|
| Rectangle | R | Drag to draw. Hold Shift for a square. |
| Ellipse | E | Drag to draw. Hold Shift for a circle. |
| Brush | B | Paint freehand. Change the size with the slider or **[** and **]**. |
| Select | V | Click a region to select it, drag to move it, drag a handle to resize it. |
| Pan | H | Drag to move around (or hold **Space** and drag with any tool). |

Delete the selected region with **Delete** or the **Delete region** button. The region list in the side
panel (below the image on phones) shows every region; click one to select it. Regions may extend past the
edge of the image: they are clipped to it.

Keyboard only: press **N** to add a rectangle in the middle of the view, **arrow keys** to move it,
**Alt + arrows** to resize it (add **Shift** for 10× steps), **.** and **,** to select the next or
previous region.

### Choose how to hide each region

Each region has its own method:

- **Blur**: Gaussian blur; adjust **Blur strength**. The **Edge** can be *Hard* (default) or *Feathered*.
  Feathered fades to a lighter blur at the rim, inside the shape, so every pixel in the region is still
  blurred and nothing outside it changes.
- **Pixelate**: large single-colour blocks; adjust **Block size**.
- **Solid fill**: covers the region with one colour (black by default; pick any colour).

Keys **1**, **2** and **3** switch the selected region to blur, pixelate or fill. With nothing selected,
these settings apply to the next region you draw.

> **Tip:** blurred or pixelated *small text* can sometimes be partly reconstructed. For passwords,
> account numbers and other sensitive text, use **Solid fill**.

### Check the result

- The preview updates live as you draw and adjust.
- Hold **Hold to compare** (or the **\\** key) to see the original image; release to see the result.
- Zoom with the mouse wheel, a trackpad or touch pinch, the **− / +** buttons or keys, **Fit**
  (**Ctrl/⌘ + 0**) and **100%** (**Ctrl/⌘ + 1**). Pan with Space + drag, a two-finger drag or the Pan
  tool. When you zoom in on a large image, BlurBox renders the visible area at full resolution, so what
  you see at 100% is exactly what will be exported.
- Undo and redo every edit with **Ctrl/⌘ + Z** and **Shift + Ctrl/⌘ + Z** (or **Ctrl + Y**); the last 100
  steps are kept.

### Export

Click **Export…** (or press **Ctrl/⌘ + S**), choose **PNG**, **JPEG** (with a quality slider) or **WebP**,
edit the file name (it defaults to `<original>-blurred`), and click **Export**. The file is saved at the
image's full resolution.

What the export guarantees:

- Hidden regions are **flattened into the pixels**. The file contains no layers, masks or copy of the
  original image, so the hidden content can't be recovered by editing the file.
- **All metadata is removed**: EXIF, GPS location, camera make and model, embedded thumbnails, XMP,
  IPTC and text chunks. The image is re-encoded from the processed pixels, and the encoded file is then
  scanned and stripped of any metadata containers as a second safeguard.
- Transparent images exported as JPEG are placed on white (JPEG has no transparency).

Press **?** at any time for the full list of keyboard shortcuts.

## How it works

```
src/
  model/        regions, geometry, history (undo/redo), editor reducer: pure TypeScript
  processing/   pixel code shared with the worker: masks, Gaussian blur, pixelate, compositing,
                EXIF/orientation parsing, metadata stripping, pixel limits
  worker/       the processing Web Worker (decode, preview renders, full-res detail, export)
  view/         canvas view (zoom/pan/pointer gestures), region overlay (SVG), tool logic
  ui/           toolbar, region panel, method controls, dialogs, shortcuts
tests/
  unit/         Vitest (Node)
  e2e/          Playwright (Chromium at 400 px touch and 1440 px)
```

- **Main thread vs worker.** The full-resolution image lives only in a Web Worker. The worker decodes
  the file (`createImageBitmap`, with EXIF orientation applied manually if the browser doesn't),
  keeps an 8 MP preview for live editing and re-renders only the area that changed after each edit.
  Zoomed-in views get a full-resolution render of just the visible area. Export flattens all regions
  into a copy of the full-resolution pixels and encodes it on an `OffscreenCanvas`. The main thread
  only draws preview bitmaps and handles input, so it never stalls. A 50 MP load, blur and export keeps
  every main-thread task under 200 ms (measured by a test).
- **Hard-edged masks.** A pixel is hidden if its centre is inside the shape. Hidden pixels are fully
  replaced; everything else is untouched. Tests check this for every method and shape.
- **Blur** is a three-pass box approximation of a Gaussian. It reads only a bounded neighbourhood
  (about 3σ), repeats border pixels at the image edge (no dark halos), and uses premultiplied alpha for
  transparent images (no dark fringes).
- **Overlapping regions** are applied in order, each to the result of the ones before it.
- The worker is bundled inline as a `blob:` URL, so starting it makes no network request.

## Browser support

Current Chrome, Edge, Firefox and Safari (desktop and mobile). It needs `OffscreenCanvas`, module Web
Workers and `createImageBitmap`. The automated end-to-end suite runs in Chromium only.
