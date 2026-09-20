// Draws the point cloud off the main thread, from the model with the detail grid.
import { loadDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import { generateCloudSet } from './cloud-set';
import {
  cloudSetTransferables,
  pointCloudTransferables,
  surfaceDetailTransferables,
} from './messages';
import type { PointCloudRequest, PointCloudResponse } from './messages';
import {
  buildSurfaceTable,
  DEFAULT_POINT_COUNT,
  DEFAULT_SEED,
  generatePointCloud,
} from './point-cloud';

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function build(request: PointCloudRequest | null): Promise<void> {
  const grid = await loadDetailGrid();
  const model = createGalaxyModel(parameters, grid);
  const table = buildSurfaceTable(model);
  const cloud = generatePointCloud(model, {
    count: request?.count ?? DEFAULT_POINT_COUNT,
    seed: request?.seed ?? DEFAULT_SEED,
    table,
  });
  // The cloud set comes from the same table, with its own seed, so its samples do
  // not repeat the point cloud's.
  const cloudSet = generateCloudSet(model, {
    seed: (request?.seed ?? DEFAULT_SEED) + 1,
    table,
  });
  const response: PointCloudResponse = { cloud, cloudSet, detail: table.detail };
  scope.postMessage(response, [
    ...pointCloudTransferables(cloud),
    ...cloudSetTransferables(cloudSet),
    ...surfaceDetailTransferables(table.detail),
  ]);
}

scope.addEventListener('message', (event: MessageEvent<PointCloudRequest>) => {
  void build(event.data).catch((error: unknown) => {
    // A rejected promise does not reach the worker's error event, so the throw moves
    // to a task of its own, where the main thread hears it.
    setTimeout(() => {
      throw error instanceof Error ? error : new Error(String(error));
    });
  });
});
