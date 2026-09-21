#version 300 es
// Draws one icon of a stack on its own black plate, or the arrow under the lowest icon,
// where no nearer marker body covers the pixel.
//
// The plate is opaque black and the size of the box. A vector of the catalogue is a thin
// light line on nothing, and the galaxy behind a marker is neither dark nor one colour,
// so without the plate the line reads against whatever the camera puts there.
//
// The arrow points down: its flat edge is the top of the box and its apex is the middle
// of the bottom. There is no multisample buffer, so the two slanted edges take a one
// pixel ramp of their own.
//
// The occlusion test reads the range buffer the marker pass writes, which holds the range
// of the nearest marker **body** at each pixel. The test runs per pixel, so a nearer
// marker cuts its own shape out of the icon and takes nothing else. An arrow runs the
// same test on the same buffer, so an arrow and the icons over it read in one order.
precision highp float;
precision highp sampler2DArray;

// The icon vectors, one layer per distinct URL.
uniform sampler2DArray uIcons;
// The range buffer, one 32-bit float of light years per pixel. The sampler states its
// precision: a sampler type takes `lowp` where the shader names none, and the comparison
// below then reads a range rounded to about a two-thousandth of itself.
uniform highp sampler2D uRange;
// 1 where the map holds a range buffer, and 0 where the context cannot blend into a float
// target. At 0 the icon draws over every marker, which is the frame the map drew before
// any such rule existed.
uniform float uHasRange;
// How much nearer a marker must be before it hides an icon, as a share of the icon's own
// range. The pass states the number and why it is relative.
uniform float uRangeBias;

in vec2 vLocal;
flat in vec2 vSize;
flat in vec3 vData;
flat in float vRange;
flat in float vKind;

out vec4 fragColour;

void main() {
  if (uHasRange > 0.5) {
    float near = texelFetch(uRange, ivec2(gl_FragCoord.xy), 0).r;
    if (near < vRange * (1.0 - uRangeBias)) discard;
  }
  if (vKind > 0.5) {
    float halfWidth = vSize.x * 0.5;
    // The distance from the middle of the box across, and from the top down, in device
    // pixels.
    float across = abs(vLocal.x * vSize.x - halfWidth);
    float down = vLocal.y * vSize.y;
    // The signed distance to the slanted edge, in device pixels, positive inside the
    // triangle. The edge runs from a top corner to the apex, so the half width the
    // triangle holds falls from the full half width at the top to nothing at the bottom.
    float slope = length(vec2(vSize.y, halfWidth));
    float edge = (halfWidth * vSize.y - across * vSize.y - halfWidth * down) / slope;
    float coverage = clamp(min(edge, down) + 0.5, 0.0, 1.0);
    if (coverage <= 0.0) discard;
    fragColour = vec4(vData, coverage);
    return;
  }
  // The rasteriser drew the vector into a canvas whose first row is the top one, and the
  // upload leaves `UNPACK_FLIP_Y_WEBGL` at its default of false, so that first row lands
  // at the texture coordinate 0. The top of the quad is `vLocal.y` of 0, so the two meet
  // and the coordinate must not turn over: a turn draws the glyph upside down.
  vec4 texel = texture(uIcons, vec3(vLocal.x, vLocal.y, vData.x));
  // The glyph over the plate. The canvas gives straight alpha, so the composite is the
  // glyph's own colour weighted by its coverage, over black.
  fragColour = vec4(texel.rgb * texel.a, 1.0);
}
