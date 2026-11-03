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
    expect(p47?.marketValue?.toFixed(2)).toBe('40000.00');
    expect(p47?.dailyReturnPct?.toFixed(4)).toBe('5.2632');
    expect(p47?.totalReturnPct?.toFixed(4)).toBe('7.5269');

    const p31 = byInstrument.get(31);
    expect(p31?.quantity).toBe(-10);
    expect(p31?.marketValue?.toFixed(2)).toBe('-15000.00');
    expect(p31?.totalReturnPct).toBeNull();

    expect(byInstrument.get(54)?.totalReturnPct?.toFixed(2)).toBe('4.00');
  });

  it('returns only pesos for a user without orders', () => {
    const portfolio = buildPortfolio([], quotes);
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.totalValue.toFixed(2)).toBe('0.00');
    expect(portfolio.totalIsPartial).toBe(false);
  });

  it('flags the total as complete and does not warn when every position has a price', () => {
    const onMissingMarketData = jest.fn();
    const portfolio = buildPortfolio(SEED_ORDERS_USER_1, quotes, { onMissingMarketData });
    expect(portfolio.totalIsPartial).toBe(false);
    expect(onMissingMarketData).not.toHaveBeenCalled();
  });

  it('keeps a position without market data, leaves it out of the total and flags it', () => {
    const onMissingMarketData = jest.fn();
    // Instrument 54 (500 shares, 130,000 at 260) has no quote.
    const withoutOne = latestQuotes([quote(47, '1000', '950'), quote(31, '1500', '1450')]);
    const portfolio = buildPortfolio(SEED_ORDERS_USER_1, withoutOne, { onMissingMarketData });

    expect(portfolio.totalIsPartial).toBe(true);
    // 753,000 + (-10 * 1500) + (40 * 1000); instrument 54 is excluded.
    expect(portfolio.totalValue.toFixed(2)).toBe('778000.00');

    const p54 = portfolio.positions.find((p) => p.instrumentId === 54);
    expect(p54).toMatchObject({
      quantity: 500,
      marketValue: null,
      dailyReturnPct: null,
      totalReturnPct: null,
    });
    expect(p54?.averageCost?.toFixed(2)).toBe('250.00');
    expect(portfolio.positions).toHaveLength(3);

    expect(onMissingMarketData).toHaveBeenCalledTimes(1);
    expect(onMissingMarketData).toHaveBeenCalledWith(54);
  });

  it('works without a callback when market data is missing', () => {
    const portfolio = buildPortfolio(SEED_ORDERS_USER_1, latestQuotes([]));
    expect(portfolio.totalIsPartial).toBe(true);
    expect(portfolio.totalValue.toFixed(2)).toBe('753000.00');
    expect(portfolio.positions.every((p) => p.marketValue === null)).toBe(true);
  });
});
