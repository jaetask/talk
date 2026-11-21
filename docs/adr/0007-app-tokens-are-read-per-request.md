# 7. App access tokens are read at each request and never stored or logged

## Context

Each app is reached over its own MCP server and may need an access token. Tokens rotate, and a token must not leak through logs, error text or the transcript.

## Decision

In `src/apps/registry.ts`:

- Apps are reached over MCP only, never through an app-to-app HTTP API.
- The token is read from the app's `.env` file at each request. A rotated token works without a restart, and the token is not held in memory between requests.
- Tokens are never stored, printed or logged.
- When connecting fails, only the error's name is kept, never its message, because the message could carry a header.

## Consequences

Do not cache the token on the app object. Do not log request headers or raw connection error messages. Do not put an error message from a connection failure into anything the model or the page sees.
