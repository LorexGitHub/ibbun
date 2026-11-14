import { Hono } from "hono";

/**
 * The API as CloudFront's viewers see it. Behind CloudFront the function URL
 * receives its own host, so each request is rewritten onto `appUrl`, the origin
 * the browser talks to and Better Auth trusts. `x-forwarded-for` is set to the
 * viewer's address from `cloudfront-viewer-address` alone: CloudFront appends to
 * whatever the viewer sent, so the header's first entry could be forged.
 */
export const behindCloudFront = (appUrl: string, api: Hono): Hono =>
  new Hono().all("*", (c) => {
    const { pathname, search } = new URL(c.req.url);
    const request = new Request(new URL(pathname + search, appUrl), c.req.raw);
    const viewer = request.headers.get("cloudfront-viewer-address");
    request.headers.delete("x-forwarded-for");
    if (viewer) request.headers.set("x-forwarded-for", viewer.slice(0, viewer.lastIndexOf(":")));
    return api.fetch(request);
  });
