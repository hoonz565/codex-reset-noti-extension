import { z } from 'zod';

export const alertPreferencesSchema = z
  .object({
    probability70: z.boolean(),
    resetAnnounced: z.boolean(),
  })
  .strict()
  .refine((data) => data.probability70 || data.resetAnnounced, {
    message: 'At least one subscription alert must be selected',
  });

export type SubscriptionPreferences = z.infer<typeof alertPreferencesSchema>;
