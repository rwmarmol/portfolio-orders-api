import { D } from './decimal';
import { dailyReturnPct, totalReturnPct } from './returns';

describe('dailyReturnPct', () => {
  it('compares close with previousClose', () => {
    expect(dailyReturnPct('1100', '1000')?.toFixed(2)).toBe('10.00');
    expect(dailyReturnPct('900', '1000')?.toFixed(2)).toBe('-10.00');
  });

  it('is null without a usable previous close', () => {
    expect(dailyReturnPct('10', null)).toBeNull();
    expect(dailyReturnPct('10', '0')).toBeNull();
  });
});

describe('totalReturnPct', () => {
  it('compares close with the average cost', () => {
    expect(totalReturnPct('1000', new D('930'))?.toFixed(4)).toBe('7.5269');
  });

  it('is null without an average cost', () => {
    expect(totalReturnPct('1000', null)).toBeNull();
  });
});
