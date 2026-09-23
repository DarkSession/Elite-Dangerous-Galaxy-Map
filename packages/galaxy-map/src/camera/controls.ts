// The game's control scheme: orbit with the left button, drag the cursor in the plane
// with the right button, zoom with the wheel and move with the keyboard.
import type { mat4 } from 'gl-matrix';
import { cameraPosition, inverseViewProjection, planePointFrom } from './projection';
import type { Viewport } from './projection';
import {
  clampCursor,
  clampDistance,
  clampPitch,
  copyView,
  unrestrictedBounds,
  wrapYaw,
} from './view';
import type { ResolvedBounds } from './view';
import type { View } from './view';

/** Degrees of yaw or pitch per pixel of left drag. */
export const ORBIT_DEGREES_PER_PIXEL = 0.3;

/** The factor one wheel notch applies to the distance. */
export const ZOOM_PER_NOTCH = 1.15;

/**
 * How long the zoom glide takes to close half of the gap to its target, in
 * milliseconds. With the floor below, one notch lands in 217 milliseconds at 60 frames
 * a second, which is the time a region label takes to settle.
 */
export const ZOOM_HALF_LIFE_MS = 50;

/**
 * The least speed of the zoom glide, in wheel notches a second. The halving alone never
 * reaches the target, so the floor is what lands the glide. With the half life above,
 * one notch lands in 217 milliseconds at 60 frames a second, which is the time a region
 * label takes to settle.
 */
export const ZOOM_LEAST_NOTCHES_PER_SECOND = 2;

/** The share of the distance the keys move the cursor in one second. */
export const MOVE_FRACTION_PER_SECOND = 0.25;

/** How far the turn keys move the yaw in one second, in degrees. */
export const TURN_DEGREES_PER_SECOND = 60;

/**
 * The keys that move the camera. `W`, `A`, `S`, `D`, `R` and `F` move the cursor, and `Q`
 * and `E` turn the camera around it. Every rule this file holds for a movement key holds
 * for all eight: the window listener, the form-field guard, and the end of a running
 * selection flight.
 */
export const MOVEMENT_KEYS = ['W', 'A', 'S', 'D', 'R', 'F', 'Q', 'E'] as const;

/** How far a left press may move from its first pixel and still be a click. */
export const CLICK_MOVE_CSS = 4;

/** How long a left press may last and still be a click, in milliseconds. */
export const CLICK_HOLD_MS = 400;

/**
 * How far a touch may move from its first pixel and still be a tap, in CSS pixels.
 *
 * The limit is wider than `CLICK_MOVE_CSS`. A finger covers a contact patch several
 * millimetres wide and the browser reports its middle, which moves by more than 4 CSS
 * pixels in a tap the user means to hold still. A mouse does not move unless the hand
 * moves it. The hold limit is the same `CLICK_HOLD_MS`, because a slow tap is slow for
 * the same reason on both.
 */
export const TAP_MOVE_CSS = 10;

/** One of the keys that move the cursor. */
export type MovementKey = (typeof MOVEMENT_KEYS)[number];

/**
 * Which of the user's inputs the map acts on. Each switch is on unless a host turns it
 * off, and each one covers the mouse and the touch form of the same input.
 *
 * A switch that is off stops that input from changing the view or the selection. It does
 * not stop the map from drawing, from reporting a hover or from answering `systemAt`, and
 * it does not stop the canvas from holding off the browser's own default action: a canvas
 * that let the page scroll under a disabled wheel would be worse than one that zooms.
 *
 * The switches are for the user's input. A `setView`, a `setSelection` and a `flyTo` from
 * the host work whatever they say.
 */
export interface InteractionSwitches {
  /** The wheel and the pinch. */
  readonly zoom: boolean;
  /** The left drag and the two finger turn. */
  readonly orbit: boolean;
  /** The right drag and the one finger drag. */
  readonly pan: boolean;
  /** The eight movement keys. */
  readonly keys: boolean;
  /** The click and the tap that select a system. */
  readonly select: boolean;
}

/** Every input on, which is what a map takes where the host names none. */
export const ALL_INTERACTION: InteractionSwitches = {
  zoom: true,
  orbit: true,
  pan: true,
  keys: true,
  select: true,
};

