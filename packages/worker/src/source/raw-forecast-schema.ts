import { z } from 'zod';

export const RawForecastSchema = z
  .object({
    fetchedAt: z.string().datetime().optional(),
    nextRefreshAt: z.string().datetime().optional(),
    refreshCount: z.number().optional(),
    forecast: z
      .object({
        score: z.number(), // Must be a number (not coerced)
        resetAnnounced: z.boolean(),
        daysSinceReset: z.number().optional(),
        hoursSinceReset: z.number().optional(),
        hoursSinceResetAnnouncement: z.number().nullable().optional(),
        latestResetAt: z.string().datetime().optional(),
      })
      .passthrough()
      .optional(),
    tiboPosts: z
      .array(
        z
          .object({
            id: z.string(),
            text: z.string().optional(),
            url: z.string().nullable().optional(),
            publishedAt: z.string().datetime().nullable().optional(),
            category: z.string().nullable().optional(),
            tweetAssessment: z
              .object({
                strength: z.number().nullable().optional(),
                isResetAnnounced: z.boolean().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
      )
      .optional(),
    sourceErrors: z.record(z.string()).optional(),
  })
  .passthrough();

export type RawForecastData = z.infer<typeof RawForecastSchema>;
