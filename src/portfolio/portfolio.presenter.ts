import { formatDecimal, formatDecimalOrNull } from '../common/presentation/format';
import type { Portfolio } from '../domain';
import type { Instrument } from '../instruments/instruments.repository';

/** Prices and balances are always in pesos (the cash instrument is ARS). */
export const ACCOUNT_CURRENCY = 'ARS';

export interface PositionResponse {
  instrumentId: number;
  ticker: string | null;
  name: string | null;
  quantity: number;
  marketValue: string | null;
  averageCost: string | null;
  dailyReturnPct: string | null;
  totalReturnPct: string | null;
}

export interface PortfolioResponse {
  userId: number;
  currency: string;
  availableAmount: string;
  committedAmount: string;
  buyableAmount: string;
  totalValue: string;
  totalIsPartial: boolean;
  positions: PositionResponse[];
}

export function presentPortfolio(
  userId: number,
  portfolio: Portfolio,
  instruments: ReadonlyMap<number, Instrument>,
): PortfolioResponse {
  return {
    userId,
    currency: ACCOUNT_CURRENCY,
    availableAmount: formatDecimal(portfolio.availableAmount),
    committedAmount: formatDecimal(portfolio.committedAmount),
    buyableAmount: formatDecimal(portfolio.buyableAmount),
    totalValue: formatDecimal(portfolio.totalValue),
    totalIsPartial: portfolio.totalIsPartial,
    positions: portfolio.positions.map((position) => {
      const instrument = instruments.get(position.instrumentId);
      return {
        instrumentId: position.instrumentId,
        ticker: instrument?.ticker ?? null,
        name: instrument?.name ?? null,
        quantity: position.quantity,
        marketValue: formatDecimalOrNull(position.marketValue),
        averageCost: formatDecimalOrNull(position.averageCost),
        dailyReturnPct: formatDecimalOrNull(position.dailyReturnPct),
        totalReturnPct: formatDecimalOrNull(position.totalReturnPct),
      };
    }),
  };
}
