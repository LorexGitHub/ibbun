// Stands in for the Lambda function URL in front of the API running under the
// Lambda Runtime Interface Emulator (lambda.Dockerfile). Each HTTP request becomes
// a function URL event (payload 2.0), and the function's result becomes the response.
//   node apps/api/lambda-url-proxy.mjs [port] [invoke URL]
// Defaults: port 3000, http://localhost:9000/2015-03-31/functions/function/invocations.
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3000);
const invoke = process.argv[3] ?? "http://localhost:9000/2015-03-31/functions/function/invocations";

const toEvent = (req, body) => {
  const url = new URL(req.url, "http://lambda-url");
  const { cookie, ...headers } = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, [v].flat().join(",")]));
  return {
    version: "2.0",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    cookies: cookie?.split("; "),
    headers,
    requestContext: { http: { method: req.method, path: url.pathname, sourceIp: req.socket.remoteAddress }, domainName: headers.host },
    body: body.toString("base64"),
    isBase64Encoded: true,
  };
};

const reply = (res, { statusCode, headers, cookies = [], body = "", isBase64Encoded }) =>
  res.writeHead(statusCode, { ...headers, "set-cookie": cookies }).end(Buffer.from(body, isBase64Encoded ? "base64" : "utf8"));
  res.writeHead(result.statusCode, headers).end(Buffer.from(result.body ?? "", result.isBase64Encoded ? "base64" : "utf8"));
};

// The emulator runs one invocation at a time and drops the others, where Lambda would
// start another instance. Queue them instead.
let queue = Promise.resolve();
const invokeInTurn = (event) => {
  const result = queue.then(() => fetch(invoke, { method: "POST", body: JSON.stringify(event) }).then((r) => r.json()));
  queue = result.catch(() => {});
  return result;
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const started = performance.now();
  const result = await invokeInTurn(toEvent(req, Buffer.concat(chunks))).catch((error) => ({ statusCode: 502, body: String(error) }));
  console.log(`${req.method} ${req.url} ${result.statusCode} ${(performance.now() - started).toFixed(0)} ms`);
  reply(res, result);
}).listen(port, () => console.log(`function URL for ${invoke} on :${port}`));
