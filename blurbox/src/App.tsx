import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultBrushSize, defaultSettings, makeRegion, rangesFor, type RegionSettings } from './model/defaults';
import { editorReducer, initialEditorState, newRegionId } from './model/editor';
import type { ExportFormat, ImageMeta, Tool } from './model/types';
import { maxPixelsForDevice, PREVIEW_MAX_PIXELS } from './processing/limits';
import { RegionPanel, regionName } from './ui/RegionPanel';
import { Toolbar } from './ui/Toolbar';
import { ACCEPT_ATTR, useImageInput } from './ui/useImageInput';
import { ZoomControls } from './ui/ZoomControls';
import { CanvasView } from './view/CanvasView';
import { RegionOverlay } from './view/RegionOverlay';
import { PreviewRenderer } from './view/previewRenderer';
import { useDetailTile } from './view/useDetailTile';
import { CompareButton } from './ui/CompareButton';
import { HistoryControls } from './ui/HistoryControls';
import { ExportDialog, EXTENSIONS } from './ui/ExportDialog';
import { canRedo, canUndo } from './model/history';
import { fitShapeToBox, intersectsImage, moveShape, shapeBounds } from './model/geometry';
import { useShortcuts } from './ui/useShortcuts';
import { HelpDialog } from './ui/HelpDialog';
import { createSurface, type PreviewSurface } from './view/surface';
import { useRegionTool, withDraft } from './view/useRegionTool';
import { actualSizeView, fitView, nextZoomStep, screenToImage, zoomTo, type Size, type View } from './view/viewTransform';
import { workerClient } from './worker/instance';
import styles from './App.module.css';

