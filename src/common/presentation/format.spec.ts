import { D } from '../../domain';
import { formatDecimal, formatDecimalOrNull } from './format';

describe('formatDecimal', () => {
  it('rounds half-up to 2 decimals', () => {
    expect(formatDecimal(new D('1.005'))).toBe('1.01');
    expect(formatDecimal(new D('-1.005'))).toBe('-1.01');
    expect(formatDecimal(new D('5.26315789473684'))).toBe('5.26');
  });

  it('pads integers and never prints negative zero', () => {
    expect(formatDecimal(new D('753000'))).toBe('753000.00');
    expect(formatDecimal(new D('-0.001'))).toBe('0.00');
  });

  it('passes null through', () => {
    expect(formatDecimalOrNull(null)).toBeNull();
    expect(formatDecimalOrNull(new D('1'))).toBe('1.00');
  });
});
