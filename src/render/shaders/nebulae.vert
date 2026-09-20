#version 300 es
// Draws the box one nebula volume is marched inside. The box is the cube [-1, +1] in
// object space and its half-extent in world units is the record's radius, so the art
// draws one diameter across, as the pass it replaces did.
//
// The shader also marches the galaxy's density volume from the camera to the record's
// centre and gives the fragment shader the transmittance of that segment, so a nebula
// the camera sees through the bulge reads darker and warmer than one with nothing in
// front of it.
precision highp float;
precision highp sampler3D;

layout(location = 0) in vec3 aCorner;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform vec3 uPosition;
uniform float uRadius;
uniform float uWeight;
uniform float uFade;

// The volume the march reads. It is the texture the volume pass draws, which the
// renderer owns and gives to both passes. The absorption is the volume pass's own, so
// the two agree on how much light a light year of dust takes.
uniform sampler3D uVolume;
uniform sampler2D uDetail;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uCentre;
uniform float uLo;
uniform float uSpan;
uniform float uEpsilon;
uniform float uAbsorption;
uniform float uDetailScale;
// Scales the optical depth. At 0 the pass draws what it drew before the march, and at 1
// it draws the volume's own extinction. The renderer sends 0 where there is no volume
// texture and where the volume pass does not draw.
uniform float uOcclusion;

// The sample point, in the record's object space, where the cube spans [-1, +1].
out vec3 vMarchObject;
// The camera, in the same frame. The march runs from it toward the sample point.
out vec3 vMarchEye;
out float vWeight;
out vec3 vTransmittance;

// @volume-density

// How many steps the march takes. The segment is at most the box diagonal, about 105,000
// light years, so 64 steps give a step of 1,600 light years at worst. That is coarse and
// it is enough: the value wanted is a column depth and not a picture, the compression is
// monotone in the density, and the error of a midpoint rule over a smooth field falls as
// the square of the step. The volume pass takes 96 steps because it draws a picture.
const int MARCH_STEPS = 64;

// The transmittance of the volume over the segment from the camera to `target`, in the
// world frame. The camera sits at the origin of that frame, as it does in `volume.frag`,
// and the segment is clipped to the volume box the same way that shader clips its ray.
vec3 marchTransmittance(vec3 target) {
  if (uOcclusion <= 0.0) {
    return vec3(1.0);
  }

  float range = length(target);
  if (range <= 0.0) {
    return vec3(1.0);
  }
  vec3 direction = target / range;
  // A zero component gives an infinite inverse, and zero times infinity is NaN below.
  vec3 safe = mix(direction, vec3(1e-7), lessThan(abs(direction), vec3(1e-7)));
  vec3 inverse = 1.0 / safe;

  vec3 first = uBoxMin * inverse;
  vec3 second = (uBoxMin + uBoxSize) * inverse;
  vec3 low = min(first, second);
  vec3 high = max(first, second);

  float near = max(max(max(low.x, low.y), low.z), 0.0);
  // The record's centre ends the segment, so a nebula in front of the dust takes none.
  float far = min(min(min(high.x, high.y), high.z), range);
  if (far <= near) {
    return vec3(1.0);
  }

  float step = (far - near) / float(MARCH_STEPS);
  float peak = exp(uLo + uSpan) - uEpsilon;
  vec3 depth = vec3(0.0);

  for (int index = 0; index < MARCH_STEPS; ++index) {
    vec3 point = direction * (near + (float(index) + 0.5) * step);
    float density = volumeDensity(
      point, uCentre, uVolume, uDetail, uBoxMin, uBoxSize,
      uLo, uSpan, uEpsilon, uDetailScale, peak);
    depth += DUST * (density * uAbsorption * step * uOcclusion);
  }

  return exp(-depth);
}

void main() {
  vec3 centre = uChunkOffset + uPosition;

  // The zoom band and the record's own fades scale the colour and the alpha together,
  // so a fading nebula both dims and stops attenuating what is behind it.
  float weight = uWeight * uFade;
  vWeight = weight;

  // The camera sits at the origin of the camera-relative frame, so its object-space
  // position is the negated centre over the half-extent.
  vMarchEye = -centre / uRadius;
  vMarchObject = aCorner;

  if (weight <= 0.0) {
    // A record at weight 0 adds nothing. The box collapses behind the near plane, so
    // the fragment stage runs on none of it and the march below is never paid for.
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vTransmittance = vec3(1.0);
    return;
  }

  gl_Position = uViewProjection * vec4(centre + aCorner * uRadius, 1.0);

  // The march runs after the early-out, so a collapsed box pays no texture fetch. The
  // 36 vertices of one box march the same segment and reach the same answer. WebGL2 has
  // no per-instance stage, and the cost of the eight extra marches is measured rather
  // than assumed.
  vTransmittance = marchTransmittance(centre);
}
