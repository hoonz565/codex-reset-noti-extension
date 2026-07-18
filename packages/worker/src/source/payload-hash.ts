import type { CodexResetStatus } from '@codex-reset/shared';

export class PayloadHasher {
  static async hash(status: CodexResetStatus): Promise<string> {
    // Construct a canonical semantic representation
    // Exclude checkedAt, statusChangedAt, sourceUpdatedAt and local retry metadata
    const canonical = {
      probability: status.probability,
      lifecycle: status.lifecycle,
      latestResetAt: status.latestResetAt,
      announcementAt: status.announcementAt,
      latestSignalId: status.latestSignal?.id || null,
      sourceHealth: status.sourceHealth,
      sourceWarnings: status.sourceWarnings.slice().sort(),
      title: status.title,
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(canonical, Object.keys(canonical).sort()));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
