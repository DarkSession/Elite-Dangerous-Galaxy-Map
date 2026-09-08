#version 300 es
// Raymarches the density volume. The camera sits at the origin of this frame, so the
// box bounds already carry the camera subtraction.
precision highp float;
precision highp sampler3D;

in vec3 vRay;

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

const int STEPS = 96;
// The emission is the decoded density relative to the peak, raised to this power. The
// peak texel is about 250 times the density at Sol, and the power brings that ratio
// to about 7, so the bulge and the disc share one display range, as in the game's map.
const float GAMMA = 0.35;
// The ramp by compressed density: violet haze at the edge, pink-brown arms, cream bulge.
const vec3 HAZE = vec3(0.34, 0.32, 0.58);
const vec3 ARMS = vec3(0.82, 0.54, 0.48);
const vec3 CORE = vec3(1.00, 0.88, 0.72);
// The dust absorbs blue most and red least, so the lanes are brown.
const vec3 DUST = vec3(0.55, 1.00, 1.70);
// The fade by galactocentric radius. The map has no texel past the painted rim, and
// this removes the analytic tail beyond it. It does not read the density, so the
// space between the arms keeps its light.
const float RIM_FULL = 47000.0;
const float RIM_ZERO = 51000.0;

void main() {
  vec3 direction = normalize(vRay);
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
    vec3 local = (point - uBoxMin) / uBoxSize;
    // The world frame negates the model's z, so the texture runs the other way on it.
    float encoded = texture(uVolume, vec3(local.x, local.y, 1.0 - local.z)).r;
    if (encoded <= 0.0) {
      continue;
    }

    // The detail grid covers the same bounds in x and z, with the same z flip. It
    // holds the logarithm of the ratio of the game's map to the smooth model.
    float detail = texture(uDetail, vec2(local.x, 1.0 - local.z)).r * 255.0 - 128.0;
    float density = max(exp(uLo + encoded * uSpan) - uEpsilon, 0.0) * exp(detail * uDetailScale);
    float compressed = pow(density / peak, GAMMA);
    float radius = length(point.xz - uCentre.xz);
    compressed *= 1.0 - smoothstep(RIM_FULL, RIM_ZERO, radius);
    // The arms take the middle colour over most of the disc, and only the bulge
    // reaches the last one.
    vec3 tint = mix(HAZE, ARMS, smoothstep(0.02, 0.09, compressed));
    tint = mix(tint, CORE, smoothstep(0.30, 0.70, compressed));

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
