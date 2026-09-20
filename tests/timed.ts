// The options a test takes when it holds a bound on wall-clock time.
//
// The pipeline runner gives two cores, and the unit suite runs its files at the same
// time. A reading taken while seven other files run measures the machine and not the
// work: `the cloud shapes` normally reads 7 milliseconds on the runner against a bound
// of 50, and one run read 58. `the sweep budget` failed the next run in the same way.
// Both already take the best of several readings, and the best reading is still of a
// core the machine took.
//
// `retry` asks for the whole measurement again, up to two more times. It does not
// weaken a bound: work that got slower misses its bound on every attempt, because the
// regression is in the work and not in the machine. A test that needs all three
// attempts still passes, which is the answer this project wants from a shared runner.
//
// The browser suite is the measurement that runs on known hardware. It is a local gate
// in the dev container, and `e2e/frame-budget.spec.ts` holds the frame bounds there.
export const TIMED_TEST = { retry: 2 };
