import { REJECTION_MESSAGES, RejectionReason } from '../domain';
import type { StoredOrder } from './orders.repository';

export interface OrderResponse extends Omit<StoredOrder, 'datetime'> {
  datetime: string;
  /** Present only when the order was stored as REJECTED. */
  reason?: string;
}

export function presentOrder(order: StoredOrder, reason?: RejectionReason): OrderResponse {
  const response: OrderResponse = { ...order, datetime: order.datetime.toISOString() };
  if (reason !== undefined) response.reason = REJECTION_MESSAGES[reason];
  return response;
}