/**
 * Reads a host's partial setting over the one the map holds. A field the setting does not
 * name, and a field that is not a boolean, keeps the value it had, so a host that writes
 * one switch does not clear the other four.
 */
export function readInteraction(
  held: InteractionSwitches,
  next: unknown,
): InteractionSwitches {
  if (next === null || typeof next !== 'object') return held;
  const given = next as Record<string, unknown>;
  const read = (name: keyof InteractionSwitches): boolean =>
    typeof given[name] === 'boolean' ? (given[name] as boolean) : held[name];
  return {
    zoom: read('zoom'),
    orbit: read('orbit'),
    pan: read('pan'),
    keys: read('keys'),
    select: read('select'),
  };
}

/** What a right drag remembers from its first pixel. */
export interface DragStart {
  /** The view as it was when the drag started. */
  readonly view: View;
  /** The plane point under the first pixel. */
  readonly point: readonly [number, number, number];
  /**
   * The inverse view-projection matrix of the start view at the viewport size
   * `inverseWidth` by `inverseHeight`. The drag reads the start view on each move, so
   * the inverse is built once. A resize during the drag builds it again.
   */
  inverse: mat4;
  /** The viewport width that `inverse` was built for. */
  inverseWidth: number;
  /** The viewport height that `inverse` was built for. */
  inverseHeight: number;
  /** The camera position of the start view, where each ray of the drag starts. */
  readonly origin: readonly [number, number, number];
}

/**
 * What a left press remembers, so the release can tell a click from an orbit. `moved` is
 * the largest distance the pointer reached from the press pixel, not the last one: a
 * press that moves 40 pixels and comes back is an orbit and never selects.
 */
export interface PressRecord {
  /** The press pixel, in CSS pixels of the canvas. */
  readonly x: number;
  readonly y: number;
  /** When the press started, in milliseconds. */
  readonly startMs: number;
  /** The largest distance from the press pixel, in CSS pixels. */
  moved: number;
}

/** Remembers where and when a left press started. */
export function beginPress(
  pixel: { readonly x: number; readonly y: number },
  nowMs: number,
): PressRecord {
  return { x: pixel.x, y: pixel.y, startMs: nowMs, moved: 0 };
}

/** Adds one pointer position to a press, keeping the largest distance it reached. */
export function trackPress(
  press: PressRecord,
  pixel: { readonly x: number; readonly y: number },
): void {
  const moved = Math.hypot(pixel.x - press.x, pixel.y - press.y);
  if (moved > press.moved) press.moved = moved;
}

/**
 * True when a left press is a click and not an orbit. The two limits exist because the
 * same button does both jobs, as it does in the game. The pixel limit is what separates
 * a click from a drag on a hand that is not perfectly still. The time limit is what
 * stops a slow press-and-hold with no movement from selecting when the user meant to
 * stop and look.
 */
export function isClick(press: PressRecord, nowMs: number): boolean {
  if (press.moved > CLICK_MOVE_CSS) return false;
  return nowMs - press.startMs <= CLICK_HOLD_MS;
}

/**
 * True when a key event is aimed at a field the user types into. The movement keys come
 * from a listener on the window, so without the guard the HUD's search box would move
 * the camera as the user types `A`, `S` or `D`.
 */
