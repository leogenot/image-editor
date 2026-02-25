export const PRESETS = [
  {
    id: 'vivid',
    name: 'VIVID',
    light: { exposure: 0.15, contrast: 0.25, highlights: -0.15, shadows: 0.1, whites: 0.1, blacks: -0.1 },
    color: { temp: 0.1, tint: 0, vibrance: 0.5, saturation: 0.2 },
  },
  {
    id: 'matte',
    name: 'MATTE',
    light: { exposure: 0.05, contrast: -0.35, highlights: -0.25, shadows: 0.3, whites: -0.2, blacks: 0.25 },
    color: { temp: 0, tint: 0, vibrance: -0.1, saturation: -0.15 },
  },
  {
    id: 'mono',
    name: 'MONO',
    light: { exposure: 0.1, contrast: 0.2, highlights: -0.1, shadows: 0.15, whites: 0, blacks: 0 },
    color: { temp: 0, tint: 0, vibrance: 0, saturation: -1 },
  },
  {
    id: 'warm',
    name: 'WARM',
    light: { exposure: 0.1, contrast: 0.1, highlights: -0.1, shadows: 0.1, whites: 0, blacks: 0 },
    color: { temp: 0.45, tint: 0.08, vibrance: 0.2, saturation: 0.1 },
  },
  {
    id: 'cool',
    name: 'COOL',
    light: { exposure: 0.05, contrast: 0.1, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    color: { temp: -0.45, tint: -0.08, vibrance: 0.1, saturation: 0 },
  },
  {
    id: 'faded',
    name: 'FADED',
    light: { exposure: 0.2, contrast: -0.4, highlights: -0.2, shadows: 0.35, whites: -0.15, blacks: 0.3 },
    color: { temp: 0.08, tint: 0, vibrance: -0.2, saturation: -0.25 },
  },
  {
    id: 'haze',
    name: 'HAZE',
    light: { exposure: 0.3, contrast: -0.2, highlights: -0.1, shadows: 0.2, whites: 0.1, blacks: 0.15 },
    color: { temp: 0.15, tint: 0.05, vibrance: -0.1, saturation: -0.1 },
  },
  {
    id: 'punch',
    name: 'PUNCH',
    light: { exposure: 0, contrast: 0.4, highlights: -0.2, shadows: -0.1, whites: 0.15, blacks: -0.2 },
    color: { temp: 0.05, tint: 0, vibrance: 0.4, saturation: 0.3 },
  },
  {
    id: 'dusk',
    name: 'DUSK',
    light: { exposure: -0.2, contrast: 0.15, highlights: -0.3, shadows: 0.1, whites: -0.1, blacks: -0.1 },
    color: { temp: 0.3, tint: 0.15, vibrance: 0.15, saturation: 0.05 },
  },
]
