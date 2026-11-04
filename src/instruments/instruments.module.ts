import { Module } from '@nestjs/common';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsRepository } from './instruments.repository';
import { InstrumentsService } from './instruments.service';

@Module({
  controllers: [InstrumentsController],
  providers: [InstrumentsRepository, InstrumentsService],
  exports: [InstrumentsRepository],
})
export class InstrumentsModule {}