export function fromFormField(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Holds a movement key down, unless the event is aimed at a form field. The guard is on
 * the press alone: a key that goes down in a field starts no hold, so it never moves the
 * cursor, and a release is always read, so no key is ever left held.
 */
export function applyKeyDown(keys: Set<string>, code: string, target: unknown): void {
  if (fromFormField(target)) return;
  const key = movementKeyOf(code);
  if (key !== null) keys.add(key);
}

/** Lets a movement key up, wherever the release landed. */
export function applyKeyUp(keys: Set<string>, code: string): void {
  const key = movementKeyOf(code);
  if (key !== null) keys.delete(key);
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
 * The target distance wheel notches ask for, from the target the map already holds. A
 * positive count is a forward notch, which moves the camera toward the cursor.
 */
export function zoomTarget(
  distance: number,
  notches: number,
  bounds: ResolvedBounds = unrestrictedBounds(),
): number {
  return clampDistance(
    distance / Math.pow(ZOOM_PER_NOTCH, notches),
    bounds.maxDistanceLy,
  );
}

/**
 * The distance one frame of the zoom glide gives. The step is taken in log distance, so
 * the zoom moves by a constant factor for each unit of time. The gap falls by half every
 * `ZOOM_HALF_LIFE_MS`, and the camera moves by at least
 * `ZOOM_LEAST_NOTCHES_PER_SECOND` notches a second. Where the step reaches the target,
 * the function returns the target itself, so the glide lands on it exactly.
 */
export function zoomStep(distance: number, target: number, seconds: number): number {
  const gap = Math.log(target) - Math.log(distance);
  const size = Math.abs(gap);
  const fall = 1 - Math.pow(0.5, (seconds * 1000) / ZOOM_HALF_LIFE_MS);
  const least = ZOOM_LEAST_NOTCHES_PER_SECOND * Math.log(ZOOM_PER_NOTCH) * seconds;
  const step = Math.max(size * fall, least);
  if (step >= size) return target;
  return distance * Math.exp(gap < 0 ? -step : step);
}

/** Turns a wheel event delta into notches. A forward notch is positive. */
export function notchesFromWheel(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return -deltaY;
  if (deltaMode === 2) return -deltaY * 10;
  return -deltaY / 100;
}

/**
 * Moves the camera for the keys that are down, over a number of seconds.
 *
 * `Q` and `E` turn the camera around the cursor and move nothing else: the pitch, the
 * distance and the cursor stay as they are. `E` raises the yaw, which is the way a drag to
 * the right turns the camera. Both keys held together turn by 0 degrees, because the two
 * rates cancel.
 */
export function moveByKeys(
  view: View,
  keys: ReadonlySet<string>,
  seconds: number,
  bounds: ResolvedBounds = unrestrictedBounds(),
): void {
  if (keys.size === 0 || seconds <= 0) return;

  const turn = (keys.has('E') ? 1 : 0) - (keys.has('Q') ? 1 : 0);
  if (turn !== 0) {
    view.yaw = wrapYaw(view.yaw + turn * TURN_DEGREES_PER_SECOND * seconds);
  }

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

  view.cursor = clampCursor([x, y, z], bounds);
}

/** Remembers what a right drag needs, or null when the pixel misses the plane. */
export function beginDrag(
  view: View,
  pixel: { readonly x: number; readonly y: number },
  viewport: Viewport,
): DragStart | null {
  const start = copyView(view);
  const inverse = inverseViewProjection(start, viewport);
  const origin = cameraPosition(start);
  const point = planePointFrom(inverse, origin, pixel, viewport, start.cursor[1]);
  if (point === null) return null;
  return {
    view: start,
    point,
    inverse,
    inverseWidth: viewport.width,
    inverseHeight: viewport.height,
    origin,
  };
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
  bounds: ResolvedBounds = unrestrictedBounds(),
): void {
  if (
    viewport.width !== start.inverseWidth ||
    viewport.height !== start.inverseHeight
  ) {
    start.inverse = inverseViewProjection(start.view, viewport);
    start.inverseWidth = viewport.width;
    start.inverseHeight = viewport.height;
  }
  const current = planePointFrom(
    start.inverse,
    start.origin,
    pixel,
    viewport,
    start.view.cursor[1],
  );
  if (current === null) return;
  view.cursor = clampCursor(
    [
      start.view.cursor[0] + (start.point[0] - current[0]),
      start.view.cursor[1],
      start.view.cursor[2] + (start.point[2] - current[2]),
    ],
    bounds,
  );
}

/** The letter a keyboard event names, or null when it is not a movement key. */
export function movementKeyOf(code: string): MovementKey | null {
  if (!code.startsWith('Key')) return null;
  const letter = code.slice(3);
  return (MOVEMENT_KEYS as readonly string[]).includes(letter)
    ? (letter as MovementKey)
    : null;
}

/** A point on the canvas, in CSS pixels. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/** The distance in CSS pixels between two pointers. */
export function pinchGap(first: Pixel, second: Pixel): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** The point half way between two pointers, in CSS pixels. */
export function pinchMiddle(first: Pixel, second: Pixel): Pixel {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

/**
 * The distance a pinch asks for, in light years, clamped to the zoom limits.
 *
 * The reading is taken from the gap the gesture started with and not from the gap of the
 * event before, so a pinch out and back leaves the distance where it began. Fingers that
 * move apart make the gap larger and the distance smaller, which zooms in.
 */
export function pinchDistance(
  startDistance: number,
  startGap: number,
  gap: number,
  bounds: ResolvedBounds = unrestrictedBounds(),
): number {
  const limit = bounds.maxDistanceLy;
  if (!(gap > 0) || !(startGap > 0)) return clampDistance(startDistance, limit);
  return clampDistance((startDistance * startGap) / gap, limit);
}

/**
 * What one reading of a touch pointer reports.
 *
 * `cancel` is a pointer the browser or the operating system took away: a notification
 * shade that opened, a change of orientation, or one touch point more than the device
 * holds. It ends the pointer as `up` does, but it is not a come-up, so it never selects.
 */
export type TouchPhase = 'down' | 'move' | 'up' | 'cancel';

/**
 * One reading of a pointer, which is all the gesture rule takes beside its own state.
 * `attachControls` makes it from a `PointerEvent`, and a unit test writes it by hand.
 */
export interface TouchReading {
  /** Whether the pointer went down, moved, came up or was cancelled. */
  readonly phase: TouchPhase;
  /** The pointer's own id. */
  readonly pointerId: number;
  /** The pointer's type, which the rule reads to take touch alone. */
  readonly pointerType: string;
  /** The pointer's position on the canvas, in CSS pixels. */
  readonly x: number;
  readonly y: number;
  /** The time of the reading, in milliseconds. */
  readonly timeMs: number;
}

/** One touch pointer that is down. */
export interface TouchPointer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** What the tap test remembers about the one pointer that may still be a tap. */
export interface TouchPress {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly startMs: number;
  /** The largest distance from the first pixel, in CSS pixels. */
  readonly moved: number;
}

/** The state the gesture rule carries between two readings. */
export interface TouchState {
  /** The touch pointers that are down, the earliest first. */
  readonly pointers: readonly TouchPointer[];
  /**
   * The distance the view holds, in light years. The caller writes it before every
   * reading: the rule is pure and cannot read the view, and a pinch takes the distance
   * at the moment its gesture starts.
   */
  readonly distance: number;
  /** The gap of the two pointers at the moment the two-finger gesture started. */
  readonly startGap: number;
  /** The view distance at that same moment, in light years. */
  readonly startDistance: number;
  /** The middle of the two pointers at the reading before, or null. */
  readonly middle: Pixel | null;
  /** The press the tap test reads, or null when no pointer can still be a tap. */
  readonly press: TouchPress | null;
}

/** What the gesture rule asks the caller to do with the view. */
export interface TouchAction {
  /** Read the plane point under this pixel and hold it as the drag start. */
  readonly beginPlane?: Pixel;
  /** Move the cursor so the held plane point sits under this pixel. */
  readonly dragTo?: Pixel;
  /** Turn the camera by this movement of the middle, in CSS pixels. */
  readonly orbit?: { readonly deltaX: number; readonly deltaY: number };
  /** Write this distance, in light years. */
  readonly distance?: number;
  /** Select at this pixel. */
  readonly select?: Pixel;
  /** End a running wheel glide, as a write of the distance does. */
  readonly endGlide?: boolean;
  /**
   * True where the gesture acts on the view. The caller raises the input hook, which
   * ends a running selection flight before the gesture reads the view.
   */
  readonly input?: boolean;
}

/** What one reading gives back. */
export interface TouchResult {
  readonly state: TouchState;
  readonly action: TouchAction;
}

/** The state of a gesture with no pointer down. */
export const NO_TOUCH: TouchState = {
  pointers: [],
  distance: 0,
  startGap: 0,
  startDistance: 0,
  middle: null,
  press: null,
};

/** The two pointers the gesture reads, which are the two that went down first. */
function activePointers(pointers: readonly TouchPointer[]): readonly TouchPointer[] {
  return pointers.slice(0, 2);
}

/**
 * Starts the two-finger gesture again from the pointers that are down. It reads the gap
 * and the middle now, so a finger that lands or lifts moves the view by nothing.
 */
function restartTwoFingers(state: TouchState): TouchState {
  const active = activePointers(state.pointers);
  const first = active[0] as TouchPointer;
  const second = active[1] as TouchPointer;
  return {
    ...state,
    startGap: pinchGap(first, second),
    startDistance: state.distance,
    middle: pinchMiddle(first, second),
  };
}

/** True when a press that has come up is a tap and not a drag. */
function isTap(press: TouchPress, nowMs: number): boolean {
  if (press.moved > TAP_MOVE_CSS) return false;
  return nowMs - press.startMs <= CLICK_HOLD_MS;
}

/**
 * The gesture rule for a touch screen. It is a pure function of its own state and one
 * reading, so a unit test drives it with no DOM: `vitest.config.ts` runs in the node
 * environment.
 *
 * One finger moves the cursor in the galactic plane. Two fingers pinch to zoom and drag
 * to orbit. A tap selects. While three or more pointers are down the rule reads the two
 * that went down first, so a palm or a resting finger does not stop the map.
 *
 * Every change in the count of pointers restarts the gesture from the pointers that are
 * down. Without that a second finger landing, or one of two lifting, would move the view
 * by the whole difference between the old reading and the new one in one event.
 */
export function touchGesture(
  state: TouchState,
  reading: TouchReading,
  bounds: ResolvedBounds = unrestrictedBounds(),
): TouchResult {
  if (reading.pointerType !== 'touch') return { state, action: {} };
  const held = state.pointers;

  if (reading.phase === 'down') {
    if (held.some((pointer) => pointer.id === reading.pointerId)) {
      return { state, action: {} };
    }
    const pointers = [...held, { id: reading.pointerId, x: reading.x, y: reading.y }];
    // A tap is one finger alone. A press that becomes a second finger never selects.
    const press =
      pointers.length === 1
        ? {
            id: reading.pointerId,
            x: reading.x,
            y: reading.y,
            startMs: reading.timeMs,
            moved: 0,
          }
        : null;
    const next = { ...state, pointers, press };
    if (pointers.length === 1) {
      return {
        state: next,
        action: { beginPlane: { x: reading.x, y: reading.y }, input: true },
      };
    }
    // A pinch is the user's own hand on the distance, so it ends the wheel glide, as
    // `setView` does. A filter between the hand and the camera would lag it.
    return { state: restartTwoFingers(next), action: { endGlide: true, input: true } };
  }

  if (reading.phase === 'up' || reading.phase === 'cancel') {
    const press = state.press;
    const lifted =
      press === null || press.id !== reading.pointerId
        ? null
        : { ...press, moved: Math.max(press.moved, movedBy(press, reading)) };
    // A tap is one pointer that goes down and comes up. A cancelled pointer ends the
    // gesture the same way, but the user never lifted a finger, so it selects nothing.
    const action: TouchAction =
      reading.phase === 'up' && lifted !== null && isTap(lifted, reading.timeMs)
        ? { select: { x: reading.x, y: reading.y } }
        : {};
    const pointers = held.filter((pointer) => pointer.id !== reading.pointerId);
    const next = { ...state, pointers, press: null, middle: null };
    if (pointers.length === 0) {
      return { state: { ...NO_TOUCH, distance: state.distance }, action };
    }
    if (pointers.length === 1) {
      const only = pointers[0] as TouchPointer;
      return {
        state: next,
        action: { ...action, beginPlane: { x: only.x, y: only.y } },
      };
    }
    return { state: restartTwoFingers(next), action };
  }

  const index = held.findIndex((pointer) => pointer.id === reading.pointerId);
  if (index < 0) return { state, action: {} };
  const pointers = held.map((pointer) =>
    pointer.id === reading.pointerId
      ? { id: pointer.id, x: reading.x, y: reading.y }
      : pointer,
  );
  const press =
    state.press !== null && state.press.id === reading.pointerId
      ? {
          ...state.press,
          moved: Math.max(state.press.moved, movedBy(state.press, reading)),
        }
      : state.press;
  const next = { ...state, pointers, press };
  // A pointer the gesture does not read moved, so the view does not move.
  if (index > 1) return { state: next, action: {} };

  const active = activePointers(pointers);
  if (active.length === 1) {
    return {
      state: next,
      action: { dragTo: { x: reading.x, y: reading.y }, input: true },
    };
  }

  const first = active[0] as TouchPointer;
  const second = active[1] as TouchPointer;
  const middle = pinchMiddle(first, second);
  const before = state.middle ?? middle;
  return {
    state: { ...next, middle },
    action: {
      orbit: { deltaX: middle.x - before.x, deltaY: middle.y - before.y },
      distance: pinchDistance(
        state.startDistance,
        state.startGap,
        pinchGap(first, second),
        bounds,
      ),
      input: true,
    },
  };
}

/** How far a reading sits from the pixel a press started on, in CSS pixels. */
function movedBy(press: TouchPress, reading: TouchReading): number {
  return Math.hypot(reading.x - press.x, reading.y - press.y);
}

/** What `attachControls` gives back. */
export interface Controls {
  /**
   * Steps the zoom glide and applies the keys that are down. Call it once per frame.
   * It raises the view change listeners once in each frame that moves the view.
   */
  update(seconds: number): void;
  /**
   * True while the user holds a movement key. The map reads it before it advances a
   * selection flight, so the flight never takes a frame the user is driving.
   */
  isMoving(): boolean;
  /**
   * The distance in light years the zoom glide moves toward, and null when no glide
   * runs. A browser test reads it to wait for the camera to settle.
   */
  zoomTargetLy(): number | null;
  /**
   * Drops the zoom target and leaves the view where it had reached. The map calls it
   * wherever something else writes the distance, so only the wheel glides.
   */
  endZoom(): void;
  /** Removes every listener. */
  dispose(): void;
}

/** Options for `attachControls`. */
export interface ControlsOptions {
  /** Called after every change to the view. */
  readonly onChange?: () => void;
  /** Called with the release pixel when a left press is a click and not an orbit. */
  readonly onClick?: (pixel: { readonly x: number; readonly y: number }) => void;
  /**
   * Called with the pointer's pixel over the canvas, and with null when the pointer
   * leaves it. The map keeps the last pixel and runs the hover pick once per frame, so
   * a pointer that reports at 120 Hz costs one sweep per frame and not one per event.
   */
  readonly onPointer?: (
    pixel: { readonly x: number; readonly y: number } | null,
  ) => void;
  /**
   * Called before a pointer press, a wheel notch or a movement key acts on the view. A
   * held movement key calls it once in each frame it moves the view, and not on the
   * `keydown` alone. The map ends a running selection flight there, so the input acts on
   * the view the flight had reached and the user is never held.
   */
  readonly onInput?: () => void;
  /**
   * True while the browser asks for less movement. The map reads the setting at each
   * notch and not once at start up, so a user who changes it does not reload. Where it
   * is true, a wheel notch writes the distance at once and no glide runs.
   */
  readonly reducedMotion?: () => boolean;
  /**
   * The browsable space, read once for each input. It is a function and not a value,
   * because a host can change the bounds at any time and the controls hold no listener.
   */
  readonly bounds?: () => ResolvedBounds;
  /**
   * The interaction switches, read once for each input, for the same reason the bounds
   * are. A switch that goes off during a drag therefore stops that drag in the frame it
   * changes.
   */
  readonly interaction?: () => InteractionSwitches;
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
  let press: PressRecord | null = null;
  let lastOrbitX = 0;
  let lastOrbitY = 0;
  // The touch gesture's own state. `touchGesture` holds every rule; the handlers below
  // make a reading, call it and apply what it gives back.
  let touch: TouchState = NO_TOUCH;
  // The distance the zoom glide moves toward, and null when no glide runs. The name is
  // `target` and not `zoomTarget`, which is the module function the wheel calls.
  let target: number | null = null;

  const changed = (): void => options.onChange?.();

  /** The browsable space as it stands. Every clamp inside the controls reads it. */
  const boundsNow = (): ResolvedBounds => options.bounds?.() ?? unrestrictedBounds();

  /** The interaction switches as they stand. Every handler below reads them. */
  const switchesNow = (): InteractionSwitches =>
    options.interaction?.() ?? ALL_INTERACTION;

  const viewportOf = (): Viewport => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  });

  const pixelOf = (event: PointerEvent): { x: number; y: number } => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  /**
   * Turns one touch event into a reading, calls the gesture rule and applies what it
   * asks for. The input hook runs first, so a running selection flight ends before the
   * gesture reads the view.
   */
  const applyTouch = (event: PointerEvent, phase: TouchPhase): void => {
    const pixel = pixelOf(event);
    // The rule is pure, so the caller states the distance the view holds. A pinch reads
    // it at the moment its gesture starts.
    const result = touchGesture(
      { ...touch, distance: view.distance },
      {
        phase,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x: pixel.x,
        y: pixel.y,
        timeMs: performance.now(),
      },
      boundsNow(),
    );
    touch = result.state;
    const action = result.action;
    const switches = switchesNow();
    // The gesture rule runs whatever the switches say, so the state it keeps stays right,
    // and each thing it asks for is gated here. The input hook fires only where one of
    // the three camera inputs can act, so a gesture that can move nothing ends no flight.
    if (action.input === true && (switches.zoom || switches.orbit || switches.pan)) {
      options.onInput?.();
    }
    if (action.endGlide === true) target = null;
    if (action.beginPlane !== undefined) {
      drag = beginDrag(view, action.beginPlane, viewportOf());
    } else if (touch.pointers.length !== 1) {
      // No one-finger drag runs, so the map holds no plane point for one.
      drag = null;
    }
    let moved = false;
    if (action.dragTo !== undefined && drag !== null && switches.pan) {
      dragCursor(view, drag, action.dragTo, viewportOf(), boundsNow());
      moved = true;
    }
    if (action.orbit !== undefined && switches.orbit) {
      orbit(view, action.orbit.deltaX, action.orbit.deltaY);
      moved = true;
    }
    if (action.distance !== undefined && switches.zoom) {
      view.distance = action.distance;
      moved = true;
    }
    if (moved) changed();
    if (action.select !== undefined && switches.select)
      options.onClick?.(action.select);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      // The capture is on the element and not on the pointer set, so the first touch
      // pointer is the only one that needs it.
      if (touch.pointers.length === 0) canvas.setPointerCapture(event.pointerId);
      applyTouch(event, 'down');
      return;
    }
    // The press begins its drag whatever the switch says, so a switch that goes on during
    // the drag takes effect at once. The move handler is where the view is written.
    const switches = switchesNow();
    if (
      (event.button === 0 && switches.orbit) ||
      (event.button === 2 && switches.pan)
    ) {
      options.onInput?.();
    }
    if (event.button === 2) {
      event.preventDefault();
      drag = beginDrag(view, pixelOf(event), viewportOf());
      dragPointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    } else if (event.button === 0) {
      event.preventDefault();
      orbitPointer = event.pointerId;
      press = beginPress(pixelOf(event), performance.now());
      lastOrbitX = event.clientX;
      lastOrbitY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    const pixel = pixelOf(event);
    options.onPointer?.(pixel);
    if (event.pointerType === 'touch') {
      event.preventDefault();
      applyTouch(event, 'move');
      return;
    }
    // The press is tracked whatever the orbit switch says, so a left press that moves
    // past the click limit with the orbit off is still not a click.
    if (press !== null && event.pointerId === orbitPointer) trackPress(press, pixel);
    const switches = switchesNow();
    if (drag !== null && event.pointerId === dragPointer) {
      event.preventDefault();
      if (switches.pan) {
        dragCursor(view, drag, pixel, viewportOf(), boundsNow());
        changed();
      }
    } else if (orbitPointer !== null && event.pointerId === orbitPointer) {
      event.preventDefault();
      // The orbit is applied as the pointer moves, so a click does not undo the at most
      // 1.2 degrees the 4 pixels of its own movement turned the camera.
      //
      // The two pixels are kept whatever the switch says, so an orbit that starts again
      // reads the movement from where the pointer is and not from where it was when the
      // switch went off.
      if (switches.orbit) {
        orbit(view, event.clientX - lastOrbitX, event.clientY - lastOrbitY);
        changed();
      }
      lastOrbitX = event.clientX;
      lastOrbitY = event.clientY;
    }
  };

  const onPointerLeave = (): void => options.onPointer?.(null);

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      // `pointercancel` ends the pointer as `pointerup` does, but the user never lifted
      // a finger, so the gesture rule must not read it as a tap.
      applyTouch(event, event.type === 'pointercancel' ? 'cancel' : 'up');
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (event.pointerId === dragPointer) {
      drag = null;
      dragPointer = null;
    }
    if (event.pointerId === orbitPointer) {
      orbitPointer = null;
      const pixel = pixelOf(event);
      if (press !== null) {
        trackPress(press, pixel);
        if (isClick(press, performance.now()) && switchesNow().select) {
          options.onClick?.(pixel);
        }
      }
      press = null;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent): void => {
    // The page must not scroll under a wheel the host turned off, so the default action is
    // held off before the switch is read.
    event.preventDefault();
    if (!switchesNow().zoom) return;
    options.onInput?.();
    const notches = notchesFromWheel(event.deltaY, event.deltaMode);
    if (options.reducedMotion?.() === true) {
      view.distance = zoomTarget(view.distance, notches, boundsNow());
      target = null;
      changed();
      return;
    }
    // The notch divides the target the map already holds, so a held wheel keeps the
    // 1.15 step and loses nothing to the camera's own lag. The event moves no view, so
    // it raises no listener: the frame step raises them while it moves the distance.
    target = zoomTarget(target ?? view.distance, notches, boundsNow());
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    applyKeyDown(keys, event.code, event.target);
    // The hook fires for a movement key the form-field guard let through, and not for a
    // key the user typed into a search box.
    if (fromFormField(event.target)) return;
    if (movementKeyOf(event.code) !== null && switchesNow().keys) options.onInput?.();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    applyKeyUp(keys, event.code);
  };

  const onBlur = (): void => keys.clear();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // The set holds movement keys alone, so a key in it is a movement key the user holds
  // down. `update` and `isMoving` read the same test under one name.
  //
  // A held key with the switch off is not movement. The map reads `isMoving` to end a
  // flight, so a key that cannot move the camera must not end one either.
  const moving = (): boolean => keys.size > 0 && switchesNow().keys;

  return {
    update(seconds: number): void {
      let moved = false;
      if (target !== null) {
        const next = zoomStep(view.distance, target, seconds);
        if (next === target) target = null;
        // A frame of no time gives a step of zero, and a frame that moves nothing must
        // raise no listener.
        if (next !== view.distance) moved = true;
        view.distance = next;
      }
      if (moving()) {
        // The hook fires each frame the key is held, and not on the `keydown` alone. A
        // user who holds the key before the map starts a selection flight sends no new
        // `keydown` until the auto-repeat of the browser, so this call ends a flight
        // that starts later in the same frame.
        options.onInput?.();
        moveByKeys(view, keys, seconds, boundsNow());
        moved = true;
      }
      // The listeners are raised once at the end, so a user who holds a key during a
      // glide does not get two calls with two different views in one frame.
      if (moved) changed();
    },
    isMoving(): boolean {
      return moving();
    },
    zoomTargetLy(): number | null {
      return target;
    },
    endZoom(): void {
      target = null;
    },
    dispose(): void {
      // A map disposed in the middle of a drag gives the canvas back without a capture.
      // The browser throws on an id the element does not hold, so each release is
      // guarded: `hasPointerCapture` is missing on some test doubles of a canvas.
      const held = [dragPointer, orbitPointer, ...touch.pointers.map((one) => one.id)];
      for (const id of held) {
        if (id === null) continue;
        try {
          canvas.releasePointerCapture(id);
        } catch {
          // The element holds no capture of that id, which is the state dispose wants.
        }
      }
      drag = null;
      dragPointer = null;
      orbitPointer = null;
      touch = NO_TOUCH;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
