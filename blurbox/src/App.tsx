import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageMeta } from './model/types';
import { maxPixelsForDevice, PREVIEW_MAX_PIXELS } from './processing/limits';
import { ACCEPT_ATTR, useImageInput } from './ui/useImageInput';
import { CanvasView } from './view/CanvasView';
import { ZoomControls } from './ui/ZoomControls';
import { actualSizeView, fitView, nextZoomStep, zoomTo, type Size, type View } from './view/viewTransform';
import { createSurface, type PreviewSurface } from './view/surface';
import { workerClient } from './worker/instance';
import styles from './App.module.css';

interface Doc {
  meta: ImageMeta;
  surface: PreviewSurface;
}

const MAX_PIXELS = maxPixelsForDevice(navigator, location.search);

export function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const needsFit = useRef(false);

  useEffect(() => {
    if (doc && needsFit.current && viewport.width > 0 && viewport.height > 0) {
      needsFit.current = false;
      setView(fitView(viewport, doc.meta));
    }
  }, [doc, viewport]);

  const zoomStep = useCallback(
    (dir: 1 | -1) => {
      if (!doc) return;
      setView((v) => zoomTo(v, nextZoomStep(v.scale, dir), viewport.width / 2, viewport.height / 2, viewport, doc.meta));
    },
    [doc, viewport],
  );
  const fit = useCallback(() => doc && setView(fitView(viewport, doc.meta)), [doc, viewport]);
  const actualSize = useCallback(() => doc && setView((v) => actualSizeView(v, viewport, doc.meta)), [doc, viewport]);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const openFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await workerClient.request({
        type: 'load',
        file,
        name: file.name || 'pasted-image',
        maxPixels: MAX_PIXELS,
        previewMaxPixels: PREVIEW_MAX_PIXELS,
      });
      needsFit.current = true;
      setDoc({ meta: res.meta, surface: createSurface(res.preview, res.previewScale) });
      if (res.meta.downscaled) {
        setNotice(
          `This image (${res.meta.sourceWidth} × ${res.meta.sourceHeight}) is larger than this device can process, ` +
            `so it was loaded at ${res.meta.width} × ${res.meta.height}. The export will be that size.`,
        );
      }
      setAnnouncement(`Opened ${res.meta.name}, ${res.meta.width} by ${res.meta.height} pixels.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const { inputRef, openPicker, onInputChange } = useImageInput(openFile, setDragOver);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.logo}>BlurBox</h1>
        <button type="button" className={styles.primary} onClick={openPicker}>
          Open image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={onInputChange}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="file-input"
        />
        {doc && (
          <p className={styles.fileInfo} data-testid="image-info">
            {doc.meta.name} · {doc.meta.width} × {doc.meta.height}
          </p>
        )}
        {doc && (
          <ZoomControls
            scale={view.scale}
            onZoomIn={() => zoomStep(1)}
            onZoomOut={() => zoomStep(-1)}
            onFit={fit}
            onActualSize={actualSize}
          />
        )}
      </header>

      <main className={styles.stage}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {doc ? (
          <CanvasView
            meta={doc.meta}
            surface={doc.surface}
            surfaceVersion={doc.surface.version}
            detail={null}
            showOriginal={false}
            view={view}
            onViewChange={setView}
            viewport={viewport}
            onViewportSize={setViewport}
            panMode={spaceHeld}
            cursor={spaceHeld ? 'grab' : 'default'}
            tool={null}
            label={`Image ${doc.meta.name}`}
          />
        ) : (
          <div className={styles.empty}>
            <h2>Hide parts of an image</h2>
            <p>Open, drop or paste a JPEG, PNG or WebP image.</p>
            <button type="button" className={styles.primary} onClick={openPicker}>
              Choose an image
            </button>
            <p className={styles.privacy}>Your image never leaves this device. Nothing is uploaded or stored.</p>
          </div>
        )}
        {loading && (
          <div className={styles.loading} role="status">
            Opening image…
          </div>
        )}
        {dragOver && <div className={styles.dropHint} aria-hidden="true">Drop image to open</div>}
      </main>

      <div aria-live="polite" className="visually-hidden" data-testid="announcer">
        {announcement}
      </div>
    </div>
  );
}
