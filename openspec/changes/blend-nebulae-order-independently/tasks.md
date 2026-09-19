# Tasks

Read [design.md](design.md) before starting. Its Migration Plan is the order below: group
1 adds the target and the composite and changes no frame, group 2 takes the readings the
decision rests on, group 3 is the swap, and group 4 goes one way or the other on what
group 4 reads.

**Commit each group on its own**, with every `git add` naming its paths and never a bare
`-A`. Task 4.5 can abort the change, and a per-group commit is what makes that abort a
revert rather than a rewrite.

`replace-nebula-sprites-with-volumes` is archived, so `openspec/specs/nebulae/spec.md`
already carries the three requirements this delta touches. Nothing gates the start.

**A note on `store-nebula-volumes-as-slice-arrays`.** That change also edits
`src/render/nebula-pass.ts`, at the texture binds and the unbind sweep. This change edits
the blend state, the draw loop and the target the pass draws into. The two do not overlap
line for line, but whichever lands second rebases onto the other. Nothing here depends on
it.

**Every millisecond reading below is taken on the hardware renderer.** `e2e/00-renderer.spec.ts`
gates the suite on it, and a cost reading on a software renderer says nothing.

## 1. The target and the composite

- [x] 1.1 Add the accumulation target to `src/render/nebula-pass.ts`. Build it with
      `createRenderTarget` from `src/render/buffers.ts`, at the size the draw already
      receives in `targetSize`. Add one member to `NebulaFrame` in
      `src/render/nebula-slot.ts` for the number format, and pass through what
      `src/render/renderer.ts` built `halfTarget` with, so the two targets match. Resize the
      target where the size changes and free it on `dispose` with the rest. Verify a unit
      test over the fake context makes it once, resizes it when the size changes, and
      deletes it on `dispose`, and that `pnpm exec tsc --noEmit` passes over the published
      types.
- [x] 1.2 Add the composite shader pair to `src/render/shaders/`: a full-screen triangle
      vertex shader, and a fragment shader that reads the accumulation target and writes
      `vec4(accumulated.rgb, 1.0 - accumulated.a)`. **Neither changes again in this change.**
      Add both to the browser test `the nebula shaders compile` in `e2e/nebulae.spec.ts`,
      which names the shaders it compiles one by one and does not enumerate the pass's set,
      so it needs the edit and not only a re-run. Verify a unit test reads the fragment
      source for that expression and that the browser test compiles both.
- [x] 1.3 Change the draw in `src/render/nebula-pass.ts`: read `FRAMEBUFFER_BINDING` and
      keep it, bind the accumulation target, clear it to `(0, 0, 0, 1)`, draw the records,
      bind the saved framebuffer back, then draw the composite with the
      `ONE, ONE_MINUS_SRC_ALPHA` blend the pass already uses, which gives
      `scene = accumulated.rgb + accumulated.a * scene`.

      **The record blend in this group is
      `blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ZERO, ONE_MINUS_SRC_ALPHA)`**, not
      `blendFunc`. The colour factors are the source-over the pass uses today, and the alpha
      factors make the alpha channel hold the product of one minus the alphas, which the
      composite turns back into the attenuation source-over would have applied. Plain
      `blendFunc` sets all four channels, so from a clear of 1 the alpha channel would read
      `src.a + (1 - src.a) * 1 = 1` after every record, the composite would write 0, and a
      dark nebula would stop dimming the scene. The range sort stays in this group.

      Verify the whole unit suite and the whole browser suite pass with **no reading moved**,
      which is the check that this group is inert, and read the two CPU fixture comparisons
      in particular: they draw 105 and 109 records and would show any change first.
- [x] 1.4 Verify the spec's scenario **The composite runs once whatever the count** with a
      unit test over the fake context, in **three** cases: a frame selecting 1 record and a
      frame selecting 100 each clear once and composite once, and **a frame selecting 0
      records does neither**. The zero case is the one that matters, because the base spec
      already requires the pass to issue no draw call at a zoom weight of 0 and the composite
      is a draw call like the others. The default view is at 60,000 light years, where the
      weight is 0, so a composite that ran anyway would cost the commonest frame the map
      draws. The browser test `the pass issues no draw call outside the band` reads
      `nebulaDrawCalls()`, which counts record draws alone, so it does not cover this.
