import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { InstrumentsQuery, instrumentsQuerySchema } from './instruments.schemas';
import { InstrumentsResponse, InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly service: InstrumentsService) {}

  /** Searches by ticker or name when `q` is given, otherwise lists every tradable instrument. */
  @Get()
  find(
    @Query(new ZodValidationPipe(instrumentsQuerySchema)) query: InstrumentsQuery,
  ): Promise<InstrumentsResponse> {
    return this.service.find(query);
  }
}
