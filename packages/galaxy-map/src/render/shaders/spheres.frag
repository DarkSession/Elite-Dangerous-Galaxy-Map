#version 300 es
// Writes one sphere over the finished frame as a limb-brightened shell.
//
// The alpha is the path length through a thin shell at an impact parameter: it is the
// sphere's own opacity at the middle of the sprite and rises to 1 at the limb. At the
// default opacity of 0.18 it reaches 1 at 0.9838 of the radius, so a sphere reads as a
// bright rim with a faint wash inside it and never as a flat disc.
//
// The colour is the sphere's own colour at every point, so the colour reaches the frame
// unmixed and the alpha alone carries the shape. `sphereAlpha` of
// `src/render/shape-pass.ts` holds the same rule for the unit tests.
//
// The shell is a space that holds systems, so it washes the markers that lie inside it
// and behind it and leaves the markers in front of it alone. The marker pass writes the
// range of each marker body into the range buffer, and the share below is how much of
// the shell path through this pixel lies behind that marker. `depthShare` of
// `src/render/shape-pass.ts` holds the same rule.
precision highp float;

in vec2 vCorner;
in vec3 vColour;
in float vOpacity;
// The range from the camera to the centre of the sphere, in light years.
in float vCentreRange;
// The radius of the sphere, in light years.
in float vRadiusLy;

// The range buffer, one 32-bit float of light years per pixel.
uniform sampler2D uRange;
// 1 where the map holds a range buffer, and 0 where the context cannot blend into a
// float target. At 0 every sphere draws at a share of 1, which is the frame the map drew
// before the range buffer existed.
uniform float uHasRange;
// What a pixel holds where no marker body drew. It is above every drawable range.
uniform float uRangeEmpty;

out vec4 fragColour;

// The most of its own alpha a sphere writes over a marker body. The shell alpha reaches 1
// at the limb, so without the cap a limb that crossed a marker would take the marker off
// the screen, and a marker is what the user clicks.
const float MARKER_CAP = 0.5;

void main() {
  float r = length(vCorner);
  // The quad is square and the sphere is round, so the corners of the quad are outside
  // the shell. Nothing draws at the limb itself, where the path length is unbounded.
  if (r >= 1.0) discard;
  float alpha = min(1.0, vOpacity / sqrt(1.0 - r * r));

  if (uHasRange > 0.5) {
    float t = texelFetch(uRange, ivec2(gl_FragCoord.xy), 0).r;
    // The half chord the ray cuts through the shell, in light years. The ray enters the
    // shell at `c - d` and leaves it at `c + d`.
    float d = vRadiusLy * sqrt(max(0.0, 1.0 - r * r));
    float share =
      d > 0.0
        ? clamp((t - (vCentreRange - d)) / (2.0 * d), 0.0, 1.0)
        : (t >= vCentreRange ? 1.0 : 0.0);
    alpha *= share;
    if (t < uRangeEmpty) alpha = min(alpha, MARKER_CAP);
  }

  fragColour = vec4(vColour, alpha);
}
