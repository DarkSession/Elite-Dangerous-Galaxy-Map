// Builds the CPU reference the browser test compares the marched frame against.
//
// The reference marches the same integral as `src/render/shaders/nebulae.frag`, over the
// same records `src/scene-data/nebulae.ts` selects, and puts the result through the map's
// own exposure and tone map. It reads the `.dds` bytes and each record's own rotation and
// nothing else, so a wrong decode, a wrong selection or a wrong integral shows as a
// difference.
//
// It does **not** check the sampling convention. Line 425 reads `(u, 1 - v, w)` because
// `shaders/nebulae.frag` does, so a wrong flip on the v axis moves both sides together
// and the RMSE test still passes. The same holds for the rotation convention. The
// baseline screenshot is what holds those two, and `design.md` records it.
//
// Run it with `node scripts/build-nebula-fixture.mjs`. It writes one `.bin` of display
// bytes per view into `e2e/fixtures/`, beside `nebula-fixtures.json`, which names the
// views and the record file the bytes were built from.
//
// The module holds no import of `src/`, because `src/` is TypeScript and this is a plain
// script. `tests/nebula-fixture.test.ts` holds the two copies together: it runs this
// module's selection and this module's block decode against the ones the map uses.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artDirectory = join(root, 'src', 'render', 'nebula-art');

/** The header of a `.dds` file with a `DX10` block, in bytes. */
const DDS_HEADER_BYTES = 148;

/** How many entries one asset's transfer table holds, and how many bytes that is. */
const TRANSFER_ENTRIES = 256;
const TRANSFER_BYTES = TRANSFER_ENTRIES * 4 * 4;

/** The view the map draws with. Both figures are the renderer's own. */
const FIELD_OF_VIEW_DEGREES = 60;
const EXPOSURE = 0.0425;

/** The tone map's own two constants, from `src/render/shaders/tonemap.frag`. */
const WHITE_LEVEL = 0.95;
const BACKGROUND = [0.038, 0.036, 0.048];

/** The size rules of `src/scene-data/nebulae.ts`, which the selection below repeats. */
const MIN_PIXELS = 1.5;
const MIN_RANGE_LY = 1;
const FLOOR_FADE_FULL = 2;
const BUDGET_FADE_START = 0.8;
const COVERED_AREA_BUDGET = 4;
const ZOOM_FAR_FULL = 12000;
const ZOOM_FAR_ZERO = 20000;

/** The world frame negates `z`, which `nebulaRotationMatrix` folds into its columns. */
const WORLD_FLIP = [1, 1, -1];

/** The most steps one ray takes, which the fragment shader holds at the same figure. */
const MAX_STEPS = 256;

/** How many march steps one object-space unit takes, the renderer's own default. */
const STEP_RATE = 32;

/**
 * The views the fixtures are built at. Each one puts its record at the middle of the
 * frame, at a range that draws it about 150 CSS pixels across the radius, with the
 * camera on the record's `-z` side at yaw 0 and pitch 0.
 */
export const FIXTURE_VIEWS = [
  { name: 'barnards-loop', asset: 'barnards-loop' },
  { name: 'cats-eye', asset: 'cats-eye' },
];

/** The canvas the fixtures are built for. */
export const FIXTURE_CANVAS = { width: 1280, height: 720 };

/**
 * The largest crop a fixture covers, in half-resolution pixels. The map marches at half
 * resolution, so one crop pixel is one marched pixel. Each view takes the lesser of this
 * and its record's own disc, so the reading is of the record and not of the background
 * around it.
 */
export const FIXTURE_MAX_CROP = 160;

/** The closest the map lets the camera zoom, from `src/camera/view.ts`. */
const MIN_DISTANCE = 10;

// --- The record file ------------------------------------------------------------

/** How many numbers one row of the record file holds before its optional name. */
const RECORD_FIELDS = 8;

