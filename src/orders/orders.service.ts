import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { BadRequestError, ConflictError, NotFoundError } from '../common/errors/app-error';
import { TransactionRunner } from '../database/transaction-runner';
import {
  assertTradable,
  buyableAmount,
  evaluateOrder,
  evaluateCancellation,
  orderMatchesRequest,
  rejectionReasonOf,
  resolveQuantity,
  sellableShares,
} from '../domain';
import { InstrumentsRepository } from '../instruments/instruments.repository';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { UsersRepository } from '../users/users.repository';
import { OrderResponse, presentOrder } from './orders.presenter';
import { OrdersRepository } from './orders.repository';
import type { CreateOrderInput } from './orders.schemas';

@Injectable()
export class OrdersService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly users: UsersRepository,
    private readonly orders: OrdersRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly marketData: MarketDataRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Validates funds or holdings and inserts the order in a single transaction, under a per-user
   * lock (D1). A business rejection is stored as REJECTED and returned, not thrown.
   *
   * Idempotent through the client's `clientOrderId` (D14): a retry with the same id returns the
   * order already created, flagged as `replayed`, and creates nothing. The lookup runs under the
   * per-user lock, so simultaneous retries are serialized and only the first one creates.
   */
  async submit(
    userId: number,
    input: CreateOrderInput,
  ): Promise<{ order: OrderResponse; replayed: boolean }> {
    const { stored, reason, replayed } = await this.transactions.run(async (db) => {
      if (!(await this.users.lockForUpdate(userId, db))) {
        throw new NotFoundError(`User ${userId} not found`);
      }

      const existing = await this.orders.findByClientOrderId(userId, input.clientOrderId, db);
      if (existing !== undefined) {
        if (!orderMatchesRequest(existing, input)) {
          throw new ConflictError(
            `clientOrderId ${input.clientOrderId} was already used for a different order`,
            'IDEMPOTENCY_KEY_REUSED',
          );
        }
        return { stored: existing, reason: rejectionReasonOf(existing), replayed: true };
      }

      const instrument = await this.instruments.findById(input.instrumentId, db);
      if (instrument === undefined) {
        throw new BadRequestError(
          `Instrument ${input.instrumentId} not found`,
          'INSTRUMENT_NOT_FOUND',
        );
      }
      assertTradable(instrument);

      // MARKET executes at the latest close (Q9); LIMIT keeps the user's price.
      let price: string | null;
      if (input.type === 'LIMIT') {
        if (input.price === undefined)
          throw new BadRequestError('price: required for LIMIT orders');
        price = input.price;
      } else {
        const quotes = await this.marketData.latestQuotes([instrument.id], db);
        price = quotes.get(instrument.id)?.close ?? null;
      }

      let size: number;
      if (price === null) {
        // No price to size an amount with (D10): only an exact quantity can be stored and rejected.
        if (input.quantity === undefined) {
          throw new BadRequestError(
            'Cannot size a MARKET order by amount without a market price',
            'NO_MARKET_PRICE',
          );
        }
        size = input.quantity;
      } else {
        size = resolveQuantity({ quantity: input.quantity, amount: input.amount, price });
      }

      const active = await this.orders.findActiveByUser(userId, db);
      const evaluation = evaluateOrder({
        side: input.side,
        type: input.type,
        size,
        price,
        buyableAmount: buyableAmount(active),
        sellableShares: sellableShares(active, instrument.id),
      });

      const stored = await this.orders.insert(
        {
          userId,
          instrumentId: instrument.id,
          size,
          price,
          type: input.type,
          side: input.side,
          status: evaluation.status,
          clientOrderId: input.clientOrderId,
        },
        db,
      );
      return { stored, reason: evaluation.reason, replayed: false };
    });

    this.logger.log(
      {
        orderId: stored.id,
        userId,
        instrumentId: stored.instrumentId,
        side: stored.side,
        type: stored.type,
        status: stored.status,
        reason,
      },
      replayed ? 'order.replayed' : 'order.created',
    );
    return { order: presentOrder(stored, reason), replayed };
  }

  /**
   * Cancels a NEW order (Q1, D12). Runs under the same per-user lock as order submission, so a
   * cancellation cannot interleave with a new order of that user. The funds or shares the order
   * committed are released implicitly: commitments are computed from NEW orders (Q3).
   * Idempotent: cancelling an already CANCELLED order succeeds and changes nothing.
   */
  async cancel(userId: number, orderId: number): Promise<OrderResponse> {
    const { order: result, repeated } = await this.transactions.run(async (db) => {
      if (!(await this.users.lockForUpdate(userId, db))) {
        throw new NotFoundError(`User ${userId} not found`);
      }
      const order = await this.orders.findByIdForUser(orderId, userId, db);
      if (order === undefined) throw new NotFoundError(`Order ${orderId} not found`);
      const outcome = evaluateCancellation(order.status);
      if (outcome === 'ALREADY_CANCELLED') return { order, repeated: true };
      if (outcome === 'NOT_CANCELLABLE') {
        throw new ConflictError(
          `Only NEW orders can be cancelled (order ${orderId} is ${order.status})`,
          'ORDER_NOT_CANCELLABLE',
        );
      }
      const updated = await this.orders.cancel(orderId, db);
      if (updated === undefined) {
        throw new ConflictError(
          `Order ${orderId} is no longer NEW and cannot be cancelled`,
          'ORDER_NOT_CANCELLABLE',
        );
      }
      return { order: updated, repeated: false };
    });

    this.logger.log(
      { orderId, userId, instrumentId: result.instrumentId, status: result.status },
      repeated ? 'order.cancel.repeated' : 'order.cancelled',
    );
    return presentOrder(result);
  }
}
