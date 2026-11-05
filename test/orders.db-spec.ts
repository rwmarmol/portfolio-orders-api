import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { D, DecValue } from '../src/domain';
import {
  CASH_INSTRUMENT_ID,
  PRICED_INSTRUMENT_ID,
  countOrders,
  createInstrument,
  createTestApp,
  createTestPool,
  createUser,
  fund,
  insertOrder,
  latestClose,
} from './db/helpers';

describe('POST /users/:userId/orders (database)', () => {
  let app: INestApplication;
  let pool: Pool;
  let close: string;

  beforeAll(async () => {
    app = await createTestApp();
    pool = createTestPool();
    close = await latestClose(pool, PRICED_INSTRUMENT_ID);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const post = (userId: number, body: object) =>
    request(app.getHttpServer()).post(`/users/${userId}/orders`).send(body);
  const portfolio = async (userId: number) =>
    (await request(app.getHttpServer()).get(`/users/${userId}/portfolio`).expect(200)).body;
  const money = (value: DecValue) => new D(value).toFixed(2);

  const market = (side: 'BUY' | 'SELL', quantity: number) => ({
    instrumentId: PRICED_INSTRUMENT_ID,
    side,
    type: 'MARKET',
    quantity,
  });

  it('fills a MARKET BUY at the latest close and updates the portfolio', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);

    const res = await post(userId, market('BUY', 10)).expect(201);
    expect(res.body).toMatchObject({
      status: 'FILLED',
      size: 10,
      price: close,
      side: 'BUY',
      type: 'MARKET',
      userId,
    });
    expect(res.body.reason).toBeUndefined();

    const body = await portfolio(userId);
    expect(body.availableAmount).toBe(money(new D(100_000).minus(new D(close).times(10))));
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0]).toMatchObject({ instrumentId: PRICED_INSTRUMENT_ID, quantity: 10 });
  });

  it('ignores a price sent with a MARKET order and executes at the market price', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);

    const res = await post(userId, { ...market('BUY', 1), price: '1.00' }).expect(201);
    expect(res.body).toMatchObject({ status: 'FILLED', price: close });
  });

  it('stores a LIMIT BUY as NEW with the user price and commits the funds', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);

    const res = await post(userId, { ...market('BUY', 5), type: 'LIMIT', price: '900' }).expect(
      201,
    );
    expect(res.body).toMatchObject({ status: 'NEW', price: '900.00', size: 5 });

    const body = await portfolio(userId);
    expect(body.availableAmount).toBe('100000.00');
    expect(body.committedAmount).toBe('4500.00');
    expect(body.buyableAmount).toBe('95500.00');
    expect(body.positions).toEqual([]);
  });

  it('sizes a BUY by amount to the maximum whole number of shares', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);
    const amount = money(new D(close).times(3).plus(1)); // three shares plus change

    const res = await post(userId, {
      instrumentId: PRICED_INSTRUMENT_ID,
      side: 'BUY',
      type: 'MARKET',
      amount,
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'FILLED', size: 3 });
  });

  it('stores a BUY above the buyable amount as REJECTED and leaves the balance untouched', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 1_000);

    const res = await post(userId, market('BUY', 100)).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient funds' });
    expect(await countOrders(pool, userId)).toBe(2); // the funding and the rejected order
    expect((await portfolio(userId)).availableAmount).toBe('1000.00');
  });

  it('rejects a SELL without holdings, including the negative position of the seed', async () => {
    const userId = await createUser(pool);
    const none = await post(userId, market('SELL', 1)).expect(201);
    expect(none.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient holdings' });

    // Seed user 1 holds -10 of instrument 31: any sale is rejected.
    const negative = await post(1, { instrumentId: 31, side: 'SELL', type: 'MARKET', quantity: 1 });
    expect(negative.status).toBe(201);
    expect(negative.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient holdings' });
  });

  it('fills a SELL of owned shares and credits the funds', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 9_000); // pays for the 10 shares bought below at 900
    await insertOrder(pool, {
      userId,
      instrumentId: PRICED_INSTRUMENT_ID,
      side: 'BUY',
      size: 10,
      price: '900',
    });

    const res = await post(userId, market('SELL', 4)).expect(201);
    expect(res.body).toMatchObject({ status: 'FILLED', price: close });
    const body = await portfolio(userId);
    expect(body.availableAmount).toBe(money(new D(close).times(4)));
    expect(body.positions[0]).toMatchObject({ quantity: 6 });
  });

  it('nets the funds committed by NEW LIMIT BUY orders, also for MARKET orders', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 10_000);
    await post(userId, { ...market('BUY', 5), type: 'LIMIT', price: '1000' }).expect(201); // 5,000 committed

    // Six shares at the latest close exceed the 5,000 still buyable; five fit.
    const tooMany = await post(userId, market('BUY', 6)).expect(201);
    expect(tooMany.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient funds' });
    const fits = await post(userId, market('BUY', 5)).expect(201);
    expect(fits.body.status).toBe('FILLED');

    // A second LIMIT BUY larger than what is left is rejected too.
    const limit = await post(userId, { ...market('BUY', 10), type: 'LIMIT', price: '1000' });
    expect(limit.body.status).toBe('REJECTED');
  });

  it('nets the shares committed by NEW LIMIT SELL orders', async () => {
    const userId = await createUser(pool);
    await insertOrder(pool, {
      userId,
      instrumentId: PRICED_INSTRUMENT_ID,
      side: 'BUY',
      size: 10,
      price: '900',
    });
    await post(userId, { ...market('SELL', 8), type: 'LIMIT', price: '2000' }).expect(201);

    const tooMany = await post(userId, market('SELL', 3)).expect(201);
    expect(tooMany.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient holdings' });
    const fits = await post(userId, market('SELL', 2)).expect(201);
    expect(fits.body.status).toBe('FILLED');
  });

  describe('instrument without market data (D10)', () => {
    it('stores a MARKET order by quantity as REJECTED with a null price', async () => {
      const userId = await createUser(pool);
      await fund(pool, userId, 1_000);
      const instrumentId = await createInstrument(pool, `NP${userId}`, 'No price S.A.');

      const res = await post(userId, { instrumentId, side: 'BUY', type: 'MARKET', quantity: 1 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        price: null,
        reason: 'no market price available',
      });
    });

    it('answers 400 and stores nothing for a MARKET order by amount', async () => {
      const userId = await createUser(pool);
      const instrumentId = await createInstrument(pool, `NA${userId}`, 'No price either S.A.');

      const res = await post(userId, { instrumentId, side: 'BUY', type: 'MARKET', amount: '500' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_MARKET_PRICE');
      expect(await countOrders(pool, userId)).toBe(0);
    });
  });

  describe('invalid requests are answered without storing anything', () => {
    it.each([
      [
        'ARS',
        { instrumentId: CASH_INSTRUMENT_ID, side: 'BUY', type: 'MARKET', quantity: 1 },
        400,
        'INSTRUMENT_NOT_TRADABLE',
      ],
      [
        'unknown instrument',
        { instrumentId: 999_999, side: 'BUY', type: 'MARKET', quantity: 1 },
        400,
        'INSTRUMENT_NOT_FOUND',
      ],
      [
        'amount below one share',
        { instrumentId: PRICED_INSTRUMENT_ID, side: 'BUY', type: 'MARKET', amount: '1' },
        400,
        'AMOUNT_BELOW_PRICE',
      ],
      [
        'quantity and amount together',
        {
          instrumentId: PRICED_INSTRUMENT_ID,
          side: 'BUY',
          type: 'MARKET',
          quantity: 1,
          amount: '100',
        },
        400,
        'VALIDATION_ERROR',
      ],
      [
        'LIMIT without price',
        { instrumentId: PRICED_INSTRUMENT_ID, side: 'BUY', type: 'LIMIT', quantity: 1 },
        400,
        'VALIDATION_ERROR',
      ],
    ])('%s', async (_label, body, status, code) => {
      const userId = await createUser(pool);
      await fund(pool, userId, 1_000_000);
      const res = await post(userId, body);
      expect(res.status).toBe(status);
      expect(res.body.error).toBe(code);
      expect(await countOrders(pool, userId)).toBe(1); // only the funding
    });

    it('answers 404 for an unknown user', async () => {
      const res = await post(999_999, market('BUY', 1));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
