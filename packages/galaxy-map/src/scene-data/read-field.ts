// The three field readers the record sets and the start view share.
//
// A host gives plain objects, so every field is `unknown` until a reader has read it.
// Each of these lived as a copy in two or three files. One copy each keeps one rule for
// a point, a colour and a name, whatever record carries it.

/** Three finite numbers, or null. */
export function readPoint(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number' || !Number.isFinite(part)) return null;
    parts.push(part);
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Three finite numbers from 0 to 255, or null. */
export function readColor(value: unknown): [number, number, number] | null {
  const parts = readPoint(value);
  if (parts === null) return null;
  for (const part of parts) {
    if (part < 0 || part > 255) return null;
  }
  return parts;
}

/** A string of at least one character, or null. */
export function readName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}
