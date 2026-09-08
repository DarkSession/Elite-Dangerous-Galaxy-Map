// Bakes the density volume off the main thread.
import { volumeTransferables } from './messages';
import { generateVolume } from './volume';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', () => {
  const volume = generateVolume();
  scope.postMessage(volume, volumeTransferables(volume));
});
