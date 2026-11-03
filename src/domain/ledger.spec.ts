import {
  buyablePesos,
  committedPesos,
  committedShares,
  filledCash,
  netQuantities,
  openPositions,
  sellableShares,
} from './ledger';
import { order, SEED_ORDERS_USER_1 } from './seed-orders.fixture';

describe('ledger with the seed data of user 1', () => {
  it('computes available pesos from FILLED movements only (reference value 753,000)', () => {
    expect(filledCash(SEED_ORDERS_USER_1).toFixed(2)).toBe('753000.00');
  });

  it('computes reference positions, keeping the negative one and dropping CANCELLED/REJECTED', () => {
    expect(netQuantities(SEED_ORDERS_USER_1).get(47)).toBe(40);
    expect(netQuantities(SEED_ORDERS_USER_1).get(31)).toBe(-10);
    expect(netQuantities(SEED_ORDERS_USER_1).get(54)).toBe(500);
    expect(openPositions(SEED_ORDERS_USER_1)).toEqual([
      { instrumentId: 31, quantity: -10 },
      { instrumentId: 47, quantity: 40 },
      { instrumentId: 54, quantity: 500 },
    ]);
  });

  it('commits pesos for NEW LIMIT BUY orders and nets them from the buyable balance', () => {
    expect(committedPesos(SEED_ORDERS_USER_1).toFixed(2)).toBe('125500.00');
    expect(buyablePesos(SEED_ORDERS_USER_1).toFixed(2)).toBe('627500.00');
  });

  it('does not commit shares for BUY orders and nets NEW LIMIT SELL from sellable shares', () => {
    expect(committedShares(SEED_ORDERS_USER_1, 47)).toBe(0);
    expect(sellableShares(SEED_ORDERS_USER_1, 47)).toBe(40);
    const withSell = [
      ...SEED_ORDERS_USER_1,
      order({ instrumentId: 47, side: 'SELL', type: 'LIMIT', status: 'NEW', size: 15 }),
    ];
    expect(sellableShares(withSell, 47)).toBe(25);
  });
});

describe('ledger edge cases', () => {
  it('returns zero for no orders', () => {
    expect(filledCash([]).toFixed(2)).toBe('0.00');
    expect(openPositions([])).toEqual([]);
  });

  it('omits positions that net to zero', () => {
    const orders = [order({ side: 'BUY', size: 5 }), order({ side: 'SELL', size: 5 })];
    expect(openPositions(orders)).toEqual([]);
  });

  it('is exact with decimal prices (no float drift)', () => {
    const orders = Array.from({ length: 10 }, () =>
      order({ side: 'CASH_IN', instrumentId: 66, size: 1, price: '0.10' }),
    );
    expect(filledCash(orders).toFixed(2)).toBe('1.00');
  });
});
