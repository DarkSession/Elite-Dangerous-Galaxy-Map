// The smallest ranges of a sweep, kept in ascending order.
//
// Two passes keep a nearest list every frame: the marker overlay keeps the 66 markers
// nearest the camera, and the icon pass keeps the 32 nearest stacks. The candidate list
// can hold 50,000 entries either way, so a sort of the whole list is what this replaces:
// a candidate no nearer than the worst kept one is refused in one comparison, and one
// that is nearer moves at most as many entries as the keeper holds.
//
// The module sits in `src/scene-data/` because both readers need it and one of them is
// the renderer, which must not import the overlay.

/** A keeper of the nearest candidates of a sweep. */
export interface NearestKeep {
  /** The kept indices, nearest the camera first. */
  readonly indices: Int32Array;
  /** The range of each kept index, ascending. */
  readonly ranges: Float64Array;
  /** How many the keeper holds at most. */
  readonly limit: number;
  /** How many it holds now. */
  count: number;
}

/** Makes a keeper of a size. */
export function createNearestKeep(limit: number): NearestKeep {
  return {
    indices: new Int32Array(limit),
    ranges: new Float64Array(limit),
    limit,
    count: 0,
  };
}

/** Empties a keeper. It keeps its arrays, so a frame allocates nothing. */
export function resetNearest(keep: NearestKeep): void {
  keep.count = 0;
}

/** Offers one candidate to a keeper. */
export function offerNearest(keep: NearestKeep, index: number, range: number): void {
  const { indices, ranges, limit } = keep;
  if (keep.count === limit && range >= (ranges[limit - 1] as number)) return;
  let at = Math.min(keep.count, limit - 1);
  while (at > 0 && (ranges[at - 1] as number) > range) {
    indices[at] = indices[at - 1] as number;
    ranges[at] = ranges[at - 1] as number;
    at -= 1;
  }
  indices[at] = index;
  ranges[at] = range;
  if (keep.count < limit) keep.count += 1;
}
