import { z } from 'zod';

export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_OFFSET = 100_000;

/** Query of GET /instruments: with `q` it searches, without it lists every tradable instrument. */
export const instrumentsQuerySchema = z.object({
  q: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});

export type InstrumentsQuery = z.infer<typeof instrumentsQuerySchema>;
