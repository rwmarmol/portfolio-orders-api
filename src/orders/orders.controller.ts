import { Body, Controller, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  /**
   * 201 also for REJECTED orders: they are stored, and the body carries status and reason.
   * 200 when a repeated `clientOrderId` returns the order that already exists (D14).
   */
  @Post()
  async submit(
    @Param(new ZodValidationPipe(userParamSchema)) { userId }: UserParam,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderResponse> {
    const { order, replayed } = await this.service.submit(userId, body);
    if (replayed) res.status(HttpStatus.OK);
    return order;
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
