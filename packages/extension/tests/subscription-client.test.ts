import { describe, expect, it, vi } from 'vitest';
import { SubscriptionClient, SubscriptionClientError } from '../src/api/subscription-client';

const request = {
  email: 'person@example.com',
  preferences: { probability70: true, resetAnnounced: false },
};

describe('SubscriptionClient', () => {
  it('accepts the privacy-preserving 202 response without expecting subscriber data', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ accepted: true, message: 'If valid, the request was processed.' }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        )
      );
    const client = new SubscriptionClient('https://worker.example', fetchMock);

    await expect(client.subscribe(request)).resolves.toContain('processed');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.example/api/subscriptions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects malformed successful responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ subscription: { id: 'leak' } })));
    const client = new SubscriptionClient('https://worker.example', fetchMock);

    await expect(client.subscribe(request)).rejects.toBeInstanceOf(SubscriptionClientError);
  });

  it('surfaces sanitized API errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
      );
    const client = new SubscriptionClient('https://worker.example', fetchMock);

    await expect(client.subscribe(request)).rejects.toThrow('Too many requests');
  });

  it('requests a management link through the generic accepted contract', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true, message: 'If valid, it was processed.' }), {
        status: 202,
      })
    );
    const client = new SubscriptionClient('https://worker.example', fetchMock);

    await expect(client.requestManagementLink('person@example.com')).resolves.toContain(
      'processed'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.example/api/subscriptions/request-management-link',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