- [x] 1.5 Verify the nebula switch skips the target, the clear and the composite together,
      which the spec requires, and that the browser test `the switch removes the nebulae`
      still matches its own capture to ten places.
- [x] 1.6 Verify `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run` and
      `pnpm test:e2e` all pass.

## 2. The readings the decision rests on

- [x] 2.1 Add the browser test for the spec's scenario **The frame does not step when two
      records change rank** to `e2e/nebulae.spec.ts`. It orbits the Orion viewpoint
      `[-60, -80, -1100]` at 3,000 light years with every pass but the nebulae off and the
      occlusion at 0, reads 720 pairs of frames 0.004 degrees apart, and asserts no pair
      differs at any pixel by more than 8, summed over the three channels on a 0 to 255
      scale. It runs in the parallel pass: it reads pixels and not time, so it does not
      belong in the timed pass. Verify it **fails** on the tree of group 1, which is what
      says it measures the artefact.
- [x] 2.1a Record the failing reading beside this task. **The probe read a worst pair of
      71**, with 167 of the 720 pairs above 8, and a no-flip floor of 3 to 7. If the worst
      pair differs by more than a fifth, restate it in the proposal's table and in the
      spec's scenario, which both quote it as the before figure.

      **The reading.** The sweep reads a worst pair of **71**, at a yaw of 54.5 degrees,
      with **167 of its 720 windows** above 8. The camera draws 87 records. The figures
      are the probe's own, so neither the proposal's table nor the spec's scenario moves.
      The test prints the floor with them: the windows below 8 read 3 to 7.
- [x] 2.2 Record the pass cost before the change, in the timed pass. Name the reading with
      the test it comes from, because `e2e/nebula-cost.spec.ts` uses three instruments and
      not one: `a near view holds the budget` reads the **whole frame** at Barnard's Loop at
      20 light years against 16.7 ms; `the box costs the same from inside as from outside`
      reads the **pass alone** at 260 and at 120 light years and bounds the **share** between
      them at 0.2; `the vertex march is a small share of the pass` bounds another share at
      0.25. The four numbers to write down are named: the **mean frame
      milliseconds at 20 light years**, the **pass-alone milliseconds at 260** and **at
      120**, and the **share** the second test computes from the last two. The third test
      pools 540-frame sums under alternating occlusion and reports a share and not a pass
      cost, so record its share alone. The two share bounds barely move under a uniform extra
      draw, so the millisecond figures are what task 4.4 compares, and the shares are a check
      that nothing became lopsided.

      **The readings**, on the tree of group 1, in the timed pass, on the hardware
      renderer:

      | reading | test | figure | bound |
      | --- | --- | --- | --- |
      | mean frame ms at 20 light years | `a near view holds the budget` | **2.883** | 16.7 |
      | pass alone ms at 260 light years | `the box costs the same from inside as from outside` | **0.4375** | — |
      | pass alone ms at 120 light years | the same test | **0.4400** | — |
      | the share of the two | the same test | **0.0057** | 0.2 |
      | pooled vertex share, many small | `the vertex march is a small share of the pass` | **0.0800** | 0.25 |
      | pooled vertex share, one large | the same test | **0.0167** | 0.25 |

      The near view draws 120 records at 1.558 covered areas and drops none.
