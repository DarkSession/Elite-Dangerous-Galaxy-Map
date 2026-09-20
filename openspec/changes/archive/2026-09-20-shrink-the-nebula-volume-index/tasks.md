# Tasks

The order matters in one place: the index is rewritten before its digest is taken, and the
fixture is written last. See [design.md](design.md) — The order of edits is fixed by the
digest.

## 1. Move the compaction error to the fixture

- [x] 1.1 Add `volume_error_per_axis` to `tests/fixtures/nebulae.json`: a map from asset
      name to `{ "x": n, "y": n, "z": n }`, copied from the 33 `error.per_axis` entries of
      `src/render/nebula-art/nebula-volumes.json` as they stand. Verify with
      `node -e` that the new map holds 33 keys and that each of its 99 numbers equals the
      index's figure for the same asset and axis.
- [x] 1.2 Point the compaction-error test at the fixture: in
      `src/scene-data/nebulae.test.ts`, change `the compaction error holds on every axis`
      to read `fixture.volume_error_per_axis` instead of `volumeIndex.assets`, and add an
      assertion that the fixture names exactly the assets the index holds. Add
      `volume_error_per_axis` to the `NebulaFixture` interface in the same file, which
      today also omits `volume_blocks_sha256`. Verify with
      `pnpm exec vitest run src/scene-data/nebulae.test.ts` — the test passes and still
      checks 99 figures.

## 2. Rewrite the index

- [x] 2.1 Rewrite `src/render/nebula-art/nebula-volumes.json`: drop every `error` key, and
      replace `"density": { "size": N }` with `"density": N` and the same for `colour`.
      Keep the asset order, the names and the side values exactly as they are, and keep the
      file 2-space pretty-printed with a trailing newline. Verify the file is 2,625 bytes,
      holds 33 assets, and that the 66 side values match the old file asset for asset.
- [x] 2.2 Update `NebulaVolumeEntry` in `src/render/nebula-volumes.ts`: remove `error`, and
      declare `density` and `colour` as `number`. Update the four reads in
      `loadNebulaVolumes` (lines 411, 412, 415 and 421) to drop `.size`. Verify with
      `pnpm exec tsc --noEmit` — it reports no error.
- [x] 2.3 Update the remaining `.size` read sites, which `tsc` lists:
      `src/render/nebula-march.test.ts:37`, `src/render/nebula-volumes.test.ts:524` and
      `:561`, and `tests/nebula-ktx2.test.ts:152`. Verify with `pnpm exec tsc --noEmit` and
      `pnpm exec vitest run src/render tests/nebula-ktx2.test.ts`.
- [x] 2.4 Update `scripts/dds-to-ktx2.mjs:73` from `entry[volume.kind].size` to
      `entry[volume.kind]`. The file is not typed, so `tsc` does not find it. Verify by
      reading the line and by `pnpm exec vitest run tests/nebula-ktx2.test.ts`, which drives
      the writer this script uses.
- [x] 2.5 Update the index-shape test in `src/scene-data/nebulae.test.ts` (`the index
      carries no field the map does not read`): each entry holds exactly `colour`,
      `density` and `name`, each side is a number, and no entry names an error. Update the
      local `VolumeEntry` interface in the same file. Verify with
      `pnpm exec vitest run src/scene-data/nebulae.test.ts`.

- [x] 2.6 Take the index under the inline threshold, which the plan did not foresee. At
      2,625 bytes a host build inlines the index as a `data:` URI, so
      `tests/main-bundle.test.ts` no longer finds it by file name. Make the
      `the volume index` needle take either form, with the base64 read from the file so a
      repack cannot make it stale. Restate the bundling rule in the spec delta. Task 2.7
      holds the wording, because the first attempt at it was wrong.
      Verify with `pnpm exec vitest run tests/main-bundle.test.ts`.
- [x] 2.7 Correct 2.6, which the implementation gate blocked on. 28 colour volumes, 16 at
      464 bytes and 12 at 2,256, are already under the threshold and already inline, so
      the rule cannot name the index as the one exception. State it in bytes: 39 files of
      the set are above the threshold and 29 are under, and those 29 are 37,121 bytes.
      Make the inlined-volume guard read `data:image/ktx`, which is the mime a `.ktx2`
      file takes; `data:application/octet-stream` alone never fires on a volume. Verify
      the file split with `node -e` over `src/render/nebula-art/` and the guard with
      `pnpm exec vitest run tests/main-bundle.test.ts`.

## 3. Close the digest

- [x] 3.1 Recompute the index digest and write it to `volume_index_sha256` in
      `tests/fixtures/nebulae.json`. Verify with
      `pnpm exec vitest run src/scene-data/nebulae.test.ts` — `The assets do not drift`
      passes.
- [x] 3.2 Update the on-disk total in all three places outside the spec: `2,918,185`
      becomes `2,912,225` in `AGENTS.md`, in `README.md`, and twice in
      `src/render/nebula-volumes.test.ts`: the `2_918_185` constant on line 545 and the
      `'2,918,185'` string on line 551. In `README.md` also change the breakdown
      that states the index as `8,585` bytes to `2,625`; no test looks for that figure.
      Verify with `grep -rn '2,918,185\|2_918_185\|8,585' AGENTS.md README.md src/` — it
      returns nothing. The `nebulae` spec keeps the old figure until archive, so the grep
      does not cover `openspec/`.
- [x] 3.3 Run `pnpm exec vitest run src/render/nebula-volumes.test.ts`. The test
      `matches the disk total the documentation states` passes: it sums the 68 files, holds
      the new constant and finds the new string in both `AGENTS.md` and `README.md`.

## 4. Check the whole tree

- [x] 4.1 Run `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm exec vitest run`. All pass.
- [x] 4.2 Run `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/nebulae.spec.ts`.
      Verify the nebulae still load and draw, and that the asset-request scenario still
      counts 33 density and 33 colour requests.
- [x] 4.3 Run the timed spec on its own project and one worker:
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/nebula-cost.spec.ts --project=chromium-timed --workers=1`.
      `nebula-cost.spec.ts` is in `timedSpecs` in `playwright.config.ts`, and a timing
      reading taken beside other specs is not the reading the budget states. Only one
      Playwright run may be in flight at a time, so 4.2 must finish first.
- [x] 4.4 Confirm the built demo still serves the index: build, then verify
      `dist-demo/assets/nebula-volumes-*.json` is 2,625 bytes and holds no `error` key.

## 5. Sync the spec

- [x] 5.1 Confirm `openspec validate shrink-the-nebula-volume-index` passes and that the
      delta in `specs/nebulae/spec.md` still matches the shipped index: 33 assets, plain
      number sides, no error key.

## 6. Gates

- [x] 6.1 Run the `openspec-proposal-reviewer` subagent on this change before any human
      sees the artifacts. Fix what it blocks on and re-run it. **Done at propose time:
      APPROVE WITH NOTES.** Four findings, all acted on: the stale-figure sweep now names
      `README.md` and the test constant (tasks 3.2 and 3.3), the timed spec runs on its own
      project (task 4.3), the grep is scoped away from `openspec/` (task 3.2), and the
      `NebulaFixture` type edit is named (task 1.2).
- [x] 6.2 Before the implementation gate, run the tests in task 4 yourself. Then run the
      `openspec-implementation-reviewer` subagent, fix what it blocks on, and state its
      verdict and findings when presenting.
