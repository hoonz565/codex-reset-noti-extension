import { z } from 'zod';

export const latestSignalSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    url: z.string().nullable(),
    publishedAt: z.string().datetime().nullable(),
    category: z.string().nullable(),
    strength: z.number().nullable(),
  })
  .strict();

export const codexResetStatusSchema = z
  .object({
    schemaVersion: z.literal(1),
    probability: z.number().int().min(0).max(100).nullable(),
    lifecycle: z.enum(['none', 'announced', 'completed']),
    resetCycleId: z.string(),
    latestResetAt: z.string().datetime().nullable(),
    announcementAt: z.string().datetime().nullable(),
    title: z.string(),
    description: z.string(),
    latestSignal: latestSignalSchema.nullable(),
    sourceUrl: z.string().url(),
    sourceUpdatedAt: z.string().datetime().nullable(),
    checkedAt: z.string().datetime(),
    statusChangedAt: z.string().datetime(),
    publishedAt: z.string().datetime(),
    sourceHealth: z.enum(['healthy', 'degraded', 'unavailable']),
    sourceWarnings: z.array(z.string()),
    parserVersion: z.string(),
  })
  .strict();

export const publicStatusResponseSchema = z
  .object({
    ok: z.boolean(),
    sourceHealth: z.enum(['healthy', 'degraded', 'unavailable']),
    status: codexResetStatusSchema.nullable(),
    message: z.string().optional(),
  })
  .strict();
