import { EnvValidationError, parseEnv } from './env.schema';

const valid = { DATABASE_URL: 'postgresql://user:secret-pass@localhost:5432/db' };

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv({ ...valid, PORT: '4000' });
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 4000, LOG_LEVEL: 'info' });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });

  it('rejects a non-postgres DATABASE_URL without leaking its value', () => {
    const attempt = () => parseEnv({ DATABASE_URL: 'mysql://user:secret-pass@host/db' });
    expect(attempt).toThrow(EnvValidationError);
    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).not.toThrow(/secret-pass/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
