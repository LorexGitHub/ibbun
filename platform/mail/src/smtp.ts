import nodemailer from "nodemailer";
import type { Mail } from "./mail.ts";
import { render } from "./templates.ts";

export type SmtpConfig = {
  /** For example `smtp://localhost:1025` for Mailpit. */
  url: string;
  /** The sender, for example `mojibun <noreply@mojibun.test>`. */
  from: string;
};

export const createSmtpMail = ({ url, from }: SmtpConfig): Mail => {
  const transport = nodemailer.createTransport(url);
  return {
    async send(message) {
      await transport.sendMail({ from, to: message.to, ...render(message) });
    },
  };
};
