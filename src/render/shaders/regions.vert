#version 300 es
// Expands one sub-chord of one boundary primitive into a screen-space ribbon.
//
// A primitive is an arc: two ends and one signed curvature, where a curvature of zero
// is a straight line. The card draws no curve, and no line wider than one pixel, so
// the pass builds both itself. The draw sets the divisor of the two endpoints and the
// curvature to the sub-chord count, so one primitive covers that many instances and
// this shader takes its sub-chord from gl_InstanceID. Each sub-chord becomes a quad in
// pixels: the half width along the screen normal, and the half width along the
// sub-chord at each end, so the overlap at a join is filled and not notched. The two
// endpoints come from the shared vertex array read at two offsets one vertex apart, so
// no vertex is stored twice.
//
// The curve is cut up here and not measured in the fragment shader, which is
// deliberate. That shader measures distance in screen pixels, and that is what holds
// the drawn line to 4 CSS pixels at any obliquity. A circle on the plane projects to a
// conic under perspective, and the distance to a conic needs a quartic.
//
// The positions are relative to the chunk origin, and the chunk offset carries the
// camera subtraction the CPU makes in float64.
precision highp float;

layout(location = 0) in vec3 aStart;
layout(location = 1) in vec3 aEnd;
// The corner of the quad: x picks the end, 0 or 1, and y picks the side, -1 or 1.
layout(location = 2) in vec2 aCorner;
// The signed curvature of the primitive, in reciprocal light years. Zero is straight.
layout(location = 3) in float aCurvature;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
// The drawing buffer size in device pixels.
uniform vec2 uTargetSize;
// Half the width of the whole line, in device pixels.
uniform float uHalfWidth;
// How many sub-chords one primitive covers. It is the attribute divisor as well.
uniform int uSubCount;

// Below this curvature a primitive draws as its chord. The fit writes exactly zero for
// a straight primitive, and its widest arc has a radius of 177,654 light years, so the
// threshold stands 5,600 times below anything the data holds.
const float STRAIGHT_CURVATURE = 1e-9;

flat out vec2 vStart;
flat out vec2 vEnd;

// Turns a plane vector by an angle, from x towards z in game coordinates. The world
// frame the card reads negates z, so the turn runs the other way in it.
vec2 turned(vec2 way, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec2(way.x * cosine + way.y * sine, -way.x * sine + way.y * cosine);
}

// The point at a fraction of the sweep of this primitive.
//
// The chord from the start to that point is 2 sin(halfSweep) / curvature long and lies
// at the start tangent turned by halfSweep. Written that way the point stays exact as
// the curvature falls to zero, because the sine and the division cancel; a form that
// took the centre of the circle would work with a centre light years away.
vec3 arcPoint(float sweep, float fraction) {
  if (sweep == 0.0) return mix(aStart, aEnd, fraction);
  float halfSweep = sweep * fraction * 0.5;
  vec2 chordWay = normalize(aEnd.xz - aStart.xz);
  // The start tangent sits half the sweep before the chord direction, so this
  // sub-chord runs at (fraction - 1) / 2 of the sweep from that direction.
  vec2 way = turned(chordWay, sweep * (fraction - 1.0) * 0.5);
  float reach = 2.0 * sin(halfSweep) / aCurvature;
  return vec3(
    aStart.x + reach * way.x,
    mix(aStart.y, aEnd.y, fraction),
    aStart.z + reach * way.y
  );
}

void main() {
  // The chord subtends half the sweep at each end, so sin(sweep / 2) is the curvature
  // times half the chord. This is the reading the data layer writes.
  float chord = length(aEnd.xz - aStart.xz);
  float sweep = 0.0;
  if (abs(aCurvature) > STRAIGHT_CURVATURE && chord > 0.0) {
    sweep = 2.0 * asin(clamp(aCurvature * chord * 0.5, -1.0, 1.0));
  }

  int count = max(uSubCount, 1);
  int index = count > 1 ? gl_InstanceID % count : 0;
  float stride = 1.0 / float(count);
  vec3 from = arcPoint(sweep, float(index) * stride);
  vec3 to = arcPoint(sweep, float(index + 1) * stride);

  vec4 near = uViewProjection * vec4(uChunkOffset + from, 1.0);
  vec4 far = uViewProjection * vec4(uChunkOffset + to, 1.0);

  // The pass makes the screen positions itself, so it must clip the sub-chord at the
  // near plane itself as well. A point behind the near plane has z + w below zero,
  // and it would otherwise project to the wrong side of the screen.
  float nearSide = near.z + near.w;
  float farSide = far.z + far.w;
  if (nearSide <= 0.0 && farSide <= 0.0) {
    // The whole sub-chord sits behind the near plane. A position outside the clip cube
    // draws nothing.
    vStart = vec2(0.0);
    vEnd = vec2(0.0);
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  if (nearSide <= 0.0) {
    near = mix(near, far, min(nearSide / (nearSide - farSide) + 0.001, 1.0));
  } else if (farSide <= 0.0) {
    far = mix(far, near, min(farSide / (farSide - nearSide) + 0.001, 1.0));
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
