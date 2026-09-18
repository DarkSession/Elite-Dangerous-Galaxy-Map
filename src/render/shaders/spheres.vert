#version 300 es
// Expands one sphere into a screen-aligned quad at its centre.
//
// A sphere is a shell and not a solid, so the pass draws an impostor: one quad, sized by
// the radius the sphere subtends at the range of its centre, with the path length through
// the shell written as the alpha. The draw is instanced, so a set of any size costs one
// call.
//
// The positions are absolute game positions in the world frame, and the chunk offset
// carries the camera subtraction the processor makes in float64. The sum of the two is
// the centre seen from the camera, as the region boundaries read it.
precision highp float;

// The corner of the quad, each component -1 or 1.
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aCentre;
layout(location = 2) in float aRadius;
layout(location = 3) in vec3 aColour;
layout(location = 4) in float aOpacity;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
// The drawing buffer size in device pixels.
uniform vec2 uTargetSize;
// The focal length in device pixels, which is half the height over the tangent of half
// the vertical field of view.
uniform float uFocal;
// The smallest drawn radius a sphere draws at, in device pixels.
uniform float uMinRadius;

out vec2 vCorner;
out vec3 vColour;
out float vOpacity;
// The range from the camera to the centre, and the radius, both in light years. The
// fragment reads the range buffer against them to find how much of its shell path lies
// behind the nearest marker body.
out float vCentreRange;
out float vRadiusLy;

void main() {
  vec3 centre = uChunkOffset + aCentre;
  float range = length(centre);
  vec4 clip = uViewProjection * vec4(centre, 1.0);
  // The drawn radius the sphere subtends at the range of its centre, in device pixels.
  float radius = range > 0.0 ? uFocal * aRadius / range : 0.0;

  // The three culls. A shell smaller than a pixel carries no reading. A centre at or
  // behind the near plane projects to the wrong side of the screen. A camera at or
  // inside the shell sees the inside of it, which the impostor is not the shape of.
  //
  // A centre on the near plane reads `clip.z = -clip.w`, and the sum of the two is worked
  // out in float32 over a camera-relative position, so it can come out a little either
  // side of 0. The bound is a share of `w`, which is a bound on the depth in normalised
  // coordinates, so a centre on the plane always culls and one a pixel inside the frustum
  // never does.
  bool tooSmall = radius < uMinRadius;
  bool behind = clip.w <= 0.0 || clip.z + clip.w <= 1e-4 * clip.w;
  bool inside = range <= aRadius;
  if (tooSmall || behind || inside) {
    // A position outside the clip cube draws nothing.
    vCorner = vec2(0.0);
    vColour = aColour;
    vOpacity = aOpacity;
    vCentreRange = range;
    vRadiusLy = aRadius;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  // The quad is built in clip space. A shift of `w` moves a point by the whole half
  // width of the screen, so the offset in device pixels is scaled by `2 * w / size`.
  clip.xy += aCorner * radius * 2.0 * clip.w / uTargetSize;

  vCorner = aCorner;
  vColour = aColour;
  vOpacity = aOpacity;
  vCentreRange = range;
  vRadiusLy = aRadius;
  gl_Position = clip;
}
