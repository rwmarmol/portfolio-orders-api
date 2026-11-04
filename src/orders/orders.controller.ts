import { Body, Controller, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { UserParam, userParamSchema } from '../portfolio/portfolio.schemas';
import type { OrderResponse } from './orders.presenter';
import { CreateOrderInput, createOrderSchema } from './orders.schemas';
import { OrdersService } from './orders.service';

@Controller('users/:userId/orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  /** 201 also for REJECTED orders: they are stored, and the body carries status and reason. */
  @Post()
  submit(
    @Param(new ZodValidationPipe(userParamSchema)) { userId }: UserParam,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ): Promise<OrderResponse> {
    return this.service.submit(userId, body);
  }
}
