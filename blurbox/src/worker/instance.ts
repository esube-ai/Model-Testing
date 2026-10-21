import { WorkerClient } from './client';

/** Created at startup (module evaluation), before the page's load event, and shared app-wide. */
export const workerClient = new WorkerClient();
