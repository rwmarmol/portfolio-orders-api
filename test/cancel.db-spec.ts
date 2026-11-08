import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import {
  PRICED_INSTRUMENT_ID,
  createTestApp,
  createTestPool,
  createUser,
  fund,
  insertOrder,
} from './db/helpers';

describe('POST /users/:userId/orders/:orderId/cancel (database)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await createTestApp();
    pool = createTestPool();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const submit = async (userId: number, body: object) =>
    (
      await http()
        .post(`/users/${userId}/orders`)
        .send({ clientOrderId: `t-${randomUUID()}`, ...body })
        .expect(201)
    ).body;
  const cancel = (userId: number, orderId: number | string) =>
    http().post(`/users/${userId}/orders/${orderId}/cancel`);
  const portfolio = async (userId: number) =>
    (await http().get(`/users/${userId}/portfolio`).expect(200)).body;
  const statusOf = async (orderId: number) =>
    (await pool.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]))
      .rows[0]!.status;

  const marketOrder = (side: 'BUY' | 'SELL', quantity: number) => ({
    instrumentId: PRICED_INSTRUMENT_ID,
    side,
    type: 'MARKET',
    quantity,
  });
  const limitOrder = (side: 'BUY' | 'SELL', quantity: number, price: string) => ({
    ...marketOrder(side, quantity),
    type: 'LIMIT',
    price,
  });

  it('cancels a NEW LIMIT BUY and releases the funds it committed', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 10_000);
    const limit = await submit(userId, limitOrder('BUY', 5, '1000')); // 5,000 committed
    const committed = await portfolio(userId);
    expect(committed.committedAmount).toBe('5000.00');
    expect(committed.buyableAmount).toBe('5000.00');

    // Six shares at the latest close do not fit in the 5,000 still buyable.
    expect((await submit(userId, marketOrder('BUY', 6))).status).toBe('REJECTED');

    const res = await cancel(userId, limit.id).expect(200);
    expect(res.body).toMatchObject({ id: limit.id, status: 'CANCELLED', userId, size: 5 });

    const after = await portfolio(userId);
    expect(after.committedAmount).toBe('0.00');
    expect(after.buyableAmount).toBe('10000.00'); // the commitment is released
    expect(after.availableAmount).toBe('10000.00'); // a cancelled order never moved cash
    expect((await submit(userId, marketOrder('BUY', 6))).status).toBe('FILLED');
  });

  it('cancels a NEW LIMIT SELL and releases the shares it committed', async () => {
    const userId = await createUser(pool);
    await insertOrder(pool, {
      userId,
      instrumentId: PRICED_INSTRUMENT_ID,
      side: 'BUY',
      size: 10,
      price: '900',
    });
    const limit = await submit(userId, limitOrder('SELL', 8, '2000'));
    expect((await submit(userId, marketOrder('SELL', 3))).status).toBe('REJECTED');

    await cancel(userId, limit.id).expect(200);
    expect((await submit(userId, marketOrder('SELL', 3))).status).toBe('FILLED');
  });

  describe('orders that cannot be cancelled', () => {
    it.each(['FILLED', 'REJECTED'])(
      'answers 409 for a %s order and leaves it untouched',
      async (status) => {
        const userId = await createUser(pool);
        await fund(pool, userId, 1_000_000);
        const order = await submit(
          userId,
          status === 'FILLED' ? marketOrder('BUY', 1) : marketOrder('BUY', 100_000_000),
        );
        expect(order.status).toBe(status);

        const res = await cancel(userId, order.id);
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('ORDER_NOT_CANCELLABLE');
        expect(res.body.message).toContain(status);
        expect(await statusOf(order.id)).toBe(status);
      },
    );

    it('is idempotent: cancelling an already cancelled order succeeds and changes nothing', async () => {
      const userId = await createUser(pool);
      await fund(pool, userId, 10_000);
      const limit = await submit(userId, limitOrder('BUY', 1, '100'));
      const first = await cancel(userId, limit.id).expect(200);

      const again = await cancel(userId, limit.id);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await statusOf(limit.id)).toBe('CANCELLED');
      expect((await portfolio(userId)).committedAmount).toBe('0.00');
    });

    it('answers 200 to both of two simultaneous cancellations of the same order', async () => {
      const userId = await createUser(pool);
      await fund(pool, userId, 10_000);
      const limit = await submit(userId, limitOrder('BUY', 1, '100'));

      const responses = await Promise.all([cancel(userId, limit.id), cancel(userId, limit.id)]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(responses.every((r) => r.body.status === 'CANCELLED')).toBe(true);
      expect(await statusOf(limit.id)).toBe('CANCELLED');
    });
  });

  describe('ownership and bad input', () => {
    it("treats another user's order as not found and leaves it NEW", async () => {
      const owner = await createUser(pool);
      const other = await createUser(pool);
      await fund(pool, owner, 10_000);
      const limit = await submit(owner, limitOrder('BUY', 1, '100'));

      const res = await cancel(other, limit.id);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(await statusOf(limit.id)).toBe('NEW');
    });

    it('answers 404 for an unknown order and for an unknown user', async () => {
      const userId = await createUser(pool);
      expect((await cancel(userId, 999_999)).status).toBe(404);
      expect((await cancel(999_999, 1)).status).toBe(404);
    });

    it('answers 400 for malformed ids', async () => {
      const userId = await createUser(pool);
      const res = await cancel(userId, 'abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
