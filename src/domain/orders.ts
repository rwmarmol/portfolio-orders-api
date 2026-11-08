import { D, Dec, DecValue } from './decimal';
import { InvalidOrderInputError } from './errors';
import type { OrderStatus, OrderType, Side } from './types';

/** `orders.size` is an INT column. */
const MAX_SIZE = 2_147_483_647;

export interface QuantityInput {
  quantity?: number | undefined;
  /** Total amount to invest, in the account currency. */
  amount?: DecValue | undefined;
  /** Price per share: the latest close for MARKET, the user's price for LIMIT. */
  price: DecValue;
}

/**
 * Resolves the number of shares of an order: exactly one of `quantity` or `amount` must be
 * given. With an amount, the quantity is the maximum whole number of shares that fits (Q8).
 */
export function resolveQuantity({ quantity, amount, price }: QuantityInput): number {
  if (quantity !== undefined && amount !== undefined) {
    throw new InvalidOrderInputError(
      'QUANTITY_AND_AMOUNT',
      'Send either quantity or amount, not both',
    );
  }
  if (quantity === undefined && amount === undefined) {
    throw new InvalidOrderInputError('QUANTITY_OR_AMOUNT_REQUIRED', 'Send quantity or amount');
  }
  const unitPrice = new D(price);
  if (!unitPrice.isFinite() || unitPrice.lte(0)) {
    throw new InvalidOrderInputError('INVALID_PRICE', 'Price must be greater than zero');
  }

  let size: number;
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidOrderInputError(
        'INVALID_QUANTITY',
        'Quantity must be a positive whole number',
      );
    }
    size = quantity;
  } else {
    const total = new D(amount as DecValue);
    if (!total.isFinite() || total.lte(0)) {
      throw new InvalidOrderInputError('INVALID_AMOUNT', 'Amount must be greater than zero');
    }
    const shares = total.div(unitPrice).floor();
    if (shares.isZero()) {
      throw new InvalidOrderInputError('AMOUNT_BELOW_PRICE', 'Amount does not cover one share');
    }
    if (shares.gt(MAX_SIZE)) {
      throw new InvalidOrderInputError('QUANTITY_TOO_LARGE', 'Quantity is too large');
    }
    size = shares.toNumber();
  }
  if (size > MAX_SIZE) {
    throw new InvalidOrderInputError('QUANTITY_TOO_LARGE', 'Quantity is too large');
  }
  return size;
}

/** BUY and SELL are not allowed on the cash instrument (type MONEDA, Q11). */
export function assertTradable(instrument: { type: string }): void {
  if (instrument.type === 'MONEDA') {
    throw new InvalidOrderInputError('INSTRUMENT_NOT_TRADABLE', 'This instrument cannot be traded');
  }
}

export type RejectionReason = 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_HOLDINGS' | 'NO_MARKET_PRICE';

/** Human-readable reason returned to the client with a REJECTED order. */
export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  INSUFFICIENT_FUNDS: 'insufficient funds',
  INSUFFICIENT_HOLDINGS: 'insufficient holdings',
  NO_MARKET_PRICE: 'no market price available',
};

export interface OrderEvaluation {
  status: 'FILLED' | 'NEW' | 'REJECTED';
  reason?: RejectionReason;
}

export interface EvaluateOrderInput {
  side: 'BUY' | 'SELL';
  type: OrderType;
  size: number;
  /**
   * Execution price for MARKET (latest close, null when the instrument has no market data),
   * user's price for LIMIT (required).
   */
  price: DecValue | null;
  /** `buyableAmount` of the user, already net of NEW LIMIT BUY commitments. */
  buyableAmount: DecValue;
  /** `sellableShares` of the user for the instrument, already net of NEW LIMIT SELL commitments. */
  sellableShares: number;
}

/**
 * Outcome of a new BUY/SELL order: REJECTED when a MARKET order has no market price (D10) or
 * when funds or holdings are insufficient, otherwise FILLED for MARKET and NEW for LIMIT. Must run inside the order transaction, under the
 * per-user lock, with balances computed in that same transaction.
 */
export function evaluateOrder(input: EvaluateOrderInput): OrderEvaluation {
  if (input.price === null) {
    if (input.type === 'MARKET') return { status: 'REJECTED', reason: 'NO_MARKET_PRICE' };
    throw new InvalidOrderInputError('INVALID_PRICE', 'A LIMIT order requires a price');
  }
  if (input.side === 'BUY') {
    const cost: Dec = new D(input.price).times(input.size);
    if (cost.gt(input.buyableAmount)) return { status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' };
  } else if (input.size > input.sellableShares) {
    return { status: 'REJECTED', reason: 'INSUFFICIENT_HOLDINGS' };
  }
  return { status: input.type === 'MARKET' ? 'FILLED' : 'NEW' };
}

/**
 * Why a stored REJECTED order was rejected, derived from the order itself: a missing price means
 * no market price; otherwise a BUY lacked funds and a SELL lacked holdings. Lets a repeated
 * request be answered with the same reason without storing it.
 */
export function rejectionReasonOf(order: {
  side: Side;
  status: OrderStatus;
  price: string | null;
}): RejectionReason | undefined {
  if (order.status !== 'REJECTED') return undefined;
  if (order.price === null) return 'NO_MARKET_PRICE';
  return order.side === 'SELL' ? 'INSUFFICIENT_HOLDINGS' : 'INSUFFICIENT_FUNDS';
}

export interface StoredOrderSummary {
  instrumentId: number;
  side: Side;
  type: OrderType;
  size: number;
  price: string | null;
}

export interface OrderRequestSummary {
  instrumentId: number;
  side: 'BUY' | 'SELL';
  type: OrderType;
  quantity?: number | undefined;
  price?: string | undefined;
}

/**
 * Whether a request that reuses a clientOrderId describes the order already stored under it
 * (D14). Compares instrument, side and type, plus the quantity when it was sent and the price of
 * a LIMIT order. An amount is not compared: the quantity it produced depended on the price at
 * that moment.
 */
export function orderMatchesRequest(
  stored: StoredOrderSummary,
  request: OrderRequestSummary,
): boolean {
  if (
    stored.instrumentId !== request.instrumentId ||
    stored.side !== request.side ||
    stored.type !== request.type
  ) {
    return false;
  }
  if (request.quantity !== undefined && stored.size !== request.quantity) return false;
  if (request.type === 'LIMIT') {
    if (request.price === undefined || stored.price === null) return false;
    if (!new D(stored.price).eq(request.price)) return false;
  }
  return true;
}
