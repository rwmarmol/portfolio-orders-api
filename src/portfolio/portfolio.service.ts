import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NotFoundError } from '../common/errors/app-error';
import { TransactionRunner } from '../database/transaction-runner';
import { buildPortfolio, openPositions } from '../domain';
import { InstrumentsRepository } from '../instruments/instruments.repository';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { UsersRepository } from '../users/users.repository';
import { PortfolioResponse, presentPortfolio } from './portfolio.presenter';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly users: UsersRepository,
    private readonly orders: OrdersRepository,
    private readonly marketData: MarketDataRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly logger: Logger,
  ) {}

  async get(userId: number): Promise<PortfolioResponse> {
    // One snapshot for all reads, so orders and prices are consistent with each other.
    return this.transactions.run(
      async (db) => {
        if (!(await this.users.exists(userId, db))) {
          throw new NotFoundError(`User ${userId} not found`);
        }
        const orders = await this.orders.findActiveByUser(userId, db);
        const instrumentIds = openPositions(orders).map((position) => position.instrumentId);
        const quotes = await this.marketData.latestQuotes(instrumentIds, db);
        const instruments = await this.instruments.findByIds(instrumentIds, db);

        const portfolio = buildPortfolio(orders, quotes, {
          onMissingMarketData: (instrumentId) =>
            this.logger.warn({ userId, instrumentId }, 'Position without market data'),
        });
        return presentPortfolio(userId, portfolio, instruments);
      },
      { isolation: 'REPEATABLE READ', readOnly: true },
    );
  }
}
