#version 300 es
// Marches one nebula volume inside its box.
//
// The loop is a volume integral: the transfer function is a four-channel extinction
// coefficient the density indexes, and the emission takes the transmittance after the
// step. The output colour is the emission, which the pass adds, and the output alpha is
// the record's transmittance, which the pass multiplies. One blend serves a bright
// nebula and a dark one.
precision highp float;
// GLSL ES 3.00 gives `sampler2DArray` no default precision in the fragment language,
// so the shader does not compile without this line.
precision highp sampler2DArray;

in vec3 vMarchObject;
in vec3 vMarchEye;
in float vWeight;
// The transmittance of the galaxy's volume between the camera and the record's centre.
// It is 1 where no volume has arrived, where the volume pass does not draw and where
// the look constant is 0.
in vec3 vTransmittance;
// The gain the record's own transmittance takes, from the range to its centre.
in float vBlockGain;

uniform sampler2DArray uDensity;
uniform sampler2DArray uColour;
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

// Reads one volume at `uvw`, where the third axis is a layer of an array.
//
// An array filters inside a layer and not across layers, so the march reads two layers
// and mixes them itself. The arithmetic is what a 3D texture's LINEAR filter does on
// its third axis: layer centres sit at half-texel offsets and both ends clamp, so a
// sample at the volume's face reads that face and not a blend with nothing.
//
// The layer count comes from the texture and not from a uniform, so the pass cannot
// send a side that does not match the texture it bound.
vec4 sampleVolume(sampler2DArray volume, vec3 uvw) {
  float layers = float(textureSize(volume, 0).z);
  float t = clamp(uvw.z * layers - 0.5, 0.0, layers - 1.0);
  float low = floor(t);
  float high = min(low + 1.0, layers - 1.0);
  return mix(
    texture(volume, vec3(uvw.xy, low)),
    texture(volume, vec3(uvw.xy, high)),
    t - low);
}

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
    float density = sampleVolume(uDensity, uvw).r;
    // BC1 carries no alpha and the fallback uploads 255, so the march reads `.rgb` and
    // the two paths agree.
    vec3 colour = sampleVolume(uColour, uvw).rgb;
    vec4 extinction = texelFetch(uNebulaTransfer, ivec2(int(density * 255.0), 0), 0);
    transmittance *= max(vec4(0.0), vec4(1.0) - extinction * density * step);
    emission += colour * uLightGain * transmittance.rgb * density * step;
    // The client abandons the ray once every channel is spent.
    if (all(lessThan(transmittance, vec4(0.01)))) break;
  }

  // The occlusion scales the colour channels and the extinction together, so a nebula
  // the camera sees through the dust both stops adding light and stops hiding what is
  // behind it. The extinction takes the mean of the three channels, which is what the
  // volume pass writes into its own alpha.
  //
  // The alpha is the record's transmittance and not one minus it, because the pass
  // multiplies the accumulated alpha by `SRC_ALPHA`.
  // The range block raises the record's own transmittance to a gain before the alpha is
  // written. A power on the transmittance is a multiply on the optical depth, which is
  // the physical form: T^g == exp(-g * tau). The march writes T and not tau, so the
  // power is the cheap way to say it, and it holds T inside 0 to 1 for any gain at or
  // above 0. The branch keeps a gain of exactly 1 on the path the pass wrote before the
  // block existed, on an implementation that is not exact for pow(x, 1.0).
  float blocked = vBlockGain == 1.0
    ? transmittance.a
    : pow(transmittance.a, vBlockGain);
  float mean = dot(vTransmittance, vec3(1.0 / 3.0));
  fragColour = vec4(
    emission * vTransmittance * vWeight,
    1.0 - (1.0 - blocked) * mean * vWeight);
}
