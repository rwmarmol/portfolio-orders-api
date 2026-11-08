import { z } from 'zod';
import { userParamSchema } from '../portfolio/portfolio.schemas';

const INT4_MAX = 2_147_483_647;

/**
 * Money arrives as a string or a JSON number and is normalized to a decimal string: at most 2
 * decimals (NUMERIC(10,2)), no exponent notation, no sign. It is never parsed as a float.
 */
const moneyString = (maxIntegerDigits: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(
      z
        .string()
        .regex(
          new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,2})?$`),
          `must be a positive amount with at most 2 decimals`,
        ),
    )
    .refine((value) => Number(value) > 0, 'must be greater than zero');

const orderBodySchema = z
  .strictObject({
    instrumentId: z.number().int().min(1).max(INT4_MAX),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    quantity: z.number().int().min(1).max(INT4_MAX).optional(),
    amount: moneyString(12).optional(),
    price: moneyString(8).optional(),
    clientOrderId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._:-]+$/, 'only letters, digits and . _ : -'),
  })
  .superRefine((order, ctx) => {
    if ((order.quantity === undefined) === (order.amount === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'send exactly one of quantity or amount',
        path: ['quantity'],
      });
    }
    if (order.type === 'LIMIT' && order.price === undefined) {
      ctx.addIssue({ code: 'custom', message: 'required for LIMIT orders', path: ['price'] });
    }
  });

/**
 * A MARKET order executes at the market price, so a `price` sent with it is ignored (D11): it is
 * dropped before validation, so even a malformed value cannot make the request fail.
 */
function dropPriceFromMarketOrder(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const body = raw as Record<string, unknown>;
  if (body.type !== 'MARKET' || !('price' in body)) return raw;
  const withoutPrice = { ...body };
  delete withoutPrice.price;
  return withoutPrice;
}

export const createOrderSchema = z.preprocess(dropPriceFromMarketOrder, orderBodySchema);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Path parameters of `/users/:userId/orders/:orderId/...`. */
export const orderParamSchema = userParamSchema.extend({
  orderId: z.coerce.number().int().min(1).max(INT4_MAX),
});

export type OrderParam = z.infer<typeof orderParamSchema>;
