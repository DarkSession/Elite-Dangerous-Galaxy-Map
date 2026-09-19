#version 300 es
// Marches one nebula volume inside its box.
//
// The loop is a volume integral: the transfer function is a four-channel extinction
// coefficient the density indexes, the emission takes the transmittance after the step,
// and the output is premultiplied, so the pass blends it with source-over. One blend
// serves a bright nebula and a dark one.
precision highp float;
precision highp sampler3D;

in vec3 vMarchObject;
in vec3 vMarchEye;
in float vWeight;
// The transmittance of the galaxy's volume between the camera and the record's centre.
// It is 1 where no volume has arrived, where the volume pass does not draw and where
// the look constant is 0.
in vec3 vTransmittance;

uniform sampler3D uDensity;
uniform sampler3D uColour;
uniform sampler2D uNebulaTransfer;
// Steps over one object-space unit. The box spans two of them.
uniform float uSteps;
// The one light gain every record shares. It scales the emission alone.
uniform vec3 uLightGain;
// Object space to volume space. It carries two things: the record's own rotation, and
// the flip from the renderer's world frame to the game frame, whose z runs the other
// way.
uniform mat3 uRotation;

out vec4 fragColour;

// The most steps one ray may take. The cube's diagonal is 2*sqrt(3) units.
const int MAX_STEPS = 256;

void main() {
  vec3 dir = normalize(vMarchObject - vMarchEye);
  vec3 inverse = 1.0 / dir;
  vec3 first = (vec3(-1.0) - vMarchEye) * inverse;
  vec3 second = (vec3(1.0) - vMarchEye) * inverse;
  vec3 low = min(first, second);
  vec3 high = max(first, second);
  // The near end clamps at 0 so a camera inside the box starts its march at the eye.
  float near = max(max(low.x, low.y), max(low.z, 0.0));
  float far = min(min(high.x, high.y), high.z);
  if (far <= near) discard;

  int count = int(ceil((far - near) * uSteps));
  count = clamp(count, 1, MAX_STEPS);
  float step = (far - near) / float(count);

  // No upper clamp. Five assets carry a negative extinction channel, so the
  // transmittance can rise above 1 along a ray. That is what the transfer tables ask
  // for, and a unit test holds the output alpha inside 0 to 1 on every asset instead.
  vec4 transmittance = vec4(1.0);
  vec3 emission = vec3(0.0);
  for (int index = 0; index < MAX_STEPS; ++index) {
    if (index >= count) break;
    vec3 at = vMarchEye + dir * (near + (float(index) + 0.5) * step);
    vec3 uvw = (uRotation * at) * 0.5 + 0.5;
    // The stored volume runs opposite to object-space y.
    uvw.y = 1.0 - uvw.y;
    float density = texture(uDensity, uvw).r;
    vec3 colour = texture(uColour, uvw).rgb;
    vec4 extinction = texelFetch(uNebulaTransfer, ivec2(int(density * 255.0), 0), 0);
    transmittance *= max(vec4(0.0), vec4(1.0) - extinction * density * step);
    emission += colour * uLightGain * transmittance.rgb * density * step;
    // The client abandons the ray once every channel is spent.
    if (all(lessThan(transmittance, vec4(0.01)))) break;
  }

  // The occlusion scales the colour channels and the alpha together, so a nebula the
  // camera sees through the dust both stops adding light and stops hiding what is
  // behind it. The alpha takes the mean of the three channels, which is what the volume
  // pass writes into its own alpha.
  float mean = dot(vTransmittance, vec3(1.0 / 3.0));
  fragColour = vec4(
    emission * vTransmittance * vWeight,
    (1.0 - transmittance.a) * mean * vWeight);
}
