import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../database/queryable';
import { PG_POOL } from '../database/tokens';

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async exists(userId: number, db: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    return (rowCount ?? 0) > 0;
  }

  /**
   * Takes the per-user lock for the rest of the transaction and tells whether the user exists.
   * NO KEY UPDATE serializes order transactions of one user without blocking the foreign-key
   * checks that inserts into other tables perform on the user row.
   */
  async lockForUpdate(userId: number, db: Queryable): Promise<boolean> {
    const { rowCount } = await db.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [
      userId,
    ]);
    return (rowCount ?? 0) > 0;
  }
}
