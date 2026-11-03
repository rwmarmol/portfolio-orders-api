export type Side = 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';

/** An order as stored. `price` is the NUMERIC string returned by the pg driver. */
export interface OrderRecord {
  id: number;
  instrumentId: number;
  side: Side;
  type: OrderType;
  status: OrderStatus;
  size: number;
  price: string;
  datetime: Date;
}

/** One day of market data for an instrument. `date` is an ISO date (YYYY-MM-DD). */
export interface MarketQuote {
  instrumentId: number;
  date: string;
  close: string;
  previousClose: string | null;
}
