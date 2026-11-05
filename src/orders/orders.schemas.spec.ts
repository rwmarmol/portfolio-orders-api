import { createOrderSchema, orderParamSchema } from './orders.schemas';

const base = { instrumentId: 47, side: 'BUY', type: 'MARKET', quantity: 10 };

describe('createOrderSchema', () => {
  it('accepts a MARKET order by quantity', () => {
    expect(createOrderSchema.parse(base)).toEqual(base);
  });

  it('accepts a LIMIT order by amount and normalizes money to strings', () => {
    const parsed = createOrderSchema.parse({
      instrumentId: 47,
      side: 'SELL',
      type: 'LIMIT',
      amount: 1500.5,
      price: '930.10',
    });
    expect(parsed).toMatchObject({ amount: '1500.5', price: '930.10' });
  });

  it('ignores a price sent with a MARKET order instead of failing', () => {
    const parsed = createOrderSchema.parse({ ...base, price: '10' });
    expect(parsed).toEqual(base);
    expect('price' in parsed).toBe(false);
  });

  it('ignores even a malformed price on a MARKET order', () => {
    expect(createOrderSchema.safeParse({ ...base, price: 'not-a-number' }).success).toBe(true);
  });

  it('still validates the price of a LIMIT order', () => {
    expect(
      createOrderSchema.safeParse({ ...base, type: 'LIMIT', price: 'not-a-number' }).success,
    ).toBe(false);
  });

  it.each([
    ['both quantity and amount', { ...base, amount: '100' }],
    ['neither quantity nor amount', { instrumentId: 47, side: 'BUY', type: 'MARKET' }],
    ['LIMIT without price', { ...base, type: 'LIMIT' }],
    ['fractional quantity', { ...base, quantity: 1.5 }],
    ['zero quantity', { ...base, quantity: 0 }],
    ['quantity above INT range', { ...base, quantity: 2_147_483_648 }],
    ['invalid side', { ...base, side: 'CASH_IN' }],
    ['invalid type', { ...base, type: 'STOP' }],
    ['unknown field', { ...base, status: 'FILLED' }],
    ['price with 3 decimals', { ...base, type: 'LIMIT', quantity: 1, price: '10.123' }],
    ['negative price', { ...base, type: 'LIMIT', price: '-5' }],
    ['zero price', { ...base, type: 'LIMIT', price: '0.00' }],
    ['price in exponent notation', { ...base, type: 'LIMIT', price: 1e21 }],
    ['price above NUMERIC(10,2)', { ...base, type: 'LIMIT', price: '100000000.00' }],
    ['non-numeric amount', { instrumentId: 47, side: 'BUY', type: 'MARKET', amount: 'abc' }],
  ])('rejects %s', (_label, input) => {
    expect(createOrderSchema.safeParse(input).success).toBe(false);
  });
});

describe('orderParamSchema', () => {
  it('parses both ids from the path', () => {
    expect(orderParamSchema.parse({ userId: '1', orderId: '12' })).toEqual({
      userId: 1,
      orderId: 12,
    });
  });

  it.each([
    ['non-numeric order id', { userId: '1', orderId: 'abc' }],
    ['zero order id', { userId: '1', orderId: '0' }],
    ['order id above INT range', { userId: '1', orderId: '2147483648' }],
    ['missing user id', { orderId: '1' }],
  ])('rejects %s', (_label, input) => {
    expect(orderParamSchema.safeParse(input).success).toBe(false);
  });
});
