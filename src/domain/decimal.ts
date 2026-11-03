import { Decimal } from 'decimal.js';

/**
 * Decimal constructor used for all money and percentage math. Precision is generous so that
 * intermediate results (e.g. moving averages) do not accumulate visible rounding error.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Dec = Decimal;
export type DecValue = Decimal.Value;
