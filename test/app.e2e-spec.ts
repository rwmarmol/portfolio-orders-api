import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Boots the real module graph so dependency-injection mistakes (e.g. import cycles) fail in CI.
// The pool connects lazily and points to a closed port: no database is needed.
describe('AppModule wiring', () => {
  let app: INestApplication;
  const previous = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://wiring:wiring@127.0.0.1:1/wiring';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it('resolves every provider and serves /health as degraded without a database', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(503, { status: 'degraded', db: 'down' });
  });

  it('rejects an invalid search query with the uniform error body', async () => {
    const res = await request(app.getHttpServer()).get('/instruments').expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, error: 'VALIDATION_ERROR' });
    expect(res.body.message).toMatch(/q/);
  });
});
