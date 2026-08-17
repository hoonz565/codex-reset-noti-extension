import { describe, expect, it } from 'vitest';
import { handlePublicPage } from '../../src/http/public-pages';

describe('public subscription pages', () => {
  it('serves a confirmation page without consuming the token on GET', async () => {
    const response = handlePublicPage(
      new Request('https://notify.example/confirm?token=secret-token')
    );

    expect(response?.status).toBe(200);
    const html = await response!.text();
    expect(html).toContain('Confirm your alerts');
    expect(html).not.toContain('secret-token');
    expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serves management UI and same-origin assets under a restrictive CSP', async () => {
    const page = handlePublicPage(new Request('https://notify.example/manage'))!;
    const script = handlePublicPage(new Request('https://notify.example/public-pages.js'))!;
    const css = handlePublicPage(new Request('https://notify.example/public-pages.css'))!;

    expect(await page.text()).toContain('Manage your alerts');
    expect(page.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(page.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');
    expect(script.headers.get('Content-Type')).toContain('text/javascript');
    expect(css.headers.get('Content-Type')).toContain('text/css');
  });

  it('does not handle non-GET requests or unrelated paths', () => {
    expect(
      handlePublicPage(new Request('https://notify.example/manage', { method: 'POST' }))
    ).toBeNull();
    expect(handlePublicPage(new Request('https://notify.example/unknown'))).toBeNull();
  });
});
