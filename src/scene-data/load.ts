// Starts every scene-data worker and waits for their results.
import type {
  PointCloudRequest,
  PointCloudResponse,
  RegionLinesResponse,
} from './messages';
import { DEFAULT_POINT_COUNT, DEFAULT_SEED } from './point-cloud';
import type { DensityVolume, SceneData } from './types';

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
 * Builds the point cloud, the cloud set, the surface detail grid, the density volume
 * and the region boundary set in three workers at the same time, and resolves when
 * all five are ready.
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
  const regionWorker = new Worker(
    new URL('./region-lines.worker.ts', import.meta.url),
    { type: 'module' },
  );

  const [cloud, volume, region] = await Promise.all([
    runWorker<PointCloudRequest, PointCloudResponse>(pointCloudWorker, request),
    runWorker<null, DensityVolume>(volumeWorker, null),
    runWorker<null, RegionLinesResponse>(regionWorker, null),
  ]);

  return {
    pointCloud: cloud.cloud,
    cloudSet: cloud.cloudSet,
    volume,
    detail: cloud.detail,
    regionLines: region.lines,
    regionGrid: region.grid,
    regionGeometry: region.geometry,
  };
}
