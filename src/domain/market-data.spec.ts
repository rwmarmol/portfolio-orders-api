import { latestQuotes } from './market-data';
import type { MarketQuote } from './types';

const quote = (instrumentId: number, date: string, close: string): MarketQuote => ({
  instrumentId,
  date,
  close,
  previousClose: null,
});

describe('latestQuotes', () => {
  it('keeps the quote with the greatest date per instrument', () => {
    const latest = latestQuotes([
      quote(1, '2023-07-14', '20'),
      quote(1, '2023-07-13', '10'),
      quote(2, '2023-07-13', '5'),
    ]);
    expect(latest.get(1)?.close).toBe('20');
    expect(latest.get(2)?.close).toBe('5');
    expect(latest.has(66)).toBe(false);
  });
});
