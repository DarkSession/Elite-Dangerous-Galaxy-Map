// Places the coordinate labels of the grid over the canvas. A label is DOM text in the
// same overlay the region labels and the marker names use, so it stays a crisp vector at
// every device pixel ratio and needs no font in a shader.
//
// The module works out no level of its own. `src/app/create-map.ts` reads the level from
// the renderer as `renderer.gridSpacingLy()` and passes it in each frame as the
// `spacingLy` field of the frame, so a label and its lines never disagree about the
// level. The module imports no renderer, as the lint rule requires.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { boxesOverlap } from './labels';
import type { LabelBox } from './labels';

/** How many spacings of the label level each side of the cursor carry a candidate. */
export const GRID_LABEL_SPAN = 8;

/** How many crossings one frame looks at. */
export const GRID_CANDIDATE_COUNT = (2 * GRID_LABEL_SPAN + 1) ** 2;

/** How many crossing labels the overlay places. */
export const MAX_GRID_LABELS = 32;

/** How far above the lower edge of the canvas the plane label sits, in CSS pixels. */
export const PLANE_LABEL_BOTTOM_CSS = 22;

/** The width of one character of a label, in CSS pixels. */
const LABEL_CHARACTER_CSS = 7;

/** The padding of a label, left and right together, in CSS pixels. */
const LABEL_PADDING_CSS = 8;

/** The height of a label, in CSS pixels. */
const LABEL_HEIGHT_CSS = 14;

