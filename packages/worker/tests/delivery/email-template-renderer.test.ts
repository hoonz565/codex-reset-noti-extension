import { describe, it, expect } from 'vitest';
import { EmailTemplateRenderer } from '../../src/email/email-template-renderer';
import { ResetEventRow } from '../../src/db/schema';
import { SubscriberEventType } from '@codex-reset/shared';

describe('Email Template Renderer', () => {
  const renderer = new EmailTemplateRenderer('https://codex-reset.tools/manage');

  const baseEvent: ResetEventRow = {
    id: 'evt1',
    reset_cycle_id: 'cyc1',
    type: 'PROBABILITY_REACHED_70',
    threshold: 70,
    previous_probability: 60,
    current_probability: 73,
    source_signal_id: 'sig1',
    source_snapshot_id: 'snap1',
    created_at: new Date().toISOString(),
  };

  it('DEL-TPL-1: Probability event renders correct subject and observed probability', () => {
    const res = renderer.render('PROBABILITY_REACHED_70', baseEvent);
    expect(res.subject).toBe('Codex reset likelihood reached 70%');
    expect(res.html).toContain('73%');
    expect(res.text).toContain('73%');
    expect(res.text).toContain('A reset is not guaranteed');
  });

  it('DEL-TPL-2: Announcement event renders announcement-specific copy', () => {
    const annEvent: ResetEventRow = {
      ...baseEvent,
      type: 'RESET_ANNOUNCED',
      current_probability: 100,
    };
    const res = renderer.render('RESET_ANNOUNCED', annEvent);
    expect(res.subject).toBe('Codex quota reset announced');
    expect(res.text).toContain('officially announced');
    expect(res.html).toContain('officially announced');
  });

  it('DEL-TPL-3: Dynamic HTML is escaped', () => {
    const unsafeEvent: ResetEventRow = { ...baseEvent, type: 'PROBABILITY_REACHED_70' };
    const unsafeRenderer = new EmailTemplateRenderer(
      'https://codex.tools/manage?user="<script>alert(1)</script>"'
    );
    const res = unsafeRenderer.render('PROBABILITY_REACHED_70', unsafeEvent);
    expect(res.html).not.toContain('<script>');
    expect(res.html).toContain('&lt;script&gt;');
  });

  it('DEL-TPL-4: No raw token is stored in rendered persistence payload', () => {
    // The rendered output only includes the configured URL. It does not include or request a raw token.
    const res = renderer.render('PROBABILITY_REACHED_70', baseEvent);
    expect(res.text).not.toContain('tok_');
  });

  it('DEL-TPL-5: No probability90 copy exists', () => {
    expect(() =>
      renderer.render('PROBABILITY_REACHED_90' as unknown as SubscriberEventType, baseEvent)
    ).toThrow('Unsupported event type');
  });

  it('DEL-TPL-6: No RESET_COMPLETED subscriber template exists', () => {
    expect(() =>
      renderer.render('RESET_COMPLETED' as unknown as SubscriberEventType, baseEvent)
    ).toThrow('Unsupported event type');
  });

  it('DEL-TPL-7: Management/unsubscribe guidance is present', () => {
    const res = renderer.render('PROBABILITY_REACHED_70', baseEvent);
    expect(res.text).toContain('Manage or unsubscribe from alerts');
    expect(res.html).toContain('Manage or unsubscribe from alerts');
    expect(res.html).toContain('https://codex-reset.tools/manage');
  });

  it('DEL-SEC-5: Only supported subscriber event types can render templates', () => {
    expect(() =>
      renderer.render('CYCLE_CREATED' as unknown as SubscriberEventType, baseEvent)
    ).toThrow('Unsupported event type');
  });
});
