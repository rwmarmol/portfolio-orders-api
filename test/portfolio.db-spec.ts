import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import {
  createInstrument,
  createTestApp,
  createTestPool,
  createUser,
  fund,
  insertOrder,
} from './db/helpers';

describe('GET /users/:userId/portfolio (database)', () => {
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

  const get = (userId: number | string) =>
    request(app.getHttpServer()).get(`/users/${userId}/portfolio`);

  it('matches the reference values of seed user 1', async () => {
    const { body } = await get(1).expect(200);

    expect(body.availableAmount).toBe('753000.00');
    expect(body.committedAmount).toBe('125500.00');
    expect(body.totalIsPartial).toBe(false);

    const quantities = Object.fromEntries(
      body.positions.map((p: { instrumentId: number; quantity: number }) => [
        p.instrumentId,
        p.quantity,
      ]),
    );
    expect(quantities).toEqual({ 31: -10, 47: 40, 54: 500 });

    const byId = new Map<number, Record<string, unknown>>(
      body.positions.map((p: { instrumentId: number }) => [p.instrumentId, p]),
    );
    expect(byId.get(47)).toMatchObject({ averageCost: '930.00', ticker: 'PAMP' });
    expect(byId.get(54)).toMatchObject({ averageCost: '250.00' });
    // Negative position: shown, but without a total return (Q2, Q10).
    expect(byId.get(31)).toMatchObject({ averageCost: null, totalReturnPct: null });
    expect(byId.get(31)?.marketValue).toMatch(/^-\d+\.\d{2}$/);
  });

  it('returns only zeros for a user without orders', async () => {
    const userId = await createUser(pool);
    const { body } = await get(userId).expect(200);
    expect(body).toMatchObject({
      availableAmount: '0.00',
      committedAmount: '0.00',
      totalValue: '0.00',
      totalIsPartial: false,
      positions: [],
    });
  });

  it('keeps a position without market data, flags the total as partial and excludes it', async () => {
    const userId = await createUser(pool);
    await fund(pool, userId, 1_000);
    const instrumentId = await createInstrument(pool, `PX${userId}`, 'Held without price S.A.');
    await insertOrder(pool, { userId, instrumentId, side: 'BUY', size: 7, price: '10' });

    const { body } = await get(userId).expect(200);
    expect(body.totalIsPartial).toBe(true);
    expect(body.availableAmount).toBe('930.00'); // 1,000 - 7 * 10
    expect(body.totalValue).toBe('930.00'); // the unpriced position is left out
    expect(body.positions).toEqual([
      {
        instrumentId,
        ticker: `PX${userId}`,
        name: 'Held without price S.A.',
        quantity: 7,
        marketValue: null,
        averageCost: '10.00',
        dailyReturnPct: null,
        totalReturnPct: null,
      },
    ]);
  });

  it('answers 404 for an unknown user and 400 for a malformed id', async () => {
    const missing = await get(999_999);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
    const malformed = await get('abc');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('VALIDATION_ERROR');
  });
});
