import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';

export const CASH_INSTRUMENT_ID = 66;
/** PAMP: a stock that has market data in the seed. */
export const PRICED_INSTRUMENT_ID = 47;

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set: run these tests with `npm run test:db`');
  return url;
}

/** Boots the real application against the throwaway test database. */
export async function createTestApp(): Promise<INestApplication> {
  process.env.DATABASE_URL = testDatabaseUrl();
  process.env.LOG_LEVEL = 'silent';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export function createTestPool(): Pool {
  return new Pool({ connectionString: testDatabaseUrl(), max: 4 });
}

export async function createUser(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO users (email, accountnumber) VALUES ($1, $2) RETURNING id',
    [`user-${randomUUID()}@test.local`, '99999'],
  );
  return rows[0]!.id;
}

export interface SeedOrder {
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
  type?: 'MARKET' | 'LIMIT';
  status?: 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  size: number;
  price: string;
}

export async function insertOrder(pool: Pool, order: SeedOrder): Promise<void> {
  await pool.query(
    `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() AT TIME ZONE 'UTC')`,
    [
      order.instrumentId,
      order.userId,
      order.size,
      order.price,
      order.type ?? 'MARKET',
      order.side,
      order.status ?? 'FILLED',
    ],
  );
}

/** Credits funds with a FILLED CASH_IN on the cash instrument. */
export function fund(pool: Pool, userId: number, amount: number): Promise<void> {
  return insertOrder(pool, {
    userId,
    instrumentId: CASH_INSTRUMENT_ID,
    side: 'CASH_IN',
    size: amount,
    price: '1',
  });
}

export async function latestClose(pool: Pool, instrumentId: number): Promise<string> {
  const { rows } = await pool.query<{ close: string }>(
    'SELECT close::text AS close FROM marketdata WHERE instrumentid = $1 ORDER BY date DESC LIMIT 1',
    [instrumentId],
  );
  return rows[0]!.close;
}

export async function createInstrument(
  pool: Pool,
  ticker: string,
  name: string,
  type = 'ACCIONES',
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO instruments (ticker, name, type) VALUES ($1, $2, $3) RETURNING id',
    [ticker, name, type],
  );
  return rows[0]!.id;
}

export async function countOrders(pool: Pool, userId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*) FROM orders WHERE userid = $1',
    [userId],
  );
  return Number(rows[0]!.count);
}
