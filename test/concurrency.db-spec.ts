import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { D } from '../src/domain';
import {
  PRICED_INSTRUMENT_ID,
  createTestApp,
  createTestPool,
  createUser,
  fund,
  latestClose,
} from './db/helpers';

describe('concurrent orders of one user (database)', () => {
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

  const buy = (userId: number, quantity: number) =>
    request(app.getHttpServer())
      .post(`/users/${userId}/orders`)
      .send({ instrumentId: PRICED_INSTRUMENT_ID, side: 'BUY', type: 'MARKET', quantity });

  it('never over-spends: only the orders the balance can cover are filled', async () => {
    const close = await latestClose(pool, PRICED_INSTRUMENT_ID);
    const funds = 10_000;
    const quantity = 3;
    const affordable = new D(funds).div(new D(close).times(quantity)).floor().toNumber();
    const attempts = affordable + 5;

    const userId = await createUser(pool);
    await fund(pool, userId, funds);

    const responses = await Promise.all(
      Array.from({ length: attempts }, () => buy(userId, quantity)),
    );
    const statuses = responses.map((res) => res.body.status as string);

    expect(responses.every((res) => res.status === 201)).toBe(true);
    expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(affordable);
    expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(attempts - affordable);

    const { rows } = await pool.query<{ pesos: string }>(
      `SELECT sum(CASE WHEN side IN ('CASH_IN', 'SELL') THEN size * price ELSE -size * price END)::text AS pesos
         FROM orders WHERE userid = $1 AND status = 'FILLED'`,
      [userId],
    );
    expect(new D(rows[0]!.pesos).gte(0)).toBe(true);
  });

  it('serializes two orders that together exceed the balance: one fills, one is rejected', async () => {
    const close = await latestClose(pool, PRICED_INSTRUMENT_ID);
    const quantity = 6;
    const userId = await createUser(pool);
    // Enough for one order of six shares, not for two.
    await fund(pool, userId, new D(close).times(quantity).plus(100).ceil().toNumber());

    const [a, b] = await Promise.all([buy(userId, quantity), buy(userId, quantity)]);
    expect([a.body.status, b.body.status].sort()).toEqual(['FILLED', 'REJECTED']);
  });
});
