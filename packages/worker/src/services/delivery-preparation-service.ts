import { ResetEventRepository } from '../db/repositories/ResetEventRepository';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { NotificationDeliveryRepository } from '../db/repositories/NotificationDeliveryRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';
import { DeliveryPreparationResult } from '../delivery/delivery-types';
import { isSubscriberEligibleForEvent } from '../delivery/delivery-eligibility';
import { SubscriberEventType } from '@codex-reset/shared';

export class DeliveryPreparationService {
  constructor(
    private resetEventRepo: ResetEventRepository,
    private subscriberRepo: SubscriberRepository,
    private deliveryRepo: NotificationDeliveryRepository,
    private auditRepo: AuditEventRepository
  ) {}

  async prepareDeliveries(eventId: string, nowIso: string): Promise<DeliveryPreparationResult> {
    try {
      const event = await this.resetEventRepo.findById(eventId);
      if (!event) {
        return { outcome: 'event_not_found' };
      }

      if (event.type !== 'PROBABILITY_REACHED_70' && event.type !== 'RESET_ANNOUNCED') {
        return { outcome: 'unsupported_event', eventType: event.type };
      }

      // Fetch all active subscribers (in real life, we'd paginate)
      const subscribers = await this.subscriberRepo.listAllActive();

      let created = 0;
      let alreadyExisting = 0;
      let ineligible = 0;

      for (const sub of subscribers) {
        if (!isSubscriberEligibleForEvent(sub, event.type as SubscriberEventType)) {
          ineligible++;
          continue;
        }

        const deliveryId = `del_${crypto.randomUUID()}`;
        const res = await this.deliveryRepo.createIfAbsent({
          id: deliveryId,
          event_id: eventId,
          subscriber_id: sub.id,
          channel: 'email',
          state: 'pending',
          created_at: nowIso,
        });

        if (res.result === 'inserted') created++;
        else if (res.result === 'already_exists') alreadyExisting++;
      }

      if (created > 0 || alreadyExisting === 0) {
        await this.auditRepo.createIfAbsentByDeduplicationKey({
          id: `audit_${crypto.randomUUID()}`,
          type: 'DELIVERY_PREPARED',
          deduplication_key: `prep_${eventId}`,
          subject_type: 'event',
          subject_id: eventId,
          payload: { created, alreadyExisting, ineligible },
          created_at: nowIso,
        });
      }

      return { outcome: 'prepared', eventId, created, alreadyExisting, ineligible };
    } catch (e: unknown) {
      return { outcome: 'failed', error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
}
