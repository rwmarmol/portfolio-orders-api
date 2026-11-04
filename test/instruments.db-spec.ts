import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createInstrument, createTestApp, createTestPool } from './db/helpers';

describe('GET /instruments (database)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await createTestApp();
    pool = createTestPool();
    // Search fixtures for the query "qq": one instrument per ordering group.
    await createInstrument(pool, 'ZQQ', 'Ticker contains it');
    await createInstrument(pool, 'WW', 'Name has qq inside');
    await createInstrument(pool, 'QQA', 'Ticker prefix');
    await createInstrument(pool, 'QQ', 'Exact ticker');
    await createInstrument(pool, 'QQB', 'Another prefix');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const search = (query: string) => request(app.getHttpServer()).get(`/instruments?${query}`);
  const tickers = (body: { items: { ticker: string }[] }) => body.items.map((i) => i.ticker);

  it('orders by exact ticker, ticker prefix, name contains and ticker contains', async () => {
    const { body } = await search('q=QQ').expect(200);
    expect(tickers(body)).toEqual(['QQ', 'QQA', 'QQB', 'WW', 'ZQQ']);
  });

  it('is case-insensitive and trims the query', async () => {
    const { body } = await search('q=%20qq%20').expect(200);
    expect(tickers(body)[0]).toBe('QQ');
  });

  it('matches by name', async () => {
    const { body } = await search('q=patagonia').expect(200);
    expect(tickers(body)).toContain('BPAT');
  });

  it('excludes the cash instrument ARS', async () => {
    const { body } = await search('q=ars').expect(200);
    expect(tickers(body)).not.toContain('ARS');
  });

  it('treats LIKE wildcards literally', async () => {
    expect((await search('q=%25').expect(200)).body.items).toEqual([]);
    expect((await search('q=_').expect(200)).body.items).toEqual([]);
  });

  it('applies the default limit of 20 and a custom limit', async () => {
    expect((await search('q=a').expect(200)).body.items).toHaveLength(20);
    expect((await search('q=a&limit=3').expect(200)).body.items).toHaveLength(3);
  });

  it('answers 400 for a missing query or an out-of-range limit', async () => {
    await search('').expect(400);
    await search('q=a&limit=51').expect(400);
  });
});
