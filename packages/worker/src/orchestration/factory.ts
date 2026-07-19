import { OrchestrationRunner } from './orchestration-runner';
import { OrchestrationLock } from './orchestration-lock';
import { DeliveryDispatchService } from './delivery-dispatch-service';
import { OrchestrationConfig } from './orchestration-config';

import { OrchestrationRunRepository } from '../db/repositories/OrchestrationRunRepository';
import { OrchestrationLockRepository } from '../db/repositories/OrchestrationLockRepository';
import { SnapshotService } from '../services/snapshot-service';
import { EventProcessingService } from '../services/event-processing-service';
import { DeliveryPreparationService } from '../services/delivery-preparation-service';
import { DeliveryProcessingService } from '../services/delivery-processing-service';
import { DeliveryRecoveryService } from '../services/delivery-recovery-service';

import { SourceForecastClient } from '../source/forecast-client';
import { ResetCycleRepository } from '../db/repositories/ResetCycleRepository';
import { SourceSnapshotRepository } from '../db/repositories/SourceSnapshotRepository';
import { ResetEventRepository } from '../db/repositories/ResetEventRepository';
import { AuditEventRepository } from '../db/repositories/AuditEventRepository';
import { NotificationDeliveryRepository } from '../db/repositories/NotificationDeliveryRepository';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { DbTransactions } from '../db/transactions';
import { EmailProvider, EmailTemplateRenderer } from '../email';

export function createOrchestrationRunner(
  db: D1Database,
  config: OrchestrationConfig,
  emailProvider: EmailProvider,
  templateRenderer: EmailTemplateRenderer,
  sourceClient: SourceForecastClient
): OrchestrationRunner {
  // Repos
  const runRepo = new OrchestrationRunRepository(db);
  const lockRepo = new OrchestrationLockRepository(db);
  const cycleRepo = new ResetCycleRepository(db);
  const snapshotRepo = new SourceSnapshotRepository(db);
  const eventRepo = new ResetEventRepository(db);
  const auditRepo = new AuditEventRepository(db);
  const deliveryRepo = new NotificationDeliveryRepository(db);
  const subscriberRepo = new SubscriberRepository(db);
  const tx = new DbTransactions(db);

  // Phase 3-6 Services
  const snapshotService = new SnapshotService(sourceClient, cycleRepo, snapshotRepo);
  const eventService = new EventProcessingService(
    tx,
    cycleRepo,
    eventRepo,
    snapshotRepo,
    auditRepo
  );
  const preparationService = new DeliveryPreparationService(
    eventRepo,
    subscriberRepo,
    deliveryRepo,
    auditRepo
  );
  const processingService = new DeliveryProcessingService(
    deliveryRepo,
    subscriberRepo,
    eventRepo,
    snapshotRepo,
    auditRepo,
    emailProvider,
    templateRenderer
  );
  const recoveryService = new DeliveryRecoveryService(deliveryRepo, auditRepo);

  // Phase 7 Services
  const lock = new OrchestrationLock(lockRepo, runRepo);
  const dispatchService = new DeliveryDispatchService(processingService, recoveryService, config);

  return new OrchestrationRunner(
    config,
    runRepo,
    lock,
    snapshotService,
    eventService,
    preparationService,
    dispatchService
  );
}
