// The messages the scene-data workers exchange with the main thread.
import type {
  CloudSet,
  CoarseRegionGrid,
  DensityVolume,
  PointCloud,
  RegionClearanceField,
  RegionLabelGeometry,
  RegionLines,
  SceneData,
  SurfaceDetail,
} from './types';

/** What the main thread asks the point cloud worker for. */
export interface PointCloudRequest {
  readonly count: number;
  readonly seed: number;
}

/**
 * What the point cloud worker sends back: the point cloud, the cloud set and the
 * surface detail grid. All three come from one surface table.
 */
export interface PointCloudResponse {
  readonly cloud: PointCloud;
  readonly cloudSet: CloudSet;
  readonly detail: SurfaceDetail;
}

/** What the volume worker sends back. */
export type VolumeResponse = DensityVolume;

/**
 * What the region worker sends back: the boundary set, the coarse region grid and the
 * label geometry.
 */
export interface RegionLinesResponse {
  readonly lines: RegionLines;
  readonly grid: CoarseRegionGrid;
  readonly geometry: RegionLabelGeometry;
}

/** The buffers a point cloud message moves instead of copying. */
export function pointCloudTransferables(cloud: PointCloud): Transferable[] {
  return [cloud.positions.buffer as ArrayBuffer, cloud.tints.buffer as ArrayBuffer];
}

/** The buffers a cloud set message moves instead of copying. */
export function cloudSetTransferables(set: CloudSet): Transferable[] {
  return [
    set.positions.buffer as ArrayBuffer,
    set.tints.buffer as ArrayBuffer,
    set.radii.buffer as ArrayBuffer,
    set.ratios.buffer as ArrayBuffer,
  ];
}

/** The buffers a volume message moves instead of copying. */
export function volumeTransferables(volume: DensityVolume): Transferable[] {
  return [volume.data.buffer as ArrayBuffer];
}

/** The buffer a surface detail message moves instead of copying. */
export function surfaceDetailTransferables(detail: SurfaceDetail): Transferable[] {
  return [detail.data.buffer as ArrayBuffer];
}

/** The buffers a region line message moves instead of copying. */
export function regionLinesTransferables(lines: RegionLines): Transferable[] {
  return [
    lines.positions.buffer as ArrayBuffer,
    lines.curvature.buffer as ArrayBuffer,
    lines.first.buffer as ArrayBuffer,
    lines.last.buffer as ArrayBuffer,
    lines.pairs.buffer as ArrayBuffer,
  ];
}

/** The buffer a clearance field message moves instead of copying. */
export function regionClearanceFieldTransferables(
  field: RegionClearanceField,
): Transferable[] {
  return [field.values.buffer as ArrayBuffer];
}

/** The buffers a label geometry message moves instead of copying. */
export function regionLabelGeometryTransferables(
  geometry: RegionLabelGeometry,
): Transferable[] {
  return [
    geometry.centres.buffer as ArrayBuffer,
    geometry.clearances.buffer as ArrayBuffer,
    ...regionClearanceFieldTransferables(geometry.field),
  ];
}

/** The buffer a coarse region grid message moves instead of copying. */
export function coarseRegionGridTransferables(grid: CoarseRegionGrid): Transferable[] {
  return [grid.ids.buffer as ArrayBuffer];
}

/** The buffers a whole region worker message moves instead of copying. */
export function regionResponseTransferables(
  response: RegionLinesResponse,
): Transferable[] {
  return [
    ...regionLinesTransferables(response.lines),
    ...coarseRegionGridTransferables(response.grid),
    ...regionLabelGeometryTransferables(response.geometry),
  ];
}

/** Every buffer a whole scene-data object holds. */
export function sceneDataTransferables(scene: SceneData): Transferable[] {
  return [
    ...pointCloudTransferables(scene.pointCloud),
    ...cloudSetTransferables(scene.cloudSet),
    ...volumeTransferables(scene.volume),
    ...surfaceDetailTransferables(scene.detail),
    ...regionLinesTransferables(scene.regionLines),
    ...coarseRegionGridTransferables(scene.regionGrid),
    ...regionLabelGeometryTransferables(scene.regionGeometry),
  ];
}
