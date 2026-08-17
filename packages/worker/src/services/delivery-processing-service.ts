import { NotificationDeliveryRepository } from '../db/repositories/NotificationDeliveryRepository';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { ResetEventRepository } from '../db/repositories/ResetEventRepository';
import { SourceSnapshotRepository } from '../db/repositories/SourceSnapshotRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';
import { EmailProvider, EmailTemplateRenderer } from '../email';
import { DeliveryRetryPolicy, isSubscriberEligibleForEvent } from '../delivery';
import { SubscriberEventType } from '@codex-reset/shared';

export class DeliveryProcessingService {
  constructor(
    private deliveryRepo: NotificationDeliveryRepository,
    private subscriberRepo: SubscriberRepository,
    private eventRepo: ResetEventRepository,
    private snapshotRepo: SourceSnapshotRepository,
    private auditRepo: AuditEventRepository,
    private emailProvider: EmailProvider,
    private templateRenderer: EmailTemplateRenderer,
    private clock: { now: () => Date } = { now: () => new Date() }
  ) {}

  async processNextDueDelivery(): Promise<{ outcome: string; error?: Error }> {
    const now = this.clock.now();
    const nowIso = now.toISOString();

    const pendingList = await this.deliveryRepo.listDuePending(nowIso, 1);
    if (pendingList.length === 0) {
      return { outcome: 'none_due' };
    }

    const deliveryId = pendingList[0].id;
    const processingToken = `tok_${crypto.randomUUID()}`;

    const claimRes = await this.deliveryRepo.claimForProcessing(
      deliveryId,
      processingToken,
      nowIso,
      nowIso,
      nowIso
    );

    if (claimRes.outcome !== 'claimed') {
      return { outcome: claimRes.outcome };
    }

    try {
      const delivery = await this.deliveryRepo.findById(deliveryId);
      if (!delivery) throw new Error('Delivery not found after claim');

      // Reload subscriber
      const subscriber = await this.subscriberRepo.findById(delivery.subscriber_id);
      if (!subscriber) {
        await this.cancelDelivery(
          deliveryId,
          processingToken,
          'SUBSCRIBER_NOT_FOUND',
          'Subscriber deleted',
          nowIso
        );
        return { outcome: 'cancelled_subscriber_not_found' };
      }

      // Reload event
      const event = await this.eventRepo.findById(delivery.event_id);
      if (!event) {
        await this.cancelDelivery(
          deliveryId,
          processingToken,
          'EVENT_NOT_FOUND',
          'Event deleted',
          nowIso
        );
        return { outcome: 'cancelled_event_not_found' };
      }

      // Re-check eligibility
      if (!isSubscriberEligibleForEvent(subscriber, event.type as SubscriberEventType)) {
        await this.cancelDelivery(
          deliveryId,
          processingToken,
          'INELIGIBLE',
          'Subscriber no longer eligible',
          nowIso
        );
        return { outcome: 'cancelled_ineligible' };
      }

      // Render
      const { subject, html, text } = this.templateRenderer.render(
        event.type as SubscriberEventType,
        event
      );

      // Send
      const result = await this.emailProvider.send({
        to: subscriber.email,
        subject,
        html,
        text,
        idempotencyKey: deliveryId,
      });

      // Handle Provider Result
      if (result.outcome === 'accepted') {
        const fin = await this.deliveryRepo.markSentToProvider(
          deliveryId,
          processingToken,
          result.providerMessageId,
          nowIso
        );
        if (fin.outcome !== 'success') {
          return { outcome: 'fatal_error', error: new Error('Stale claim during accepted') };
        }
        await this.auditRepo.create({
          id: `audit_${crypto.randomUUID()}`,
          type: 'DELIVERY_SENT_TO_PROVIDER',
          deduplication_key: `sent_${deliveryId}_${delivery.attempt_count}`,
          subject_type: 'delivery',
          subject_id: deliveryId,
          payload: {
            attemptCount: delivery.attempt_count,
            providerMessageId: result.providerMessageId,
          },
          created_at: nowIso,
        });
        return { outcome: 'sent' };
      }

      if (result.outcome === 'permanent_failure') {
        const fin = await this.deliveryRepo.markPermanentFailure(
          deliveryId,
          processingToken,
          result.code,
          'Provider rejected permanently',
          nowIso
        );
        if (fin.outcome !== 'success') {
          return {
            outcome: 'fatal_error',
            error: new Error('Stale claim during permanent_failure'),
          };
        }
        await this.auditRepo.create({
          id: `audit_${crypto.randomUUID()}`,
          type: 'DELIVERY_PERMANENTLY_FAILED',
          deduplication_key: `perm_${deliveryId}`,
          subject_type: 'delivery',
          subject_id: deliveryId,
          payload: { code: result.code, attemptCount: delivery.attempt_count },
          created_at: nowIso,
        });
        return { outcome: 'permanent_failure' };
      }

      if (result.outcome === 'retryable_failure') {
        const nextAttemptAt = DeliveryRetryPolicy.calculateNextAttemptAt(
          delivery.attempt_count,
          now,
          result.retryAfterSeconds
        );

        if (!nextAttemptAt) {
          // Exceeded max attempts
          const fin = await this.deliveryRepo.markPermanentFailure(
            deliveryId,
            processingToken,
            'MAX_ATTEMPTS_EXCEEDED',
            'Max attempts exceeded after retryable failure',
            nowIso
          );
          if (fin.outcome !== 'success') {
            return { outcome: 'fatal_error', error: new Error('Stale claim during max_attempts') };
          }
          await this.auditRepo.create({
            id: `audit_${crypto.randomUUID()}`,
            type: 'DELIVERY_PERMANENTLY_FAILED',
            deduplication_key: `perm_${deliveryId}`,
            subject_type: 'delivery',
            subject_id: deliveryId,
            payload: { code: 'MAX_ATTEMPTS_EXCEEDED' },
            created_at: nowIso,
          });
          return { outcome: 'failed_permanent_max_attempts' };
        }

        const fin = await this.deliveryRepo.markRetryableFailure(
          deliveryId,
          processingToken,
          result.code,
          'Provider transient error',
          nextAttemptAt,
          nowIso
        );
        if (fin.outcome !== 'success') {
          return { outcome: 'fatal_error', error: new Error('Stale claim during retry_scheduled') };
        }
        await this.auditRepo.create({
          id: `audit_${crypto.randomUUID()}`,
          type: 'DELIVERY_RETRY_SCHEDULED',
          deduplication_key: `retry_${deliveryId}_${delivery.attempt_count}`,
          subject_type: 'delivery',
          subject_id: deliveryId,
          payload: { code: result.code, nextAttemptAt, attemptCount: delivery.attempt_count },
          created_at: nowIso,
        });
        return { outcome: 'retry_scheduled' };
      }
      return { outcome: 'unknown_provider_result' };
    } catch {
      // Unhandled error during processing
      const code = 'INTERNAL_ERROR';
      const msg = 'Unhandled provider or processing error';
      // Attempt to schedule a retry since we don't know the nature
      const delivery = await this.deliveryRepo.findById(deliveryId);
      if (!delivery) return { outcome: 'fatal_missing_delivery' };

      const nextAttemptAt = DeliveryRetryPolicy.calculateNextAttemptAt(
        delivery.attempt_count,
        now,
        null
      );
      if (!nextAttemptAt) {
        await this.deliveryRepo.markPermanentFailure(
          deliveryId,
          processingToken,
          code,
          msg,
          nowIso
        );
        return { outcome: 'failed_permanent_max_attempts' };
      }

      await this.deliveryRepo.markRetryableFailure(
        deliveryId,
        processingToken,
        code,
        msg,
        nextAttemptAt,
        nowIso
      );
      return { outcome: 'failed_internal_retry' };
    }
  }

  private async cancelDelivery(
    deliveryId: string,
    processingToken: string,
    code: string,
    msg: string,
    nowIso: string
  ) {
    const fin = await this.deliveryRepo.markCancelled(
      deliveryId,
      processingToken,
      code,
      msg,
      nowIso
    );
    if (fin.outcome !== 'success') {
      return; // or throw
    }
    await this.auditRepo.create({
      id: `audit_${crypto.randomUUID()}`,
      type: 'DELIVERY_CANCELLED',
      deduplication_key: `cancel_${deliveryId}`,
      subject_type: 'delivery',
      subject_id: deliveryId,
      payload: { code },
      created_at: nowIso,
    });
  }
}
