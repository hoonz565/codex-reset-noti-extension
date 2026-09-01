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
    const escapedLink = escapeHtml(link);
    return {
      subject: 'Confirm your Codex Reset Notifier alerts',
      text: `Confirm your alert subscription by opening this secure link:\n\n${link}\n\nThe link expires in 24 hours. If you did not request these alerts, you can ignore this email.\n\nUnofficial community tool. Not affiliated with OpenAI.`,
      html: `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F7FAFF; color: #172554;">
  <div style="max-width: 480px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 28px 24px; box-shadow: 0 4px 12px rgba(15,23,42,0.04);">
    <div style="font-size: 1.1rem; font-weight: 700; color: #172554; margin-bottom: 4px;">Codex Reset Notifier</div>
    <div style="font-size: 0.8rem; color: #64748B; margin-bottom: 20px;">Unofficial community alerts for Codex quota-reset signals.</div>
    <p style="font-size: 0.95rem; line-height: 1.5; color: #334155; margin-bottom: 20px;">
      Click the button below to confirm your subscription and start receiving real-time OpenAI Codex quota-reset notifications:
    </p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapedLink}" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 0.92rem; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 6px rgba(37,99,235,0.25);">Confirm alerts</a>
    </div>
    <p style="font-size: 0.82rem; color: #64748B; line-height: 1.4; margin-top: 24px; border-top: 1px solid #F1F5F9; padding-top: 16px;">
      This secure link expires in 24 hours. If you did not request these alerts, you can safely ignore this email.
    </p>
    <p style="font-size: 0.75rem; color: #94A3B8; margin-top: 12px; margin-bottom: 0;">
      Unofficial community tool. Not affiliated with OpenAI.
    </p>
  </div>
</body>
</html>`,
    };
  }

  renderManagement(token: string): { subject: string; text: string; html: string } {
    const link = this.link('/manage', token);
    const escapedLink = escapeHtml(link);
    return {
      subject: 'Manage your Codex Reset Notifier alerts',
      text: `Open this secure link to update or unsubscribe from your alerts:\n\n${link}\n\nThe link expires in 30 days. If you did not request it, you can ignore this email.\n\nUnofficial community tool. Not affiliated with OpenAI.`,
      html: `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F7FAFF; color: #172554;">
  <div style="max-width: 480px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 28px 24px; box-shadow: 0 4px 12px rgba(15,23,42,0.04);">
    <div style="font-size: 1.1rem; font-weight: 700; color: #172554; margin-bottom: 4px;">Codex Reset Notifier</div>
    <div style="font-size: 0.8rem; color: #64748B; margin-bottom: 20px;">Unofficial community alerts for Codex quota-reset signals.</div>
    <p style="font-size: 0.95rem; line-height: 1.5; color: #334155; margin-bottom: 20px;">
      Use the button below to update your alert preferences or unsubscribe from notifications:
    </p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapedLink}" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 0.92rem; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 6px rgba(37,99,235,0.25);">Manage alerts</a>
    </div>
    <p style="font-size: 0.82rem; color: #64748B; line-height: 1.4; margin-top: 24px; border-top: 1px solid #F1F5F9; padding-top: 16px;">
      This link expires in 30 days. If you did not request it, you can ignore this email.
    </p>
    <p style="font-size: 0.75rem; color: #94A3B8; margin-top: 12px; margin-bottom: 0;">
      Unofficial community tool. Not affiliated with OpenAI.
    </p>
  </div>
</body>
</html>`,
    };
  }

  private link(pathname: string, token: string): string {
    if (!token) throw new EmailTemplateError('A subscription token is required');
    const url = new URL(pathname, this.applicationOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
