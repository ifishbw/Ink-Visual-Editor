/** Distinct hues for file color-coding; the sidecar can override per file. */
const PALETTE = ['#3f7fd6', '#d9822b', '#2f9e63', '#b455c9', '#d34f63', '#1fa3a3', '#a68f1f', '#6f62d9', '#d3588f', '#5e9b33'];

export const MISSING_COLOR = '#c0392b';

export function assignFileColors(paths: string[], overrides: Record<string, { color?: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  paths.forEach((p, i) => {
    out[p] = overrides[p]?.color ?? PALETTE[i % PALETTE.length]!;
  });
  return out;
}
