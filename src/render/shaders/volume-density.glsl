// The compressed density of the volume at one point, and the dust weights that go with
// it.
//
// `volume.frag` and `nebulae.vert` both read this file, which `volume-pass.ts` puts in
// place of the `// @volume-density` line of each source, because GLSL has no include. The
// volume pass draws the dust, and the nebula pass dims a sprite by the dust between the
// camera and it. The two must give the same answer: a second copy of the rule that
// drifted would light a nebula against a rim the volume no longer draws.
//
// The function gives back a scalar and not the extinction per channel. `volume.frag`
// keys its colour ramp and its emission on that scalar and weights its extinction alone
// by `DUST`, so the weights are a constant both shaders read and not something the
// function applies.

// The density is the decoded value relative to the peak, through a curve with two
// slopes on a logarithmic scale. Above the knee the power keeps the bulge and the
// disc in one display range. Below it the larger power spreads the low densities, so
// the patches the detail grid holds reach the screen.
const float GAMMA = 0.34;
const float LOW_GAMMA = 0.87;
// The knee sits at the density of the disc at 14,000 light years, relative to the
// peak texel, so the whole outer disc runs on the low slope and holds its contrast.
const float KNEE = 2.13e-2;
// The dust absorbs blue most and red least, so the light behind it turns warm.
const vec3 DUST = vec3(0.55, 1.00, 1.70);
// The fade by galactocentric radius. The map has no texel past the painted rim, and
// this removes the analytic tail beyond it. It does not read the density, so the
// space between the arms keeps its light.
const float RIM_FULL = 47000.0;
const float RIM_ZERO = 51000.0;
// The fade by height above the mid-plane. The model's vertical profile stops at
// 2,867 light years with the bulge still lit, so this spreads its top over 1,080
// light years and the bulge has no hard edge.
const float HEIGHT_FULL = 1800.0;
const float HEIGHT_ZERO = 2880.0;

// The compressed density at one point, with the fade at the rim and the fade by height
// above the mid-plane applied. `point` and `centre` are in the world frame, where the
// camera sits at the origin, and `boxMin` and `boxSize` carry the same subtraction.
// `peak` is `exp(lo + span) - epsilon`, which the caller computes once outside its loop.
//
// It gives back 0 where the volume holds no texel, before it reads the detail grid. The
// volume pass takes about 50 million samples a frame, so a second fetch on an empty
// sample is a cost the frame cannot carry.
float volumeDensity(
  vec3 point,
  vec3 centre,
  sampler3D map,
  sampler2D detailMap,
  vec3 boxMin,
  vec3 boxSize,
  float lo,
  float span,
  float epsilon,
  float detailScale,
  float peak
) {
  vec3 local = (point - boxMin) / boxSize;
  // The world frame negates the model's z, so the texture runs the other way on it.
  float encoded = texture(map, vec3(local.x, local.y, 1.0 - local.z)).r;
  if (encoded <= 0.0) {
    return 0.0;
  }

  // The detail grid covers the same bounds in x and z, with the same z flip. It
  // holds the logarithm of the ratio of the game's map to the smooth model.
  float detail = texture(detailMap, vec2(local.x, 1.0 - local.z)).r * 255.0 - 128.0;
  float density = max(exp(lo + encoded * span) - epsilon, 0.0) * exp(detail * detailScale);
  float ratio = density / peak;
  float compressed = ratio >= KNEE
    ? pow(ratio, GAMMA)
    : pow(KNEE, GAMMA) * pow(ratio / KNEE, LOW_GAMMA);
  compressed *= 1.0 - smoothstep(RIM_FULL, RIM_ZERO, length(point.xz - centre.xz));
  compressed *= 1.0 - smoothstep(HEIGHT_FULL, HEIGHT_ZERO, abs(point.y - centre.y));
  return compressed;
}
