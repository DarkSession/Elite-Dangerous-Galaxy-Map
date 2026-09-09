#version 300 es
// A soft sprite with an irregular outline, read from the shape atlas. The pass draws
// with additive blending, so the sprites give the haze its chunks.
precision highp float;

in vec2 vLocal;
in vec2 vShapeUv;
in float vTint;
in float vBrightness;
in float vSpread;
in float vSpreadKey;
in float vBlend;

uniform sampler2D uShapes;

out vec4 fragColour;

// Five stops of the volume ramp, so a cloud carries the haze, the arms, the lanes,
// the band of the inner disc and the core. They must stay equal to the same names in
// volume.frag and points.frag: GLSL has no include, so the ramp is written out in
// each shader that draws part of the disc.
const vec3 HAZE = vec3(0.26, 0.30, 1.00);
const vec3 ARMS = vec3(0.90, 0.60, 0.62);
const vec3 LANE = vec3(1.36, 0.66, 0.62);
const vec3 BAND = vec3(1.00, 0.78, 0.78);
const vec3 CORE = vec3(1.00, 0.97, 0.92);
// The patch colour of the spread. It is the volume's outer ramp stop, so a bright
// sprite on the blue ground carries the same pink as a patch of the outer disc.
const vec3 PATCH = ARMS;
// The zone at the disc at Sol is 0.209, so this key puts Sol at the warm end. The
// zone reaches 0.896 at the peak of the model, so the core key sits near the top. The
// zone is a lookup on the log of the surface density, so it keys the lanes as well:
// on the ring at 14,000 light years it runs from 0.23 to 0.47, and on the ring at
// 20,000 from 0.14 to 0.34, so a sprite in a lane takes the lane colour at both. The
// keys below are on the zone and are this shader's own; only the ramp colours must
// stay equal by name with volume.frag, which keys its lanes on the density.
const float ZONE_SCALE = 6.0;
const float LANE_ZONE_LOW = 0.22;
const float LANE_ZONE_HIGH = 0.36;
const float CORE_LOW = 0.45;
const float CORE_HIGH = 0.75;

void main() {
  // The shape is zero outside its inscribed disc, and the corners of the turned quad
  // reach past it, so this drop keeps the lookup inside the shape's cell.
  if (dot(vLocal, vLocal) > 1.0) {
    discard;
  }
  float shape = texture(uShapes, vShapeUv).r;
  // The sprite carries the volume's two ramps, blended by the same radii. Over the
  // inner disc it runs from the lanes to the band by zone, so the sprites do not lay
  // one flat colour over the mottling. Over the outer disc it runs from the haze to
  // the arms by zone, and where the spread applies a faint sprite is the blue ground
  // and a bright one a pink puff.
  vec3 inner = mix(LANE, BAND, smoothstep(LANE_ZONE_LOW, LANE_ZONE_HIGH, vTint));
  vec3 zoneColour = mix(HAZE, ARMS, clamp(vTint * ZONE_SCALE, 0.0, 1.0));
  vec3 spreadColour = mix(HAZE, PATCH, vSpread);
  vec3 outer = mix(zoneColour, spreadColour, vSpreadKey);
  vec3 colour = mix(inner, outer, vBlend);
  colour = mix(colour, CORE, smoothstep(CORE_LOW, CORE_HIGH, vTint));
  fragColour = vec4(colour * (shape * vBrightness), 0.0);
}
