import { env } from 'cloudflare:test';
import m1 from '../../migrations/0001_initial_schema.sql?raw';
import m2 from '../../migrations/0002_add_reset_cycle_transition_token.sql?raw';
import m3 from '../../migrations/0003_subscription_tokens.sql?raw';
import m4 from '../../migrations/0004_delivery_processing.sql?raw';
import m5 from '../../migrations/0005_delivery_state_correction.sql?raw';
import m6 from '../../migrations/0006_orchestration.sql?raw';
import m7 from '../../migrations/0007_dashboard_metrics.sql?raw';

export async function setupTestDb() {
  const db = env.DB as D1Database;

  // Clean up
  await db.exec(`
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS rate_limit_records;
    DROP TABLE IF EXISTS notification_deliveries;
    DROP TABLE IF EXISTS reset_events;
    DROP TABLE IF EXISTS source_snapshots;
    DROP TABLE IF EXISTS reset_cycles;
    DROP TABLE IF EXISTS subscription_tokens;
    DROP TABLE IF EXISTS subscribers;
    DROP TABLE IF EXISTS orchestration_runs;
    DROP TABLE IF EXISTS orchestration_locks;
    DROP TABLE IF EXISTS d1_migrations;
  `);

  const applyMigration = async (sql: string) => {
    // Strip comments to avoid D1 choking on empty statement blocks
    const strippedSql = sql.replace(/--.*$/gm, '');
    const statements = strippedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => db.prepare(s));

    if (statements.length > 0) {
      await db.batch(statements);
    }
  };

  await applyMigration(m1);
  await applyMigration(m2);
  await applyMigration(m3);
  await applyMigration(m4);
  await applyMigration(m5);
  await applyMigration(m6);
  await applyMigration(m7);

  return db;
}
