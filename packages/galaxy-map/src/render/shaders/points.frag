#version 300 es
// A soft round sprite. The pass draws with additive blending.
precision highp float;

in float vTint;
in float vBrightness;
// The range from the camera to the sprite, in light years.
in float vRange;

// The accumulated nebula transmittance of the frame, at half the scene target's size.
// The sprite passes draw after the nebula composite, so a star behind a nebula takes
// none of its blocking without this fetch.
uniform sampler2D uNebulaTransmittance;
// The front range and the centre range of the record the camera is nearest to. A sprite
// at or nearer than the first takes none of the attenuation and one at or beyond the
// second takes all of it. The renderer sends a pair far beyond the volume box for a
// frame that drew no record, and the two are never equal: smoothstep is undefined in
// GLSL ES 3.00 for edge0 >= edge1, and the NaN would turn every sprite black.
uniform vec2 uNebulaRange;
// One over the size of the target the sprites draw into, in pixels.
uniform vec2 uInverseTarget;

out vec4 fragColour;

// The points carry a large share of the disc's light, so their colour sets the arm
// colour as much as the volume does. WARM and CORE must stay equal to the same names
// in volume.frag and clouds.frag: GLSL has no include, so the ramp is written out in
// each shader that draws part of the disc.
const vec3 COOL = vec3(0.72, 0.78, 1.00);
const vec3 WARM = vec3(1.00, 0.78, 0.62);
const vec3 CORE = vec3(1.00, 0.97, 0.92);
// The zone at the disc at Sol is 0.209, so this key puts Sol at the warm end. The
// zone reaches 0.896 at the peak of the model, so the core key sits near the top.
const float ZONE_SCALE = 6.0;
const float CORE_LOW = 0.45;
const float CORE_HIGH = 0.75;

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float radius = dot(offset, offset);
  if (radius > 1.0) {
    discard;
  }
  float falloff = 1.0 - radius;
  falloff *= falloff;
  vec3 colour = mix(COOL, WARM, clamp(vTint * ZONE_SCALE, 0.0, 1.0));
  colour = mix(colour, CORE, smoothstep(CORE_LOW, CORE_HIGH, vTint));
  // A frame that drew no nebula reads a share of exactly 0 and makes no fetch at all,
  // so it draws what it drew before this rule existed.
  float share = smoothstep(uNebulaRange.x, uNebulaRange.y, vRange);
  float block = 1.0;
  if (share > 0.0) {
    float held = texture(uNebulaTransmittance, gl_FragCoord.xy * uInverseTarget).a;
    block = mix(1.0, held, share);
  }
  fragColour = vec4(colour * (falloff * vBrightness) * block, 1.0);
}
