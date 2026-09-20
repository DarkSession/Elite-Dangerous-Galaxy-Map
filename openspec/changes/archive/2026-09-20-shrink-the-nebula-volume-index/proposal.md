## Why

`src/render/nebula-art/nebula-volumes.json` is 8,585 bytes, and every host that asks for
the nebulae downloads it. 5,960 of those bytes give the map nothing.

**4,244 bytes are `error.per_axis`.** No runtime code reads the field. Two unit tests do,
and both read the file from disk, not over the network. The `nebulae` spec already evicted
the digests on exactly this argument — "every host that asks for the nebulae downloads the
index, no code reads a digest at run time, and 67 of them cost 5,778 bytes on the wire for
a check that runs in a unit test" — and moved them to `tests/fixtures/nebulae.json`, which
ships in no build. The error is the same case at a similar size, and the spec mandates it
regardless.

**1,716 bytes are two wrappers.** Each entry holds `density: { size: N }` and
`colour: { size: N }`, where `size` is the only key either object holds. The spec's own
rule for this file is that it carries what the map reads and nothing else.

## What Changes

- Move the per-axis compaction error out of the volume index and into
  `tests/fixtures/nebulae.json`, beside the digests that left for the same reason. It
  becomes a map from asset name to the three axis figures.
- Flatten the two size wrappers: `density: { size: 32 }` becomes `density: 32`, and
  `colour` the same.
- Restate the index shape in the `nebulae` spec, with the same reasoning the spec applies
  to digests, and move the compaction-error scenario to read the fixture.
- Restate the set's on-disk total, which falls by the 5,960 bytes the index loses.
- Restate the bundling rule in bytes rather than in files. At 2,625 bytes the index drops
  under the 4,096-byte inline threshold a bundler applies by default, so a host that
  re-bundles the package carries it as a `data:` URI in a chunk rather than as a file. 28
  colour volumes, at 464 and 2,256 bytes, already sit under that threshold and already
  inline, which no guard caught. The rule becomes: an asset above the threshold stays a
  file, and the 29 assets under it, 37,121 bytes in all, may ride in a chunk.

The index goes from 8,585 bytes to 2,625, a cut of 69 percent.

### What this change does not do

- It does not drop, add or repack an asset. All 33 assets stay, and every `.ktx2` block
  payload and the transfer file are byte-for-byte what they are now.
- It does not change the record file, the selection rules, the march or any fade.
- It does not weaken the compaction-error check. The same assertion runs over the same 99
  figures, from the fixture instead of the index.
- It does not change how the renderer gets a volume's side. The side still comes from the
  index and never from a constant, so a repacked set stays a drop-in.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nebulae`: the index shape, where the per-axis compaction error lives, and the set's
  on-disk byte total.

## Impact

**Data files.** `src/render/nebula-art/nebula-volumes.json` (8,585 to 2,625 bytes) and
`tests/fixtures/nebulae.json` (a new error map, and a recomputed `volume_index_sha256`).

**Runtime code.** `src/render/nebula-volumes.ts`: `NebulaVolumeEntry` loses `error` and
flattens the two sides, and the four reads in `loadNebulaVolumes` follow.

**Scripts.** `scripts/dds-to-ktx2.mjs` reads `entry[volume.kind].size`.
`scripts/build-nebula-fixture.mjs` reads the index but takes only `entry.name`, and each
side from the block length, so it needs no change.

**Tests.** `src/scene-data/nebulae.test.ts` (the `VolumeEntry` type, the key-shape test
and the compaction-error test), `src/render/nebula-march.test.ts`,
`src/render/nebula-volumes.test.ts` and `tests/nebula-ktx2.test.ts` all parse the index
and read `.density.size` or `.colour.size`. `tests/main-bundle.test.ts` looks for the
index in a host build by file name, which the inline threshold above takes away, so its
needle must take the `data:` URI as well. Its guard against an inlined volume reads
`data:application/octet-stream`, which a `.ktx2` file never takes, so the guard must read
`data:image/ktx` to fire at all.

**Documentation.** Four places state the art total of 2,918,185 bytes, which becomes
2,912,225: `AGENTS.md`, `README.md`, the `nebulae` spec and
`src/render/nebula-volumes.test.ts`, which holds it twice: as
`expect(disk).toBe(2_918_185)` on line 545 and as `toContain('2,918,185')` on line 551,
where it asserts the string in both documents. `README.md` also breaks the total down and
states the index as **8,585 bytes**, which becomes 2,625; no test looks for that figure,
so it must be changed by hand. `THIRD_PARTY_NOTICES.md` names the index but states no
shape or size, so it needs no change.

**Measured effect.**

| reading                          | now         | after       |
| -------------------------------- | ----------- | ----------- |
| volume index                      | 8,585 B     | 2,625 B     |
| on disk, as served                | 2,918,185 B | 2,912,225 B |
| over the wire, brotli             | 1.11 MiB    | 1.11 MiB    |
| in video memory                   | unchanged   | unchanged   |

**Scale.** The index is one fetch of one file at map start, parsed once into 33 entries.
The change takes 5,960 bytes off that fetch and nothing off any other. It touches no
per-frame path: no selection, no march and no upload reads the field that leaves. The
on-the-wire figure does not move at two decimal places, because brotli already carries the
repeated JSON keys cheaply; the gain is on the uncompressed fetch and on a serving path
that does not compress.

**Risk.** Low. The field that leaves is read by two unit tests on disk, and both keep
running against the fixture. The shape change is mechanical and the type system catches
every read site. The one thing to get right is `volume_index_sha256`: it must be
recomputed from the new file, or the digest test fails and hides whether the content is
correct.
