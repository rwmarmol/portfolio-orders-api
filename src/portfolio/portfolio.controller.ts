import { Controller, Get, Param } from '@nestjs/common';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import type { PortfolioResponse } from './portfolio.presenter';
import { UserParam, userParamSchema } from './portfolio.schemas';
import { PortfolioService } from './portfolio.service';

@Controller('users/:userId/portfolio')
export class PortfolioController {
  constructor(private readonly service: PortfolioService) {}

  @Get()
  get(
    @Param(new ZodValidationPipe(userParamSchema)) { userId }: UserParam,
  ): Promise<PortfolioResponse> {
    return this.service.get(userId);
  }
}
