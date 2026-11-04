import { Module } from '@nestjs/common';
import { MarketDataRepository } from './market-data.repository';

@Module({ providers: [MarketDataRepository], exports: [MarketDataRepository] })
export class MarketDataModule {}
