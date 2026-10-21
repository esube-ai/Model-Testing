import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultBrushSize, defaultSettings, rangesFor, type RegionSettings } from './model/defaults';
import { editorReducer, initialEditorState } from './model/editor';
import type { ImageMeta, Tool } from './model/types';
import { maxPixelsForDevice, PREVIEW_MAX_PIXELS } from './processing/limits';
import { RegionPanel, regionName } from './ui/RegionPanel';
import { Toolbar } from './ui/Toolbar';
import { ACCEPT_ATTR, useImageInput } from './ui/useImageInput';
import { ZoomControls } from './ui/ZoomControls';
import { CanvasView } from './view/CanvasView';
import { RegionOverlay } from './view/RegionOverlay';
import { createSurface, type PreviewSurface } from './view/surface';
import { useRegionTool, withDraft } from './view/useRegionTool';
import { actualSizeView, fitView, nextZoomStep, zoomTo, type Size, type View } from './view/viewTransform';
import { workerClient } from './worker/instance';
import styles from './App.module.css';

interface Doc {
  meta: ImageMeta;
  surface: PreviewSurface;
}

const MAX_PIXELS = maxPixelsForDevice(navigator, location.search);
const EMPTY_META: ImageMeta = {
  name: '', width: 1, height: 1, sourceWidth: 1, sourceHeight: 1, downscaled: false, format: 'png', hasAlpha: false,
};

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

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
  const [tool, setTool] = useState<Tool>('rect');
  const [brushSize, setBrushSize] = useState(24);
  const [settings, setSettings] = useState<RegionSettings>(() => defaultSettings(1000, 1000));
  const [editor, dispatch] = useReducer(editorReducer, initialEditorState);
  const needsFit = useRef(false);
  const coarse = useCoarsePointer();

  const meta = doc?.meta ?? EMPTY_META;
  const regions = editor.history.present;
  const ranges = useMemo(() => rangesFor(meta.width, meta.height), [meta]);

  const announce = useCallback((msg: string) => {
    // Re-announce identical messages by toggling a trailing non-breaking space.
    setAnnouncement((prev) => (prev === msg ? `${msg}\u00a0` : msg));
  }, []);

  const regionTool = useRegionTool({
    tool, regions, selectedId: editor.selectedId, view, meta, brushSize, settings, dispatch,
  });
  const liveRegions = useMemo(() => withDraft(regions, regionTool.draft), [regions, regionTool.draft]);

  useEffect(() => {
    if (doc && needsFit.current && viewport.width > 0 && viewport.height > 0) {
      needsFit.current = false;
      setView(fitView(viewport, doc.meta));
    }
  }, [doc, viewport]);

  const openFile = useCallback(
    async (file: File) => {
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
        dispatch({ type: 'reset' });
        setSettings(defaultSettings(res.meta.width, res.meta.height));
        setBrushSize(defaultBrushSize(res.meta.width, res.meta.height));
        setDoc({ meta: res.meta, surface: createSurface(res.preview, res.previewScale) });
        if (res.meta.downscaled) {
          setNotice(
            `This image (${res.meta.sourceWidth} × ${res.meta.sourceHeight}) is larger than this device can process, ` +
              `so it was loaded at ${res.meta.width} × ${res.meta.height}. The export will be that size.`,
          );
        }
        announce(`Opened ${res.meta.name}, ${res.meta.width} by ${res.meta.height} pixels.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [announce],
  );

  const { inputRef, openPicker, onInputChange } = useImageInput(openFile, setDragOver);

  const zoomStep = useCallback(
    (dir: 1 | -1) => {
      if (!doc) return;
      setView((v) => zoomTo(v, nextZoomStep(v.scale, dir), viewport.width / 2, viewport.height / 2, viewport, doc.meta));
    },
    [doc, viewport],
  );
  const fit = useCallback(() => doc && setView(fitView(viewport, doc.meta)), [doc, viewport]);
  const actualSize = useCallback(() => doc && setView((v) => actualSizeView(v, viewport, doc.meta)), [doc, viewport]);

  const deleteRegion = useCallback(
    (id: string) => {
      const r = regions.find((x) => x.id === id);
      if (!r) return;
      dispatch({ type: 'remove', id });
      announce(`${regionName(regions, r)} deleted.`);
    },
    [regions, announce],
  );

  // Announce newly added regions.
  const prevCount = useRef(0);
  useEffect(() => {
    if (regions.length > prevCount.current) {
      const r = regions[regions.length - 1];
      announce(`${regionName(regions, r)} added and selected.`);
    }
    prevCount.current = regions.length;
  }, [regions, announce]);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping(e.target) && editor.selectedId) {
        e.preventDefault();
        deleteRegion(editor.selectedId);
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
  }, [editor.selectedId, deleteRegion]);

  const panMode = spaceHeld || tool === 'pan';
  const cursor = panMode ? 'grab' : (regionTool.hover?.cursor ?? (tool === 'select' ? 'default' : 'crosshair'));
  const brushCursor = tool === 'brush' && regionTool.hover && !panMode ? { ...regionTool.hover, size: brushSize } : null;

  return (
    <div className={styles.app} data-has-image={doc ? 'true' : 'false'}>
      <header className={styles.header}>
        <h1 className={styles.logo}>BlurBox</h1>
        <button type="button" className={styles.primary} onClick={openPicker} aria-keyshortcuts="Control+O Meta+O">
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

      {doc && (
        <Toolbar tool={tool} onTool={setTool} brushSize={brushSize} brushRange={ranges.brushSize} onBrushSize={setBrushSize} />
      )}

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
            panMode={panMode}
            cursor={cursor}
            tool={regionTool.handler}
            label={`Image ${doc.meta.name}. ${regions.length} regions.`}
          >
            <RegionOverlay
              regions={liveRegions}
              selectedId={regionTool.draft?.id ?? editor.selectedId}
              view={view}
              viewport={viewport}
              brushCursor={brushCursor}
              coarse={coarse}
            />
          </CanvasView>
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
        {dragOver && (
          <div className={styles.dropHint} aria-hidden="true">
            Drop image to open
          </div>
        )}
      </main>

      {doc && <RegionPanel regions={regions} selectedId={editor.selectedId} dispatch={dispatch} onDelete={deleteRegion} />}

      <div aria-live="polite" className="visually-hidden" data-testid="announcer">
        {announcement}
      </div>
    </div>
  );
}
