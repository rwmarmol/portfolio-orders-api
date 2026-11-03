import { D, Dec } from './decimal';
import type { OrderRecord } from './types';

export interface CostBasis {
  quantity: number;
  /** Null whenever the quantity is <= 0. */
  averageCost: Dec | null;
}

function chronological(a: OrderRecord, b: OrderRecord): number {
  return a.datetime.getTime() - b.datetime.getTime() || a.id - b.id;
}

/**
 * Moving weighted average cost of an instrument, walking its FILLED BUY/SELL orders by
 * `datetime` then `id` (decision Q2):
 * - with quantity > 0 a purchase updates the weighted average;
 * - a sale reduces the quantity and keeps the average; at quantity <= 0 the average resets;
 * - with quantity <= 0 a purchase first covers the shortfall; if the resulting quantity is > 0
 *   the average is that purchase's price, otherwise it stays null.
 */
export function costBasis(orders: readonly OrderRecord[], instrumentId: number): CostBasis {
  const relevant = orders
    .filter(
      (o) =>
        o.instrumentId === instrumentId &&
        o.status === 'FILLED' &&
        (o.side === 'BUY' || o.side === 'SELL'),
    )
    .sort(chronological);

  let quantity = 0;
  let average: Dec | null = null;
  for (const order of relevant) {
    if (order.side === 'BUY') {
      const price = new D(order.price);
      if (quantity > 0 && average !== null) {
        average = average
          .times(quantity)
          .plus(price.times(order.size))
          .div(quantity + order.size);
        quantity += order.size;
      } else {
        quantity += order.size;
        average = quantity > 0 ? price : null;
      }
    } else {
      quantity -= order.size;
      if (quantity <= 0) average = null;
    }
  }
  return { quantity, averageCost: quantity > 0 ? average : null };
}
