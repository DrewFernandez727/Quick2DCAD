export type UnitSystem = 'mm' | 'cm' | 'm' | 'in' | 'ft';

// Conversion factor: model units (mm) → display units
const UNIT_TO_MM: Record<UnitSystem, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export const UNIT_LABELS: Record<UnitSystem, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
};

/** Convert from internal mm to display units */
export function toDisplay(mmValue: number, units: UnitSystem): number {
  return mmValue / UNIT_TO_MM[units];
}

/** Convert from display units back to internal mm */
export function fromDisplay(displayValue: number, units: UnitSystem): number {
  return displayValue * UNIT_TO_MM[units];
}

/** Format a length value (in mm) for display with appropriate precision */
export function formatLength(mmValue: number, units: UnitSystem): string {
  const v = toDisplay(mmValue, units);
  switch (units) {
    case 'mm': return `${v.toFixed(2)}mm`;
    case 'cm': return `${v.toFixed(3)}cm`;
    case 'm':  return `${v.toFixed(4)}m`;
    case 'in': return `${v.toFixed(3)}"`;
    case 'ft': return `${v.toFixed(4)}'`;
  }
}

/** Format an angle (degrees) */
export function formatAngle(deg: number): string {
  return `${deg.toFixed(1)}°`;
}
