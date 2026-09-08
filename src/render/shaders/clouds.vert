#version 300 es
// Draws one large soft quad per cloud sample. The quad is an instance over four
// corners, because a point sprite is discarded whole when its centre leaves the clip
// volume, and a sprite this large would then pop at the edge of the frame.
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aTint;
layout(location = 2) in vec2 aCorner;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform vec2 uTargetSize;
uniform float uSpriteScale;
uniform float uMaxRadius;
uniform float uMaxGain;
uniform float uBrightness;
uniform float uFade;

out vec2 vCorner;
out float vTint;
out float vBrightness;

void main() {
  vec3 relative = uChunkOffset + aPosition;
  float range = max(length(relative), 1.0);
  float wanted = uSpriteScale / range;
  float drawn = min(wanted, uMaxRadius);

  vec4 clip = uViewProjection * vec4(relative, 1.0);
  if (clip.w <= 0.0) {
    // Behind the camera. The far plane clips this vertex away.
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vCorner = vec2(2.0);
    vTint = 0.0;
    vBrightness = 0.0;
    return;
  }
  clip.xy += aCorner * (2.0 * drawn * clip.w) / uTargetSize;
  gl_Position = clip;

  vCorner = aCorner;
  vTint = aTint;
  // The cap keeps the total light of the sprite: a sprite drawn smaller than it
  // wants is brighter by the square of the ratio of the two radii. The gain bound
  // stops that ratio near the camera, where it would otherwise pass the range of a
  // 16-bit float target and turn the whole glow into a flat wash.
  float gain = min((wanted * wanted) / (drawn * drawn), uMaxGain);
  vBrightness = uBrightness * uFade * gain;
}
