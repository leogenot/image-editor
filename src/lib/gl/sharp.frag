#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_sharpness;
uniform float u_noiseReduction;

void main() {
  vec2 uv = v_texCoord;
  vec4 center = texture(u_texture, uv);

  // 3x3 bilateral blur (noise reduction)
  vec4 blurSum = vec4(0.0);
  float weightSum = 0.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * u_texelSize;
      vec4 s = texture(u_texture, uv + offset);
      // Weight by color similarity (bilateral)
      float colorDist = dot(s.rgb - center.rgb, s.rgb - center.rgb);
      float w = exp(-colorDist / 0.04); // sigma^2 = 0.04
      blurSum += s * w;
      weightSum += w;
    }
  }
  vec4 blurred = blurSum / weightSum;

  // Noise reduction: blend toward blurred
  vec4 denoised = mix(center, blurred, u_noiseReduction * 0.8);

  // Sharpening: unsharp mask
  vec4 sharpened = denoised + (denoised - blurred) * (u_sharpness * 2.5);

  outColor = clamp(sharpened, 0.0, 1.0);
}
