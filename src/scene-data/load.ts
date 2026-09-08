// Starts both scene-data workers and waits for their results.
import type { PointCloudRequest } from './messages';
import { DEFAULT_POINT_COUNT, DEFAULT_SEED } from './point-cloud';
import type { DensityVolume, PointCloud, SceneData } from './types';

/** Options for one scene-data load. */
export interface SceneDataOptions {
  /** The number of point cloud samples. */
  readonly count?: number;
  /** The generator seed. */
  readonly seed?: number;
}

function runWorker<Request, Response>(
  worker: Worker,
  request: Request,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<Response>) => {
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
 * Builds the point cloud and the density volume in two workers at the same time and
 * resolves when both are ready.
 */
export async function loadSceneData(
  options: SceneDataOptions = {},
): Promise<SceneData> {
  const request: PointCloudRequest = {
    count: options.count ?? DEFAULT_POINT_COUNT,
    seed: options.seed ?? DEFAULT_SEED,
  };

  const pointCloudWorker = new Worker(
    new URL('./point-cloud.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const volumeWorker = new Worker(new URL('./volume.worker.ts', import.meta.url), {
    type: 'module',
  });

  const [pointCloud, volume] = await Promise.all([
    runWorker<PointCloudRequest, PointCloud>(pointCloudWorker, request),
    runWorker<null, DensityVolume>(volumeWorker, null),
  ]);

  return { pointCloud, volume };
}
