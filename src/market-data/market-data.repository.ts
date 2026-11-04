import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../database/queryable';
import { PG_POOL } from '../database/tokens';
import type { MarketQuote } from '../domain';

interface QuoteRow {
  instrumentId: number;
  date: string;
  close: string | null;
  previousClose: string | null;
}

@Injectable()
export class MarketDataRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Latest quote per instrument (greatest date). An instrument whose latest row has no close is
   * treated as having no price: an older close is never used as a stand-in.
   */
  async latestQuotes(
    instrumentIds: readonly number[],
    db: Queryable = this.pool,
  ): Promise<Map<number, MarketQuote>> {
    const quotes = new Map<number, MarketQuote>();
    if (instrumentIds.length === 0) return quotes;
    const { rows } = await db.query<QuoteRow>(
      `SELECT DISTINCT ON (instrumentid)
              instrumentid AS "instrumentId",
              date::text AS date,
              close::text AS close,
              previousclose::text AS "previousClose"
         FROM marketdata
        WHERE instrumentid = ANY($1::int[])
        ORDER BY instrumentid, date DESC`,
      [instrumentIds],
    );
    for (const row of rows) {
      if (row.close === null) continue;
      quotes.set(row.instrumentId, { ...row, close: row.close });
    }
    return quotes;
  }
}
