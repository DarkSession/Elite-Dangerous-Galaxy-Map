// Draws the point cloud off the main thread.
import { pointCloudTransferables } from './messages';
import type { PointCloudRequest } from './messages';
import { DEFAULT_POINT_COUNT, DEFAULT_SEED, generatePointCloud } from './point-cloud';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<PointCloudRequest>) => {
  const request = event.data;
  const cloud = generatePointCloud(undefined, {
    count: request?.count ?? DEFAULT_POINT_COUNT,
    seed: request?.seed ?? DEFAULT_SEED,
  });
  scope.postMessage(cloud, pointCloudTransferables(cloud));
});
