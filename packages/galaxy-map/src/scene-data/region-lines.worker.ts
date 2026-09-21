// Traces the region boundaries off the main thread. The trace reads the whole region
// cell grid, which is 199 KiB, so it runs here and never enters the main bundle.
import { regionResponseTransferables, WORKER_STARTED } from './messages';
import type { RegionLinesResponse } from './messages';
import { buildRegionData } from './region-lines';

const scope = self as unknown as DedicatedWorkerGlobalScope;

// The main thread waits for this message before it makes the context. See
// `WORKER_STARTED` in `messages.ts`.
scope.postMessage(WORKER_STARTED);

scope.addEventListener('message', () => {
  const data = buildRegionData();
  const response: RegionLinesResponse = {
    lines: data.lines,
    grid: data.grid,
    flow: data.flow,
  };
  scope.postMessage(response, regionResponseTransferables(response));
});
