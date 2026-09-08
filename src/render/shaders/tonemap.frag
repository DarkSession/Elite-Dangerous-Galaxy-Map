#version 300 es
// Maps the sum of the scene passes into the display range and puts it over the
// background.
precision highp float;
// The fragment language defaults integers to mediump, which is too narrow for the
// 32-bit hash below.
precision highp int;

in vec2 vTexture;

uniform sampler2D uScene;
uniform float uExposure;

out vec4 fragColour;

// The curve stops here instead of at 1, so the bulge keeps its cream colour.
const float WHITE_LEVEL = 0.95;
// The background of the game's map is a dark grey, not black. The blend keeps faint
// light above it, which a maximum would hide.
const vec3 BACKGROUND = vec3(0.038, 0.036, 0.048);

// An integer hash of the pixel position, in 0 to 1. It uses shifts, adds and
// exclusive or only, because GLSL ES 3.00 leaves an overflow of a `uint` multiply
// undefined. An exclusive-or shift alone leaves the high bits of two neighbouring
// rows close together, which puts runs of one level in the frame, so this is
// Jenkins's 32-bit mix.
float hashPixel(uvec2 pixel) {
  uint bits = pixel.x + (pixel.y << 16u);
  bits += ~(bits << 15u);
  bits ^= bits >> 10u;
  bits += bits << 3u;
  bits ^= bits >> 6u;
  bits += ~(bits << 11u);
  bits ^= bits >> 16u;
  return float(bits) / 4294967295.0;
}

void main() {
  vec3 scene = max(texture(uScene, vTexture).rgb, 0.0);
  // The curve runs on the luminance and scales the colour, so the arms keep their
  // hue. It reaches the white level only at an infinite luminance, so the bulge does
  // not clip and falls off from the centre. A strongly tinted pixel can still carry
  // a channel above 1 at that luminance, and the min below clamps it.
  float luminance = dot(scene, vec3(0.2126, 0.7152, 0.0722));
  float exposed = luminance * uExposure;
  float mapped = WHITE_LEVEL * exposed / (1.0 + exposed);
  vec3 colour = luminance > 0.0 ? scene * (mapped / luminance) : vec3(0.0);
  vec3 display = pow(min(colour, 1.0), vec3(1.0 / 2.2));
  vec3 blended = BACKGROUND + (1.0 - BACKGROUND) * display;
  // A triangular dither of one 8-bit step breaks the bands a smooth gradient would
  // show. It reads the pixel position only, so every frame carries the same pattern.
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  float dither = (hashPixel(pixel) - hashPixel(pixel + 1u)) / 255.0;
  fragColour = vec4(blended + dither, 1.0);
}
