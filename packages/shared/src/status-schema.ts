import { z } from 'zod';

export const PublicResetStatusSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('empty'),
    probability: z.null(),
    lastKnownProbability: z.null(),
    lastKnownObservedAt: z.null(),
    resetAnnounced: z.boolean(),
    latestResetAt: z.null(),
    resetCycleId: z.null(),
    checkedAt: z.null(),
  }),
  z.object({
    state: z.literal('fresh'),
    probability: z.number().min(0).max(100),
    lastKnownProbability: z.null(),
    lastKnownObservedAt: z.null(),
    resetAnnounced: z.boolean(),
    latestResetAt: z.string().nullable(),
    resetCycleId: z.string().nullable(),
    checkedAt: z.string(),
  }),
  z.object({
    state: z.literal('stale'),
    probability: z.number().min(0).max(100),
    lastKnownProbability: z.null(),
    lastKnownObservedAt: z.null(),
    resetAnnounced: z.boolean(),
    latestResetAt: z.string().nullable(),
    resetCycleId: z.string().nullable(),
    checkedAt: z.string(),
  }),
  z.object({
    state: z.literal('unavailable'),
    probability: z.null(),
    lastKnownProbability: z.number().min(0).max(100).nullable(),
    lastKnownObservedAt: z.string().nullable(),
    resetAnnounced: z.boolean(),
    latestResetAt: z.string().nullable(),
    resetCycleId: z.string().nullable(),
    checkedAt: z.string(),
  }),
]);

export type PublicResetStatus = z.infer<typeof PublicResetStatusSchema>;

export const StatusApiResponseSchema = z.object({
  schemaVersion: z.literal(1),
  status: PublicResetStatusSchema,
  generatedAt: z.string(),
});

export type StatusApiResponse = z.infer<typeof StatusApiResponseSchema>;

export const StatusApiErrorSchema = z.object({
  error: z.string(),
});

export type StatusApiError = z.infer<typeof StatusApiErrorSchema>;
