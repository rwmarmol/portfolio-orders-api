import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { UserParam, userParamSchema } from '../portfolio/portfolio.schemas';
import type { OrderResponse } from './orders.presenter';
import {
  CreateOrderInput,
  OrderParam,
  createOrderSchema,
  orderParamSchema,
} from './orders.schemas';
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

  /**
   * Cancels a NEW order. A dedicated action instead of PUT/PATCH so clients cannot set arbitrary
   * statuses, and instead of DELETE because the order is kept (as CANCELLED), not removed.
   */
  @Post(':orderId/cancel')
  @HttpCode(200)
  cancel(
    @Param(new ZodValidationPipe(orderParamSchema)) { userId, orderId }: OrderParam,
  ): Promise<OrderResponse> {
    return this.service.cancel(userId, orderId);
  }
}
