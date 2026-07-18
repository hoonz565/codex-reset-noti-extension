import { z } from 'zod';
import { alertPreferencesSchema } from './subscription.schema';

export const createSubscriptionRequestSchema = z
  .object({
    email: z.string().email(),
    preferences: alertPreferencesSchema,
  })
  .strict();
