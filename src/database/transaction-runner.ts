import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from './tokens';

export interface TransactionOptions {
  isolation?: 'READ COMMITTED' | 'REPEATABLE READ';
  readOnly?: boolean;
}

/** Runs a function inside a single database transaction on a dedicated pooled client. */
@Injectable()
export class TransactionRunner {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async run<T>(
    work: (client: PoolClient) => Promise<T>,
    { isolation = 'READ COMMITTED', readOnly = false }: TransactionOptions = {},
  ): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      // Options come from a closed union type, never from user input.
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}${readOnly ? ' READ ONLY' : ''}`);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        broken = true; // the connection is unusable: make the pool discard it
      }
      throw err;
    } finally {
      client.release(broken);
    }
  }
}
