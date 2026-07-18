import { NotificationDeliveryRepository } from '../db/repositories/NotificationDeliveryRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';

export class DeliveryRecoveryService {
  constructor(
    private deliveryRepo: NotificationDeliveryRepository,
    private auditRepo: AuditEventRepository,
    private clock: { now: () => Date } = { now: () => new Date() }
  ) {}

  async recoverStaleClaims(
    leaseDurationMs: number = 5 * 60 * 1000
  ): Promise<{ recoveredCount: number }> {
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const cutoffMs = now.getTime() - leaseDurationMs;
    const cutoffIso = new Date(cutoffMs).toISOString();

    // Query processing rows with processing_started_at < cutoffIso
    const staleDeliveries = await this.deliveryRepo.listStaleProcessing(cutoffIso);
    let recoveredCount = 0;

    for (const delivery of staleDeliveries) {
      if (!delivery.processing_token) continue;

      const fin = await this.deliveryRepo.recoverStaleClaim(
        delivery.id,
        delivery.processing_token,
        nowIso, // Next attempt is immediately due
        nowIso
      );

      if (fin.outcome === 'success') {
        recoveredCount++;
        await this.auditRepo.create({
          id: `audit_${crypto.randomUUID()}`,
          type: 'DELIVERY_STALE_CLAIM_RECOVERED',
          deduplication_key: `recover_${delivery.id}_${delivery.attempt_count}`,
          subject_type: 'delivery',
          subject_id: delivery.id,
          payload: { attemptCount: delivery.attempt_count },
          created_at: nowIso,
        });
      }
    }

    return { recoveredCount };
  }
}
