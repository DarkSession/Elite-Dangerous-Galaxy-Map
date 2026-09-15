#version 300 es
// Expands one boundary segment into a screen-space ribbon.
//
// The card draws no line wider than one pixel, so the pass builds the width itself. A
// segment becomes a quad in pixels: the half width along the screen normal, and the
// half width along the segment at each end, so the overlap at a join is filled and
// not notched. The two endpoints come from the shared vertex array read at two
// offsets one vertex apart, so no vertex is stored twice.
//
// The positions are relative to the chunk origin, and the chunk offset carries the
// camera subtraction the CPU makes in float64. The sum of the two is therefore the
// point seen from the camera. The shader passes the two screen positions of the
// segment, and the fragment shader measures its own pixel against them.
precision highp float;

layout(location = 0) in vec3 aStart;
layout(location = 1) in vec3 aEnd;
// The corner of the quad: x picks the end, 0 or 1, and y picks the side, -1 or 1.
layout(location = 2) in vec2 aCorner;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
// The drawing buffer size in device pixels.
uniform vec2 uTargetSize;
// Half the width of the whole line, in device pixels.
uniform float uHalfWidth;

flat out vec2 vStart;
flat out vec2 vEnd;

void main() {
  vec3 startPoint = uChunkOffset + aStart;
  vec3 endPoint = uChunkOffset + aEnd;
  vec4 near = uViewProjection * vec4(startPoint, 1.0);
  vec4 far = uViewProjection * vec4(endPoint, 1.0);

  // The pass makes the screen positions itself, so it must clip the segment at the
  // near plane itself as well. A point behind the near plane has z + w below zero,
  // and it would otherwise project to the wrong side of the screen.
  float nearSide = near.z + near.w;
  float farSide = far.z + far.w;
  if (nearSide <= 0.0 && farSide <= 0.0) {
    // The whole segment sits behind the near plane. A position outside the clip cube
    // draws nothing.
    vStart = vec2(0.0);
    vEnd = vec2(0.0);
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  // The clip is a mix of the two clip positions, and the view-projection is linear, so
  // the same mix of the two camera-relative points names the same place on the segment.
  if (nearSide <= 0.0) {
    float cut = min(nearSide / (nearSide - farSide) + 0.001, 1.0);
    near = mix(near, far, cut);
  } else if (farSide <= 0.0) {
    float cut = min(farSide / (farSide - nearSide) + 0.001, 1.0);
    far = mix(far, near, cut);
  }

  vec2 start = (near.xy / near.w * 0.5 + 0.5) * uTargetSize;
  vec2 end = (far.xy / far.w * 0.5 + 0.5) * uTargetSize;
  vec2 along = end - start;
  float span = length(along);
  vec2 direction = span > 1e-6 ? along / span : vec2(1.0, 0.0);
  vec2 sideways = vec2(-direction.y, direction.x);

  vec2 base = mix(start, end, aCorner.x);
  vec2 pixel = base + direction * (aCorner.x * 2.0 - 1.0) * uHalfWidth +
    sideways * aCorner.y * uHalfWidth;

  vStart = start;
  vEnd = end;
  gl_Position = vec4(pixel / uTargetSize * 2.0 - 1.0, 0.0, 1.0);
}