/** The text of a crossing label: the `x` and the `z`, in whole light years. */
export function crossingLabelText(x: number, z: number): string {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

/** The text of the plane label: the `y` of the plane, in whole light years. */
export function planeLabelText(y: number): string {
  return `y = ${Math.round(y)}`;
}

/** The box of a label of a text, centred on a point. */
export function labelBoxAt(text: string, x: number, y: number): LabelBox {
  const width = text.length * LABEL_CHARACTER_CSS + LABEL_PADDING_CSS;
  return {
    left: x - width / 2,
    top: y - LABEL_HEIGHT_CSS / 2,
    width,
    height: LABEL_HEIGHT_CSS,
  };
}

/** The box of the plane label in a viewport. */
export function planeLabelBox(text: string, viewport: Viewport): LabelBox {
  const width = text.length * LABEL_CHARACTER_CSS + LABEL_PADDING_CSS;
  return {
    left: viewport.width / 2 - width / 2,
    top: viewport.height - PLANE_LABEL_BOTTOM_CSS - LABEL_HEIGHT_CSS,
    width,
    height: LABEL_HEIGHT_CSS,
  };
}

/** What one grid label update reads. */
export interface GridLabelFrame {
  readonly view: View;
  readonly viewport: Viewport;
  /** The spacing of the label level, in light years. 0 draws no label. */
  readonly spacingLy: number;
}

/** One crossing label the frame places. */
export interface GridLabelPlacement {
  readonly text: string;
  readonly box: LabelBox;
  /** Where the crossing projects to, in CSS pixels. */
  readonly x: number;
  readonly y: number;
}

/**
 * The crossing labels of one frame. The sweep reads the 289 crossings within 8 spacings
 * of the cursor, drops the ones the frame cannot show, keeps the 32 nearest the centre
 * of the canvas, and skips a box that overlaps one already placed.
 */
export function gridLabelPlacements(frame: GridLabelFrame): GridLabelPlacement[] {
  const { view, viewport, spacingLy } = frame;
  if (spacingLy <= 0) return [];

  const matrix = viewProjectionMatrix(view, viewport);
  const near = nearPlane(view.distance);
  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;
  // The sweep holds the subtraction in `float64`, so a crossing 45,000 light years out
  // keeps its resolution.
  const camera = cameraPosition(view);
  const planeY = view.cursor[1] - camera[1];
  const baseX = Math.round(view.cursor[0] / spacingLy) * spacingLy;
  const baseZ = Math.round(view.cursor[2] / spacingLy) * spacingLy;

  const candidates: GridLabelPlacement[] = [];
  const centres: number[] = [];
  for (let stepX = -GRID_LABEL_SPAN; stepX <= GRID_LABEL_SPAN; stepX += 1) {
    for (let stepZ = -GRID_LABEL_SPAN; stepZ <= GRID_LABEL_SPAN; stepZ += 1) {
      const gameX = baseX + stepX * spacingLy;
      const gameZ = baseZ + stepZ * spacingLy;
      // The renderer's world frame runs its third axis the other way to the game's.
      const offset: [number, number, number] = [
        gameX - camera[0],
        planeY,
        camera[2] - gameZ,
      ];
      const clipW =
        matrix[3] * offset[0] +
        matrix[7] * offset[1] +
        matrix[11] * offset[2] +
        matrix[15];
      if (clipW <= near) continue;
      const clipX =
        matrix[0] * offset[0] +
        matrix[4] * offset[1] +
        matrix[8] * offset[2] +
        matrix[12];
      const clipY =
        matrix[1] * offset[0] +
        matrix[5] * offset[1] +
        matrix[9] * offset[2] +
        matrix[13];
      const x = (clipX / clipW + 1) * halfWidth;
      const y = (1 - clipY / clipW) * halfHeight;
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
      const text = crossingLabelText(gameX, gameZ);
      candidates.push({ text, box: labelBoxAt(text, x, y), x, y });
      const fromX = x - halfWidth;
      const fromY = y - halfHeight;
      centres.push(fromX * fromX + fromY * fromY);
    }
  }

  const order = candidates.map((_place, index) => index);
  order.sort(
    (first, second) => (centres[first] as number) - (centres[second] as number),
  );

  const placed: GridLabelPlacement[] = [];
  for (const index of order) {
    if (placed.length === MAX_GRID_LABELS) break;
    const candidate = candidates[index] as GridLabelPlacement;
    if (placed.some((other) => boxesOverlap(candidate.box, other.box))) continue;
    placed.push(candidate);
  }
  return placed;
}

/** The overlay that holds the grid labels. */
export interface GridLabelOverlay {
  /** Places the labels of one frame. */
  update(frame: GridLabelFrame): void;
  /** How many crossing labels the last frame placed. */
  labelCount(): number;
  /** Takes every label out of the overlay. */
  clear(): void;
}

/** Builds one label element. */
function makeLabel(document: Document, className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  const style = element.style;
  style.position = 'absolute';
  style.pointerEvents = 'none';
  style.whiteSpace = 'nowrap';
  style.boxSizing = 'border-box';
  style.height = `${LABEL_HEIGHT_CSS}px`;
  style.padding = '1px 4px';
  style.font = `10px/${LABEL_HEIGHT_CSS - 2}px 'IBM Plex Mono', ui-monospace, monospace`;
  style.letterSpacing = '1px';
  style.color = 'rgba(255, 196, 140, 0.86)';
  style.textShadow = '0 0 8px #000, 0 1px 3px #000';
  return element;
}

/**
 * Builds the grid label overlay in an element. It keeps a pool of label elements, so a
 * frame adds no element the frame before did not need.
 */
export function createGridLabelOverlay(host: HTMLElement): GridLabelOverlay {
  const document = host.ownerDocument;
  const labels: HTMLElement[] = [];
  const plane = makeLabel(document, 'gm-grid-plane-label');
  let shown = 0;

  const labelAt = (index: number): HTMLElement => {
    let element = labels[index];
    if (element === undefined) {
      element = makeLabel(document, 'gm-grid-label');
      labels[index] = element;
    }
    return element;
  };

  const clear = (): void => {
    for (const element of labels) element.remove();
    plane.remove();
    shown = 0;
  };

  return {
    update(frame: GridLabelFrame): void {
      if (frame.spacingLy <= 0) {
        clear();
        return;
      }

      const placements = gridLabelPlacements(frame);
      for (let index = 0; index < placements.length; index += 1) {
        const placement = placements[index] as GridLabelPlacement;
        const element = labelAt(index);
        if (element.textContent !== placement.text)
          element.textContent = placement.text;
        element.style.left = `${placement.box.left}px`;
        element.style.top = `${placement.box.top}px`;
        if (element.parentNode === null) host.append(element);
      }
      for (let index = placements.length; index < shown; index += 1) {
        labels[index]?.remove();
      }
      shown = placements.length;

      const text = planeLabelText(frame.view.cursor[1]);
      const box = planeLabelBox(text, frame.viewport);
      if (plane.textContent !== text) plane.textContent = text;
      plane.style.left = `${box.left}px`;
      plane.style.top = `${box.top}px`;
      if (plane.parentNode === null) host.append(plane);
    },
    labelCount(): number {
      return shown;
    },
    clear,
  };
}
