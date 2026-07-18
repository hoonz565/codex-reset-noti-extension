# Email Provider Abstraction — Codex Reset Notifier

> **Version:** 0.6 (Product Alignment — Two-Alert MVP)  
> **Changes from v0.5:** Removed 90% alert template, removed RESET_COMPLETED subscriber template. MVP has exactly three email categories.

---

## 1. MVP Email Categories

**Exactly three email types in MVP:**

| #   | Category                  | Trigger                                   |
| --- | ------------------------- | ----------------------------------------- |
| 1   | Subscription confirmation | Subscriber created/re-submitted           |
| 2   | Probability reached 70%   | `PROBABILITY_REACHED_70` subscriber event |
| 3   | Reset announced           | `RESET_ANNOUNCED` subscriber event        |

**Deliberately excluded from MVP:**

- 90% probability alert (no product alignment with source website)
- Reset completed subscriber alert (operational event only)

---

## 2. NotificationChannel Interface

```typescript
// ─── Core interfaces ─────────────────────────────────────────────

interface NotificationRecipient {
  subscriberId: string;
  email: string; // used only for sending, never logged
  maskedEmail: string; // for logging: "us***@gmail.com"
  preferences: {
    notify70: boolean;
    notifyAnnounced: boolean;
  };
  unsubscribeToken: {
    payload: string; // base64url of {subscriberId, tokenVersion}
    signature: string; // HMAC-SHA256 signature
  };
}

interface NotificationDelivery {
  id: string; // ULID — the notification_deliveries.id
  eventId: string;
  subscriberId: string;
  channel: 'email'; // extensible later
  state: DeliveryState;
  attemptCount: number;
  nextAttemptAt: string | null;
}

type DeliveryResult =
  | { success: true; providerMessageId: string }
  | { success: false; retryable: boolean; errorCode: string; errorMessage: string };

interface NotificationChannel {
  readonly channel: 'email' | 'whatsapp' | 'telegram' | 'browser';

  send(
    delivery: NotificationDelivery,
    recipient: NotificationRecipient,
    event: ResetEvent // ResetEvent wraps SubscriberEventType
  ): Promise<DeliveryResult>;
}
```

---

## 3. EmailNotificationChannel

```typescript
interface EmailProvider {
  sendEmail(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

class EmailNotificationChannel implements NotificationChannel {
  readonly channel = 'email';

  constructor(
    private provider: EmailProvider,
    private templates: EmailTemplates
  ) {}

  async send(delivery, recipient, event): Promise<DeliveryResult> {
    const { subject, html, text } = this.templates.render(event, recipient);
    try {
      const result = await this.provider.sendEmail({
        to: recipient.email,
        from: 'alerts@<your-sending-domain>',
        subject,
        html,
        text,
      });
      return { success: true, providerMessageId: result.messageId };
    } catch (err) {
      return classifyError(err);
    }
  }
}
```

---

## 4. MVP Email Providers

### Primary: Resend

| Property        | Value                                  |
| --------------- | -------------------------------------- |
| Free tier       | 3,000 emails/month, 100/day            |
| Sender domain   | Custom domain or `@resend.dev` for MVP |
| API             | REST, simple                           |
| Message IDs     | Yes                                    |
| Bounce handling | Webhook (post-MVP)                     |

### Fallback: Mailgun (optional)

| Property      | Value                               |
| ------------- | ----------------------------------- |
| Free tier     | 5,000 emails/month (first 3 months) |
| Sender domain | Custom domain or sandbox            |
| API           | REST                                |

### Optional Temporary Adapter: Apps Script MailApp

> **Classification: Optional, temporary, NOT primary architecture.**

```typescript
class AppsScriptEmailProvider implements EmailProvider {
  // Calls a minimal Apps Script Web App that only calls MailApp.sendEmail()
  // Does NOT own subscriber data, event state, or delivery logic
  // Has 100 email/day quota (Google Workspace: 1,500/day)
  // Replaceable without touching domain logic

  constructor(
    private appsScriptUrl: string,
    private secret: string
  ) {}

  async sendEmail(params): Promise<{ messageId: string }> {
    // POST to Apps Script; returns timestamp-based message ID
  }
}
```

---

## 5. Delivery Retry Policy

```
Max attempts: 3
Backoff schedule:
  Attempt 1: immediate
  Attempt 2: +5 minutes
  Attempt 3: +30 minutes
After attempt 3 failure: state = "failed_permanent"

Retryable errors:
  - Network timeout
  - HTTP 429 (provider rate limit)
  - HTTP 500, 502, 503, 504 (provider transient)

Permanent errors:
  - HTTP 400 with "invalid email" code
  - HTTP 422 (unprocessable entity)
  - Bounce (if webhook available)
  - Provider "invalid_to" or "email_not_found" codes

Provider timeout behavior:
  - state stays "processing" (guard)
  - Cleanup job resets stuck "processing" → "pending" after 5 min
  - Delivery ID used as idempotency key on retry
```

---

## 6. Quota and Partial Delivery Policy

1. Every subscriber has an individual `notification_deliveries` row.
2. Quota exhaustion → `failed_retryable` with `PROVIDER_QUOTA_EXCEEDED`.
3. Event not globally complete until all deliveries are terminal.
4. Priority on quota constraint:
   - `RESET_ANNOUNCED` > `PROBABILITY_REACHED_70` > confirmation resend

---

## 7. Sender Domain Requirements

Before production launch:

- Register a sending domain (e.g. `mail.codex-reset.tools`)
- Add SPF, DKIM, DMARC records
- Verify domain with provider
- Do not send from free Gmail/personal address
- Include `List-Unsubscribe` header

---

## 8. Email Templates (Exactly Three MVP Templates)

| Template               | Subject                              |
| ---------------------- | ------------------------------------ |
| Confirmation           | "Confirm your Codex Reset alerts"    |
| PROBABILITY_REACHED_70 | "Codex reset likelihood reached 70%" |
| RESET_ANNOUNCED        | "Codex quota reset announced"        |

### Template Content Requirements

**All templates must include:**

- Source updated time
- Checked time
- Link to source: willcodexquotareset.com
- Unsubscribe link (HMAC-signed)
- Disclaimer: "Unofficial community tool. Not affiliated with OpenAI."
- "You are receiving this because you subscribed via [source]."

**PROBABILITY_REACHED_70 template must:**

- State the current probability (e.g. "Current likelihood: 73%")
- NOT claim the reset is certain or imminent
- NOT claim any specific timing

**RESET_ANNOUNCED template must:**

- State that a reset has been announced
- Explicitly state it may not have completed yet
- Reference the source: "According to willcodexquotareset.com"
- State the tool is unofficial

**All templates must NOT:**

- Render raw source content without sanitization
- Claim certainty beyond what the source provides
- Use images that may be blocked by email clients for primary information

### Excluded Templates (not in MVP)

The following templates are explicitly NOT included in the MVP:

- **90% alert template** — No 90% subscriber alert in MVP
- **Reset completed subscriber template** — RESET_COMPLETED is an operational event; no subscriber email
