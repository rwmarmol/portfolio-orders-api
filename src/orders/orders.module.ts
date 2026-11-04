import { Module } from '@nestjs/common';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [UsersModule, InstrumentsModule, MarketDataModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersRepository],
})
export class OrdersModule {}
