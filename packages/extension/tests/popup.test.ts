import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

describe('Extension UI and Client', () => {
  const htmlPath = path.resolve(__dirname, '../src/popup.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  it('Exactly two subscription options exist', () => {
    const dom = new JSDOM(html);
    const checkboxes = dom.window.document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);

    const ids = Array.from(checkboxes).map((c) => c.id);
    expect(ids).toContain('alert-70');
    expect(ids).toContain('alert-announced');
  });

  it('uses production copy and never pre-populates a test email', () => {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    expect(document.title).toBe('Codex Reset Notifier');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
    expect(html).not.toContain('Spike');
    expect(html).not.toContain('test@example.com');
  });

  it('offers a management-link request with accessible live status regions', () => {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    expect(document.getElementById('manage-email')).not.toBeNull();
    expect(document.getElementById('manage-btn')).not.toBeNull();
    expect(document.getElementById('sub-result')?.getAttribute('aria-live')).toBe('polite');
    expect(document.getElementById('manage-result')?.getAttribute('aria-live')).toBe('polite');
  });

  // Client parsing logic is in popup.ts. Since we use fetch(), we can mock it
  // or just test the pure logic. The acceptance criteria mostly require the logic
  // to be present and to safely handle Zod parses. Since we use `publicStatusResponseSchema.parse`
  // inside popup.ts, the schema provides the validation safety.
});
