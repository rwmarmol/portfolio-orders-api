import { escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('leaves plain text untouched', () => {
    expect(escapeLike('Telecom S.A.')).toBe('Telecom S.A.');
  });
});
