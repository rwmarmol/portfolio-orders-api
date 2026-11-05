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

  it('answers 400 for a blank query and for out-of-range limit or offset', async () => {
    await search('q=%20%20').expect(400);
    await search('q=a&limit=51').expect(400);
    await search('q=a&limit=0').expect(400);
    await search('q=a&offset=-1').expect(400);
  });

  describe('listing without q', () => {
    const tradableCount = async () =>
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*) FROM instruments WHERE type <> 'MONEDA'",
          )
        ).rows[0]!.count,
      );

    it('lists every tradable instrument alphabetically, without ARS', async () => {
      const total = await tradableCount();
      const { body } = await search('limit=50').expect(200);
      expect(body).toMatchObject({ total, limit: 50, offset: 0 });
      expect(body.items).toHaveLength(Math.min(50, total));
      const listed = tickers(body);
      expect(listed).toEqual([...listed].sort());
      expect(listed).not.toContain('ARS');
    });

    it('uses a default page of 20 and reports the paging metadata', async () => {
      const { body } = await search('').expect(200);
      expect(body.items).toHaveLength(20);
      expect(body).toMatchObject({ limit: 20, offset: 0 });
      expect(body.total).toBe(await tradableCount());
    });

    it('walks the whole catalog page by page without gaps or repeats', async () => {
      const total = await tradableCount();
      const seen: string[] = [];
      for (let offset = 0; offset < total; offset += 20) {
        const { body } = await search(`limit=20&offset=${offset}`).expect(200);
        expect(body.total).toBe(total);
        seen.push(...tickers(body));
      }
      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
      expect(seen).toEqual([...seen].sort());
    });

    it('returns an empty page, keeping the total, when the offset is past the end', async () => {
      const total = await tradableCount();
      const { body } = await search(`offset=${total + 50}`).expect(200);
      expect(body.items).toEqual([]);
      expect(body.total).toBe(total);
    });
  });

  describe('searching with q is paginated too', () => {
    it('reports the total of matches and pages in relevance order', async () => {
      const first = (await search('q=qq&limit=2&offset=0').expect(200)).body;
      expect(tickers(first)).toEqual(['QQ', 'QQA']);
      expect(first).toMatchObject({ total: 5, limit: 2, offset: 0 });

      const second = (await search('q=qq&limit=2&offset=2').expect(200)).body;
      expect(tickers(second)).toEqual(['QQB', 'WW']);

      const last = (await search('q=qq&limit=2&offset=4').expect(200)).body;
      expect(tickers(last)).toEqual(['ZQQ']);
      expect(last.total).toBe(5);
    });
  });
});
