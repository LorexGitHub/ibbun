# ADR 0003: Verify Cognito tokens in the API function, without API Gateway

- Status: Accepted
- Date: 2026-11-04

## Context

The usual AWS design puts an API Gateway HTTP API with a Cognito JWT authorizer in front of the API Lambda. Under `alchemy dev`, that authorizer rejects every token. The emulator's Cognito signs tokens with the real AWS issuer URL. Its API Gateway then fetches that issuer's signing keys from real AWS, where the local pool does not exist, and gets a 404.

Alchemy's emulator is a fork of Floci. We tried upstream Floci 2.4.0 instead. Its JWT authorizer works in TLS mode, but it lacks the CloudFront KeyValueStore API that Alchemy's `Website.Router` needs, so the stack cannot deploy on it.

## Decision

- Drop API Gateway. The CloudFront router sends `/api/*` straight to the Lambda's function URL.
- Verify the Cognito ID token inside the function (`src/auth/LearnerAuth.ts`, with `jose`). The check covers the signature against the pool's published keys, the issuer, the audience (the web client id) and `token_use = id`. A failure returns 401.
- Read the signing keys from Cognito on AWS. Locally, read them from the emulator, which sets `AWS_ENDPOINT_URL` in the function's container.

## Consequences

- The same verification code runs locally and on AWS, and `npm run smoke` covers it, including a forged-token case.
- The estimated bill drops by about a fifth, because API Gateway charged for every request.
- The function URL is public. A request that bypasses CloudFront still has to pass the token check, but it runs the Lambda, which API Gateway would have rejected at no compute cost. There is also no API Gateway throttling. If abuse becomes a problem, restrict the function URL to CloudFront with Origin Access Control, or put AWS WAF on the distribution.
- Each Lambda sandbox caches the signing keys after first use, so a cold start pays one extra HTTPS call.
