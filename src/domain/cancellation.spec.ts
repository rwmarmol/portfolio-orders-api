import { isCancellable } from './cancellation';

describe('isCancellable', () => {
  it('allows only NEW orders', () => {
    expect(isCancellable('NEW')).toBe(true);
    expect(isCancellable('FILLED')).toBe(false);
    expect(isCancellable('REJECTED')).toBe(false);
    expect(isCancellable('CANCELLED')).toBe(false);
  });
});
