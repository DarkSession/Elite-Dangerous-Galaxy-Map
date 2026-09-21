#version 300 es
// Raymarches the density volume. The camera sits at the origin of this frame, so the
// box bounds already carry the camera subtraction.
precision highp float;
precision highp sampler3D;

in vec2 vTexture;

uniform mat4 uInverseViewProjection;
uniform sampler3D uVolume;
uniform sampler2D uDetail;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uCentre;
uniform float uLo;
uniform float uSpan;
uniform float uEpsilon;
uniform float uEmission;
uniform float uAbsorption;
uniform float uDetailScale;

out vec4 fragColour;

// @volume-density

const int STEPS = 96;
// The ramp has two axes: the compressed density and the galactocentric radius. The
// inner ramp runs from a red-brown dust lane through a soft salmon band to a
// near-white core. The outer ramp runs from a blue haze to a dusty pink
// patch colour. HAZE, ARMS and CORE must stay equal to the same names in clouds.frag
// and points.frag: GLSL has no include, so the ramp is written out in each shader
// that draws part of the disc.
const vec3 HAZE = vec3(0.26, 0.30, 1.00);
const vec3 ARMS = vec3(0.90, 0.60, 0.62);
const vec3 LANE = vec3(1.36, 0.66, 0.62);
const vec3 BAND = vec3(1.00, 0.78, 0.78);
const vec3 CORE = vec3(1.00, 0.97, 0.92);
// The keys of the two ramps, in compressed density.
const float LANE_LOW = 0.08;
const float LANE_HIGH = 0.20;
const float CORE_LOW = 0.24;
const float CORE_HIGH = 0.95;
const float PATCH_LOW = 0.005;
const float PATCH_HIGH = 0.030;
// The galactocentric radius blends the inner ramp into the outer one. The reference
// paints the disc by region, and the radius is the region.
const float BLEND_IN = 20000.0;
const float BLEND_OUT = 32000.0;

void main() {
  // The camera is the origin of this frame. The point on the near plane is therefore
  // the direction of the ray through this pixel.
  // The unprojection runs for each fragment. The far point's w is a cancellation. A far
  // point built at a corner of the triangle carries a scale error of 1 to 3 per cent.
  // Each corner carries a different one. The interpolation mixes three unequal scales.
  // It turns them into a direction error of up to 2.6 degrees.
  vec4 nearPoint = uInverseViewProjection * vec4(vTexture * 2.0 - 1.0, -1.0, 1.0);
  vec3 direction = normalize(nearPoint.xyz / nearPoint.w);
  // A zero component gives an infinite inverse, and zero times infinity is NaN below.
  vec3 safe = mix(direction, vec3(1e-7), lessThan(abs(direction), vec3(1e-7)));
  vec3 inverse = 1.0 / safe;

  vec3 first = (uBoxMin - vec3(0.0)) * inverse;
  vec3 second = (uBoxMin + uBoxSize) * inverse;
  vec3 low = min(first, second);
  vec3 high = max(first, second);

  float near = max(max(low.x, low.y), low.z);
  float far = min(min(high.x, high.y), high.z);
  near = max(near, 0.0);

  if (far <= near) {
    fragColour = vec4(0.0);
    return;
  }

  float step = (far - near) / float(STEPS);
  float peak = exp(uLo + uSpan) - uEpsilon;
  vec3 colour = vec3(0.0);
  vec3 transmittance = vec3(1.0);

  for (int index = 0; index < STEPS; ++index) {
    float distance = near + (float(index) + 0.5) * step;
    vec3 point = direction * distance;
    float compressed = volumeDensity(
      point, uCentre, uVolume, uDetail, uBoxMin, uBoxSize,
      uLo, uSpan, uEpsilon, uDetailScale, peak);
    // An empty sample adds no light and takes none, so it skips the ramp. The volume
    // pass takes about 50 million samples a frame and most of them are empty.
    if (compressed <= 0.0) {
      continue;
    }

    // The radius keys the blend of the two ramps. The shared rule reads it as well, for
    // the fade at the rim, and one repeated line is cheaper than a second return value.
    float radius = length(point.xz - uCentre.xz);
    // Inside the inner disc the lanes are red-brown, the disc is salmon and only the
    // centre reaches the core colour. In the outer disc the space between the patches
    // is blue and the patches are pink.
    vec3 inner = mix(LANE, BAND, smoothstep(LANE_LOW, LANE_HIGH, compressed));
    inner = mix(inner, CORE, smoothstep(CORE_LOW, CORE_HIGH, compressed));
    vec3 outer = mix(HAZE, ARMS, smoothstep(PATCH_LOW, PATCH_HIGH, compressed));
    vec3 tint = mix(inner, outer, smoothstep(BLEND_IN, BLEND_OUT, radius));

    vec3 extinction = DUST * (compressed * uAbsorption * step);
    colour += transmittance * tint * (compressed * uEmission * step);
    transmittance *= exp(-extinction);
    if (all(lessThan(transmittance, vec3(0.002)))) {
      break;
    }
  }

  float mean = dot(transmittance, vec3(1.0 / 3.0));
  fragColour = vec4(colour, 1.0 - mean);
}
