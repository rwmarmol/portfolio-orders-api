import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { BadRequestError, NotFoundError } from '../common/errors/app-error';
import { TransactionRunner } from '../database/transaction-runner';
import {
  assertTradable,
  buyablePesos,
  evaluateOrder,
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
   */
  async submit(userId: number, input: CreateOrderInput): Promise<OrderResponse> {
    const { stored, reason } = await this.transactions.run(async (db) => {
      if (!(await this.users.lockForUpdate(userId, db))) {
        throw new NotFoundError(`User ${userId} not found`);
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
        buyablePesos: buyablePesos(active),
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
        },
        db,
      );
      return { stored, reason: evaluation.reason };
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
      'order.created',
    );
    return presentOrder(stored, reason);
  }
}
