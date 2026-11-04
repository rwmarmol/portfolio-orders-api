import { searchQuerySchema } from './instruments.schemas';

describe('searchQuerySchema', () => {
  it('trims q and applies the default limit', () => {
    expect(searchQuerySchema.parse({ q: '  pa ' })).toEqual({ q: 'pa', limit: 20 });
  });

  it.each([
    ['missing q', {}],
    ['blank q', { q: '   ' }],
    ['q too long', { q: 'x'.repeat(51) }],
    ['repeated q', { q: ['a', 'b'] }],
    ['limit zero', { q: 'a', limit: '0' }],
    ['limit above the maximum', { q: 'a', limit: '51' }],
    ['fractional limit', { q: 'a', limit: '2.5' }],
  ])('rejects %s', (_label, input) => {
    expect(searchQuerySchema.safeParse(input).success).toBe(false);
  });

  it('accepts the maximum limit', () => {
    expect(searchQuerySchema.parse({ q: 'a', limit: '50' }).limit).toBe(50);
  });
});