interface Doc {
  meta: ImageMeta;
  surface: PreviewSurface;
  renderer: PreviewRenderer;
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
  const [surfaceVersion, setSurfaceVersion] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [compareHeld, setCompareHeld] = useState(false);
  const [compareKey, setCompareKey] = useState(false);
  const showOriginal = compareHeld || compareKey;
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);


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

  // Live preview: every change to the regions (including in-progress drags) re-renders.
  const renderer = doc?.renderer;
  useEffect(() => {
    renderer?.update(liveRegions);
  }, [renderer, liveRegions]);
  useEffect(() => () => renderer?.dispose(), [renderer]);

  const detail = useDetailTile(workerClient, doc?.meta ?? null, doc?.surface ?? null, view, viewport, liveRegions);

  const selected = regions.find((r) => r.id === editor.selectedId) ?? null;
  const onSettings = useCallback(
    (patch: Partial<RegionSettings>, field: string) => {
      setSettings((s) => ({ ...s, ...patch }));
      if (selected) {
        const discrete = field === 'method' || field === 'edge';
        dispatch({ type: 'update', id: selected.id, patch, coalesceKey: discrete ? undefined : `${selected.id}:${field}` });
      }
    },
    [selected],
  );

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
        const surface = createSurface(res.preview, res.previewScale);
        const renderer = new PreviewRenderer(
          workerClient,
          surface,
          () => setSurfaceVersion(surface.version),
          (e) => setError(`Preview failed: ${e.message}`),
          setPreviewBusy,
        );
        setDoc({ meta: res.meta, surface, renderer });
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

  const undo = useCallback(() => {
    if (!canUndo(editor.history)) return;
    regionTool.handler.cancel();
    dispatch({ type: 'undo' });
    announce('Undone.');
  }, [editor.history, regionTool.handler, announce]);
  const redo = useCallback(() => {
    if (!canRedo(editor.history)) return;
    regionTool.handler.cancel();
    dispatch({ type: 'redo' });
    announce('Redone.');
  }, [editor.history, regionTool.handler, announce]);

  const runExport = useCallback(
    async ({ format, quality, filename }: { format: ExportFormat; quality: number; filename: string }) => {
      setExporting(true);
      setExportError(null);
      try {
        const res = await workerClient.request({ type: 'export', regions, format, quality });
        const name = `${filename}.${EXTENSIONS[format]}`;
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setExportOpen(false);
        announce(`Exported ${name}, ${res.width} by ${res.height} pixels.`);
      } catch (e) {
        setExportError(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(false);
      }
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

  const [helpOpen, setHelpOpen] = useState(false);

  const addRegionInView = useCallback(() => {
    if (!doc) return;
    const c = screenToImage(view, viewport.width / 2, viewport.height / 2);
    const visW = Math.min(doc.meta.width, viewport.width / view.scale);
    const visH = Math.min(doc.meta.height, viewport.height / view.scale);
    const w = Math.max(8, Math.round(visW / 4));
    const h = Math.max(8, Math.round(visH / 4));
    const cx = Math.min(Math.max(c.x, w / 2), doc.meta.width - w / 2);
    const cy = Math.min(Math.max(c.y, h / 2), doc.meta.height - h / 2);
    dispatch({
      type: 'add',
      region: makeRegion(newRegionId(), { kind: 'rect', x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h }, settings),
    });
  }, [doc, view, viewport, settings]);

  const nudge = useCallback(
    (dx: number, dy: number, resize: boolean) => {
      if (!selected) return;
      const unit = Math.max(1, Math.round(1 / view.scale));
      const sx = dx * unit;
      const sy = dy * unit;
      let shape = selected.shape;
      if (resize) {
        const b = shapeBounds(shape);
        const to = { ...b, w: Math.max(1, b.w + sx), h: Math.max(1, b.h + sy) };
        shape = fitShapeToBox(shape, b, to);
      } else {
        shape = moveShape(shape, sx, sy);
      }
      if (!intersectsImage(shape, meta.width, meta.height)) return;
      dispatch({ type: 'replace', region: { ...selected, shape }, coalesceKey: `${selected.id}:${resize ? 'resize' : 'move'}` });
    },
    [selected, view.scale, meta],
  );

  useShortcuts({
    enabled: !exportOpen && !helpOpen,
    hasImage: !!doc,
    setTool,
    brushStep: (dir) =>
      setBrushSize((b) => Math.min(ranges.brushSize[1], Math.max(ranges.brushSize[0], Math.round(dir > 0 ? b * 1.25 + 1 : b * 0.8)))),
    setMethod: (method) => onSettings({ method }, 'method'),
    addRegion: addRegionInView,
    nudge,
    cycleSelection: (dir) => {
      if (!regions.length) return;
      const i = regions.findIndex((r) => r.id === editor.selectedId);
      const next = i < 0 ? (dir > 0 ? 0 : regions.length - 1) : (i + dir + regions.length) % regions.length;
      dispatch({ type: 'select', id: regions[next].id });
      announce(`${regionName(regions, regions[next])} selected.`);
    },
    deleteSelected: () => editor.selectedId && deleteRegion(editor.selectedId),
    deselect: () => {
      regionTool.handler.cancel();
      dispatch({ type: 'select', id: null });
    },
    undo,
    redo,
    zoom: zoomStep,
    fit,
    actualSize,
    setPanHeld: setSpaceHeld,
    setCompareHeld: setCompareKey,
    open: openPicker,
    exportImage: () => {
      setExportError(null);
      setExportOpen(true);
    },
    help: () => setHelpOpen(true),
  });

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
        {doc && (
          <HistoryControls
            canUndo={canUndo(editor.history)}
            canRedo={canRedo(editor.history)}
            onUndo={undo}
            onRedo={redo}
          />
        )}
        {doc && <CompareButton active={showOriginal} onChange={setCompareHeld} />}
        <button
          type="button"
          className={styles.helpBtn}
          onClick={() => setHelpOpen(true)}
          aria-label="Keyboard shortcuts"
          aria-keyshortcuts="?"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
        {doc && (
          <button
            type="button"
            className={`${styles.primary} ${styles.exportBtn}`}
            onClick={() => {
              setExportError(null);
              setExportOpen(true);
            }}
            aria-keyshortcuts="Control+S Meta+S"
          >
            Export…
          </button>
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
            surfaceVersion={surfaceVersion}
            detail={detail}
            showOriginal={showOriginal}
            view={view}
            onViewChange={setView}
            viewport={viewport}
            onViewportSize={setViewport}
            panMode={panMode}
            cursor={cursor}
            tool={regionTool.handler}
            label={`Image ${doc.meta.name}. ${regions.length} regions.`}
            busy={previewBusy}
          >
            {showOriginal && (
              <p className={styles.originalBadge} role="status">
                Original
              </p>
            )}
            <RegionOverlay
              hidden={showOriginal}
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

      {doc && (
        <RegionPanel
          regions={regions}
          selectedId={editor.selectedId}
          dispatch={dispatch}
          onDelete={deleteRegion}
          settings={settings}
          ranges={ranges}
          onSettings={onSettings}
        />
      )}

      {doc && (
        <ExportDialog
          open={exportOpen}
          meta={doc.meta}
          busy={exporting}
          error={exportError}
          onCancel={() => setExportOpen(false)}
          onExport={runExport}
        />
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div aria-live="polite" className="visually-hidden" data-testid="announcer">
        {announcement}
      </div>
    </div>
  );
}
