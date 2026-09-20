// Inflates the factions dump and reads the two factions the entry wants, off the main
// thread.
//
// The main thread fetches the dump and moves the body here, so the request still comes
// from the page and the browser test still intercepts it. Chromium's
// `DecompressionStream` inflates a body the browser already holds in one burst: a drain
// of the 62 MB test fixture that only counts bytes holds the main thread for 70 ms, and
// the same drain without the gzip step holds it for 21. The read therefore belongs on a
// thread of its own.
import { inflateDump, readDumpRecords } from './multifaction';
import type { MultifactionRequest, MultifactionAnswer } from './multifaction-message';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<MultifactionRequest>) => {
  const request = event.data;
  const run = async (): Promise<void> => {
    try {
      const answer: MultifactionAnswer = {
        records: await readDumpRecords(inflateDump(request.body), request.wanted),
      };
      scope.postMessage(answer);
    } catch (cause) {
      const answer: MultifactionAnswer = {
        error: cause instanceof Error ? cause.message : String(cause),
      };
      scope.postMessage(answer);
    }
  };
  void run();
});
