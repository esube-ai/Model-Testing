import BlurWorker from './blur.worker.ts?worker&inline';
import type { WorkerRequest, WorkerResponse } from './protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<WorkerRequest, 'id'>;

type ResponseFor<T extends RequestBody['type']> = T extends 'load'
  ? Extract<WorkerResponse, { type: 'loaded' }>
  : T extends 'render'
    ? Extract<WorkerResponse, { type: 'patch' }>
    : T extends 'detail'
      ? Extract<WorkerResponse, { type: 'detail' }>
      : Extract<WorkerResponse, { type: 'exported' }>;

/**
 * Promise-based wrapper around the processing worker. The worker is an inline (blob) module so it
 * starts without any network request.
 */
export class WorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new BlurWorker();
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.type === 'error') p.reject(new Error(res.message));
      else p.resolve(res);
    };
    this.worker.onerror = (e) => {
      e.preventDefault();
      const err = new Error(e.message || 'The image worker crashed (the image may be too large for this device).');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  request<B extends RequestBody>(body: B, transfer: Transferable[] = []): Promise<ResponseFor<B['type']>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: WorkerResponse) => void, reject });
      this.worker.postMessage({ ...body, id }, transfer);
    });
  }
}
