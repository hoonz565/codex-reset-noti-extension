import { EmailProvider } from '../email/email-types';
import { SubscriptionEmailRenderer } from '../email/subscription-email-renderer';
import { SubscriptionError } from '../subscriptions/subscription-errors';

export class SubscriptionMailer {
  constructor(
    private readonly provider: EmailProvider,
    private readonly renderer: SubscriptionEmailRenderer
  ) {}

  async sendConfirmation(recipient: string, token: string): Promise<void> {
    await this.send(recipient, this.renderer.renderConfirmation(token));
  }

  async sendManagementLink(recipient: string, token: string): Promise<void> {
    await this.send(recipient, this.renderer.renderManagement(token));
  }

  private async send(
    recipient: string,
    content: { subject: string; text: string; html: string }
  ): Promise<void> {
    const result = await this.provider.send({ to: recipient, ...content });
    if (result.outcome !== 'accepted') {
      throw new SubscriptionError(
        'INTERNAL_ERROR',
        'The email could not be queued. Please try again later.',
        503
      );
    }
  }
}
