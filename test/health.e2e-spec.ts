import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PG_POOL } from '../src/database/tokens';

async function createApp(query: jest.Mock): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: PG_POOL, useValue: { query } },
      { provide: Logger, useValue: { warn: jest.fn() } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health', () => {
  let app: INestApplication;
  afterEach(async () => app.close());

  it('returns 200 when the database answers', async () => {
    app = await createApp(jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }));
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', db: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    app = await createApp(jest.fn().mockRejectedValue(new Error('connection refused')));
    await request(app.getHttpServer())
      .get('/health')
      .expect(503, { status: 'degraded', db: 'down' });
  });
});
