import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/tokens';
import type { Queryable } from '../database/queryable';
import { escapeLike } from './like';

export interface Instrument {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

/** One page of instruments plus the total number of matches (ignoring limit and offset). */
export interface InstrumentPage {
  items: Instrument[];
  total: number;
}

@Injectable()
export class InstrumentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Partial, case-insensitive match on ticker or name, excluding the cash instrument (Q11, Q12).
   * Order: exact ticker, ticker prefix, name contains, then ticker contains; ticker within each.
   */
  async search(q: string, limit: number, offset: number): Promise<InstrumentPage> {
    const escaped = escapeLike(q);
    const contains = `%${escaped}%`;
    const [page, count] = await Promise.all([
      this.pool.query<Instrument>(
        `SELECT id, ticker, name, type
           FROM instruments
          WHERE type IS DISTINCT FROM 'MONEDA'
            AND (ticker ILIKE $1 OR name ILIKE $1)
          ORDER BY CASE
                     WHEN upper(ticker) = upper($2) THEN 0
                     WHEN ticker ILIKE $3 THEN 1
                     WHEN name ILIKE $1 THEN 2
                     ELSE 3
                   END,
                   ticker, id
          LIMIT $4 OFFSET $5`,
        [contains, q, `${escaped}%`, limit, offset],
      ),
      this.pool.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM instruments
          WHERE type IS DISTINCT FROM 'MONEDA'
            AND (ticker ILIKE $1 OR name ILIKE $1)`,
        [contains],
      ),
    ]);
    return { items: page.rows, total: count.rows[0]?.total ?? 0 };
  }

  /** Every tradable instrument (all but the cash instrument), alphabetical by ticker. */
  async list(limit: number, offset: number): Promise<InstrumentPage> {
    const [page, count] = await Promise.all([
      this.pool.query<Instrument>(
        `SELECT id, ticker, name, type
           FROM instruments
          WHERE type IS DISTINCT FROM 'MONEDA'
          ORDER BY ticker, id
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.pool.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM instruments
          WHERE type IS DISTINCT FROM 'MONEDA'`,
      ),
    ]);
    return { items: page.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findById(id: number, db: Queryable = this.pool): Promise<Instrument | undefined> {
    const { rows } = await db.query<Instrument>(
      'SELECT id, ticker, name, type FROM instruments WHERE id = $1',
      [id],
    );
    return rows[0];
  }

  async findByIds(
    ids: readonly number[],
    db: Queryable = this.pool,
  ): Promise<Map<number, Instrument>> {
    const found = new Map<number, Instrument>();
    if (ids.length === 0) return found;
    const { rows } = await db.query<Instrument>(
      'SELECT id, ticker, name, type FROM instruments WHERE id = ANY($1::int[])',
      [ids],
    );
    for (const row of rows) found.set(row.id, row);
    return found;
  }
}
