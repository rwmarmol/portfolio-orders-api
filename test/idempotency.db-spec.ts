import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { D } from '../src/domain';
import {
  PRICED_INSTRUMENT_ID,
  countOrders,
  createTestApp,
  createTestPool,
  createUser,
  fund,
  latestClose,
} from './db/helpers';

describe('idempotent order creation with clientOrderId (database)', () => {
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
  const buy = (quantity: number, extra: object = {}) => ({
    instrumentId: PRICED_INSTRUMENT_ID,
    side: 'BUY',
    type: 'MARKET',
    quantity,
    ...extra,
  });
  const key = () => `test-${randomUUID()}`;
  const portfolio = async (userId: number) =>
    (await request(app.getHttpServer()).get(`/users/${userId}/portfolio`).expect(200)).body;

  it('creates the order once and answers a retry with the same order and a 200', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);
    const clientOrderId = key();

    const first = await post(userId, buy(2, { clientOrderId })).expect(201);
    expect(first.body).toMatchObject({ status: 'FILLED', size: 2, clientOrderId });

    const retry = await post(userId, buy(2, { clientOrderId }));
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);

    expect(await countOrders(pool, userId)).toBe(2); // the funding and one purchase
    expect((await portfolio(userId)).availableAmount).toBe(
      new D(100_000).minus(new D(close).times(2)).toFixed(2),
    );
  });

  it('creates a single order out of simultaneous retries', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);
    const clientOrderId = key();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(userId, buy(1, { clientOrderId }))),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await countOrders(pool, userId)).toBe(2);
  });

  it('replays a rejected order with its reason', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 1_000);
    const clientOrderId = key();

    const first = await post(userId, buy(100, { clientOrderId })).expect(201);
    expect(first.body).toMatchObject({ status: 'REJECTED', reason: 'insufficient funds' });

    const retry = await post(userId, buy(100, { clientOrderId }));
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(await countOrders(pool, userId)).toBe(2);
  });

  it('answers 409 when the id is reused for a different order, and stores nothing', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);
    const clientOrderId = key();
    await post(userId, buy(2, { clientOrderId })).expect(201);

    const other = await post(userId, buy(3, { clientOrderId }));
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await countOrders(pool, userId)).toBe(2);
  });

  it('keeps ids independent between users', async () => {
    const [a, b] = [await createUser(pool), await createUser(pool)];
    await fund(pool, a, 100_000);
    await fund(pool, b, 100_000);
    const clientOrderId = key();

    expect((await post(a, buy(1, { clientOrderId }))).status).toBe(201);
    expect((await post(b, buy(1, { clientOrderId }))).status).toBe(201);
  });

  it('answers 400 and stores nothing when the clientOrderId is missing', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);

    const res = await post(userId, buy(1));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('clientOrderId');
    expect(await countOrders(pool, userId)).toBe(1); // only the funding
  });

  it('creates two orders when the ids differ, even if the orders are identical', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 100_000);

    expect((await post(userId, buy(1, { clientOrderId: key() }))).status).toBe(201);
    expect((await post(userId, buy(1, { clientOrderId: key() }))).status).toBe(201);
    expect(await countOrders(pool, userId)).toBe(3);
  });

  it('answers 400 for a malformed clientOrderId', async () => {
    const userId = await createUser(pool);
    const res = await post(userId, buy(1, { clientOrderId: 'has spaces' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('refuses a second order with the same id at the database level', async () => {
    const userId = await createUser(pool);
    const clientOrderId = key();
    const insert = () =>
      pool.query(
        `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, clientorderid, datetime)
         VALUES (47, $1, 1, 1, 'MARKET', 'BUY', 'REJECTED', $2, now())`,
        [userId, clientOrderId],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/orders_userid_clientorderid_key/);
  });
});
