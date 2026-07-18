import { SubscriberEventType } from '@codex-reset/shared';
import { ResetEventRow } from '../db/schema';
import { EmailTemplateError } from './email-provider-errors';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class EmailTemplateRenderer {
  constructor(private managementPageUrl: string) {
    if (!managementPageUrl) {
      throw new EmailTemplateError('MANAGEMENT_PAGE_URL is not configured');
    }
  }

  render(
    eventType: SubscriberEventType,
    eventRow: ResetEventRow
  ): { subject: string; text: string; html: string } {
    if (eventType === 'PROBABILITY_REACHED_70') {
      return this.renderProbability70(eventRow);
    } else if (eventType === 'RESET_ANNOUNCED') {
      return this.renderResetAnnounced(eventRow);
    }
    throw new EmailTemplateError(`Unsupported event type for template rendering: ${eventType}`);
  }

  private renderProbability70(eventRow: ResetEventRow) {
    const probability = eventRow.current_probability ?? 70;
    const subject = 'Codex reset likelihood reached 70%';
    const text = `The likelihood of a Codex quota reset has reached ${probability}%.
This is an automated alert based on changes detected at willcodexquotareset.com.

Current likelihood: ${probability}%
A reset is not guaranteed to happen immediately, and specific timing is unknown.

---
Unofficial community tool. Not affiliated with OpenAI.
You are receiving this because you subscribed via willcodexquotareset.com.

Manage or unsubscribe from alerts:
${this.managementPageUrl}
`;

    const html = `
<p>The likelihood of a Codex quota reset has reached <strong>${escapeHtml(probability.toString())}%</strong>.</p>
<p>This is an automated alert based on changes detected at <a href="https://willcodexquotareset.com">willcodexquotareset.com</a>.</p>
<p><strong>Current likelihood: ${escapeHtml(probability.toString())}%</strong></p>
<p><em>A reset is not guaranteed to happen immediately, and specific timing is unknown.</em></p>
<hr />
<p><small>Unofficial community tool. Not affiliated with OpenAI.<br />
You are receiving this because you subscribed via willcodexquotareset.com.</small></p>
<p><small><a href="${escapeHtml(this.managementPageUrl)}">Manage or unsubscribe from alerts</a></small></p>
`;
    return { subject, text, html };
  }

  private renderResetAnnounced(_eventRow: ResetEventRow) {
    const subject = 'Codex quota reset announced';
    const text = `A Codex quota reset has been announced.
According to willcodexquotareset.com, a reset has been officially announced.
Please note that the reset may not have completed yet.

---
Unofficial community tool. Not affiliated with OpenAI.
You are receiving this because you subscribed via willcodexquotareset.com.

Manage or unsubscribe from alerts:
${this.managementPageUrl}
`;

    const html = `
<p>A Codex quota reset has been announced.</p>
<p>According to <a href="https://willcodexquotareset.com">willcodexquotareset.com</a>, a reset has been officially announced.</p>
<p><em>Please note that the reset may not have completed yet.</em></p>
<hr />
<p><small>Unofficial community tool. Not affiliated with OpenAI.<br />
You are receiving this because you subscribed via willcodexquotareset.com.</small></p>
<p><small><a href="${escapeHtml(this.managementPageUrl)}">Manage or unsubscribe from alerts</a></small></p>
`;
    return { subject, text, html };
  }
}
