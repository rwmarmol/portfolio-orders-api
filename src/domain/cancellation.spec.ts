import { evaluateCancellation } from './cancellation';

describe('evaluateCancellation', () => {
  it('cancels a NEW order', () => {
    expect(evaluateCancellation('NEW')).toBe('CANCEL');
  });

  it('treats a repeated cancellation as already done', () => {
    expect(evaluateCancellation('CANCELLED')).toBe('ALREADY_CANCELLED');
  });

  it.each(['FILLED', 'REJECTED'] as const)('does not allow cancelling a %s order', (status) => {
    expect(evaluateCancellation(status)).toBe('NOT_CANCELLABLE');
  });
});
