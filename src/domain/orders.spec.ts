import { InvalidOrderInputError } from './errors';
import {
  assertTradable,
  evaluateOrder,
  orderMatchesRequest,
  REJECTION_MESSAGES,
  rejectionReasonOf,
  resolveQuantity,
} from './orders';

describe('resolveQuantity', () => {
  it('uses an exact quantity', () => {
    expect(resolveQuantity({ quantity: 7, price: '10' })).toBe(7);
  });

  it('derives the maximum whole number of shares from an amount', () => {
    expect(resolveQuantity({ amount: '1000', price: '300' })).toBe(3);
    expect(resolveQuantity({ amount: '0.30', price: '0.10' })).toBe(3); // no float drift
  });

  it.each([
    ['both given', { quantity: 1, amount: '10', price: '1' }, 'QUANTITY_AND_AMOUNT'],
    ['none given', { price: '1' }, 'QUANTITY_OR_AMOUNT_REQUIRED'],
    ['amount below price', { amount: '99', price: '100' }, 'AMOUNT_BELOW_PRICE'],
    ['zero quantity', { quantity: 0, price: '1' }, 'INVALID_QUANTITY'],
    ['fractional quantity', { quantity: 1.5, price: '1' }, 'INVALID_QUANTITY'],
    ['negative amount', { amount: '-5', price: '1' }, 'INVALID_AMOUNT'],
    ['zero price', { quantity: 1, price: '0' }, 'INVALID_PRICE'],
    ['int overflow from amount', { amount: '99999999999', price: '1' }, 'QUANTITY_TOO_LARGE'],
    ['int overflow from quantity', { quantity: 2_147_483_648, price: '1' }, 'QUANTITY_TOO_LARGE'],
  ])('rejects %s', (_label, input, code) => {
    expect(() => resolveQuantity(input)).toThrow(
      expect.objectContaining({ name: InvalidOrderInputError.name, code }),
    );
  });
});

describe('assertTradable', () => {
  it('rejects the cash instrument and accepts stocks', () => {
    expect(() => assertTradable({ type: 'MONEDA' })).toThrow(InvalidOrderInputError);
    expect(() => assertTradable({ type: 'ACCIONES' })).not.toThrow();
  });
});

describe('evaluateOrder', () => {
  const base = { size: 10, price: '100', buyableAmount: '1000', sellableShares: 10 };

  it('fills a MARKET order and leaves a LIMIT order NEW', () => {
    expect(evaluateOrder({ ...base, side: 'BUY', type: 'MARKET' })).toEqual({ status: 'FILLED' });
    expect(evaluateOrder({ ...base, side: 'BUY', type: 'LIMIT' })).toEqual({ status: 'NEW' });
    expect(evaluateOrder({ ...base, side: 'SELL', type: 'MARKET' })).toEqual({ status: 'FILLED' });
  });

  it('accepts a BUY that costs exactly the buyable amount', () => {
    expect(evaluateOrder({ ...base, side: 'BUY', type: 'MARKET' }).status).toBe('FILLED');
  });

  it('rejects a BUY above the buyable amount', () => {
    expect(
      evaluateOrder({ ...base, side: 'BUY', type: 'MARKET', buyableAmount: '999.99' }),
    ).toEqual({
      status: 'REJECTED',
      reason: 'INSUFFICIENT_FUNDS',
    });
  });

  it('rejects a SELL above the sellable shares, including negative holdings', () => {
    expect(evaluateOrder({ ...base, side: 'SELL', type: 'MARKET', sellableShares: 9 })).toEqual({
      status: 'REJECTED',
      reason: 'INSUFFICIENT_HOLDINGS',
    });
    expect(
      evaluateOrder({ ...base, size: 1, side: 'SELL', type: 'MARKET', sellableShares: -10 }).status,
    ).toBe('REJECTED');
  });

  describe('without a market price (D10)', () => {
    it.each(['BUY', 'SELL'] as const)('rejects a MARKET %s with NO_MARKET_PRICE', (side) => {
      const result = evaluateOrder({ ...base, side, type: 'MARKET', price: null });
      expect(result).toEqual({ status: 'REJECTED', reason: 'NO_MARKET_PRICE' });
      expect(REJECTION_MESSAGES.NO_MARKET_PRICE).toBe('no market price available');
    });

    it('checks the price before funds and holdings', () => {
      const result = evaluateOrder({
        ...base,
        side: 'SELL',
        type: 'MARKET',
        price: null,
        sellableShares: 0,
      });
      expect(result.reason).toBe('NO_MARKET_PRICE');
    });

    it('treats a LIMIT order without a price as invalid input', () => {
      expect(() => evaluateOrder({ ...base, side: 'BUY', type: 'LIMIT', price: null })).toThrow(
        InvalidOrderInputError,
      );
    });
  });
});

describe('rejectionReasonOf', () => {
  it('derives the reason of a stored REJECTED order', () => {
    expect(rejectionReasonOf({ side: 'BUY', status: 'REJECTED', price: '10.00' })).toBe(
      'INSUFFICIENT_FUNDS',
    );
    expect(rejectionReasonOf({ side: 'SELL', status: 'REJECTED', price: '10.00' })).toBe(
      'INSUFFICIENT_HOLDINGS',
    );
    expect(rejectionReasonOf({ side: 'BUY', status: 'REJECTED', price: null })).toBe(
      'NO_MARKET_PRICE',
    );
    expect(rejectionReasonOf({ side: 'SELL', status: 'REJECTED', price: null })).toBe(
      'NO_MARKET_PRICE',
    );
  });

  it('has no reason for orders that were not rejected', () => {
    expect(rejectionReasonOf({ side: 'BUY', status: 'FILLED', price: '10.00' })).toBeUndefined();
    expect(rejectionReasonOf({ side: 'BUY', status: 'NEW', price: '10.00' })).toBeUndefined();
  });
});

describe('orderMatchesRequest', () => {
  const stored = {
    instrumentId: 47,
    side: 'BUY' as const,
    type: 'MARKET' as const,
    size: 10,
    price: '925.85',
  };
  const request = { instrumentId: 47, side: 'BUY' as const, type: 'MARKET' as const, quantity: 10 };

  it('matches the same request', () => {
    expect(orderMatchesRequest(stored, request)).toBe(true);
  });

  it.each([
    ['another instrument', { ...request, instrumentId: 31 }],
    ['another side', { ...request, side: 'SELL' as const }],
    ['another type', { ...request, type: 'LIMIT' as const, price: '925.85' }],
    ['another quantity', { ...request, quantity: 11 }],
  ])('does not match %s', (_label, other) => {
    expect(orderMatchesRequest(stored, other)).toBe(false);
  });

  it('does not compare an amount, whose quantity depended on the price of that moment', () => {
    const byAmount = { instrumentId: 47, side: 'BUY' as const, type: 'MARKET' as const };
    expect(orderMatchesRequest(stored, byAmount)).toBe(true);
  });

  it('compares the price of a LIMIT order numerically', () => {
    const limitStored = { ...stored, type: 'LIMIT' as const, price: '900.00' };
    const limitRequest = { ...request, type: 'LIMIT' as const };
    expect(orderMatchesRequest(limitStored, { ...limitRequest, price: '900' })).toBe(true);
    expect(orderMatchesRequest(limitStored, { ...limitRequest, price: '901' })).toBe(false);
    expect(orderMatchesRequest(limitStored, limitRequest)).toBe(false);
  });
});
