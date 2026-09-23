// Draws the point cloud off the main thread, from the model with the detail grid.
import { loadDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import { generateCloudSet } from './cloud-set';
import {
  cloudSetTransferables,
  detailGridTransferables,
  pointCloudTransferables,
  surfaceDetailTransferables,
  WORKER_STARTED,
} from './messages';
import type { PointCloudResponse } from './messages';
import {
  buildSurfaceTable,
  DEFAULT_POINT_COUNT,
  DEFAULT_SEED,
  generatePointCloud,
} from './point-cloud';

const scope = self as unknown as DedicatedWorkerGlobalScope;

// The main thread waits for this message before it makes the context. See
// `WORKER_STARTED` in `messages.ts`.
scope.postMessage(WORKER_STARTED);

async function build(): Promise<void> {
  const grid = await loadDetailGrid();
  const model = createGalaxyModel(parameters, grid);
  const table = buildSurfaceTable(model);
  const cloud = generatePointCloud(model, {
    count: DEFAULT_POINT_COUNT,
    seed: DEFAULT_SEED,
    table,
  });
  // The cloud set comes from the same table, with its own seed, so its samples do
  // not repeat the point cloud's.
  const cloudSet = generateCloudSet(model, {
    seed: DEFAULT_SEED + 1,
    table,
  });
  // The grid goes to the main thread too, which builds the star field model from it. The
  // worker has no more use for it after the cloud set, so the buffer moves.
  const response: PointCloudResponse = {
    cloud,
    cloudSet,
    detail: table.detail,
    grid,
  };
  scope.postMessage(response, [
    ...pointCloudTransferables(cloud),
    ...cloudSetTransferables(cloudSet),
    ...surfaceDetailTransferables(table.detail),
    ...detailGridTransferables(grid),
  ]);
}

// The message from the main thread carries no data. It only starts the build.
scope.addEventListener('message', () => {
  void build().catch((error: unknown) => {
    // A rejected promise does not reach the worker's error event, so the throw moves
    // to a task of its own, where the main thread hears it.
    setTimeout(() => {
      throw error instanceof Error ? error : new Error(String(error));
    });
  });
});
