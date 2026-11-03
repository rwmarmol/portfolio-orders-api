import { costBasis } from './average-cost';
import { D, Dec } from './decimal';
import { MissingMarketDataError } from './errors';
import { committedPesos, filledCash, openPositions } from './ledger';
import { dailyReturnPct, totalReturnPct } from './returns';
import type { MarketQuote, OrderRecord } from './types';

export interface PositionView {
  instrumentId: number;
  quantity: number;
  marketValue: Dec;
  averageCost: Dec | null;
  dailyReturnPct: Dec | null;
  totalReturnPct: Dec | null;
}

export interface Portfolio {
  /** FILLED cash. */
  availablePesos: Dec;
  /** Pesos committed by NEW LIMIT BUY orders. */
  committedPesos: Dec;
  /** availablePesos plus the market value of all positions. */
  totalValue: Dec;
  positions: PositionView[];
}

/**
 * Builds a user's portfolio from their orders and the latest quote per instrument. Negative
 * positions are shown as computed (Q10), so they reduce the total value. Throws
 * MissingMarketDataError rather than silently under-reporting a position.
 */
export function buildPortfolio(
  orders: readonly OrderRecord[],
  quotes: ReadonlyMap<number, MarketQuote>,
): Portfolio {
  const availablePesos = filledCash(orders);
  let totalValue = availablePesos;

  const positions = openPositions(orders).map(({ instrumentId, quantity }) => {
    const quote = quotes.get(instrumentId);
    if (quote === undefined) throw new MissingMarketDataError(instrumentId);
    const marketValue = new D(quote.close).times(quantity);
    totalValue = totalValue.plus(marketValue);
    const { averageCost } = costBasis(orders, instrumentId);
    return {
      instrumentId,
      quantity,
      marketValue,
      averageCost,
      dailyReturnPct: dailyReturnPct(quote.close, quote.previousClose),
      totalReturnPct: totalReturnPct(quote.close, averageCost),
    };
  });

  return { availablePesos, committedPesos: committedPesos(orders), totalValue, positions };
}
