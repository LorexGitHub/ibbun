import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeMail, createSmtpMail, render, type Mail, type Message } from "./index.ts";

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
    const mail: Mail = createSmtpMail({ url: `smtp://127.0.0.1:${port}`, from: "mojibun <noreply@mojibun.test>" });
    await mail.send(every[0]!);
    expect(received).toHaveLength(1);
    expect(received[0]!.from).toBe("noreply@mojibun.test");
    expect(received[0]!.to).toEqual(["a@x.test"]);
    expect(received[0]!.raw).toContain(`Subject: ${render(every[0]!).subject}`);
    expect(quotedPrintableBody(received[0]!.raw)).toContain(render(every[0]!).text);
  });
});
