// @vitest-environment node
import { render } from '@react-email/components';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminNewAdmissionEmail from '../../emails/admin-new-admission';
import AdmissionRejectedEmail from '../../emails/admission-rejected';
import CredentialsEmail from '../../emails/credentials';
import RenewalApprovedEmail from '../../emails/renewal-approved';
import { devMailbox, sendEmail } from '@/lib/email/send';
import { createSheetsClient } from '@/lib/sheets/client';

function fakeFetch(responses: Record<string, unknown>) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url: decodeURIComponent(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    const key = Object.keys(responses).find((k) => decodeURIComponent(url).includes(k));
    return new Response(JSON.stringify(key ? responses[key] : {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('Sheets client (P2.05)', () => {
  const getToken = async () => 'token';

  it('is a no-op without a spreadsheet id', async () => {
    const { impl } = fakeFetch({});
    const client = createSheetsClient({ spreadsheetId: undefined, getToken, fetchImpl: impl });
    expect(await client.appendRow('Admissions', ['x'])).toEqual({ skipped: true });
    expect(impl).not.toHaveBeenCalled();
  });

  it('appends a row and reports its number', async () => {
    const { impl, calls } = fakeFetch({ ':append': { updates: { updatedRange: "'Admissions'!A7:N7" } } });
    const client = createSheetsClient({ spreadsheetId: 'sheet1', getToken, fetchImpl: impl });
    expect(await client.appendRow('Admissions', ['01712345678', 'a@b.co'])).toEqual({ skipped: false, row: 7 });
    expect(calls[0]).toMatchObject({ method: 'POST', body: { values: [['01712345678', 'a@b.co']] } });
    expect(calls[0]?.url).toContain("'Admissions'!A1:append?valueInputOption=RAW");
  });

  it('upsert updates the row found by key (header row skipped)', async () => {
    const { impl, calls } = fakeFetch({ '!A:A': { values: [['Mobile'], ['01700000001'], ['01712345678']] } });
    const client = createSheetsClient({ spreadsheetId: 'sheet1', getToken, fetchImpl: impl });
    expect(await client.upsertRowByColumn('Active Students', 'A', '01712345678', ['01712345678'])).toEqual({ skipped: false, row: 3 });
    expect(calls[1]).toMatchObject({ method: 'PUT' });
    expect(calls[1]?.url).toContain("'Active Students'!A3");
  });

  it('upsert appends when the key is missing', async () => {
    const { impl, calls } = fakeFetch({ '!A:A': { values: [['Mobile']] }, ':append': { updates: { updatedRange: "'Active Students'!A2:N2" } } });
    const client = createSheetsClient({ spreadsheetId: 'sheet1', getToken, fetchImpl: impl });
    expect(await client.upsertRowByColumn('Active Students', 'A', '01799999999', ['01799999999'])).toEqual({ skipped: false, row: 2 });
    expect(calls[1]?.url).toContain(':append');
  });

  it('throws on API errors so the outbox retries', async () => {
    const impl = vi.fn(async () => new Response('quota', { status: 429 })) as unknown as typeof fetch;
    const client = createSheetsClient({ spreadsheetId: 'sheet1', getToken, fetchImpl: impl });
    await expect(client.appendRow('Admissions', ['x'])).rejects.toThrow('Sheets API 429');
  });
});

describe('email templates & dev mailbox (P2.04)', () => {
  it('credentials email contains mobile, PIN and expiry in both languages', async () => {
    const text = await render(
      createElement(CredentialsEmail, {
        brandName: 'ByteSizeICT', siteUrl: 'https://x.test', mobile: '01712345678', pin: '480317',
        startsAt: '7 Nov 2026', expiresAt: '6 Dec 2026', reason: 'welcome',
      }),
      { plainText: true },
    );
    expect(text).toContain('480317');
    expect(text).toContain('01712345678');
    expect(text).toContain('6 Dec 2026');
    expect(text).toContain('স্বাগতম');
    expect(text).toContain('Welcome to ByteSizeICT');
    expect(text).toContain('https://x.test/login');
  });

  it('other templates render', async () => {
    const htmls = await Promise.all([
      render(createElement(RenewalApprovedEmail, { brandName: 'B', siteUrl: 'https://x.test', mobile: '017', expiresAt: 'D' })),
      render(createElement(AdmissionRejectedEmail, { brandName: 'B', trxId: 'TRX1', reason: 'Amount mismatch', whatsappUrl: 'https://wa.me/1' })),
      render(createElement(AdminNewAdmissionEmail, { brandName: 'B', queueUrl: 'https://x.test/admin/admissions', mobile: '017', kind: 'new', method: 'bkash', trxId: 'T', amountBdt: 1200 })),
    ]);
    expect(htmls[1]).toContain('Amount mismatch');
    expect(htmls[2]).toContain('৳1,200');
  });

  it('without RESEND_API_KEY messages go to the dev mailbox', async () => {
    const before = devMailbox.length;
    const result = await sendEmail({
      to: 'x@test.local',
      subject: 'Hello',
      react: createElement(RenewalApprovedEmail, { brandName: 'B', siteUrl: 'https://x.test', mobile: '017', expiresAt: 'D' }),
    });
    expect(result).toEqual({ ok: true, id: null });
    expect(devMailbox.length).toBe(before + 1);
    expect(devMailbox.at(-1)?.to).toBe('x@test.local');
  });
});
