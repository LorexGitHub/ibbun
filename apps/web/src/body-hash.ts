/**
 * CloudFront signs each request to the API's function URL (origin access control),
 * and Lambda takes no unsigned body there: a request with a body must carry its
 * SHA-256 in `x-amz-content-sha256`, which CloudFront signs along with the rest.
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
 * Only same-origin requests get it, so a cross-origin one needs no CORS preflight for it.
 */
export const withBodyHash =
  (send: typeof fetch, origin: string): typeof fetch =>
  async (input, init) => {
    const request = new Request(input, init);
    if (request.body === null || new URL(request.url).origin !== origin) return send(request);
    const digest = await crypto.subtle.digest("SHA-256", await request.clone().arrayBuffer());
    request.headers.set("x-amz-content-sha256", Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""));
    return send(request);
  };
