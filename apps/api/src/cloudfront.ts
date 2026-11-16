import { Hono } from "hono";

/** The viewer's IP, set by the router's viewer-request function over anything the viewer sent (infra/modules/cdn). */
export const VIEWER_IP_HEADER = "x-viewer-ip";

/**
 * The API as CloudFront's viewers see it. Behind CloudFront the function URL
 * receives its own host, so each request is rewritten onto `appUrl`, the origin
 * the browser talks to and Better Auth trusts. `x-forwarded-for` is set to the
 * viewer's IP from `VIEWER_IP_HEADER` alone: CloudFront appends to whatever the
 * viewer sent, so the header's first entry could be forged. Only CloudFront can
 * reach the function URL, so nobody else can write `VIEWER_IP_HEADER`.
 */
export const behindCloudFront = (appUrl: string, api: Hono): Hono =>
  new Hono().all("*", (c) => {
    const { pathname, search } = new URL(c.req.url);
    const request = new Request(new URL(pathname + search, appUrl), c.req.raw);
    const viewer = request.headers.get(VIEWER_IP_HEADER);
    request.headers.delete("x-forwarded-for");
    if (viewer) request.headers.set("x-forwarded-for", viewer);
    return api.fetch(request);
  });
