// Starts every scene-data worker and waits for their results.
import type { PointCloudResponse, RegionLinesResponse } from './messages';
import { WORKER_STARTED } from './messages';
import type { DensityVolume, SceneData } from './types';

/** The three workers a scene-data load starts. */
export type WorkerName = 'point-cloud' | 'volume' | 'region-lines';

/** Options for one scene-data load. */
export interface SceneDataOptions {
  /**
   * Stops the load. Every worker the load started is terminated when the signal fires,
   * and the promise rejects. `dispose` on the map handle fires it.
   */
  readonly signal?: AbortSignal;
  /**
   * Called once, when all three workers have posted `WORKER_STARTED`. A worker that
   * never posts it, as a test double may not, never calls this.
   */
  readonly onStarted?: () => void;
  /**
   * Makes one worker. It is a test seam: a unit test gives its own workers, because a
   * test runner has no `Worker`. Leave it out and the load starts the real ones.
   */
  readonly createWorker?: (name: WorkerName) => Worker;
}

/** The error a cancelled load rejects with. */
export const LOAD_CANCELLED = 'The scene-data load was cancelled.';

function startWorker(name: WorkerName): Worker {
  // Each `new Worker(new URL(...))` stays written out, because the bundler reads the
  // literal to find the worker file.
  if (name === 'point-cloud') {
    return new Worker(new URL('./point-cloud.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  if (name === 'volume') {
    return new Worker(new URL('./volume.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return new Worker(new URL('./region-lines.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function runWorker<Request, Response>(
  worker: Worker,
  request: Request,
  onStarted: () => void,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<Response>) => {
      if ((event.data as unknown) === WORKER_STARTED) {
        onStarted();
        return;
      }
      resolve(event.data);
      worker.terminate();
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      reject(new Error(`A scene-data worker failed: ${event.message}`));
      worker.terminate();
    });
    worker.postMessage(request);
  });
}

/**
 * Builds the point cloud, the cloud set, the surface detail grid, the density volume
 * and the region boundary set in three workers at the same time, and resolves when
 * all five are ready.
 */
export async function loadSceneData(
  options: SceneDataOptions = {},
): Promise<SceneData> {
  const create = options.createWorker ?? startWorker;
  const pointCloudWorker = create('point-cloud');
  const volumeWorker = create('volume');
  const regionWorker = create('region-lines');
  const workers = [pointCloudWorker, volumeWorker, regionWorker];

  const signal = options.signal;
  const stopAll = (): void => {
    for (const worker of workers) worker.terminate();
  };
  if (signal !== undefined && signal.aborted) {
    stopAll();
    throw new Error(LOAD_CANCELLED);
  }

  // The race gives the caller the cancel as a rejection. A signal that never fires
  // leaves this promise pending, which costs nothing.
  const cancelled = new Promise<never>((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => {
        stopAll();
        reject(new Error(LOAD_CANCELLED));
      },
      { once: true },
    );
  });

  let waiting = workers.length;
  const started = (): void => {
    waiting -= 1;
    if (waiting === 0) options.onStarted?.();
  };

  const [cloud, volume, region] = await Promise.race([
    Promise.all([
      // The point cloud worker reads the default count and seed itself.
      runWorker<null, PointCloudResponse>(pointCloudWorker, null, started),
      runWorker<null, DensityVolume>(volumeWorker, null, started),
      runWorker<null, RegionLinesResponse>(regionWorker, null, started),
    ]),
    cancelled,
  ]);

  return {
    pointCloud: cloud.cloud,
    cloudSet: cloud.cloudSet,
    volume,
    detail: cloud.detail,
    detailGrid: cloud.grid,
    regionLines: region.lines,
    regionGrid: region.grid,
    regionFlow: region.flow,
  };
}
