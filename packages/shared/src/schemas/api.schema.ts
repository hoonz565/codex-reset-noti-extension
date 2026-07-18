import { z } from 'zod';
import { alertPreferencesSchema } from './subscription.schema';

export const createSubscriptionRequestSchema = z
  .object({
    email: z.string().email(),
    preferences: alertPreferencesSchema,
    installationId: z.string().optional(),
  })
  .strict();
export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionRequestSchema>;

export const confirmSubscriptionRequestSchema = z
  .object({
    token: z.string().min(10),
  })
  .strict();
export type ConfirmSubscriptionRequest = z.infer<typeof confirmSubscriptionRequestSchema>;

export const updatePreferencesRequestSchema = z
  .object({
    preferences: alertPreferencesSchema,
  })
  .strict();
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

export const requestManagementLinkSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();
export type RequestManagementLinkRequest = z.infer<typeof requestManagementLinkSchema>;

export const genericAcceptedResponseSchema = z
  .object({
    accepted: z.literal(true),
    message: z.string(),
  })
  .strict();
export type GenericAcceptedResponse = z.infer<typeof genericAcceptedResponseSchema>;

export const manageSubscriptionResponseSchema = z
  .object({
    state: z.enum(['pending', 'active', 'unsubscribed', 'suppressed']),
    preferences: alertPreferencesSchema,
    updatedAt: z.string(),
  })
  .strict();
export type ManageSubscriptionResponse = z.infer<typeof manageSubscriptionResponseSchema>;
