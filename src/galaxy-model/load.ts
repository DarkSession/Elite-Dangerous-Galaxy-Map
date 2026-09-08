import type { GalaxyModelDocument } from './types';

/** The only format this port reads. */
export const MODEL_FORMAT = 'galaxy-density-model-v1';

/** The number of spiral arms the model defines. */
export const ARM_COUNT = 4;

/** The range a quantised correction value must lie in. */
export const CORRECTION_LIMIT = 127;

/** The error every validation failure in this module throws. */
export class GalaxyModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GalaxyModelError';
  }
}

/**
 * Reads a parsed parameter document and checks the parts the port depends on.
 * Throws `GalaxyModelError` when the document does not match.
 */
export function loadGalaxyModel(source: unknown): GalaxyModelDocument {
  if (typeof source !== 'object' || source === null) {
    throw new GalaxyModelError('The galaxy model document is not an object.');
  }
  const document = source as GalaxyModelDocument;

  if (document.format !== MODEL_FORMAT) {
    throw new GalaxyModelError(
      `The galaxy model format is "${String(document.format)}". ` +
        `This port reads "${MODEL_FORMAT}".`,
    );
  }

  const arms = document.surface?.arms?.list;
  if (!Array.isArray(arms) || arms.length !== ARM_COUNT) {
    throw new GalaxyModelError(
      `The galaxy model needs ${ARM_COUNT} arms. It has ${
        Array.isArray(arms) ? arms.length : 0
      }.`,
    );
  }

  const correction = document.correction;
  if (typeof correction !== 'object' || correction === null) {
    throw new GalaxyModelError('The galaxy model has no correction grid.');
  }

  const expected = correction.size * correction.size;
  if (!Array.isArray(correction.values) || correction.values.length !== expected) {
    throw new GalaxyModelError(
      `The correction grid declares size ${correction.size}, so it needs ${expected} ` +
        `values. It has ${Array.isArray(correction.values) ? correction.values.length : 0}.`,
    );
  }

  for (let index = 0; index < correction.values.length; index += 1) {
    const value = correction.values[index];
    if (
      !Number.isFinite(value) ||
      value < -CORRECTION_LIMIT ||
      value > CORRECTION_LIMIT
    ) {
      throw new GalaxyModelError(
        `The correction value at index ${index} is ${String(value)}. ` +
          `Values run from ${-CORRECTION_LIMIT} to ${CORRECTION_LIMIT}.`,
      );
    }
  }

  return document;
}
