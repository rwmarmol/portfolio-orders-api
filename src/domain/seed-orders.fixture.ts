import type { OrderRecord } from './types';

let nextId = 1000;

/** Builds an order with sensible defaults; override only what the test cares about. */
export function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: nextId++,
    instrumentId: 47,
    side: 'BUY',
    type: 'MARKET',
    status: 'FILLED',
    size: 1,
    price: '1.00',
    datetime: new Date('2023-07-12T12:00:00Z'),
    ...overrides,
  };
}

function seed(
  id: number,
  instrumentId: number,
  size: number,
  price: string,
  side: OrderRecord['side'],
  status: OrderRecord['status'],
  type: OrderRecord['type'],
  datetime: string,
): OrderRecord {
  return { id, instrumentId, size, price, side, status, type, datetime: new Date(datetime) };
}

/** User 1's 11 orders from db/init/001-schema-and-seed.sql. */
export const SEED_ORDERS_USER_1: OrderRecord[] = [
  seed(1, 66, 1000000, '1', 'CASH_IN', 'FILLED', 'MARKET', '2023-07-12T12:11:20Z'),
  seed(2, 47, 50, '930', 'BUY', 'FILLED', 'MARKET', '2023-07-12T12:31:20Z'),
  seed(3, 47, 50, '920', 'BUY', 'CANCELLED', 'LIMIT', '2023-07-12T14:21:20Z'),
  seed(4, 47, 10, '940', 'SELL', 'FILLED', 'MARKET', '2023-07-12T14:51:20Z'),
  seed(5, 45, 50, '710', 'BUY', 'NEW', 'LIMIT', '2023-07-12T15:14:20Z'),
  seed(6, 47, 100, '950', 'SELL', 'REJECTED', 'MARKET', '2023-07-12T16:11:20Z'),
  seed(7, 31, 60, '1500', 'BUY', 'NEW', 'LIMIT', '2023-07-13T11:13:20Z'),
  seed(8, 66, 100000, '1', 'CASH_OUT', 'FILLED', 'MARKET', '2023-07-13T12:31:20Z'),
  seed(9, 31, 20, '1540', 'BUY', 'FILLED', 'LIMIT', '2023-07-13T12:51:20Z'),
  seed(10, 54, 500, '250', 'BUY', 'FILLED', 'MARKET', '2023-07-13T14:11:20Z'),
  seed(11, 31, 30, '1530', 'SELL', 'FILLED', 'MARKET', '2023-07-13T15:13:20Z'),
];
