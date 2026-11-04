import { z } from 'zod';

const INT4_MAX = 2_147_483_647;

/** `:userId` path parameter shared by the user-scoped endpoints. */
export const userParamSchema = z.object({
  userId: z.coerce.number().int().min(1).max(INT4_MAX),
});

export type UserParam = z.infer<typeof userParamSchema>;
