import { D, Dec } from './decimal';
import type { OrderRecord } from './types';

function notional(order: OrderRecord): Dec {
  return new D(order.price).times(order.size);
}

/** Cash from FILLED movements: CASH_IN and SELL add, CASH_OUT and BUY subtract. */
export function filledCash(orders: readonly OrderRecord[]): Dec {
  let total = new D(0);
  for (const order of orders) {
    if (order.status !== 'FILLED') continue;
    switch (order.side) {
      case 'CASH_IN':
      case 'SELL':
        total = total.plus(notional(order));
        break;
      case 'CASH_OUT':
      case 'BUY':
        total = total.minus(notional(order));
        break;
    }
  }
  return total;
}

/** Funds committed by NEW LIMIT BUY orders (no reservation table; see decision Q3). */
export function committedAmount(orders: readonly OrderRecord[]): Dec {
  let total = new D(0);
  for (const order of orders) {
    if (order.status === 'NEW' && order.type === 'LIMIT' && order.side === 'BUY') {
      total = total.plus(notional(order));
    }
  }
  return total;
}

/** Funds a new order can use: FILLED cash minus what NEW LIMIT BUY orders commit. */
export function buyableAmount(orders: readonly OrderRecord[]): Dec {
  return filledCash(orders).minus(committedAmount(orders));
}

/** Net quantity per instrument from FILLED BUY/SELL orders. Cash movements are ignored. */
export function netQuantities(orders: readonly OrderRecord[]): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const order of orders) {
    if (order.status !== 'FILLED') continue;
    if (order.side !== 'BUY' && order.side !== 'SELL') continue;
    const delta = order.side === 'BUY' ? order.size : -order.size;
    quantities.set(order.instrumentId, (quantities.get(order.instrumentId) ?? 0) + delta);
  }
  return quantities;
}

/** Instruments with a non-zero net quantity, ordered by instrument id. Negative ones are kept. */
export function openPositions(
  orders: readonly OrderRecord[],
): { instrumentId: number; quantity: number }[] {
  return [...netQuantities(orders)]
    .filter(([, quantity]) => quantity !== 0)
    .map(([instrumentId, quantity]) => ({ instrumentId, quantity }))
    .sort((a, b) => a.instrumentId - b.instrumentId);
}

/** Shares committed by NEW LIMIT SELL orders on an instrument. */
export function committedShares(orders: readonly OrderRecord[], instrumentId: number): number {
  let total = 0;
  for (const order of orders) {
    if (
      order.status === 'NEW' &&
      order.type === 'LIMIT' &&
      order.side === 'SELL' &&
      order.instrumentId === instrumentId
    ) {
      total += order.size;
    }
  }
  return total;
}

/** Shares a new SELL can use: FILLED holdings minus what NEW LIMIT SELL orders commit. */
export function sellableShares(orders: readonly OrderRecord[], instrumentId: number): number {
  const held = netQuantities(orders).get(instrumentId) ?? 0;
  return held - committedShares(orders, instrumentId);
}
