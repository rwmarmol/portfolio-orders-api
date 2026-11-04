import { Logger } from 'nestjs-pino';
import type { TransactionRunner } from '../database/transaction-runner';
import { NotFoundError } from '../common/errors/app-error';
import type { OrderRecord } from '../domain';
import type { InstrumentsRepository } from '../instruments/instruments.repository';
import type { MarketDataRepository } from '../market-data/market-data.repository';
import type { OrdersRepository } from '../orders/orders.repository';
import type { UsersRepository } from '../users/users.repository';
import { PortfolioService } from './portfolio.service';

const buy: OrderRecord = {
  id: 1,
  instrumentId: 54,
  side: 'BUY',
  type: 'MARKET',
  status: 'FILLED',
  size: 10,
  price: '250',
  datetime: new Date('2023-07-13T14:11:20Z'),
};

function setup(userExists: boolean, quotes = new Map()) {
  const warn = jest.fn();
  const transactions = { run: (work: (db: unknown) => unknown) => work({}) };
  const service = new PortfolioService(
    transactions as unknown as TransactionRunner,
    { exists: jest.fn().mockResolvedValue(userExists) } as unknown as UsersRepository,
    { findActiveByUser: jest.fn().mockResolvedValue([buy]) } as unknown as OrdersRepository,
    { latestQuotes: jest.fn().mockResolvedValue(quotes) } as unknown as MarketDataRepository,
    {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([[54, { id: 54, ticker: 'X', name: 'X SA', type: 'ACCIONES' }]]),
        ),
    } as unknown as InstrumentsRepository,
    { warn } as unknown as Logger,
  );
  return { service, warn };
}

describe('PortfolioService', () => {
  it('throws NotFoundError for an unknown user', async () => {
    await expect(setup(false).service.get(99)).rejects.toThrow(NotFoundError);
  });

  it('warns with the affected instrument and reports a partial total', async () => {
    const { service, warn } = setup(true);
    const result = await service.get(1);
    expect(result.totalIsPartial).toBe(true);
    expect(result.positions[0]).toMatchObject({ instrumentId: 54, ticker: 'X', marketValue: null });
    expect(warn).toHaveBeenCalledWith(
      { userId: 1, instrumentId: 54 },
      'Position without market data',
    );
  });

  it('formats money as 2-decimal strings when prices exist', async () => {
    const quotes = new Map([
      [54, { instrumentId: 54, date: '2023-07-14', close: '260', previousClose: '250' }],
    ]);
    const { service, warn } = setup(true, quotes);
    const result = await service.get(1);
    expect(result).toMatchObject({
      availablePesos: '-2500.00',
      totalValue: '100.00',
      totalIsPartial: false,
    });
    expect(result.positions[0]).toMatchObject({
      marketValue: '2600.00',
      averageCost: '250.00',
      dailyReturnPct: '4.00',
      totalReturnPct: '4.00',
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
