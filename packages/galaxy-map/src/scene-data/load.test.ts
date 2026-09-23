import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { decodeDetailGrid, DETAIL_SIZE } from '../galaxy-model/detail';
import { LOAD_CANCELLED, loadSceneData } from './load';
import { WORKER_STARTED } from './messages';
import type { WorkerName } from './load';

/** A worker that answers nothing, so the load runs until the signal stops it. */
class SilentWorker {
  terminated = 0;
  listener: ((event: { data: unknown }) => void) | null = null;

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    // The test holds the listener and calls it only where a test says it started.
    if (type === 'message') this.listener = listener;
  }

  postMessage(): void {
    // The test never answers.
  }

  terminate(): void {
    this.terminated += 1;
  }

  /** Posts the message a real worker posts as soon as its script runs. */
  start(): void {
    this.listener?.({ data: WORKER_STARTED });
  }
}

describe('a scene-data load', () => {
  test('reports the start once, when the third worker has started', async () => {
    const started: SilentWorker[] = [];
    const controller = new AbortController();
    let reports = 0;
    const load = loadSceneData({
      signal: controller.signal,
      onStarted: () => {
        reports += 1;
      },
      createWorker: () => {
        const worker = new SilentWorker();
        started.push(worker);
        return worker as unknown as Worker;
      },
    });

    started[0]?.start();
    started[1]?.start();
    expect(reports).toBe(0);
    started[2]?.start();
    expect(reports).toBe(1);
    // The message is not an answer, so no worker ends on it.
    for (const worker of started) expect(worker.terminated).toBe(0);

    controller.abort();
    await expect(load).rejects.toThrow(LOAD_CANCELLED);
  });

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

/** A worker that answers each request with the message the test gives it. */
class AnsweringWorker {
  listener: ((event: { data: unknown }) => void) | null = null;

  constructor(private readonly answer: unknown) {}

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    if (type === 'message') this.listener = listener;
  }

  postMessage(): void {
    queueMicrotask(() => this.listener?.({ data: this.answer }));
  }

  terminate(): void {}
}

describe('the scene data of a load', () => {
  test('carries the detail grid the point cloud worker decoded', async () => {
    // The real detail PNG, decoded as the worker decodes it. The worker's answer carries
    // the grid, and the load hands it on as `detailGrid`.
    const png = new Uint8Array(
      readFileSync(
        fileURLToPath(new URL('../galaxy-model/galaxy-detail.png', import.meta.url)),
      ),
    );
    const grid = await decodeDetailGrid(png);
    const answers: Record<WorkerName, unknown> = {
      'point-cloud': { cloud: {}, cloudSet: {}, detail: {}, grid },
      volume: {},
      'region-lines': { lines: {}, grid: {}, flow: new Uint8Array(0) },
    };

    const scene = await loadSceneData({
      createWorker: (name) => new AnsweringWorker(answers[name]) as unknown as Worker,
    });

    expect(scene.detailGrid.size).toBe(DETAIL_SIZE);
    expect(scene.detailGrid.values).toHaveLength(1024 * 1024);
    expect(scene.detailGrid).toBe(grid);
  });
});
