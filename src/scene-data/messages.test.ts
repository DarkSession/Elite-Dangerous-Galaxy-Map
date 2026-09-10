import { describe, expect, test } from 'vitest';
import { sceneDataTransferables } from './messages';
import type { SceneData } from './types';

function makeScene(): SceneData {
  const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
  const tints = new Uint8Array([10, 200]);
  const data = new Uint8Array([0, 1, 2, 3]);
  const detail = new Uint8Array([120, 128, 136, 200]);
  const cloudPositions = new Float32Array([7, 8, 9]);
  const cloudTints = new Uint8Array([30]);
  const cloudRadii = new Float32Array([1500]);
  const cloudRatios = new Float32Array([0.25]);
  const chain = new Float32Array([0, 0, 0, 0, 0, 100]);
  // A curvature a `float32` holds exactly, so the reading needs no tolerance.
  const chainCurvature = new Float32Array([0.001953125, 0]);
  const regionIds = new Uint8Array([1, 2, 3, 4]);
  const centres = new Float32Array([50, 50]);
  const clearances = new Uint16Array([40]);
  const clearanceValues = new Uint16Array([7, 8, 9, 10]);
  return {
    pointCloud: { count: 2, positions, tints },
    cloudSet: {
      count: 1,
      positions: cloudPositions,
      tints: cloudTints,
      radii: cloudRadii,
      ratios: cloudRatios,
    },
    volume: {
      size: [2, 1, 2],
      origin: [0, 0, 0],
      extent: [1, 1, 1],
      lo: 0,
      hi: 1,
      epsilon: 300,
      data,
    },
    detail: {
      size: 2,
      origin: [0, 0],
      extent: [1, 1],
      scale: 3,
      data: detail,
    },
    regionLines: {
      chainCount: 1,
      vertexCount: 2,
      positions: chain,
      curvature: chainCurvature,
      first: new Uint32Array([0]),
      last: new Uint32Array([1]),
      pairs: new Uint8Array([1, 2]),
    },
    regionGrid: {
      size: 2,
      origin: [0, 0],
      cell: 100,
      ids: regionIds,
    },
    regionGeometry: {
      centres,
      clearances,
      field: {
        size: 2,
        origin: [200, 200],
        cell: 400,
        values: clearanceValues,
      },
      departureLy: 200,
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
    expect(Array.from(received.cloudSet.positions)).toEqual([7, 8, 9]);
    expect(Array.from(received.cloudSet.tints)).toEqual([30]);
    expect(Array.from(received.cloudSet.radii)).toEqual([1500]);
    expect(Array.from(received.cloudSet.ratios)).toEqual([0.25]);
    expect(Array.from(received.volume.data)).toEqual([0, 1, 2, 3]);
    expect(received.volume.lo).toBe(0);
    expect(Array.from(received.detail.data)).toEqual([120, 128, 136, 200]);
    expect(received.detail.scale).toBe(3);
    expect(Array.from(received.regionLines.positions)).toEqual([0, 0, 0, 0, 0, 100]);
    expect(Array.from(received.regionLines.curvature)).toEqual([0.001953125, 0]);
    expect(received.regionLines.chainCount).toBe(1);
    expect(Array.from(received.regionLines.first)).toEqual([0]);
    expect(Array.from(received.regionLines.last)).toEqual([1]);
    expect(Array.from(received.regionGrid.ids)).toEqual([1, 2, 3, 4]);
    expect(Array.from(received.regionLines.pairs)).toEqual([1, 2]);
    expect(Array.from(received.regionGeometry.centres)).toEqual([50, 50]);
    expect(Array.from(received.regionGeometry.clearances)).toEqual([40]);
    expect(Array.from(received.regionGeometry.field.values)).toEqual([7, 8, 9, 10]);
    expect(received.regionGeometry.departureLy).toBe(200);

    expect(scene.pointCloud.positions.buffer.byteLength).toBe(0);
    expect(scene.pointCloud.tints.buffer.byteLength).toBe(0);
    expect(scene.cloudSet.positions.buffer.byteLength).toBe(0);
    expect(scene.cloudSet.tints.buffer.byteLength).toBe(0);
    expect(scene.cloudSet.radii.buffer.byteLength).toBe(0);
    expect(scene.cloudSet.ratios.buffer.byteLength).toBe(0);
    expect(scene.volume.data.buffer.byteLength).toBe(0);
    expect(scene.detail.data.buffer.byteLength).toBe(0);
    expect(scene.regionLines.positions.buffer.byteLength).toBe(0);
    expect(scene.regionLines.curvature.buffer.byteLength).toBe(0);
    expect(scene.regionLines.first.buffer.byteLength).toBe(0);
    expect(scene.regionLines.last.buffer.byteLength).toBe(0);
    expect(scene.regionGrid.ids.buffer.byteLength).toBe(0);
    expect(scene.regionLines.pairs.buffer.byteLength).toBe(0);
    expect(scene.regionGeometry.centres.buffer.byteLength).toBe(0);
    expect(scene.regionGeometry.clearances.buffer.byteLength).toBe(0);
    expect(scene.regionGeometry.field.values.buffer.byteLength).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});
