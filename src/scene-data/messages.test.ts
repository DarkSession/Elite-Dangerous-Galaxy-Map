import { describe, expect, test } from 'vitest';
import { sceneDataTransferables } from './messages';
import type { SceneData } from './types';

function makeScene(): SceneData {
  const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
  const tints = new Uint8Array([10, 200]);
  const data = new Uint8Array([0, 1, 2, 3]);
  return {
    pointCloud: { count: 2, positions, tints },
    volume: {
      size: [2, 1, 2],
      origin: [0, 0, 0],
      extent: [1, 1, 1],
      lo: 0,
      hi: 1,
      epsilon: 300,
      data,
    },
  };
}

describe('scene data', () => {
  test('moves through a MessageChannel without a copy', async () => {
    const scene = makeScene();
    const channel = new MessageChannel();
    const received = await new Promise<SceneData>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<SceneData>) => resolve(event.data);
      channel.port2.start();
      channel.port1.postMessage(scene, sceneDataTransferables(scene));
    });

    expect(Array.from(received.pointCloud.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(received.pointCloud.tints)).toEqual([10, 200]);
    expect(Array.from(received.volume.data)).toEqual([0, 1, 2, 3]);
    expect(received.volume.lo).toBe(0);

    expect(scene.pointCloud.positions.buffer.byteLength).toBe(0);
    expect(scene.pointCloud.tints.buffer.byteLength).toBe(0);
    expect(scene.volume.data.buffer.byteLength).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});
