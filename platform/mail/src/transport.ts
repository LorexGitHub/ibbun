import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import type { Mail } from "./mail.ts";
import { render } from "./templates.ts";

/** Where mail goes: SMTP (Mailpit locally) or SES, which signs with the Lambda role's credentials. */
export type MailConfig =
  | { transport: "smtp"; from: string; url: string }
  | { transport: "ses"; from: string; region?: string; endpoint?: string };

const DEFAULT_FROM = "ibbun <noreply@ibbun.test>";

/** `MAIL_TRANSPORT=ses` picks SES (`AWS_REGION`, optional `SES_ENDPOINT`); otherwise SMTP at `SMTP_URL`, Mailpit by default. */
export const mailConfigFromEnv = (env: Record<string, string | undefined>): MailConfig => {
  const from = env.MAIL_FROM ?? DEFAULT_FROM;
  switch (env.MAIL_TRANSPORT ?? "smtp") {
    case "smtp":
      return { transport: "smtp", from, url: env.SMTP_URL ?? "smtp://localhost:1025" };
    case "ses":
      return { transport: "ses", from, region: env.AWS_REGION, endpoint: env.SES_ENDPOINT };
    default:
      throw new Error(`MAIL_TRANSPORT must be smtp or ses, got ${env.MAIL_TRANSPORT}`);
  }
};

export const createMail = (config: MailConfig): Mail => {
  const transport =
    config.transport === "smtp"
      ? nodemailer.createTransport(config.url)
      : nodemailer.createTransport({
          SES: { sesClient: new SESv2Client({ region: config.region, endpoint: config.endpoint }), SendEmailCommand },
        });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, to: message.to, ...render(message) });
    },
  };
};
