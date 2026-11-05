import type { OrderStatus } from './types';

/** Only an order that is still NEW can be cancelled (decision Q1). */
export function isCancellable(status: OrderStatus): boolean {
  return status === 'NEW';
}
