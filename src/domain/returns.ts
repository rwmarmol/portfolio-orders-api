import { D, Dec, DecValue } from './decimal';

/** Daily return in percent: (close - previousClose) / previousClose * 100. */
export function dailyReturnPct(close: DecValue, previousClose: DecValue | null): Dec | null {
  if (previousClose === null) return null;
  const previous = new D(previousClose);
  if (previous.isZero()) return null;
  return new D(close).minus(previous).div(previous).times(100);
}

/** Total return in percent against the average cost: (close - average) / average * 100. */
export function totalReturnPct(close: DecValue, averageCost: Dec | null): Dec | null {
  if (averageCost === null || averageCost.isZero()) return null;
  return new D(close).minus(averageCost).div(averageCost).times(100);
}
