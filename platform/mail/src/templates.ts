/** Every mail mojibun sends, and the data each one needs. */
export type Templates = {
  "verify-email": { url: string };
  "already-registered": { resetUrl: string };
  "reset-password": { url: string };
  "email-changed": { newEmail: string };
  "account-deleted": Record<string, never>;
};

export type TemplateName = keyof Templates;

/** One mail: a template, its data and the address it goes to. */
export type Message = { [T in TemplateName]: { to: string; template: T; data: Templates[T] } }[TemplateName];

export type Rendered = { subject: string; text: string };

const templates: { [T in TemplateName]: (data: Templates[T]) => Rendered } = {
  "verify-email": ({ url }) => ({
    subject: "Verify your email for mojibun",
    text: `Open this link to verify your email and finish signing up:\n\n${url}\n\nThe link works once and expires in 24 hours. If you didn't sign up, ignore this mail.`,
  }),
  "already-registered": ({ resetUrl }) => ({
    subject: "You already have a mojibun account",
    text: `Someone tried to sign up with this address, but it already has an account.\n\nForgot your password? Reset it here:\n\n${resetUrl}\n\nIf this wasn't you, ignore this mail.`,
  }),
  "reset-password": ({ url }) => ({
    subject: "Reset your mojibun password",
    text: `Open this link to choose a new password:\n\n${url}\n\nThe link works once and expires in 1 hour. Resetting logs you out everywhere. If you didn't ask for this, ignore this mail.`,
  }),
  "email-changed": ({ newEmail }) => ({
    subject: "Your mojibun email was changed",
    text: `Your account now uses ${newEmail}. This address no longer logs in.\n\nIf you didn't make this change, reset your password at once.`,
  }),
  "account-deleted": () => ({
    subject: "Your mojibun account was deleted",
    text: "Your account and everything you studied in mojibun have been deleted. Thank you for learning with us.",
  }),
};

export const render = (message: Message): Rendered =>
  (templates[message.template] as (data: Message["data"]) => Rendered)(message.data);
