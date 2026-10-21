/**
 * Red (weak) through orange and yellow to green and dark teal-green (strong),
 * the convention buyer's agents use on suburb heat maps.
 */
export const RAMP: [number, string][] = [
  [0, '#c8463a'],
  [0.25, '#e6924a'],
  [0.5, '#e4d07c'],
  [0.75, '#7fb26c'],
  [1, '#127a74'],
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
