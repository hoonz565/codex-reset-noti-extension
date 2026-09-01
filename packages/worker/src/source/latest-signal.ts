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
        const dateStr = p.publishedAt ?? p.pubDate ?? null;
        if (!dateStr) return false;
        const time = Date.parse(dateStr);
        return !Number.isNaN(time);
      });

    if (validPosts.length === 0) {
      return null;
    }

    // Deduplicate by id or guid
    const uniquePosts = new Map<string, (typeof validPosts)[0]>();
    for (const p of validPosts) {
      const key = p.id ?? p.guid ?? '';
      if (key && !uniquePosts.has(key)) {
        uniquePosts.set(key, p);
      }
    }

    // Sort by publication date descending
    const sorted = Array.from(uniquePosts.values()).sort((a, b) => {
      const timeA = Date.parse((a.publishedAt ?? a.pubDate) as string);
      const timeB = Date.parse((b.publishedAt ?? b.pubDate) as string);
      return timeB - timeA;
    });

    const newest = sorted[0];

    return {
      id: newest.id ?? newest.guid ?? '',
      title: newest.text ?? newest.title ?? '',
      url: newest.url ?? newest.link ?? null,
      publishedAt: newest.publishedAt ?? newest.pubDate ?? null,
      category: newest.category || null,
      strength: newest.tweetAssessment?.strength ?? null,
    };
  }
}
