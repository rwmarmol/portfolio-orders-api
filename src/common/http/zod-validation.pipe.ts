import { Injectable, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { BadRequestError } from '../errors/app-error';

/** Validates and parses a request part (body, query, param) with a zod schema. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ` : '') + issue.message)
        .join('; ');
      throw new BadRequestError(message);
    }
    return result.data;
  }
}
