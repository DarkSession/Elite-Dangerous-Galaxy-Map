// The game's control scheme: orbit with the left button, drag the cursor in the plane
// with the right button, zoom with the wheel and move with the keyboard.
import { planePoint } from './projection';
import type { Viewport } from './projection';
import { clampCursor, clampDistance, clampPitch, copyView, wrapYaw } from './view';
import type { View } from './view';

/** Degrees of yaw or pitch per pixel of left drag. */
export const ORBIT_DEGREES_PER_PIXEL = 0.3;

/** The factor one wheel notch applies to the distance. */
export const ZOOM_PER_NOTCH = 1.15;

/** The share of the distance the keys move the cursor in one second. */
export const MOVE_FRACTION_PER_SECOND = 0.25;

/** The keys that move the cursor. */
export const MOVEMENT_KEYS = ['W', 'A', 'S', 'D', 'R', 'F'] as const;

/** One of the keys that move the cursor. */
export type MovementKey = (typeof MOVEMENT_KEYS)[number];

/** What a right drag remembers from its first pixel. */
export interface DragStart {
  /** The view as it was when the drag started. */
  readonly view: View;
  /** The plane point under the first pixel. */
  readonly point: readonly [number, number, number];
}

/** Turns yaw into the horizontal direction the camera looks along. */
function planeAxes(yaw: number): {
  forward: [number, number, number];
  right: [number, number, number];
} {
  const radians = (yaw * Math.PI) / 180;
  return {
    forward: [Math.sin(radians), 0, Math.cos(radians)],
    right: [Math.cos(radians), 0, -Math.sin(radians)],
  };
}

/** Turns a left drag into a change of yaw and pitch. */
export function orbit(view: View, deltaX: number, deltaY: number): void {
  view.yaw = wrapYaw(view.yaw + deltaX * ORBIT_DEGREES_PER_PIXEL);
  view.pitch = clampPitch(view.pitch + deltaY * ORBIT_DEGREES_PER_PIXEL);
}

/**
 * Applies wheel notches. A positive count is a forward notch, which moves the camera
 * toward the cursor.
 */
export function zoomByNotches(view: View, notches: number): void {
  view.distance = clampDistance(view.distance / Math.pow(ZOOM_PER_NOTCH, notches));
}

/** Turns a wheel event delta into notches. A forward notch is positive. */
export function notchesFromWheel(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return -deltaY;
  if (deltaMode === 2) return -deltaY * 10;
  return -deltaY / 100;
}

/** Moves the cursor for the keys that are down, over a number of seconds. */
export function moveByKeys(
  view: View,
  keys: ReadonlySet<string>,
  seconds: number,
): void {
  if (keys.size === 0 || seconds <= 0) return;
  const speed = view.distance * MOVE_FRACTION_PER_SECOND * seconds;
  const { forward, right } = planeAxes(view.yaw);
  let x = view.cursor[0];
  let y = view.cursor[1];
  let z = view.cursor[2];

  if (keys.has('W')) {
    x += forward[0] * speed;
    z += forward[2] * speed;
  }
  if (keys.has('S')) {
    x -= forward[0] * speed;
    z -= forward[2] * speed;
  }
  if (keys.has('D')) {
    x += right[0] * speed;
    z += right[2] * speed;
  }
  if (keys.has('A')) {
    x -= right[0] * speed;
    z -= right[2] * speed;
  }
  if (keys.has('R')) y += speed;
  if (keys.has('F')) y -= speed;

  view.cursor = clampCursor([x, y, z]);
}

/** Remembers what a right drag needs, or null when the pixel misses the plane. */
export function beginDrag(
  view: View,
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
): DragStart | null {
  const start = copyView(view);
  const point = planePoint(start, pixel, viewport, start.cursor[1]);
  if (point === null) return null;
  return { view: start, point };
}

/**
 * Moves the cursor so the plane point under the first pixel of the drag stays under
 * the pointer.
 */
export function dragCursor(
  view: View,
  start: DragStart,
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
): void {
  const current = planePoint(start.view, pixel, viewport, start.view.cursor[1]);
  if (current === null) return;
  view.cursor = clampCursor([
    start.view.cursor[0] + (start.point[0] - current[0]),
    start.view.cursor[1],
    start.view.cursor[2] + (start.point[2] - current[2]),
  ]);
}

/** The letter a keyboard event names, or null when it is not a movement key. */
export function movementKeyOf(code: string): MovementKey | null {
  if (!code.startsWith('Key')) return null;
  const letter = code.slice(3);
  return (MOVEMENT_KEYS as readonly string[]).includes(letter)
    ? (letter as MovementKey)
    : null;
}

/** What `attachControls` gives back. */
export interface Controls {
  /** Applies the keys that are down. Call it once per frame. */
  update(seconds: number): void;
  /** True while the user drags or orbits. */
  isInteracting(): boolean;
  /** Removes every listener. */
  dispose(): void;
}

/** Options for `attachControls`. */
export interface ControlsOptions {
  /** Called after every change to the view. */
  readonly onChange?: () => void;
}

/** Wires the control scheme to a canvas. */
export function attachControls(
  canvas: HTMLCanvasElement,
  view: View,
  options: ControlsOptions = {},
): Controls {
  const keys = new Set<string>();
  let drag: DragStart | null = null;
  let dragPointer: number | null = null;
  let orbitPointer: number | null = null;
  let lastOrbitX = 0;
  let lastOrbitY = 0;

  const changed = (): void => options.onChange?.();

  const viewportOf = (): Viewport => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  });

  const pixelOf = (event: PointerEvent): { x: number; y: number } => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      event.preventDefault();
      drag = beginDrag(view, pixelOf(event), viewportOf());
      dragPointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    } else if (event.button === 0) {
      event.preventDefault();
      orbitPointer = event.pointerId;
      lastOrbitX = event.clientX;
      lastOrbitY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (drag !== null && event.pointerId === dragPointer) {
      event.preventDefault();
      dragCursor(view, drag, pixelOf(event), viewportOf());
      changed();
    } else if (orbitPointer !== null && event.pointerId === orbitPointer) {
      event.preventDefault();
      orbit(view, event.clientX - lastOrbitX, event.clientY - lastOrbitY);
      lastOrbitX = event.clientX;
      lastOrbitY = event.clientY;
      changed();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === dragPointer) {
      drag = null;
      dragPointer = null;
    }
    if (event.pointerId === orbitPointer) {
      orbitPointer = null;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    zoomByNotches(view, notchesFromWheel(event.deltaY, event.deltaMode));
    changed();
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = movementKeyOf(event.code);
    if (key !== null) keys.add(key);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const key = movementKeyOf(event.code);
    if (key !== null) keys.delete(key);
  };

  const onBlur = (): void => keys.clear();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    update(seconds: number): void {
      if (keys.size === 0) return;
      moveByKeys(view, keys, seconds);
      changed();
    },
    isInteracting(): boolean {
      return drag !== null || orbitPointer !== null;
    },
    dispose(): void {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
