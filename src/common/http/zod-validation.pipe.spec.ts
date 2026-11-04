import { z } from 'zod';
import { BadRequestError } from '../errors/app-error';
import { ZodValidationPipe } from './zod-validation.pipe';

const pipe = new ZodValidationPipe(z.object({ id: z.coerce.number().int().positive() }));

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    expect(pipe.transform({ id: '5' })).toEqual({ id: 5 });
  });

  it('throws a 400 BadRequestError naming the field', () => {
    const attempt = () => pipe.transform({ id: '-1' });
    expect(attempt).toThrow(BadRequestError);
    expect(attempt).toThrow(/^id: /);
  });
});
