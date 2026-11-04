import type { Dec } from '../../domain';

/**
 * Fixed 2-decimal string (half-up). The domain never rounds (D9); the HTTP layer does it once,
 * for display. Money and percentages leave the API as strings, never as floats.
 */
export function formatDecimal(value: Dec): string {
  const text = value.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}

export function formatDecimalOrNull(value: Dec | null): string | null {
  return value === null ? null : formatDecimal(value);
}
