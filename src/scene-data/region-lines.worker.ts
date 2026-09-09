// Traces the region boundaries off the main thread. The trace reads the whole region
// cell grid, which is 199 KiB, so it runs here and never enters the main bundle.
import { regionLinesTransferables } from './messages';
import { buildRegionLines } from './region-lines';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', () => {
  const lines = buildRegionLines();
  scope.postMessage(lines, regionLinesTransferables(lines));
});
