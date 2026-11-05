import { costBasis } from './average-cost';
import { D, Dec } from './decimal';
import { committedAmount, filledCash, openPositions } from './ledger';
import { dailyReturnPct, totalReturnPct } from './returns';
import type { MarketQuote, OrderRecord } from './types';

export interface PositionView {
  instrumentId: number;
  quantity: number;
  /** Null when the instrument has no market data. */
  marketValue: Dec | null;
  averageCost: Dec | null;
  /** Null when the instrument has no market data (or no usable previous close). */
  dailyReturnPct: Dec | null;
  /** Null when the instrument has no market data or no average cost. */
  totalReturnPct: Dec | null;
}

export interface Portfolio {
  /** FILLED cash. */
  availableAmount: Dec;
  /** Funds committed by NEW LIMIT BUY orders. */
  committedAmount: Dec;
  /** availableAmount plus the market value of the positions that have a price. */
  totalValue: Dec;
  /** True when at least one position has no market data and is left out of `totalValue`. */
  totalIsPartial: boolean;
  positions: PositionView[];
}

export interface BuildPortfolioOptions {
  /**
   * Called once per position without market data. The domain stays free of logging imports:
   * callers pass a function that logs a warning with the instrument id.
   */
  onMissingMarketData?: (instrumentId: number) => void;
}

/**
 * Builds a user's portfolio from their orders and the latest quote per instrument. Negative
 * positions are shown as computed (Q10), so they reduce the total value. A position without
 * market data is still returned, with null market value and returns; it is left out of the
 * total and `totalIsPartial` is set (D9).
 */
export function buildPortfolio(
  orders: readonly OrderRecord[],
  quotes: ReadonlyMap<number, MarketQuote>,
  { onMissingMarketData }: BuildPortfolioOptions = {},
): Portfolio {
  const availableAmount = filledCash(orders);
  let totalValue = availableAmount;
  let totalIsPartial = false;

  const positions = openPositions(orders).map(({ instrumentId, quantity }): PositionView => {
    const { averageCost } = costBasis(orders, instrumentId);
    const quote = quotes.get(instrumentId);
    if (quote === undefined) {
      totalIsPartial = true;
      onMissingMarketData?.(instrumentId);
      return {
        instrumentId,
        quantity,
        marketValue: null,
        averageCost,
        dailyReturnPct: null,
        totalReturnPct: null,
      };
    }
    const marketValue = new D(quote.close).times(quantity);
    totalValue = totalValue.plus(marketValue);
    return {
      instrumentId,
      quantity,
      marketValue,
      averageCost,
      dailyReturnPct: dailyReturnPct(quote.close, quote.previousClose),
      totalReturnPct: totalReturnPct(quote.close, averageCost),
    };
  });

  return {
    availableAmount,
    committedAmount: committedAmount(orders),
    totalValue,
    totalIsPartial,
    positions,
  };
}