/** Reads the committed record file into flat arrays, as `buildNebulaSet` does. */
export function readRecords() {
  const parsed = JSON.parse(
    readFileSync(join(root, 'src', 'scene-data', 'nebulae.json'), 'utf8'),
  );
  const rows = parsed.records;
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const assets = new Uint8Array(count);
  const rotations = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const row = rows[index];
    if (row.length < RECORD_FIELDS) throw new Error(`Record ${index} is short.`);
    positions[index * 3] = row[0];
    positions[index * 3 + 1] = row[1];
    positions[index * 3 + 2] = row[2];
    radii[index] = row[3];
    assets[index] = row[4];
    rotations[index * 3] = row[5];
    rotations[index * 3 + 1] = row[6];
    rotations[index * 3 + 2] = row[7];
  }
  return { count, positions, radii, assets, rotations };
}

// --- The selection --------------------------------------------------------------

function smoothStep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function zoomWeight(distance) {
  return 1 - smoothStep(ZOOM_FAR_FULL, ZOOM_FAR_ZERO, distance);
}

export function floorFade(pixels) {
  return smoothStep(MIN_PIXELS, FLOOR_FADE_FULL * MIN_PIXELS, pixels);
}

export function coveredArea(pixels, width, height) {
  const screen = width * height;
  if (screen <= 0) return 0;
  return Math.min((Math.PI * pixels * pixels) / screen, 1);
}

export function budgetFade(throughArea) {
  return (
    1 -
    smoothStep(
      BUDGET_FADE_START * COVERED_AREA_BUDGET,
      COVERED_AREA_BUDGET,
      throughArea,
    )
  );
}

export function focalPixels(canvasHeightCss, fieldOfView) {
  return canvasHeightCss / (2 * Math.tan((fieldOfView * Math.PI) / 360));
}

/**
 * The records one frame draws, largest first. It repeats `selectNebulae`, and
 * `tests/nebula-fixture.test.ts` holds the two answers together.
 */
export function selectRecords(set, view) {
  const weight = zoomWeight(view.distance);
  const above = [];
  for (let index = 0; index < set.count; index += 1) {
    const dx = set.positions[index * 3] - view.camera[0];
    const dy = set.positions[index * 3 + 1] - view.camera[1];
    const dz = set.positions[index * 3 + 2] - view.camera[2];
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (range <= 0) continue;
    const radius = set.radii[index];
    const pixels = (view.focalPixels * radius) / Math.max(range, MIN_RANGE_LY);
    if (pixels < MIN_PIXELS) continue;
    above.push({
      index,
      range,
      pixels,
      fade: floorFade(pixels),
      covered: coveredArea(pixels, view.canvasWidthCss, view.canvasHeightCss),
    });
  }
  if (weight <= 0) return { weight, instances: [] };
  above.sort((a, b) => b.pixels - a.pixels);
  const kept = [];
  let area = 0;
  for (const one of above) {
    const through = area + one.covered;
    if (through > COVERED_AREA_BUDGET) break;
    area = through;
    kept.push({ ...one, fade: one.fade * budgetFade(through) });
  }
  return { weight, instances: kept };
}

// --- The art --------------------------------------------------------------------

/** Decodes a `BC4_UNORM` volume to one byte a texel. */
export function decodeBC4(blocks, side) {
  const across = side / 4;
  const out = new Uint8Array(side * side * side);
  const levels = new Uint8Array(8);
  let offset = 0;
  for (let z = 0; z < side; z += 1) {
    for (let by = 0; by < across; by += 1) {
      for (let bx = 0; bx < across; bx += 1) {
        const r0 = blocks[offset];
        const r1 = blocks[offset + 1];
        levels[0] = r0;
        levels[1] = r1;
        if (r0 > r1) {
          for (let i = 1; i < 7; i += 1) levels[i + 1] = ((7 - i) * r0 + i * r1) / 7;
        } else {
          for (let i = 1; i < 5; i += 1) levels[i + 1] = ((5 - i) * r0 + i * r1) / 5;
          levels[6] = 0;
          levels[7] = 255;
        }
        const low =
          blocks[offset + 2] | (blocks[offset + 3] << 8) | (blocks[offset + 4] << 16);
        const high =
          blocks[offset + 5] | (blocks[offset + 6] << 8) | (blocks[offset + 7] << 16);
        offset += 8;
        for (let i = 0; i < 16; i += 1) {
          const bits = i < 8 ? (low >> (3 * i)) & 7 : (high >> (3 * (i - 8))) & 7;
          const x = bx * 4 + (i % 4);
          const y = by * 4 + ((i / 4) | 0);
          out[z * side * side + y * side + x] = levels[bits];
        }
      }
    }
  }
  return out;
}

