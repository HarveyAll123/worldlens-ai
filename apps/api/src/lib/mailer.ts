/**
 * Account emails (sign-up codes, password reset codes, new-email codes).
 *
 * Without MAIL_PROVIDER the code is printed to the API's console — enough to develop and test.
 * MAIL_PROVIDER=brevo sends through Brevo's free plan (300 emails a day, no domain needed: a
 * single verified sender address). Codes are never logged by the Brevo mailer.
 */
import type { FetchLike } from './http';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly name: 'log' | 'brevo' | 'test';
  send(mail: Mail): Promise<void>;
}

export const logMailer: Mailer = {
  name: 'log',
  async send(mail) {
    console.info(`[mail] to ${mail.to} · ${mail.subject}\n${mail.text}`);
  },
};

export function brevoMailer(
  apiKey: string,
  from: { email: string; name: string },
  fetchImpl: FetchLike = fetch,
): Mailer {
  return {
    name: 'brevo',
    async send(mail) {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: from,
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
        }),
      });
      if (!res.ok) throw new Error(`brevo: HTTP ${res.status}`);
    },
  };
}

/** TEST-ONLY (Playwright, Node server): keeps the last mails so a test can read its code. */
export class TestMailbox implements Mailer {
  readonly name = 'test' as const;
  readonly sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
    if (this.sent.length > 50) this.sent.shift();
  }
  last(to: string): Mail | null {
    for (let i = this.sent.length - 1; i >= 0; i--)
      if (this.sent[i]!.to.toLowerCase() === to.toLowerCase()) return this.sent[i]!;
    return null;
  }
}

export type CodePurpose = 'email-verification' | 'forget-password' | 'change-email' | 'sign-in';

/** The email carrying a 6-digit code. */
export function codeMail(to: string, code: string, purpose: CodePurpose): Mail {
  const what =
    purpose === 'forget-password'
      ? ['Reset your WorldLens password', 'to choose a new password']
      : purpose === 'change-email'
        ? ['Confirm your new email for WorldLens', 'to make this your account email']
        : ['Verify your email for WorldLens', 'to finish creating your account'];
  return {
    to,
    subject: `${what[0]}: ${code}`,
    text: `Your code is ${code}. Enter it in WorldLens ${what[1]}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
  };
}