- [x] 2.3 Record the light these readings of `e2e/nebulae.spec.ts` measure on the tree of
      group 1. The list is named and not left as "every test", because task 4.3 reads the
      same list back: `a bright nebula adds light and a dark one takes it away`,
      `the glow reads the nebulae`, `a close zoom still draws the nebulae`,
      `the camera inside a nebula is surrounded by it`, `a nebula grows as the camera closes
      on it`, `a nebula with little in front of it barely changes`, `occluded light turns
      warm`, `a dark nebula behind the core stops cutting a hole`, `a nebula behind the core
      dims`, `doubling the step rate moves nothing visible`, the two `the march of <name>
      reproduces the reference integral` RMSE figures, and the no-compressed-extension
      scenario. That last one refuses the three compressed-texture extensions, so it changes
      the format of the **art** and not of the render target: it is not the non-floating
      target path, which no committed test reaches, because `e2e/00-renderer.spec.ts` asserts
      `EXT_color_buffer_float` on every run.

      **The readings**, on the tree of group 1:

      | reading | figure |
      | --- | --- |
      | `a bright nebula adds light and a dark one takes it away` | bright 0.19982 on against 0.14246 off; dark 0.37550 on against 0.60246 off |
      | `the glow reads the nebulae` | 0.047523 with the glow against 0.037575 without |
      | `a close zoom still draws the nebulae` | 0.20295 on against 0.13300 off, 105 records |
      | `the camera inside a nebula is surrounded by it` | nine blocks from 0.18135 to 0.20852, against 0.03725 off |
      | `a nebula grows as the camera closes on it` | 0.18763 at three radii, 0.19321 at two, 0.19542 at 1.2 |
      | `a nebula with little in front of it barely changes` | 0.21571 at occlusion 1 against 0.21591 at 0, a change of 0.00092 |
      | `occluded light turns warm` | blue to red 0.81658 at 1 against 0.83377 at 0 |
      | `a dark nebula behind the core stops cutting a hole` | 0.88115 at 1 against 0.85216 at 0 |
      | `a nebula behind the core dims` | the block reads 0.88944 off, and the nebula adds -0.00091 at occlusion 1 against -0.01471 at 0 |
      | `doubling the step rate moves nothing visible` | 0.067217 at 32 steps against 0.068471 at 64, a share of 0.01865 |
      | `the march of barnards-loop reproduces the reference integral` | RMSE **0.0083255** against a bound of 0.02 |
      | `the march of cats-eye reproduces the reference integral` | RMSE **0.0058001** against a bound of 0.01 |
      | the no-compressed-extension scenario | 71 records drawn, block light 0.22113 |
- [x] 2.4 Capture the before-frames task 4.2 measures the overlap error against: the whole
      canvas at Barnard's Loop at 120 light years, and at the Orion viewpoint at 800 and at
      3,000, with every pass but the nebulae off and the occlusion at 0. Record the mean
      frame luminance of each, and keep the three frames as files under the scratch directory
      so task 4.2 can difference them pixel by pixel. Record beside this task what each
      camera draws: the probe read 124 records at 1.84 covered areas at the first.

      **The readings**, on the tree of group 1, with every pass but the nebulae off and
      the occlusion at 0, at 1,280 by 720:

      | camera | mean frame luminance | records drawn | covered area |
      | --- | --- | --- | --- |
      | Barnard's Loop at 120 | **0.1824152** | 120 | 1.184 |
      | Orion at 800 | **0.0431420** | 110 | 0.060 |
      | Orion at 3,000 | **0.0382361** | 87 | 0.011 |

      The three frames sit in the scratch directory as `before-barnards-loop-120.bin`,
      `before-orion-800.bin` and `before-orion-3000.bin`, 1,280 by 720 of four bytes a
      pixel. The first camera reads 120 records at 1.184 covered areas, where the probe
      read 124 at 1.84. The probe gave no pitch or yaw for the camera and this one reads
      both at 0, which is the likely difference. The records still overlap there.
- [x] 2.4a Add the browser test for the spec's scenario **The overlap stays inside the
      light it was measured at** to `e2e/nebulae.spec.ts`, beside the readings it sits with.
      It reads the mean frame luminance at the three cameras of task 2.4, under the same
      conditions: every pass but the nebulae off, the occlusion at 0, 1,280 by 720. It runs
      in the **parallel** pass, as task 2.1's test does, because it reads pixels and not
      time. Write the three before-figures of task 2.4 in as the bounds for now, so the test
      passes on this tree and states what it measures; task 4.2 replaces them with the
      figures it reads, rounded up to the next thousandth. Verify it passes here.
- [x] 2.5 Verify `pnpm test:e2e` passes apart from the new test of task 2.1, which is
      expected to fail until group 3.

## 3. The swap

- [x] 3.1 Change the record blend in `src/render/nebula-pass.ts` from
      `blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ZERO, ONE_MINUS_SRC_ALPHA)` to
      `blendFuncSeparate(ONE, ONE, ZERO, SRC_ALPHA)`. The clear and the composite shader do
      not change. Verify a unit test over the fake context reads both blend states — the
      record blend and the composite blend — and the order they are set in.
