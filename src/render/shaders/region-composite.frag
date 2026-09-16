#version 300 es
// Reads the coverage buffer once and writes the boundary band over the frame.
//
// The band is one warm tone with a soft edge, which is the line the game draws. The
// two-tone ribbon of a light core inside a dark outline is gone: the tone's luminance is
// 0.755, above every part of the frame but the core of the galaxy itself, so the band
// lightens what it crosses and needs no darker edge to be seen.
//
// The `smoothstep` clamps at 1, which gives the band a flat top. The ribbon pass blends
// the coverage with MAX, so a join keeps the smallest distance and a corner reads exactly
// what its own arm reads.
//
// The band then fades by the range of the plane point the pixel sees. The camera sits at
// the origin of the world frame, so the range is the length of the ray to the plane. A
// pixel whose ray misses the plane takes the band in full.
precision highp float;

uniform sampler2D uCoverage;
uniform vec3 uTone;
uniform float uOpacity;
// The inverse of the frame's view projection, which unprojects a pixel to a world ray.
uniform mat4 uInverseViewProjection;
// The galactic plane in the camera-relative world frame, which is minus the camera's own
// height above it.
uniform float uPlaneY;
// The range at which the band draws nothing, and the range at which it draws in full.
uniform float uRangeNone;
uniform float uRangeFull;

in vec2 vTexture;

out vec4 fragColour;

/** The world point one end of the pixel's ray sits at. */
vec3 unproject(vec2 ndc, float depth) {
  vec4 point = uInverseViewProjection * vec4(ndc, depth, 1.0);
  return point.xyz / point.w;
}

void main() {
  float coverage = texture(uCoverage, vTexture).r;
  float alpha = smoothstep(0.0, 1.0, coverage);
  if (alpha <= 0.0) discard;

  vec2 ndc = vTexture * 2.0 - 1.0;
  vec3 near = unproject(ndc, -1.0);
  vec3 far = unproject(ndc, 1.0);
  vec3 along = far - near;
  // A ray that runs along the plane, or away from it, never meets it and takes 1.
  float range = uRangeFull;
  if (abs(along.y) > 1e-9) {
    float part = (uPlaneY - near.y) / along.y;
    if (part >= 0.0) range = length(near + part * along);
  }
  alpha *= smoothstep(uRangeNone, uRangeFull, range);
  if (alpha <= 0.0) discard;

  fragColour = vec4(uTone, alpha * uOpacity);
}
