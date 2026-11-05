export type { Mail } from "./contract.ts";
export { createFakeMail, type FakeMail } from "./fake.ts";
export { createSmtpMail, type SmtpConfig } from "./smtp.ts";
export { render, type Message, type Rendered, type TemplateName, type Templates } from "./templates.ts";
