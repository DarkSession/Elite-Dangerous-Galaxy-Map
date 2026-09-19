#version 300 es
// One triangle over the screen, for the nebula composite.
precision highp float;

out vec2 vTexture;

void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vTexture = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
