import { EmailTemplateError } from './email-provider-errors';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class SubscriptionEmailRenderer {
  private readonly applicationOrigin: string;

  constructor(managementPageUrl: string) {
    try {
      const parsed = new URL(managementPageUrl);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        throw new Error('public application URL must use HTTPS');
      }
      this.applicationOrigin = parsed.origin;
    } catch {
      throw new EmailTemplateError('MANAGEMENT_PAGE_URL is not a valid public URL');
    }
  }

  renderConfirmation(token: string): { subject: string; text: string; html: string } {
    const link = this.link('/confirm', token);
    return {
      subject: 'Confirm your Codex Reset Notifier alerts',
      text: `Confirm your alert subscription by opening this secure link:\n\n${link}\n\nThe link expires in 24 hours. If you did not request these alerts, you can ignore this email.\n\nUnofficial community tool. Not affiliated with OpenAI.`,
      html: `<p>Confirm your alert subscription:</p><p><a href="${escapeHtml(link)}">Confirm alerts</a></p><p>This secure link expires in 24 hours. If you did not request these alerts, you can ignore this email.</p><p><small>Unofficial community tool. Not affiliated with OpenAI.</small></p>`,
    };
  }

  renderManagement(token: string): { subject: string; text: string; html: string } {
    const link = this.link('/manage', token);
    return {
      subject: 'Manage your Codex Reset Notifier alerts',
      text: `Open this secure link to update or unsubscribe from your alerts:\n\n${link}\n\nThe link expires in 30 days. If you did not request it, you can ignore this email.\n\nUnofficial community tool. Not affiliated with OpenAI.`,
      html: `<p>Use this secure link to update or unsubscribe from your alerts:</p><p><a href="${escapeHtml(link)}">Manage alerts</a></p><p>This link expires in 30 days. If you did not request it, you can ignore this email.</p><p><small>Unofficial community tool. Not affiliated with OpenAI.</small></p>`,
    };
  }

  private link(pathname: string, token: string): string {
    if (!token) throw new EmailTemplateError('A subscription token is required');
    const url = new URL(pathname, this.applicationOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
