import { costBasis } from './average-cost';
import { order, SEED_ORDERS_USER_1 } from './seed-orders.fixture';

const at = (minute: number) => new Date(Date.UTC(2023, 6, 12, 10, minute));
const buy = (size: number, price: string, minute: number, id?: number) =>
  order({ side: 'BUY', size, price, datetime: at(minute), ...(id ? { id } : {}) });
const sell = (size: number, minute: number) =>
  order({ side: 'SELL', size, price: '1', datetime: at(minute) });

describe('costBasis', () => {
  it('weights purchases by quantity', () => {
    const result = costBasis([buy(10, '100', 0), buy(10, '200', 1)], 47);
    expect(result.quantity).toBe(20);
    expect(result.averageCost?.toFixed(2)).toBe('150.00');
  });

  it('keeps full precision for repeating averages', () => {
    const result = costBasis([buy(1, '100', 0), buy(2, '101', 1)], 47);
    expect(result.averageCost?.toFixed(6)).toBe('100.666667');
  });

  it('keeps the average on a sale', () => {
    const result = costBasis([buy(10, '100', 0), buy(10, '200', 1), sell(5, 2)], 47);
    expect(result.quantity).toBe(15);
    expect(result.averageCost?.toFixed(2)).toBe('150.00');
  });

  it('resets when the quantity reaches zero and starts over on the next purchase', () => {
    const closed = costBasis([buy(10, '100', 0), sell(10, 1)], 47);
    expect(closed).toEqual({ quantity: 0, averageCost: null });
    const reopened = costBasis([buy(10, '100', 0), sell(10, 1), buy(4, '300', 2)], 47);
    expect(reopened.quantity).toBe(4);
    expect(reopened.averageCost?.toFixed(2)).toBe('300.00');
  });

  it('returns null when the quantity is negative', () => {
    expect(costBasis([buy(20, '10', 0), sell(30, 1)], 47)).toEqual({
      quantity: -10,
      averageCost: null,
    });
  });

  it('uses the price of the purchase that turns a negative quantity positive', () => {
    const result = costBasis([buy(20, '10', 0), sell(30, 1), buy(15, '50', 2)], 47);
    expect(result.quantity).toBe(5);
    expect(result.averageCost?.toFixed(2)).toBe('50.00');
  });

  it('stays null if the purchase does not cover the shortfall', () => {
    const result = costBasis([buy(20, '10', 0), sell(30, 1), buy(5, '50', 2)], 47);
    expect(result).toEqual({ quantity: -5, averageCost: null });
  });

  it('walks orders by datetime then id regardless of input order', () => {
    const sameTime = new Date(Date.UTC(2023, 6, 12, 10, 0));
    const first = order({ id: 1, side: 'BUY', size: 10, price: '100', datetime: sameTime });
    const second = order({ id: 2, side: 'SELL', size: 10, price: '1', datetime: sameTime });
    // Sale after purchase by id: quantity 0. Reversed (sale first) would leave +10 @ 100.
    expect(costBasis([second, first], 47)).toEqual({ quantity: 0, averageCost: null });
  });

  it('ignores non-FILLED orders, other instruments and cash movements', () => {
    const orders = [
      buy(10, '100', 0),
      order({ side: 'BUY', size: 99, price: '1', status: 'NEW', type: 'LIMIT' }),
      order({ side: 'BUY', size: 99, price: '1', instrumentId: 1 }),
      order({ side: 'CASH_IN', size: 99, price: '1' }),
    ];
    const result = costBasis(orders, 47);
    expect(result.quantity).toBe(10);
    expect(result.averageCost?.toFixed(2)).toBe('100.00');
  });

  it('matches the seed: instrument 47 @ 930, instrument 54 @ 250, instrument 31 null', () => {
    expect(costBasis(SEED_ORDERS_USER_1, 47).averageCost?.toFixed(2)).toBe('930.00');
    expect(costBasis(SEED_ORDERS_USER_1, 54).averageCost?.toFixed(2)).toBe('250.00');
    expect(costBasis(SEED_ORDERS_USER_1, 31)).toEqual({ quantity: -10, averageCost: null });
  });
});
