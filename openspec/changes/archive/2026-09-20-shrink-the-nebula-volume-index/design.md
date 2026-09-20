## Context

See [proposal.md](proposal.md) — Why. The index is a committed data file that the map
fetches at start, and four test files plus one script parse it. The change is small in
code and needs care in one place: `tests/fixtures/nebulae.json` records a digest of the
index, and that file is hand-maintained rather than generated.

## Goals / Non-Goals

**Goals**

- The index carries only what `loadNebulaVolumes` reads.
- The compaction-error check keeps running over the same 99 figures.
- The renderer still takes every side from the index, so a repacked set stays a drop-in.

**Non-Goals**

- No change to any block payload, the transfer file or the record file.
- No new script. The fixture stays hand-maintained, as it is now.

## Decisions

### The error map keys by asset name, and keeps the `{ x, y, z }` shape

`tests/fixtures/nebulae.json` gains one top-level key:

```json
"volume_error_per_axis": {
  "barnards-loop": { "x": 0.01854, "y": 0.02632, "z": 0.02222 }
}
```

The name key matches `volume_files_sha256` and `volume_blocks_sha256`, which are already
name-keyed maps in the same file. Keying by name rather than by position also means the
fixture does not silently follow a reordered index: the test can assert that the fixture
names exactly the assets the index holds.

The `{ x, y, z }` value is kept rather than flattened to `[x, y, z]`. An array is shorter,
but this file ships in no build, so its bytes buy nothing, and the axis names are what make
a hand-edited fixture readable. The test also keeps iterating `['x', 'y', 'z']` as it does
now.

**Alternative rejected**: keeping the error in the index and shrinking it some other way.
There is no other way — the field is the bytes.

### The sides stay in the index, and are not read from the KTX2 headers

Each `.ktx2` header already states `pixelWidth`, `pixelHeight` and `layerCount`, so the
loader could take every side from the file and the index could shrink to a name list. That
is rejected. `volumeBlocksOf` exists to check each file's own header **against** the index,
and a loader that took the side from the file it is checking would check the file against
itself. The spec states the index as the one source of truth for a side, and
"a repacked set is a drop-in" rests on it.

### The order of edits is fixed by the digest

`volume_index_sha256` is a digest of the index. The steps therefore run in this order, and
the fixture is written last:

1. Rewrite `nebula-volumes.json` (drop `error`, flatten the two sides).
2. Compute its SHA-256.
3. Write `volume_error_per_axis` and the new `volume_index_sha256` into the fixture.

Doing 3 before 1 leaves a digest of a file that no longer exists, and the failure reads as
"the assets drifted", which points at the art rather than at the fixture.

### The error values move, they are not recomputed

The packing step that produced the per-axis errors is not in this repository. The values
are copied from the index as they stand. A test asserts the fixture holds one entry per
index asset, so a copy that drops an asset fails rather than passing quietly.

## Risks / Trade-offs

- **A read site is missed** → `NebulaVolumeEntry` is a typed interface and every reader in
  `src/` parses the index through it or through a local structural type. Flattening
  `density` from an object to a number is a type error at every site that still writes
  `.size`, so `tsc` finds them. The two `.mjs` scripts are not typed: `dds-to-ktx2.mjs`
  reads `entry[volume.kind].size` and must be changed by hand, and
  `build-nebula-fixture.mjs` reads only `entry.name`, which does not move.
- **The digest is stale** → the order above, plus the existing `The assets do not drift`
  test, which fails on a mismatch.
- **The error check weakens without anyone noticing** → the fixture test asserts one entry
  per index asset, so a fixture that loses an asset fails rather than checking 32 of 33.
- **A host pinned to an older package** → no risk. The index ships with the build that
  reads it, and no client stores a parsed copy.

## Migration Plan

None at run time. The index is a fetched asset of the build that reads it, so a deploy
replaces both together. Rollback is a revert of the commit; no data is written anywhere
that survives it.

`scripts/dds-to-ktx2.mjs` is the recovery path if the art is ever repacked from `.dds`
files. It reads the flattened side, so it stays in step with the new index shape.
