import type { SourceFetchError } from './forecast-errors';

import type { RawForecastData } from './raw-forecast-schema';

export type RawForecastResponse = RawForecastData;

export type SourceFetchSuccess = {
  ok: true;
  fetchedAt: string;
  httpStatus: number;
  raw: RawForecastResponse;
};

export type SourceFetchFailure = {
  ok: false;
  fetchedAt: string;
  error: SourceFetchError;
};

export type SourceFetchResult = SourceFetchSuccess | SourceFetchFailure;

export interface LatestSignal {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  category: string | null;
  strength: number | null;
}

export type SourceHealth = 'healthy' | 'degraded' | 'unavailable';
