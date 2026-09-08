#version 300 es
// Raymarches the density volume. The camera sits at the origin of this frame, so the
// box bounds already carry the camera subtraction.
precision highp float;
precision highp sampler3D;

in vec3 vRay;

uniform sampler3D uVolume;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uLo;
uniform float uSpan;
uniform float uEpsilon;
uniform float uEmission;
uniform float uAbsorption;

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
  float transmittance = 1.0;

  for (int index = 0; index < STEPS; ++index) {
    float distance = near + (float(index) + 0.5) * step;
    vec3 point = direction * distance;
    vec3 local = (point - uBoxMin) / uBoxSize;
    // The world frame negates the model's z, so the texture runs the other way on it.
    float encoded = texture(uVolume, vec3(local.x, local.y, 1.0 - local.z)).r;
    if (encoded <= 0.0) {
      continue;
    }

    float density = max(exp(uLo + encoded * uSpan) - uEpsilon, 0.0);
    float compressed = pow(density / peak, GAMMA);
    // The fade removes the thin haze past the truncation and gives the disc a soft
    // edge. Full emission starts near a quarter of the density at Sol.
    compressed *= smoothstep(0.03, 0.09, compressed);
    // The compressed density at Sol is about 0.15. The arms take the middle colour
    // from there, and the bulge takes the last.
    vec3 tint = mix(HAZE, ARMS, smoothstep(0.03, 0.14, compressed));
    tint = mix(tint, CORE, smoothstep(0.16, 0.45, compressed));

    float extinction = compressed * uAbsorption * step;
    colour += transmittance * tint * (compressed * uEmission * step);
    transmittance *= exp(-extinction);
    if (transmittance < 0.002) {
      break;
    }
  }

  fragColour = vec4(colour, 1.0 - transmittance);
}
