import { instrumentsQuerySchema } from './instruments.schemas';

describe('instrumentsQuerySchema', () => {
  it('trims q and applies the default limit and offset', () => {
    expect(instrumentsQuerySchema.parse({ q: '  pa ' })).toEqual({ q: 'pa', limit: 20, offset: 0 });
  });

  it('allows a missing q, which lists every instrument', () => {
    expect(instrumentsQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('parses limit and offset from the query string', () => {
    expect(instrumentsQuerySchema.parse({ limit: '50', offset: '40' })).toEqual({
      limit: 50,
      offset: 40,
    });
  });

  it.each([
    ['blank q', { q: '   ' }],
    ['empty q', { q: '' }],
    ['q too long', { q: 'x'.repeat(51) }],
    ['repeated q', { q: ['a', 'b'] }],
    ['limit zero', { limit: '0' }],
    ['limit above the maximum', { limit: '51' }],
    ['fractional limit', { limit: '2.5' }],
    ['negative offset', { offset: '-1' }],
    ['fractional offset', { offset: '1.5' }],
    ['offset above the maximum', { offset: '100001' }],
    ['non-numeric offset', { offset: 'abc' }],
  ])('rejects %s', (_label, input) => {
    expect(instrumentsQuerySchema.safeParse(input).success).toBe(false);
  });
});
