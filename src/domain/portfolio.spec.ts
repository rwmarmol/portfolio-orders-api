import { MissingMarketDataError } from './errors';
import { latestQuotes } from './market-data';
import { buildPortfolio } from './portfolio';
import { SEED_ORDERS_USER_1 } from './seed-orders.fixture';
import type { MarketQuote } from './types';

const quote = (instrumentId: number, close: string, previousClose: string): MarketQuote => ({
  instrumentId,
  date: '2023-07-14',
  close,
  previousClose,
});

describe('buildPortfolio', () => {
  const quotes = latestQuotes([
    quote(47, '1000', '950'),
    quote(31, '1500', '1450'),
    quote(54, '260', '250'),
  ]);

  it('builds the portfolio of user 1 from the seed', () => {
    const portfolio = buildPortfolio(SEED_ORDERS_USER_1, quotes);

    expect(portfolio.availablePesos.toFixed(2)).toBe('753000.00');
    expect(portfolio.committedPesos.toFixed(2)).toBe('125500.00');
    // 753,000 + (-10 * 1500) + (40 * 1000) + (500 * 260)
    expect(portfolio.totalValue.toFixed(2)).toBe('908000.00');

    const byInstrument = new Map(portfolio.positions.map((p) => [p.instrumentId, p]));
    expect([...byInstrument.keys()]).toEqual([31, 47, 54]);

    const p47 = byInstrument.get(47);
    expect(p47?.quantity).toBe(40);
    expect(p47?.marketValue.toFixed(2)).toBe('40000.00');
    expect(p47?.dailyReturnPct?.toFixed(4)).toBe('5.2632');
    expect(p47?.totalReturnPct?.toFixed(4)).toBe('7.5269');

    const p31 = byInstrument.get(31);
    expect(p31?.quantity).toBe(-10);
    expect(p31?.marketValue.toFixed(2)).toBe('-15000.00');
    expect(p31?.totalReturnPct).toBeNull();

    expect(byInstrument.get(54)?.totalReturnPct?.toFixed(2)).toBe('4.00');
  });

  it('returns only pesos for a user without orders', () => {
    const portfolio = buildPortfolio([], quotes);
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.totalValue.toFixed(2)).toBe('0.00');
  });

  it('fails instead of under-reporting when a position has no market data', () => {
    expect(() =>
      buildPortfolio(SEED_ORDERS_USER_1, latestQuotes([quote(47, '1000', '950')])),
    ).toThrow(MissingMarketDataError);
  });
});
