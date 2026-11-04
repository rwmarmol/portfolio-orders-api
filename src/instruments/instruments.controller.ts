import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import type { Instrument } from './instruments.repository';
import { SearchQuery, searchQuerySchema } from './instruments.schemas';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly service: InstrumentsService) {}

  @Get()
  async search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ): Promise<{ items: Instrument[] }> {
    return { items: await this.service.search(query) };
  }
}
