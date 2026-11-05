import { formatDecimal, formatDecimalOrNull } from '../common/presentation/format';
import type { Portfolio } from '../domain';
import type { Instrument } from '../instruments/instruments.repository';

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
  availableAmount: string;
  committedAmount: string;
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
    availableAmount: formatDecimal(portfolio.availableAmount),
    committedAmount: formatDecimal(portfolio.committedAmount),
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
