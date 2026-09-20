// The include rules the shaders use. GLSL has no include, so a shader carries a marker
// line and the pass puts the shared rule in place of it before it compiles.
//
// The rules sit here, in a module that imports no shader text, so a caller that reads the
// files itself composes a shader the same way the pass does. The browser tests that
// compile the marker shaders and the nebula shaders are such callers: they read the files
// from the tree, and a second copy of a rule would let a test compile a source the pass
// never compiles.

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

/** The line the volume shader and the nebula shader carry in place of the density rule. */
export const VOLUME_DENSITY_MARKER = '// @volume-density';

/**
 * Puts the shared density rule into a shader. The volume pass draws the dust and the
 * nebula pass dims a record by the dust in front of it, so both read one rule and neither
 * holds a copy.
 */
export function putVolumeDensity(source: string, rule: string): string {
  if (!source.includes(VOLUME_DENSITY_MARKER)) {
    throw new Error('A shader holds no place for the density rule.');
  }
  return source.replace(VOLUME_DENSITY_MARKER, rule);
}
