import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/tokens';

const HEALTH_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  async check(): Promise<HealthReport> {
    try {
      await withTimeout(this.pool.query('SELECT 1'), HEALTH_TIMEOUT_MS);
      return { status: 'ok', db: 'up' };
    } catch (err) {
      this.logger.warn({ err }, 'Database health check failed');
      return { status: 'degraded', db: 'down' };
    }
  }
}
