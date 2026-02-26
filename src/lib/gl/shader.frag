#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform bool u_isFloat;

uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;

uniform float u_temp;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;

uniform vec3 u_hsl[8];

uniform sampler2D u_curveLUT_r;
uniform sampler2D u_curveLUT_g;
uniform sampler2D u_curveLUT_b;
uniform bool u_useCurve;

uniform float u_angle;       // radians, positive = CCW
uniform float u_aspectRatio; // canvas width / height

uniform float u_grain;
uniform float u_grainSize;     // 1.0 to 8.0 — higher = coarser
uniform float u_borderThickness; // 0 to 0.15, fraction of shorter crop dimension
uniform vec3  u_borderColor;
uniform float u_cropX;
uniform float u_cropY;
uniform float u_cropW;
uniform float u_cropH;

float grainHash(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 linearToSrgb(vec3 c) {
  return mix(
    12.92 * c,
    1.055 * pow(max(c, vec3(0.0001)), vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), c)
  );
}

vec3 srgbToLinear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(vec3(0.04045), c)
  );
}

vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float delta = maxC - minC;
  float l = (maxC + minC) * 0.5;
  float s = delta < 0.0001 ? 0.0 : delta / (1.0 - abs(2.0 * l - 1.0));
  float h = 0.0;
  if (delta > 0.0001) {
    if (maxC == c.r)      h = mod((c.g - c.b) / delta, 6.0);
    else if (maxC == c.g) h = (c.b - c.r) / delta + 2.0;
    else                  h = (c.r - c.g) / delta + 4.0;
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }
  return vec3(h, s, l);
}

vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  float c2 = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c2 * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c2 * 0.5;
  vec3 rgb;
  float hi = floor(h * 6.0);
  if      (hi == 0.0) rgb = vec3(c2, x, 0.0);
  else if (hi == 1.0) rgb = vec3(x, c2, 0.0);
  else if (hi == 2.0) rgb = vec3(0.0, c2, x);
  else if (hi == 3.0) rgb = vec3(0.0, x, c2);
  else if (hi == 4.0) rgb = vec3(x, 0.0, c2);
  else                rgb = vec3(c2, 0.0, x);
  return rgb + m;
}

float hueMask(float h, float center, float width) {
  float d = abs(h - center);
  if (d > 0.5) d = 1.0 - d;
  return smoothstep(width, 0.0, d);
}

void main() {
  vec2 tc = v_texCoord;

  // Border: drawn relative to the crop region, equal pixel width on all sides
  if (u_borderThickness > 0.001) {
    // Convert fragment UV to crop-relative space [0, 1]
    float relX = (tc.x - u_cropX) / u_cropW;
    float relY = (tc.y - u_cropY) / u_cropH;

    // Only apply border logic within the crop region
    if (relX >= 0.0 && relX <= 1.0 && relY >= 0.0 && relY <= 1.0) {
      // Pixel aspect ratio of the crop region
      float cropAr = (u_cropW / u_cropH) * u_aspectRatio;

      // Equal-pixel-width border in crop-relative UV
      float tx = cropAr >= 1.0 ? u_borderThickness / cropAr : u_borderThickness;
      float ty = cropAr >= 1.0 ? u_borderThickness : u_borderThickness * cropAr;

      if (relX < tx || relX > 1.0 - tx || relY < ty || relY > 1.0 - ty) {
        outColor = vec4(u_borderColor, 1.0);
        return;
      }

      // Remap to scale the crop content down inside the border
      float innerRelX = (relX - tx) / (1.0 - 2.0 * tx);
      float innerRelY = (relY - ty) / (1.0 - 2.0 * ty);
      tc.x = u_cropX + innerRelX * u_cropW;
      tc.y = u_cropY + innerRelY * u_cropH;
    }
  }

  // Straighten rotation — rotate UV around image center
  if (abs(u_angle) > 0.0001) {
    tc -= 0.5;
    float cosA = cos(u_angle);
    float sinA = sin(u_angle);
    tc.x *= u_aspectRatio;
    tc = vec2(cosA * tc.x - sinA * tc.y, sinA * tc.x + cosA * tc.y);
    tc.x /= u_aspectRatio;
    tc += 0.5;
    // Out-of-bounds pixels = black
    if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  vec4 texel = texture(u_texture, tc);
  vec3 color = texel.rgb;

  if (!u_isFloat) {
    color = srgbToLinear(color);
  }

  color *= pow(2.0, u_exposure);

  if (abs(u_contrast) > 0.001) {
    float mid = 0.18;
    float factor = 1.0 + u_contrast;
    color = pow(max(color / mid, vec3(0.0001)), vec3(factor)) * mid;
  }

  float L = luma(color);
  color += u_highlights * 0.5 * smoothstep(0.3, 0.8, L);
  color += u_shadows    * 0.3 * (1.0 - smoothstep(0.1, 0.6, L));
  color += u_whites     * 0.4 * smoothstep(0.5, 0.9, L);
  color += u_blacks     * 0.2 * (1.0 - smoothstep(0.0, 0.3, L));
  color = max(color, vec3(0.0));

  color.r += u_temp * 0.15;
  color.b -= u_temp * 0.15;
  color.g -= u_tint * 0.1;
  color = max(color, vec3(0.0));

  float centers[8];
  centers[0] = 0.0;
  centers[1] = 0.08;
  centers[2] = 0.17;
  centers[3] = 0.33;
  centers[4] = 0.50;
  centers[5] = 0.61;
  centers[6] = 0.75;
  centers[7] = 0.88;

  vec3 hsl = rgbToHsl(color);
  for (int i = 0; i < 8; i++) {
    float mask = hueMask(hsl.x, centers[i], 0.1);
    if (mask > 0.001) {
      hsl.x = fract(hsl.x + u_hsl[i].x * mask * 0.1);
      hsl.y = clamp(hsl.y + u_hsl[i].y * mask * 0.5, 0.0, 1.0);
      hsl.z = clamp(hsl.z + u_hsl[i].z * mask * 0.5, 0.0, 1.0);
    }
  }
  color = hslToRgb(hsl);

  {
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float sat = maxC - minC;
    float vibranceAmount = u_vibrance * (1.0 - sat);
    float L2 = luma(color);
    color = mix(vec3(L2), color, 1.0 + vibranceAmount);
    color = max(color, vec3(0.0));
  }

  if (abs(u_saturation) > 0.001) {
    float L2 = luma(color);
    color = mix(vec3(L2), color, 1.0 + u_saturation);
    color = max(color, vec3(0.0));
  }

  if (u_useCurve) {
    color.r = texture(u_curveLUT_r, vec2(color.r, 0.5)).r;
    color.g = texture(u_curveLUT_g, vec2(color.g, 0.5)).g;
    color.b = texture(u_curveLUT_b, vec2(color.b, 0.5)).b;
  }

  color = aces(color);
  color = linearToSrgb(color);

  // Film grain — static noise based on original UV, applied in sRGB space
  if (u_grain > 0.001) {
    vec2 noiseCoord = floor(v_texCoord * 512.0 / u_grainSize);
    float noise = grainHash(noiseCoord) * 2.0 - 1.0;
    color += vec3(noise * u_grain * 0.15);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
