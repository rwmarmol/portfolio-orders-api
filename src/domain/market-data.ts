import type { MarketQuote } from './types';

/**
 * Latest quote per instrument (greatest ISO date). If an instrument has two rows for the same
 * date, the first one encountered wins.
 */
export function latestQuotes(quotes: readonly MarketQuote[]): Map<number, MarketQuote> {
  const latest = new Map<number, MarketQuote>();
  for (const quote of quotes) {
    const current = latest.get(quote.instrumentId);
    if (current === undefined || quote.date > current.date) latest.set(quote.instrumentId, quote);
  }
  return latest;
}