/** Decodes a `BC1_UNORM` volume to four bytes a texel, alpha 255. */
export function decodeBC1(blocks, side) {
  const across = side / 4;
  const out = new Uint8Array(side * side * side * 4);
  const palette = new Uint8Array(12);
  let offset = 0;
  for (let z = 0; z < side; z += 1) {
    for (let by = 0; by < across; by += 1) {
      for (let bx = 0; bx < across; bx += 1) {
        const c0 = blocks[offset] | (blocks[offset + 1] << 8);
        const c1 = blocks[offset + 2] | (blocks[offset + 3] << 8);
        const bits =
          (blocks[offset + 4] |
            (blocks[offset + 5] << 8) |
            (blocks[offset + 6] << 16) |
            (blocks[offset + 7] << 24)) >>>
          0;
        offset += 8;
        const unpack = (colour, slot) => {
          palette[slot * 3] = (((colour >> 11) & 31) * 255) / 31;
          palette[slot * 3 + 1] = (((colour >> 5) & 63) * 255) / 63;
          palette[slot * 3 + 2] = ((colour & 31) * 255) / 31;
        };
        unpack(c0, 0);
        unpack(c1, 1);
        for (let channel = 0; channel < 3; channel += 1) {
          const e0 = palette[channel];
          const e1 = palette[3 + channel];
          if (c0 > c1) {
            palette[6 + channel] = (2 * e0 + e1) / 3;
            palette[9 + channel] = (e0 + 2 * e1) / 3;
          } else {
            palette[6 + channel] = (e0 + e1) / 2;
            palette[9 + channel] = 0;
          }
        }
        for (let i = 0; i < 16; i += 1) {
          const slot = (bits >>> (2 * i)) & 3;
          const x = bx * 4 + (i % 4);
          const y = by * 4 + ((i / 4) | 0);
          const at = (z * side * side + y * side + x) * 4;
          out[at] = palette[slot * 3];
          out[at + 1] = palette[slot * 3 + 1];
          out[at + 2] = palette[slot * 3 + 2];
          out[at + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** The blocks of one `.dds` file, with its header taken off. */
function readBlocks(file) {
  const bytes = readFileSync(join(artDirectory, file));
  return new Uint8Array(
    bytes.buffer,
    bytes.byteOffset + DDS_HEADER_BYTES,
    bytes.length - DDS_HEADER_BYTES,
  );
}

/** The side of a cube volume whose blocks are `bytes` long, at 8 bytes per 4 by 4 block. */
function sideOf(bytes) {
  return Math.round(Math.cbrt((bytes / 8) * 16));
}

/** Every asset of the committed index, decoded and ready to sample. */
export function readAssets() {
  const index = JSON.parse(
    readFileSync(join(artDirectory, 'nebula-volumes.json'), 'utf8'),
  );
  const transferBytes = readFileSync(join(artDirectory, 'transfer.bin'));
  return index.assets.map((entry, slot) => {
    const densityBlocks = readBlocks(`${entry.name}-density.dds`);
    const colourBlocks = readBlocks(`${entry.name}-colour.dds`);
    // 8 bytes a block of 4 by 4 texels, `side / 4` blocks across each of three axes.
    // The two volumes of one asset are not the same size: the density runs 32, 48 or 64
    // texels a side and the colour 8, 16 or 32, so each side is read from its own file.
    const densitySide = sideOf(densityBlocks.length);
    const colourSide = sideOf(colourBlocks.length);
    const transfer = new Float32Array(
      transferBytes.buffer.slice(
        transferBytes.byteOffset + slot * TRANSFER_BYTES,
        transferBytes.byteOffset + (slot + 1) * TRANSFER_BYTES,
      ),
    );
    return {
      name: entry.name,
      densitySide,
      colourSide,
      density: decodeBC4(densityBlocks, densitySide),
      colour: decodeBC1(colourBlocks, colourSide),
      transfer,
    };
  });
}

// --- The march ------------------------------------------------------------------

/** The rotation the shader reads: `Rx * Ry * Rz`, with the world flip in its columns. */
export function rotationMatrix(rotation) {
  const [a, b, c] = rotation;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const sb = Math.sin(b);
  const cb = Math.cos(b);
  const sc = Math.sin(c);
  const cc = Math.cos(c);
  const rows = [
    [cb * cc, -cb * sc, sb],
    [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb],
    [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb],
  ];
  const out = new Float64Array(9);
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      out[column * 3 + row] = rows[row][column] * WORLD_FLIP[column];
    }
  }
  return out;
}

/** One trilinear sample of a volume, clamped at the edges, as `CLAMP_TO_EDGE` is. */
function sample(data, stride, side, u, v, w, out) {
  const clamp = (value) => Math.min(side - 1, Math.max(0, value));
  const x = u * side - 0.5;
  const y = v * side - 0.5;
  const z = w * side - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  for (let channel = 0; channel < stride; channel += 1) out[channel] = 0;
  for (let dz = 0; dz < 2; dz += 1) {
    const wz = dz === 0 ? 1 - fz : fz;
    if (wz === 0) continue;
    const cz = clamp(z0 + dz);
    for (let dy = 0; dy < 2; dy += 1) {
      const wy = dy === 0 ? 1 - fy : fy;
      if (wy === 0) continue;
      const cy = clamp(y0 + dy);
      for (let dx = 0; dx < 2; dx += 1) {
        const wx = dx === 0 ? 1 - fx : fx;
        if (wx === 0) continue;
        const cx = clamp(x0 + dx);
        const at = ((cz * side + cy) * side + cx) * stride;
        const weight = wx * wy * wz;
        for (let channel = 0; channel < stride; channel += 1) {
          out[channel] += data[at + channel] * weight;
        }
      }
    }
  }
}

const densityOut = new Float64Array(1);
const colourOut = new Float64Array(4);

/**
 * One ray through one record's box, in that record's object space. It gives the emission
 * and the transmittance the fragment shader writes, before the record's weight.
 */
export function marchRay(asset, matrix, eye, direction, stepRate, lightGain) {
  const inverse = [1 / direction[0], 1 / direction[1], 1 / direction[2]];
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    const first = (-1 - eye[axis]) * inverse[axis];
    const second = (1 - eye[axis]) * inverse[axis];
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  if (!(far > near)) return null;

  let count = Math.ceil((far - near) * stepRate);
  count = Math.min(MAX_STEPS, Math.max(1, count));
  const step = (far - near) / count;

  const transmittance = [1, 1, 1, 1];
  const emission = [0, 0, 0];
  const {
    densitySide,
    colourSide,
    density: densityData,
    colour: colourData,
    transfer,
  } = asset;
  for (let index = 0; index < count; index += 1) {
    const along = near + (index + 0.5) * step;
    const px = eye[0] + direction[0] * along;
    const py = eye[1] + direction[1] * along;
    const pz = eye[2] + direction[2] * along;
    const rx = matrix[0] * px + matrix[3] * py + matrix[6] * pz;
    const ry = matrix[1] * px + matrix[4] * py + matrix[7] * pz;
    const rz = matrix[2] * px + matrix[5] * py + matrix[8] * pz;
    const u = rx * 0.5 + 0.5;
    // The stored volume runs opposite to object-space y, as the shader's own comment says.
    const v = 1 - (ry * 0.5 + 0.5);
    const w = rz * 0.5 + 0.5;
    sample(densityData, 1, densitySide, u, v, w, densityOut);
    const value = densityOut[0] / 255;
    sample(colourData, 4, colourSide, u, v, w, colourOut);
    const entry =
      Math.min(TRANSFER_ENTRIES - 1, Math.max(0, Math.trunc(value * 255))) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const held = 1 - transfer[entry + channel] * value * step;
      transmittance[channel] *= Math.max(0, held);
    }
    for (let channel = 0; channel < 3; channel += 1) {
      emission[channel] +=
        (colourOut[channel] / 255) *
        lightGain[channel] *
        transmittance[channel] *
        value *
        step;
    }
    if (
      transmittance[0] < 0.01 &&
      transmittance[1] < 0.01 &&
      transmittance[2] < 0.01 &&
      transmittance[3] < 0.01
    ) {
      break;
    }
  }
  return { colour: emission, transmittance: transmittance[3] };
}

// --- The frame ------------------------------------------------------------------

/** The camera in game coordinates, as `src/camera/projection.ts` places it. */
export function cameraPosition(view) {
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const horizontal = Math.cos(pitch);
  const direction = [
    -horizontal * Math.sin(yaw),
    Math.sin(pitch),
    -horizontal * Math.cos(yaw),
  ];
  return [
    view.cursor[0] + direction[0] * view.distance,
    view.cursor[1] + direction[1] * view.distance,
    view.cursor[2] + direction[2] * view.distance,
  ];
}

function normalise(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * The camera basis in the renderer's world frame: forward, right and up. It repeats the
 * `lookAt` of `src/camera/projection.ts`, whose up vector is `(0, 1, 0)`.
 */
export function cameraBasis(view) {
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const horizontal = Math.cos(pitch);
  // The direction from the cursor to the camera, in game coordinates, then negated and
  // turned into the world frame, whose `z` runs the other way.
  const toCamera = [
    -horizontal * Math.sin(yaw),
    Math.sin(pitch),
    -horizontal * Math.cos(yaw),
  ];
  const forward = normalise([-toCamera[0], -toCamera[1], toCamera[2]]);
  const right = normalise(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { forward, right, up };
}

/** The tone map of `src/render/shaders/tonemap.frag`, without its dither. */
export function toneMap(scene, exposure) {
  const clamped = scene.map((value) => Math.max(value, 0));
  const luminance = clamped[0] * 0.2126 + clamped[1] * 0.7152 + clamped[2] * 0.0722;
  const exposed = luminance * exposure;
  const mapped = (WHITE_LEVEL * exposed) / (1 + exposed);
  const colour =
    luminance > 0 ? clamped.map((value) => value * (mapped / luminance)) : [0, 0, 0];
  return colour.map((value, channel) => {
    const display = Math.pow(Math.min(value, 1), 1 / 2.2);
    return BACKGROUND[channel] + (1 - BACKGROUND[channel]) * display;
  });
}

/**
 * Marches one frame and gives back the display bytes of the crop at its middle, three
 * bytes a pixel, on the half-resolution grid the map marches on.
 */
export function marchFixture(options) {
  const {
    set,
    assets,
    view,
    lightGain,
    stepRate = STEP_RATE,
    crop = FIXTURE_MAX_CROP,
  } = options;
  const canvas = options.canvas ?? FIXTURE_CANVAS;
  const half = { width: canvas.width >> 1, height: canvas.height >> 1 };
  const camera = cameraPosition(view);
  const { forward, right, up } = cameraBasis(view);
  const selection = selectRecords(set, {
    camera,
    distance: view.distance,
    focalPixels: focalPixels(canvas.height, FIELD_OF_VIEW_DEGREES),
    canvasHeightCss: canvas.height,
    canvasWidthCss: canvas.width,
  });

  const tanHalf = Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360);
  const aspect = canvas.width / canvas.height;
  const firstX = (half.width - crop) >> 1;
  const firstY = (half.height - crop) >> 1;

  // The accumulation target the nebulae draw into. The pass adds the emissions and
  // multiplies the transmittances, and the fixture composites over black, so the sum of
  // the emissions is the whole of the frame.
  const scene = new Float64Array(crop * crop * 3);

  for (const one of selection.instances) {
    const weight = selection.weight * one.fade;
    if (weight <= 0) continue;
    const asset = assets[set.assets[one.index]];
    if (asset === undefined) continue;
    const radius = set.radii[one.index];
    const matrix = rotationMatrix([
      set.rotations[one.index * 3],
      set.rotations[one.index * 3 + 1],
      set.rotations[one.index * 3 + 2],
    ]);
    // The centre in the world frame, relative to the camera, over the half-extent.
    const centre = [
      set.positions[one.index * 3] - camera[0],
      set.positions[one.index * 3 + 1] - camera[1],
      -(set.positions[one.index * 3 + 2] - camera[2]),
    ];
    const eye = [-centre[0] / radius, -centre[1] / radius, -centre[2] / radius];

    for (let row = 0; row < crop; row += 1) {
      const pixelY = (firstY + row + 0.5) * 2;
      const ndcY = 1 - (pixelY / canvas.height) * 2;
      for (let column = 0; column < crop; column += 1) {
        const pixelX = (firstX + column + 0.5) * 2;
        const ndcX = (pixelX / canvas.width) * 2 - 1;
        const direction = normalise([
          forward[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
          forward[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
          forward[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
        ]);
        const hit = marchRay(asset, matrix, eye, direction, stepRate, lightGain);
        if (hit === null) continue;
        const at = row * crop + column;
        for (let channel = 0; channel < 3; channel += 1) {
          scene[at * 3 + channel] += hit.colour[channel] * weight;
        }
      }
    }
  }

  const out = new Uint8Array(crop * crop * 3);
  for (let at = 0; at < crop * crop; at += 1) {
    const display = toneMap(
      [scene[at * 3], scene[at * 3 + 1], scene[at * 3 + 2]],
      EXPOSURE,
    );
    for (let channel = 0; channel < 3; channel += 1) {
      out[at * 3 + channel] = Math.round(
        Math.min(255, Math.max(0, display[channel] * 255)),
      );
    }
  }
  return { bytes: out, drawn: selection.instances.length };
}

/**
 * The view that puts one record at the middle of the frame, and the crop that covers it.
 *
 * The range aims at an apparent radius of 150 CSS pixels and stops at the map's own
 * closest zoom of 10 light years, which a small record reaches first. The crop is the
 * record's own disc in half-resolution pixels, at most `FIXTURE_MAX_CROP`.
 */
export function viewFor(set, assets, assetName) {
  const slot = assets.findIndex((asset) => asset.name === assetName);
  if (slot < 0) throw new Error(`The index holds no asset named ${assetName}.`);
  const record = [...set.assets].findIndex((value) => value === slot);
  if (record < 0) throw new Error(`No record names ${assetName}.`);
  const radius = set.radii[record];
  const focal = focalPixels(FIXTURE_CANVAS.height, FIELD_OF_VIEW_DEGREES);
  const distance = Math.max(MIN_DISTANCE, Math.round((focal * radius) / 150));
  // The apparent radius in CSS pixels, which is the disc's diameter in half-resolution
  // pixels. An odd crop would put the middle of the frame between two pixels.
  const pixels = (focal * radius) / distance;
  const crop = Math.min(FIXTURE_MAX_CROP, 2 * Math.round(pixels / 2));
  return {
    record,
    crop,
    view: {
      cursor: [
        set.positions[record * 3],
        set.positions[record * 3 + 1],
        set.positions[record * 3 + 2],
      ],
      distance,
      pitch: 0,
      yaw: 0,
    },
  };
}

/** The light gain the map draws with, from `src/render/nebula-slot.ts`. */
export const LIGHT_GAIN = [8.66, 8.44, 8.07];

function main() {
  const set = readRecords();
  const assets = readAssets();
  const outDirectory = join(root, 'e2e', 'fixtures');
  mkdirSync(outDirectory, { recursive: true });
  const meta = {
    canvas: FIXTURE_CANVAS,
    stepRate: STEP_RATE,
    lightGain: LIGHT_GAIN,
    records_sha256: createHash('sha256')
      .update(readFileSync(join(root, 'src', 'scene-data', 'nebulae.json')))
      .digest('hex'),
    views: {},
  };
  for (const entry of FIXTURE_VIEWS) {
    const { record, crop, view } = viewFor(set, assets, entry.asset);
    const started = Date.now();
    const { bytes, drawn } = marchFixture({
      set,
      assets,
      view,
      crop,
      lightGain: LIGHT_GAIN,
    });
    writeFileSync(join(outDirectory, `nebula-${entry.name}.bin`), bytes);
    meta.views[entry.name] = { asset: entry.asset, record, crop, view, drawn };
    console.log(
      `${entry.name}: record ${record}, crop ${crop}, ${drawn} records drawn, ` +
        `${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  writeFileSync(
    join(outDirectory, 'nebula-fixtures.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  console.log('wrote', outDirectory);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
