import { types } from 'pg';

/**
 * `orders.datetime` is TIMESTAMP without time zone and holds UTC wall-clock values. node-pg would
 * parse it in the process time zone, which would reorder the chronological walk used for the
 * average cost. Parse it as UTC instead.
 */
export function parseTimestampAsUtc(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

/** Registers the type parsers once. NUMERIC is left as a string on purpose (money). */
export function registerPgTypeParsers(): void {
  types.setTypeParser(types.builtins.TIMESTAMP, parseTimestampAsUtc);
  // Keep DATE as the plain 'YYYY-MM-DD' string instead of a local-time Date.
  types.setTypeParser(types.builtins.DATE, (value: string) => value);
}
