## 1. Thresholds

- [x] 1.1 In `e2e/look.spec.ts`, set the factor of the ring at 20,000 light years to 1.2 in the patch contrast test, apply the bright ceiling only to the ring at 38,000 in the haze test, and set the rim puff factor to 1.6; verify `pnpm exec playwright test e2e/00-renderer.spec.ts e2e/look.spec.ts` names a hardware renderer and every look scenario passes, including the baseline scenario with the baseline image unchanged
- [x] 1.2 Read the printed values of the three scenarios from that run and check them against the design's table: 1.25, 0.095 and 1.76 within 0.01; verify the values in the log match, so the thresholds sit under the tree the owner accepted and not under a tree that drifted

## 2. Documentation and checks

- [x] 2.1 In `docs/roadmap.md`, append `far-view-look-thresholds` to the phase 1 change list, keep "Status: implemented, under review.", delete the sentence on the three unreached scenarios, and add one sentence that records the point shader's zone key at 6 as accepted; verify the phase 1 paragraph reads correctly and `openspec validate far-view-look-thresholds --strict` reports the change valid
- [x] 2.2 Run `pnpm build`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm test` and `pnpm test:e2e`; verify every command exits 0 and the browser suite reports a hardware renderer
