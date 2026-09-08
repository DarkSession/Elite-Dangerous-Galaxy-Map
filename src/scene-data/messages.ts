// The messages the scene-data workers exchange with the main thread.
import type { DensityVolume, PointCloud, SceneData, SurfaceDetail } from './types';

/** What the main thread asks the point cloud worker for. */
export interface PointCloudRequest {
  readonly count: number;
  readonly seed: number;
}

/** What the point cloud worker sends back: the cloud and the surface detail grid. */
export interface PointCloudResponse {
  readonly cloud: PointCloud;
  readonly detail: SurfaceDetail;
}

/** What the volume worker sends back. */
export type VolumeResponse = DensityVolume;

/** The buffers a point cloud message moves instead of copying. */
export function pointCloudTransferables(cloud: PointCloud): Transferable[] {
  return [cloud.positions.buffer as ArrayBuffer, cloud.tints.buffer as ArrayBuffer];
}

/** The buffers a volume message moves instead of copying. */
export function volumeTransferables(volume: DensityVolume): Transferable[] {
  return [volume.data.buffer as ArrayBuffer];
}

/** The buffer a surface detail message moves instead of copying. */
export function surfaceDetailTransferables(detail: SurfaceDetail): Transferable[] {
  return [detail.data.buffer as ArrayBuffer];
}

/** Every buffer a whole scene-data object holds. */
export function sceneDataTransferables(scene: SceneData): Transferable[] {
  return [
    ...pointCloudTransferables(scene.pointCloud),
    ...volumeTransferables(scene.volume),
    ...surfaceDetailTransferables(scene.detail),
  ];
}
