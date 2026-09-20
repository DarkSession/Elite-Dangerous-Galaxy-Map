#version 300 es
// One triangle over the screen. It gives every pixel the ray that leaves the camera.
precision highp float;

uniform mat4 uInverseViewProjection;

out vec3 vRay;

void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(corner, 0.0, 1.0);

  vec4 near = uInverseViewProjection * vec4(corner, -1.0, 1.0);
  vec4 far = uInverseViewProjection * vec4(corner, 1.0, 1.0);
  vRay = far.xyz / far.w - near.xyz / near.w;
}
