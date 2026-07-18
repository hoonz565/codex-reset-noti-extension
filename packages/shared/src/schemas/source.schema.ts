import { z } from 'zod';

export const rawSourceSchema = z
  .object({
    fetchedAt: z.string().nullable().optional(),
    forecast: z
      .object({
        score: z.number().nullable().optional(),
        resetAnnounced: z.boolean().nullable().optional(),
        latestResetAt: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    tiboPosts: z
      .array(
        z
          .object({
            guid: z.string(),
            title: z.string(),
            link: z.string().nullable().optional(),
            pubDate: z.string().nullable().optional(),
            tweetAssessment: z
              .object({
                category: z.string().nullable().optional(),
                resetSignalStrength: z.number().nullable().optional(),
              })
              .nullable()
              .optional(),
          })
          .passthrough()
      )
      .nullable()
      .optional(),
    sourceErrors: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();
