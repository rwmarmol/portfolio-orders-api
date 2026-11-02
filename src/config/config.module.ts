import { Global, Module } from '@nestjs/common';
import { Env, parseEnv } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): Env => parseEnv(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