- [x] 3.2 Change the last statement of `src/render/shaders/nebulae.frag` to write the
      transmittance in the alpha channel: `1.0 - (1.0 - transmittance.a) * mean * vWeight` in
      place of `(1.0 - transmittance.a) * mean * vWeight`. The three colour channels do not
      change. The source check in `src/render/nebula-pass.test.ts` reads
      `expect(alpha).toContain('(1.0 - transmittance.a) * mean * vWeight')`, which the new
      text still contains, so it would pass while checking nothing: **change it to an exact
      match on the new expression.** Verify the unit test that holds the output alpha from 0
      to 1 on every asset at 25, 32 and 64 steps still passes, reading the transmittance
      instead — the same bound the other way, and the spec's modified march requirement now
      says why it matters.
- [x] 3.3 Remove the range sort from `src/scene-data/nebulae.ts`: the line
      `kept.sort((a, b) => b.range - a.range)` goes, with the three comments that say the
      order is furthest first because the blend depends on it — the field comment on
      `instances`, the function comment on `selectNebulae`, and the comment above the
      largest-first sort. Remove the same sort from `scripts/build-nebula-fixture.mjs`, whose
      `selectRecords` repeats `selectNebulae` and holds its own copy. Both must go together,
      or the order-parity assertion of `tests/nebula-fixture.test.ts` fails over 105 records.
      Verify that assertion still passes, and that the unit test `gives the selected records
      furthest first` in `src/scene-data/nebulae.test.ts` is replaced by the spec's scenario
      **The selection does not order by range**.
- [x] 3.4 Change the composite in `scripts/build-nebula-fixture.mjs` to match the pass. The
      one edit it needs is dropping the `held` factor from the scene accumulation, so it
      reads `hit.colour[channel] * weight`. `alphaLeft` already accumulates the product of
      the record transmittances, because `1 - hit.alpha * weight` is one of them, and the
      fixture composites over black and never reads it out, so **remove it** once `held` is
      gone or the lint reports it unused. Rebuild both `.bin` fixtures in
      the same commit as tasks 3.1 and 3.2. Verify the two RMSE readings against the rebuilt
      reference, and **record the old and the new figure for each beside this task**: the
      committed ones are 0.0083 for `barnards-loop` against a bound of 0.02 and 0.0058 for
      `cats-eye` against 0.01. A reading that rose towards its bound is a finding for task
      4.2, not a bound to move.

      **The readings.** The two RMSE figures **fell** against the rebuilt reference:
      `barnards-loop` reads **0.0018745** where it read 0.0083255, against a bound of
      0.02, and `cats-eye` reads **0.0036028** where it read 0.0058001, against a bound
      of 0.01. Both draw the same record counts as before, 105 and 109. Neither rose, so
      neither is a finding for task 4.2. The GPU and the CPU now state the same composite
      as well as the same integral, and the source-over the reference applied by hand was
      the larger part of the difference the two readings held.
- [x] 3.5 Replace the unit test `draws from the furthest to the nearest` in
      `src/render/nebula-pass.test.ts`. It asserts `uPosition` arrives as
      `[[0,0,-600],[0,0,-400],[0,0,-200]]` over three records of equal radius, which the
      largest-first sort now reverses. Its two comments, at the test and at the draw-call
      test above it, state the same contract. Verify the replacement reads what the spec now
      states: the order does not follow the range.
- [x] 3.6 Rewrite the comments in `src/render/nebula-pass.ts` and `src/render/renderer.ts`
      that state the old contract: the file header, the comment above the blend call, the
      comment above the draw loop, the function comment on `createNebulaPass`, and the
      renderer's comment above the nebula block, which says the blend is source-over so a
      dark nebula attenuates what the two passes before it drew. That sentence is false after
      this group: a dark nebula attenuates the scene at the composite and not during the
      loop. Verify by reading each one; no test covers a comment.
- [ ] 3.7 Verify the test of task 2.1 now passes, and that `pnpm lint`,
      `pnpm exec tsc --noEmit` and `pnpm exec vitest run` all pass.

## 4. The decision


      **The reading. The sweep does not reach the bound of 8, and the cause is not the
      draw order.** It reads a worst pair of **26**, down from 71, with **163 of its 720
      windows** above 8, down from 167. Task 4.1 holds the reading and the three probes
      that explain it.

      `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm exec vitest run` all pass: 81 files
      and 1,148 unit tests.
