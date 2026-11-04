import { parseTimestampAsUtc } from './pg-types';

describe('parseTimestampAsUtc', () => {
  it('reads a naive timestamp as UTC regardless of the process time zone', () => {
    expect(parseTimestampAsUtc('2023-07-12 12:11:20').toISOString()).toBe(
      '2023-07-12T12:11:20.000Z',
    );
  });

  it('keeps fractional seconds', () => {
    expect(parseTimestampAsUtc('2023-07-12 12:11:20.123456').getUTCMilliseconds()).toBe(123);
  });
});
