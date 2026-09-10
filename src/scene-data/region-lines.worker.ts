// Traces the region boundaries off the main thread. The trace reads the whole region
// cell grid, which is 199 KiB, so it runs here and never enters the main bundle.
import { regionResponseTransferables } from './messages';
import type { RegionLinesResponse } from './messages';
import { buildRegionData } from './region-lines';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', () => {
  const data = buildRegionData();
  const response: RegionLinesResponse = { lines: data.lines, grid: data.grid };
  scope.postMessage(response, regionResponseTransferables(response));
});
