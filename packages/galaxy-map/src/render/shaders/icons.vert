#version 300 es
// Draws one quad per icon and per arrow of a stack, from a box the pass worked out in
// device pixels.
//
// The placement is screen work, so the CPU does it: it already projects the candidates to
// pick the nearest 32, and it rounds each box to whole device pixels there. This shader
// therefore does no projection at all. It takes a unit quad corner and the box, and turns
// the two into a clip position.
//
// One program draws both kinds, because an arrow and an icon of two different stacks must
// order by range, the same as two icons do. Two draw calls cannot state that order: the
// second call draws every one of its quads over every quad of the first.
precision highp float;

// The corner of the quad: 0 or 1 on each axis, with 0,0 at the top left of the box.
layout(location = 0) in vec2 aCorner;
// The box: the left, the top, the width and the height, in device pixels from the top
// left of the drawing buffer.
layout(location = 1) in vec4 aBox;
// The layer of the texture array in `x` for an icon, and the fill as three parts from 0
// to 1 for an arrow.
layout(location = 2) in vec3 aData;
// The range from the camera to the system the stack belongs to, in light years.
layout(location = 3) in float aRange;
// 0 for an icon and 1 for an arrow.
layout(location = 4) in float aKind;

// The drawing buffer size in device pixels.
uniform vec2 uViewportPx;

out vec2 vLocal;
flat out vec2 vSize;
flat out vec3 vData;
flat out float vRange;
flat out float vKind;

void main() {
  vec2 pixel = aBox.xy + aCorner * aBox.zw;
  vLocal = aCorner;
  vSize = aBox.zw;
  vData = aData;
  vRange = aRange;
  vKind = aKind;
  // The box runs from the top of the frame and clip space runs from the bottom.
  vec2 clip = vec2(pixel.x / uViewportPx.x, 1.0 - pixel.y / uViewportPx.y) * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
}
