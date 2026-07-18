import { ResetLifecycle, SourceHealth } from './lifecycle';

export interface LatestSignal {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  category: string | null;
  strength: number | null;
}

export interface CodexResetStatus {
  schemaVersion: 1;
  probability: number | null;
  lifecycle: ResetLifecycle;
  resetCycleId: string;
  latestResetAt: string | null;
  announcementAt: string | null;
  title: string;
  description: string;
  latestSignal: LatestSignal | null;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  checkedAt: string;
  statusChangedAt: string;
  publishedAt: string;
  sourceHealth: SourceHealth;
  sourceWarnings: string[];
  parserVersion: string;
}

export interface PublicStatusResponse {
  ok: boolean;
  sourceHealth: SourceHealth;
  status: CodexResetStatus | null;
  message?: string;
}
