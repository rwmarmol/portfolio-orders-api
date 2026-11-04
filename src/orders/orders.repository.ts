import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../database/queryable';
import { PG_POOL } from '../database/tokens';
import type { OrderRecord, OrderStatus, OrderType, Side } from '../domain';

export interface NewOrder {
  userId: number;
  instrumentId: number;
  size: number;
  /** Null only for a MARKET order rejected for lack of a market price. */
  price: string | null;
  type: OrderType;
  side: 'BUY' | 'SELL';
  status: 'NEW' | 'FILLED' | 'REJECTED';
}

export interface StoredOrder {
  id: number;
  userId: number;
  instrumentId: number;
  side: Side;
  type: OrderType;
  status: OrderStatus;
  size: number;
  price: string | null;
  datetime: Date;
}

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

  /** Inserts an order. Must run inside the order transaction, under the per-user lock. */
  async insert(order: NewOrder, db: Queryable): Promise<StoredOrder> {
    const { rows } = await db.query<StoredOrder>(
      `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
       VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, now() AT TIME ZONE 'UTC')
       RETURNING id,
                 userid AS "userId",
                 instrumentid AS "instrumentId",
                 side, type, status, size,
                 price::text AS price,
                 datetime`,
      [
        order.instrumentId,
        order.userId,
        order.size,
        order.price,
        order.type,
        order.side,
        order.status,
      ],
    );
    const stored = rows[0];
    if (stored === undefined) throw new Error('Order insert returned no row');
    return stored;
  }
}
