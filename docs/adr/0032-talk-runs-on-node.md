# 32. Talk runs on Node, with TypeScript run by tsx

## Context

Jae's other apps run on Node and npm. A second runtime meant a second set of tools, lockfile and CI setup.

## Decision

- The server runs on Node 22.19 or later. `npm start` runs `tsx src/server.ts`; source files import each other with `.ts` extensions and nothing is compiled for the server.
- HTTP is `node:http`. Routes are written against the web `Request` and `Response`; `src/http.ts` converts between the two, and streams a response body as it is produced, so the event stream reaches the page as each event is sent.
- The websocket is `ws` on the same server, upgraded only at `/ws`.
- The store is chord's `node:sqlite` adapter (`@earendil-works/chord/sqlite/node`): WAL, a busy timeout, one queue for every statement and `BEGIN IMMEDIATE` transactions.
- The server listens on 127.0.0.1 only. Its settings are `TALK_PORT` (3930), `TALK_DATA`, `TALK_TTS`, `TALK_PAGE_DIR` and `TALK_DEBUG_REQUEST`.
- The built page is served from `public/`; any other GET outside `/api/` gets `index.html`.

## Consequences

Do not add code that needs another runtime. Tests start their fake servers and Talk's server on port 0 and await the port before using it.
