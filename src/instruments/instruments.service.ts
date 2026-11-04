import { Injectable } from '@nestjs/common';
import { Instrument, InstrumentsRepository } from './instruments.repository';
import type { SearchQuery } from './instruments.schemas';

@Injectable()
export class InstrumentsService {
  constructor(private readonly instruments: InstrumentsRepository) {}

  search({ q, limit }: SearchQuery): Promise<Instrument[]> {
    return this.instruments.search(q, limit);
  }
}
