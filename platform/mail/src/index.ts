export type { Mail } from "./mail.ts";
export { createFakeMail, type FakeMail } from "./fake-mail.ts";
export { createMail, mailConfigFromEnv, type MailConfig } from "./transport.ts";
export { render, type Message, type Rendered, type TemplateName, type Templates } from "./templates.ts";
