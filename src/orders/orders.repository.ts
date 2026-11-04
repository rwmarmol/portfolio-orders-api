import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../database/queryable';
import { PG_POOL } from '../database/tokens';
import type { OrderRecord } from '../domain';

interface OrderRow extends Omit<OrderRecord, 'price'> {
  price: string | null;
}

@Injectable()
export class OrdersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The user's FILLED and NEW orders: the only statuses that affect balances, positions and
   * commitments. Served by the index on orders(userid, status).
   */
  async findActiveByUser(userId: number, db: Queryable = this.pool): Promise<OrderRecord[]> {
    const { rows } = await db.query<OrderRow>(
      `SELECT id,
              instrumentid AS "instrumentId",
              side, type, status, size,
              price::text AS price,
              datetime
         FROM orders
        WHERE userid = $1 AND status IN ('FILLED', 'NEW')`,
      [userId],
    );
    return rows.map(({ price, ...row }) => {
      if (price === null) {
        throw new Error(`Order ${row.id} is ${row.status} but has no price`);
      }
      return { ...row, price };
    });
  }
}
