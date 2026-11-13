import { createServer, type Server } from "node:http";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeMail, createMail, mailConfigFromEnv, render, type Mail, type Message } from "./index.ts";

/** The body of a raw mail, quoted-printable decoded, with CRLF as LF. */
const quotedPrintableBody = (raw: string) =>
  raw
    .slice(raw.indexOf("\r\n\r\n") + 4)
    .replaceAll("=\r\n", "")
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replaceAll("\r\n", "\n")
    .trimEnd();

const every: Message[] = [
  { to: "a@x.test", template: "verify-email", data: { url: "https://m.test/verify?t=1" } },
  { to: "a@x.test", template: "already-registered", data: { resetUrl: "https://m.test/reset" } },
  { to: "a@x.test", template: "reset-password", data: { url: "https://m.test/reset?t=2" } },
  { to: "a@x.test", template: "email-changed", data: { newEmail: "b@x.test" } },
  { to: "a@x.test", template: "account-deleted", data: {} },
];

describe("render", () => {
  it.each(every)("gives $template a subject and a body carrying its data", (message) => {
    const { subject, text } = render(message);
    expect(subject.length).toBeGreaterThan(0);
    for (const value of Object.values(message.data)) expect(text).toContain(value);
  });

  it("gives each template its own subject", () => {
    expect(new Set(every.map((m) => render(m).subject)).size).toBe(every.length);
  });
});

describe("fake mail", () => {
  it("records what was sent, in order, and finds the last mail to an address", async () => {
    const mail = createFakeMail();
    await mail.send(every[0]!);
    await mail.send({ to: "b@x.test", template: "account-deleted", data: {} });
    await mail.send(every[2]!);
    expect(mail.sent().map((m) => m.template)).toEqual(["verify-email", "account-deleted", "reset-password"]);
    expect(mail.last("a@x.test")?.template).toBe("reset-password");
    expect(mail.last("nobody@x.test")).toBeUndefined();
  });
});

describe("smtp mail", () => {
  const received: { from: string; to: string[]; raw: string }[] = [];
  let server: SMTPServer;
  let port: number;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, session, done) {
        let raw = "";
        stream.on("data", (chunk: Buffer) => (raw += chunk.toString()));
        stream.on("end", () => {
          received.push({
            from: (session.envelope.mailFrom as { address: string }).address,
            to: session.envelope.rcptTo.map((r) => r.address),
            raw,
          });
          done();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("delivers the rendered template to the recipient from the configured sender", async () => {
    const mail: Mail = createMail(mailConfigFromEnv({ SMTP_URL: `smtp://127.0.0.1:${port}` }));
    await mail.send(every[0]!);
    expect(received).toHaveLength(1);
    expect(received[0]!.from).toBe("noreply@ibbun.test");
    expect(received[0]!.to).toEqual(["a@x.test"]);
    expect(received[0]!.raw).toContain(`Subject: ${render(every[0]!).subject}`);
    expect(quotedPrintableBody(received[0]!.raw)).toContain(render(every[0]!).text);
  });
});

describe("ses mail", () => {
  const requests: { path: string; authorization: string; body: { FromEmailAddress?: string; Content: { Raw: { Data: string } } } }[] = [];
  let server: Server;
  let endpoint: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        requests.push({ path: req.url ?? "", authorization: req.headers.authorization ?? "", body: JSON.parse(body) });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ MessageId: "ses-1" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("sends the rendered template as a signed SESv2 raw mail from the configured sender", async () => {
    const mail = createMail(
      mailConfigFromEnv({ MAIL_TRANSPORT: "ses", AWS_REGION: "eu-central-1", SES_ENDPOINT: endpoint, MAIL_FROM: "ibbun <noreply@ibbun.test>" }),
    );
    await mail.send(every[2]!);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.path).toBe("/v2/email/outbound-emails");
    expect(requests[0]!.authorization).toContain("/eu-central-1/ses/aws4_request");
    const raw = Buffer.from(requests[0]!.body.Content.Raw.Data, "base64").toString();
    expect(raw).toContain("From: ibbun <noreply@ibbun.test>");
    expect(raw).toContain("To: a@x.test");
    expect(raw).toContain(`Subject: ${render(every[2]!).subject}`);
    expect(quotedPrintableBody(raw)).toContain(render(every[2]!).text);
  });
});

describe("mail config", () => {
  it("defaults to Mailpit over SMTP", () => {
    expect(mailConfigFromEnv({})).toEqual({ transport: "smtp", from: "ibbun <noreply@ibbun.test>", url: "smtp://localhost:1025" });
  });

  it("rejects an unknown transport instead of silently using SMTP", () => {
    expect(() => mailConfigFromEnv({ MAIL_TRANSPORT: "sendgrid" })).toThrow(/MAIL_TRANSPORT/);
  });
});
