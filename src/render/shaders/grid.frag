#version 300 es
// One fragment of the coordinate grid. The fragment sends a ray from the camera through
// its own pixel, meets the plane the cursor sits on, and reads the six decade levels at
// the point it meets.
//
// The camera sits at the origin of this frame. The processor sends the phase of each
// level, which is the camera's own coordinate inside one cell, so the shader adds a
// small camera-relative offset to a small phase. It never forms an absolute coordinate,
// which float32 cannot hold to one part in 100,000 light years.
precision highp float;

#define LEVEL_COUNT 6

in vec2 vNdc;

uniform mat4 uInverseViewProjection;
// The height of the plane above the camera, in the world frame. It is never positive,
// because the camera sits above the cursor at every pitch the map allows.
uniform float uPlaneY;
// The cursor on the plane, minus the camera, in game coordinates.
uniform vec2 uCursorOffset;
// The model bounds on the game x and z axes, minus the camera.
uniform vec2 uBoundsX;
uniform vec2 uBoundsZ;
// Device pixels for each CSS pixel.
uniform float uPixelRatio;
// The line's colour over a dark background and over the brightest one. The two are the
// same hue, so the line never leaves cyan and is never taken for a warm thing in the
// frame.
uniform vec3 uColorLight;
uniform vec3 uColorDeep;
// The width of a level at its finest and when it is fully bold, in CSS pixels.
uniform vec2 uWidthRange;
// The alpha of a level at its finest and when it is fully bold.
uniform vec2 uAlphaRange;
// The screen spacings a level grows bold between, in CSS pixels.
uniform vec2 uBoldRange;
// The screen spacings a level fades in over, in CSS pixels.
uniform vec2 uFadeRange;
// How many of its own lines a level reaches each side of the cursor.
uniform float uFadeLines;
// The camera distance band, from 0 to 1. It multiplies every level's alpha, so a wide
// view draws no grid at all. The processor works it out once for the frame.
uniform float uBand;
// The background reading, a sixteenth of the frame on each axis, tone mapped. The grid
// follows what it draws over: a fixed alpha makes one line read the same over the dark
// space between the arms and over the cream core.
uniform sampler2D uBackground;
// The background luminances the merge runs between.
uniform vec2 uMergeRange;
// How much of the alpha is left over the brightest background.
uniform float uMergeFloor;
uniform float uSpacing[LEVEL_COUNT];
uniform vec2 uPhase[LEVEL_COUNT];

out vec4 fragColor;

// How far along the plane the grid can reach, in light years. The galaxy model is about
// 100,000 light years across, so a point further out carries no line. The clamp also
// holds a ray that misses the plane at a finite point, so the derivatives below stay
// finite on the row of pixels that holds the horizon.
const float MAX_REACH = 400000.0;

void main() {
  // The camera is the origin of this frame, so the point on the near plane is the
  // direction of the ray through this pixel.
  vec4 nearPoint = uInverseViewProjection * vec4(vNdc, -1.0, 1.0);
  vec3 dir = nearPoint.xyz / nearPoint.w;

  // A ray that does not point down misses the plane. The floor holds the divide finite
  // and the reach clamp puts the miss outside the model bounds, where the test below
  // drops it.
  float denom = min(dir.y, -1e-6);
  float reach = MAX_REACH / max(length(dir), 1e-6);
  float along = min(uPlaneY / denom, reach);
  vec3 hit = dir * along;

  // The world frame negates z against the game frame, so the plane point in game
  // coordinates, relative to the camera, is (x, -z).
  vec2 plane = vec2(hit.x, -hit.z);

  // The light years one device pixel covers on each game axis. The derivative reads the
  // foreshortening, so a level whose lines close up toward the horizon fades out there
  // and draws no moire. Both derivatives are taken before any branch.
  vec2 alongX = vec2(dFdx(plane.x), dFdy(plane.x));
  vec2 alongZ = vec2(dFdx(plane.y), dFdy(plane.y));
  vec2 perDevice = max(vec2(length(alongX), length(alongZ)), vec2(1e-9));
  vec2 perCss = perDevice * uPixelRatio;

  float radius = length(plane - uCursorOffset);

  float alpha = 0.0;
  for (int level = 0; level < LEVEL_COUNT; level += 1) {
    float spacing = uSpacing[level];

    // The distance to the nearest line of this level, on each axis, in light years.
    vec2 cell = mod(plane + uPhase[level], vec2(spacing));
    vec2 toLine = min(cell, vec2(spacing) - cell);

    // The spacing of this level on the screen, on each axis, in CSS pixels.
    vec2 screen = vec2(spacing) / perCss;
    vec2 bold = smoothstep(vec2(uBoldRange.x), vec2(uBoldRange.y), screen);
    vec2 width = vec2(uWidthRange.x) + (uWidthRange.y - uWidthRange.x) * bold;
    vec2 levelAlpha = (vec2(uAlphaRange.x) + (uAlphaRange.y - uAlphaRange.x) * bold) *
      smoothstep(vec2(uFadeRange.x), vec2(uFadeRange.y), screen) * uBand;

    // The coverage of the line over this pixel. The ramp is one device pixel wide, so
    // the light across the line is its width whatever part of a pixel the line sits on.
    vec2 widthDevice = width * uPixelRatio;
    vec2 toLineDevice = toLine / perDevice;
    vec2 coverage = clamp(0.5 * widthDevice + 0.5 - toLineDevice, vec2(0.0), vec2(1.0));

    float fade = clamp(1.0 - radius / (uFadeLines * spacing), 0.0, 1.0);
    vec2 drawn = levelAlpha * coverage * fade;

    // Where two levels cover one point the grid takes the larger alpha and not the sum,
    // so a crossing is no brighter than the lines that meet there.
    alpha = max(alpha, max(drawn.x, drawn.y));
  }

  bool inside = plane.x >= uBoundsX.x && plane.x <= uBoundsX.y &&
    plane.y >= uBoundsZ.x && plane.y <= uBoundsZ.y;
  if (!inside || alpha <= 0.0) discard;

  // The merge with the background under this pixel. The reading is a sixteenth of the
  // frame on each axis and the sampler filters it, so the weight changes smoothly and a
  // line does not step where two texels meet.
  // The reading gives the luminance alone. The line does not take the background's own
  // colour: it darkens toward a deep blue of its own hue, so it keeps hue contrast over
  // the cream core as well as over the dark space between the arms.
  vec3 background = texture(uBackground, vNdc * 0.5 + 0.5).rgb;
  float backgroundLuminance = dot(background, vec3(0.2126, 0.7152, 0.0722));
  float merge = smoothstep(uMergeRange.x, uMergeRange.y, backgroundLuminance);
  // The floor is not zero. A grid the user cannot find over the core is not a
  // coordinate grid.
  float weight = 1.0 - (1.0 - uMergeFloor) * merge;
  vec3 colour = mix(uColorLight, uColorDeep, merge);

  fragColor = vec4(colour, alpha * weight);
}
