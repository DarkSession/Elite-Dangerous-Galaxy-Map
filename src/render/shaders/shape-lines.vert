#version 300 es
// Expands one line segment into a screen-space ribbon of a fixed width.
//
// The card draws no line wider than one pixel, so the pass builds the width itself, as
// the region boundary pass does. A segment becomes a quad in device pixels: the half
// width along the screen normal, and the half width along the segment at each end, so the
// overlap at a join is filled and not notched.
//
// The width does not follow the range. A route line is a symbol between two places and
// not an object with a size, so it holds its width in CSS pixels at every zoom.
//
// Every segment of every line draws in one instanced call, so the set size changes the
// vertex work and not the call count.
precision highp float;

// The corner of the quad: x picks the end, 0 or 1, and y picks the side, -1 or 1.
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aStart;
layout(location = 2) in vec3 aEnd;
layout(location = 3) in vec3 aColour;
// Half the width of the ribbon, in CSS pixels.
layout(location = 4) in float aHalfWidth;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
// The drawing buffer size in device pixels.
uniform vec2 uTargetSize;
// Device pixels per CSS pixel.
uniform float uPixelRatio;

flat out vec2 vStart;
flat out vec2 vEnd;
flat out vec3 vColour;
flat out float vHalfWidth;

void main() {
  vec3 startPoint = uChunkOffset + aStart;
  vec3 endPoint = uChunkOffset + aEnd;
  vec4 near = uViewProjection * vec4(startPoint, 1.0);
  vec4 far = uViewProjection * vec4(endPoint, 1.0);
  float halfWidth = aHalfWidth * uPixelRatio;

  // The pass makes the screen positions itself, so it clips the segment at the near
  // plane itself as well. A point behind the near plane has z + w below zero, and it
  // would otherwise project to the wrong side of the screen.
  float nearSide = near.z + near.w;
  float farSide = far.z + far.w;
  if (nearSide <= 0.0 && farSide <= 0.0) {
    // The whole segment sits behind the near plane and draws nothing.
    vStart = vec2(0.0);
    vEnd = vec2(0.0);
    vColour = aColour;
    vHalfWidth = halfWidth;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  // The clip is a mix of the two clip positions, and the view projection is linear, so
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
  vec2 pixel = base + direction * (aCorner.x * 2.0 - 1.0) * halfWidth +
    sideways * aCorner.y * halfWidth;

  vStart = start;
  vEnd = end;
  vColour = aColour;
  vHalfWidth = halfWidth;
  gl_Position = vec4(pixel / uTargetSize * 2.0 - 1.0, 0.0, 1.0);
}
