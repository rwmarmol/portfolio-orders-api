import { Injectable } from '@nestjs/common';
import { Instrument, InstrumentsRepository } from './instruments.repository';
import type { InstrumentsQuery } from './instruments.schemas';

export interface InstrumentsResponse {
  items: Instrument[];
  /** Matches for the whole query, ignoring limit and offset. */
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class InstrumentsService {
  constructor(private readonly instruments: InstrumentsRepository) {}

  async find({ q, limit, offset }: InstrumentsQuery): Promise<InstrumentsResponse> {
    const page =
      q === undefined
        ? await this.instruments.list(limit, offset)
        : await this.instruments.search(q, limit, offset);
    return { ...page, limit, offset };
  }
}