- [ ] 4.1 Re-run the sweep of task 2.1 on the finished tree and record the worst pair beside
      this task, for the record. Task 3.7 already ran it; this is the reading the change is
      presented with. **If it is above 8**, something other than the blend still depends on
      the order: read the selection, the budget fade and the clear before going further, and
      do not take the abort branch until that reading is explained.
- [ ] 4.2 Read the overlap error against the frames task 2.4 captured, at the same three
      cameras and the same conditions. For each, record the mean frame luminance before and
      after, the largest per-pixel rise and the count of pixels that rose by more than 8.
      Beside each, record the worst step the probe read at that camera, so the two sit
      together: **23** at Barnard's Loop at 120 and **71** at Orion at 3,000; Orion at 800
      has no probe figure. The two are not the same quantity — one is static and one moves —
      so they are recorded side by side and not subtracted.

      **This task carries half the gate.** Write the three measured means into the test task
      2.4a built, rounded up to the next thousandth, in place of the before-figures it
      started with, so the overlap cannot grow later without a reading saying so. **If the rise
      at any of the three cameras is above a tenth of the light that camera drew before**,
      take the abort branch of task 4.5. That tenth is the judgement the spec states; it is
      not a measurement, and it is the one number in this change that a reader is entitled to
      argue with.
- [ ] 4.3 **The other half of the gate.** Read every reading task 2.3 listed. Each must
      still hold its committed bound, and **no bound moves to make a test pass**. Where one
      breaks, write the old and the new figure beside this task and take the abort branch of
      task 4.5.

      Read this list for what it is. Most of its assertions are one-sided — that a nebula
      adds light, that the glow puts a halo, that a close zoom still draws — so a blend that
      adds light passes them **harder**, and only two read the other way: the dark half of
      `a bright nebula adds light and a dark one takes it away`, and the core reading of
      `a nebula behind the core dims`. On its own this list is a weak proxy for the artefact
      this change introduces. That is why task 4.2 carries a bound of its own, and why both
      halves have to pass.
- [ ] 4.4 Read the pass cost at the cameras of task 2.2 and compare the four millisecond
      readings against the ones recorded there. The composite adds one full-screen draw of
      230,400 fragments and the sort it removes was CPU work. Verify each test still holds
      its own bound: 16.7 ms for the whole frame at 20 light years, 0.2 for the
      inside-against-outside share, 0.25 for the vertex-march share.
- [ ] 4.5 **The abort branch**, on either half of the gate: task 4.2 reading a rise above a
      tenth at any of its three cameras, or task 4.3 finding a committed bound it cannot
      hold. Revert
      the group 3 commit and the group 1 commit together: the accumulation target and the
      composite are one extra draw for nothing once the blend goes back, so they do not stay.
      That restores the two `.bin` fixtures with the rest of group 3. Keep the test of task
      2.1, marked as expected to fail with the reading of task 2.1a, so a later attempt starts
      from the measurement and not from the argument. Then withdraw this change: write the
      readings of tasks 4.2 and 4.3 into `design.md` as the answer, mark the remaining tasks
      not done with that reason, and do **not** archive it. The delta describes a tree that
      does not exist, so it must not reach `openspec/specs/nebulae/spec.md`.
- [ ] 4.6 If the change lands: verify `pnpm lint`, `pnpm exec tsc --noEmit`,
      `pnpm exec vitest run` and `pnpm test:e2e` all pass, and that the two CPU fixture
      comparisons read inside their committed bounds against the reference rebuilt in task
      3.4 — 0.02 for `barnards-loop` and 0.01 for `cats-eye`. Those two readings no longer
      say the frame is unchanged, because the reference moved with the pass. They say the
      march still agrees with an independent statement of the same integral and the same
      composite, which is what the requirement asks of them.

## 5. The review gate

- [ ] 5.1 Run the tests yourself first: `pnpm lint`, `pnpm exec vitest run` and
      `pnpm test:e2e`. A reviewer sent into a broken tree wastes its run.
- [ ] 5.2 Launch the `openspec-implementation-reviewer` subagent with this change id and
      wait for its verdict. On BLOCK, fix what it found and run it again. Do not carry a
      blocked change to a human with the objections attached as caveats.
- [ ] 5.3 Present the change: state the verdict, the findings, the readings of tasks 4.1 to
      4.4, and any finding you decided against acting on with the reason.
