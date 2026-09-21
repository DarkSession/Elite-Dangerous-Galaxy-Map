// Bakes the density volume off the main thread.
import { WORKER_STARTED, volumeTransferables } from './messages';
import { generateVolume } from './volume';

const scope = self as unknown as DedicatedWorkerGlobalScope;

// The main thread waits for this message before it makes the context. See
// `WORKER_STARTED` in `messages.ts`.
scope.postMessage(WORKER_STARTED);

scope.addEventListener('message', () => {
  const volume = generateVolume();
  scope.postMessage(volume, volumeTransferables(volume));
});
