import { describe, expect, it } from "vitest";
import { createLearnerClient } from "./learner-client.ts";

const answering = (...responses: Response[]) => {
  const requests: Request[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(new URL(String(input), "http://m.test"), init));
    return responses.shift()!;
  }) as typeof fetch;
  return { requests, client: createLearnerClient({ fetch: send }) };
};

describe("learner/client", () => {
  it("posts JSON to /api/auth on the page's own origin, with cookies", async () => {
    const { requests, client } = answering(Response.json({ token: null }));
    expect(await client.signIn("a@x.test", "pw")).toEqual({ ok: true, data: null });
    const [request] = requests;
    expect(request!.url).toBe("http://m.test/api/auth/sign-in/email");
    expect(request!.method).toBe("POST");
    expect(request!.credentials).toBe("same-origin");
    expect(await request!.json()).toEqual({ email: "a@x.test", password: "pw" });
  });

  it("reads with GET", async () => {
    const { requests, client } = answering(Response.json(null));
    expect(await client.session()).toEqual({ ok: true, data: null });
    expect(requests[0]!.method).toBe("GET");
  });

  it("passes on the server's message for a failure", async () => {
    const { client } = answering(Response.json({ message: "email or password is wrong" }, { status: 401 }));
    expect(await client.signIn("a@x.test", "pw")).toEqual({ ok: false, status: 401, message: "email or password is wrong" });
  });

  it("falls back to the status text when the failure has no JSON body", async () => {
    const { client } = answering(new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }));
    expect(await client.signOut()).toEqual({ ok: false, status: 502, message: "Bad Gateway" });
  });

  it("passes on a failure to read the session or the session list", async () => {
    const unauthorized = () => Response.json({ message: "log in first" }, { status: 401 });
    expect(await answering(unauthorized()).client.session()).toEqual({ ok: false, status: 401, message: "log in first" });
    expect(await answering(unauthorized(), unauthorized()).client.listSessions()).toEqual({
      ok: false,
      status: 401,
      message: "log in first",
    });
  });

  it("marks no session current when the current session can't be read", async () => {
    const list = [{ token: "t1", createdAt: "c", updatedAt: "u" }];
    const { client } = answering(Response.json(list), Response.json({ message: "?" }, { status: 500 }));
    expect(await client.listSessions()).toEqual({
      ok: true,
      data: [{ id: "t1", ipAddress: null, userAgent: null, createdAt: "c", lastUsedAt: "u", current: false }],
    });
  });
});
