/**
 * Perceptually even, colour-blind-safe sequential ramp (viridis family,
 * trimmed at the dark end so it sits calmly on a light basemap).
 */
export const RAMP: [number, string][] = [
  [0, '#3b2f6b'],
  [0.2, '#3c5a92'],
  [0.4, '#2f8790'],
  [0.6, '#3daa7c'],
  [0.8, '#97c95a'],
  [1, '#f2e14c'],
];

export const NO_DATA = '#c9c6bd';

export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    const [t0, c0] = RAMP[i - 1];
    if (x <= t1) return mix(c0, c1, (x - t0) / (t1 - t0));
  }
  return RAMP[RAMP.length - 1][1];
}

export function rampGradientCss(): string {
  return `linear-gradient(90deg, ${RAMP.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
