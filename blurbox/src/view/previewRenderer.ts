import type { Region } from '../model/types';
import type { WorkerClient } from '../worker/client';
import type { PreviewSurface } from './surface';

/**
 * Keeps the main-thread preview in sync with the regions. At most one render is in flight; while
 * it runs, newer region lists replace each other so only the latest is rendered next.
 */
export class PreviewRenderer {
  private inFlight = false;
  private queued: Region[] | null = null;
  private disposed = false;

  constructor(
    private readonly client: WorkerClient,
    private readonly surface: PreviewSurface,
    private readonly onUpdate: () => void,
    private readonly onError: (e: Error) => void,
    private readonly onBusy: (busy: boolean) => void = () => {},
  ) {}

  update(regions: Region[]): void {
    this.queued = regions;
    if (!this.inFlight) {
      this.onBusy(true);
      void this.pump();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queued = null;
  }

  /** Resolves once everything queued so far has been drawn. */
  idle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => (!this.inFlight && !this.queued ? resolve() : setTimeout(check, 16));
      check();
    });
  }

  private async pump(): Promise<void> {
    while (this.queued && !this.disposed) {
      const regions = this.queued;
      this.queued = null;
      this.inFlight = true;
      try {
        const res = await this.client.request({ type: 'render', regions });
        if (res.bitmap) {
          if (!this.disposed) {
            const ctx = this.surface.composite.getContext('2d');
            // Clear first: patches of transparent images must replace, not blend over, old pixels.
            ctx?.clearRect(res.x, res.y, res.bitmap.width, res.bitmap.height);
            ctx?.drawImage(res.bitmap, res.x, res.y);
            this.surface.version++;
            this.onUpdate();
          }
          res.bitmap.close();
        }
      } catch (e) {
        if (!this.disposed) this.onError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        this.inFlight = false;
      }
    }
    if (!this.disposed) this.onBusy(false);
  }
}
