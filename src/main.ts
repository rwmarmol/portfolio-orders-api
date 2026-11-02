import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config.module';
import { EnvValidationError } from './config/env.schema';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const env = app.get<Env>(APP_CONFIG);
  await app.listen(env.PORT);
  app.get(Logger).log(`Listening on port ${env.PORT}`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
  } else {
    console.error(JSON.stringify({ level: 'fatal', msg: 'Failed to start', err: String(err) }));
  }
  process.exit(1);
});
