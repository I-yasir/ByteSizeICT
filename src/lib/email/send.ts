import 'server-only';
import { render } from '@react-email/components';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { env } from '@/lib/env';

/**
 * Transactional email (TRD §9.1). Without RESEND_API_KEY (dev/test/preview) messages are logged
 * and kept in `devMailbox` instead of sent; production requires the key (env validation).
 */
export type OutgoingEmail = { to: string; subject: string; react: ReactElement };
export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export type DevMail = { to: string; subject: string; text: string; html: string; at: string };
/**
 * In-memory capture for local development and tests. Never populated in production. Kept on
 * `globalThis` because Next bundles route handlers and Server Actions as separate module instances;
 * E2E specs read it through `/api/internal/dev-mailbox`.
 */
const mailboxHost = globalThis as typeof globalThis & { __bsiDevMailbox?: DevMail[] };
export const devMailbox: DevMail[] = (mailboxHost.__bsiDevMailbox ??= []);

let client: Resend | null = null;
const resend = () => (client ??= new Resend(env.RESEND_API_KEY));

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const [html, text] = await Promise.all([render(message.react), render(message.react, { plainText: true })]);

  if (!env.RESEND_API_KEY) {
    devMailbox.push({ to: message.to, subject: message.subject, text, html, at: new Date().toISOString() });
    if (devMailbox.length > 200) devMailbox.shift();
    console.info(JSON.stringify({ level: 'info', event: 'email.dev', to: message.to, subject: message.subject }));
    return { ok: true, id: null };
  }

  try {
    const { data, error } = await resend().emails.send({
      from: env.EMAIL_FROM ?? 'no-reply@localhost',
      to: message.to,
      subject: message.subject,
      html,
      text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
