#version 300 es
// The coordinate grid draws one full-screen triangle. The plane, the levels and the
// lines are all worked out for each fragment, so no line is a vertex.
precision highp float;

out vec2 vNdc;

void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = corner;
  gl_Position = vec4(corner, 0.0, 1.0);
}
