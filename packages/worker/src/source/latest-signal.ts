import type { RawForecastData } from './raw-forecast-schema';
import type { LatestSignal } from './source-types';

export class LatestSignalSelector {
  static select(raw: RawForecastData): LatestSignal | null {
    if (!raw.tiboPosts || raw.tiboPosts.length === 0) {
      return null;
    }

    const validPosts = raw.tiboPosts
      .filter((p) => p.category !== 'none')
      .filter((p) => {
        if (!p.publishedAt) return false;
        const time = Date.parse(p.publishedAt);
        return !Number.isNaN(time);
      });

    if (validPosts.length === 0) {
      return null;
    }

    // Deduplicate by id
    const uniquePosts = new Map<string, (typeof validPosts)[0]>();
    for (const p of validPosts) {
      if (!uniquePosts.has(p.id)) {
        uniquePosts.set(p.id, p);
      }
    }

    // Sort by publication date descending
    const sorted = Array.from(uniquePosts.values()).sort((a, b) => {
      const timeA = Date.parse(a.publishedAt as string);
      const timeB = Date.parse(b.publishedAt as string);
      return timeB - timeA;
    });

    const newest = sorted[0];

    return {
      id: newest.id,
      title: newest.text ? newest.text.substring(0, 255) : '',
      url: newest.url || null,
      publishedAt: newest.publishedAt || null,
      category: newest.category || null,
      strength: newest.tweetAssessment?.strength ?? null,
    };
  }
}
