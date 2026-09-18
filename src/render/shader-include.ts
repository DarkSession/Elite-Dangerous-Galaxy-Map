// The one include rule the marker shaders use. GLSL has no include, so a marker fragment
// shader carries a marker line and the pass puts the shared rule in place of it before it
// compiles.
//
// The rule sits here, in a module that imports no shader text, so a caller that reads the
// files itself composes a shader the same way the pass does. The browser test that
// compiles the marker shaders is such a caller: it reads the files from the tree, and a
// second copy of this rule would let the test compile a source the pass never compiles.

/** The line both marker fragment shaders carry in place of the shared alpha rule. */
export const MARKER_ALPHA_MARKER = '// @marker-alpha';

/**
 * Puts the shared alpha rule into a marker fragment shader. The colour shader and the
 * range shader must give the same answer, so both read one rule and neither holds a copy.
 */
export function putMarkerAlpha(source: string, rule: string): string {
  if (!source.includes(MARKER_ALPHA_MARKER)) {
    throw new Error('A marker shader holds no place for the alpha rule.');
  }
  return source.replace(MARKER_ALPHA_MARKER, rule);
}
