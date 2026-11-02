import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env.schema';

export const PG_POOL = Symbol('PG_POOL');

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG, Logger],
      useFactory: (env: Env, logger: Logger): Pool => {
        const pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: env.DATABASE_POOL_MAX,
          connectionTimeoutMillis: 5_000,
          query_timeout: 10_000,
          idleTimeoutMillis: 30_000,
        });
        // Idle clients can fail (e.g. server restart); without a handler this crashes the process.
        pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle pg client'));
        return pool;
      },
    },
    PoolLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
