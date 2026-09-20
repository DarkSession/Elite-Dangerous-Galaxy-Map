// The third entry point, reached at `<package>/testing`.
//
// **This is not the supported surface.** It carries no compatibility promise, and a host
// has no reason to import it. The main entry point does not re-export it, so nothing in
// a host's build reaches it by accident.
//
// It is an entry point rather than a demo module because `src/render/context.ts` writes
// the object: `createRenderContext` records the unmasked renderer string and the error
// text there. That write is what makes a software-renderer fallback fail the browser
// suite, so the object stays library-side, on a path a mistake cannot quietly remove.
export { galaxyMapGlobal } from './render/global';
export type { GalaxyMapGlobal, TestView } from './render/global';
