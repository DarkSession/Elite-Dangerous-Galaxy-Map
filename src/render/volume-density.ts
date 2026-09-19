// The shared density rule, as the passes compile it. The volume pass draws the dust and
// the nebula pass dims a record by the dust in front of it, so both read one rule.
//
// The rule sits in a module of its own and not beside the volume pass, because the nebula
// pass is the second reader. A nebula pass that imported the volume pass would drag the
// volume shader text into the chunk the nebula pass sits in.
import { putVolumeDensity } from './shader-include';
import densitySource from './shaders/volume-density.glsl?raw';

/**
 * Puts the shared density rule into a shader that carries the marker line.
 * `shaders/volume-density.glsl` holds the rule and `shader-include.ts` holds the marker,
 * so a caller that reads the shader files itself composes what the passes compile.
 */
export function withVolumeDensity(source: string): string {
  return putVolumeDensity(source, densitySource);
}
