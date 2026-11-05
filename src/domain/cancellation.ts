import type { OrderStatus } from './types';

export type CancellationOutcome = 'CANCEL' | 'ALREADY_CANCELLED' | 'NOT_CANCELLABLE';

/**
 * What a cancellation request means for an order in the given status (Q1, D12):
 * - NEW: it is cancelled;
 * - CANCELLED: the request is repeated and the goal is already met, so it succeeds without
 *   changing anything (idempotent, safe for clients that retry);
 * - FILLED or REJECTED: the order can no longer be cancelled.
 */
export function evaluateCancellation(status: OrderStatus): CancellationOutcome {
  if (status === 'NEW') return 'CANCEL';
  if (status === 'CANCELLED') return 'ALREADY_CANCELLED';
  return 'NOT_CANCELLABLE';
}
