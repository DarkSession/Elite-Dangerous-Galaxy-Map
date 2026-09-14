import { describe, expect, test } from 'vitest';
import { LOAD_CANCELLED, loadSceneData } from './load';
import type { WorkerName } from './load';

/** A worker that answers nothing, so the load runs until the signal stops it. */
class SilentWorker {
  terminated = 0;

  addEventListener(): void {
    // The test never answers, so no listener is ever called.
  }

  postMessage(): void {
    // The test never answers.
  }

  terminate(): void {
    this.terminated += 1;
  }
}

describe('a scene-data load', () => {
  test('terminates every worker it started when the signal fires', async () => {
    const started: SilentWorker[] = [];
    const names: WorkerName[] = [];
    const controller = new AbortController();
    const load = loadSceneData({
      signal: controller.signal,
      createWorker: (name) => {
        names.push(name);
        const worker = new SilentWorker();
        started.push(worker);
        return worker as unknown as Worker;
      },
    });

    expect(started).toHaveLength(3);
    expect(names).toEqual(['point-cloud', 'volume', 'region-lines']);
    for (const worker of started) expect(worker.terminated).toBe(0);

    controller.abort();
    await expect(load).rejects.toThrow(LOAD_CANCELLED);
    for (const worker of started) expect(worker.terminated).toBe(1);
  });

  test('starts nothing that runs when the signal fired first', async () => {
    const started: SilentWorker[] = [];
    const controller = new AbortController();
    controller.abort();
    const load = loadSceneData({
      signal: controller.signal,
      createWorker: () => {
        const worker = new SilentWorker();
        started.push(worker);
        return worker as unknown as Worker;
      },
    });

    await expect(load).rejects.toThrow(LOAD_CANCELLED);
    expect(started).toHaveLength(3);
    for (const worker of started) expect(worker.terminated).toBe(1);
  });
});
