# 26. Kokoro speech streams over one websocket per reply

## Context

A spoken reply is judged on how soon the first audio arrives. A separate HTTP request per sentence pays connection and setup time each time.

## Decision

`packages/pi-voice/src/providers/kokoro-stream.ts` opens one websocket for a whole reply, sends a JSON request per sentence, and receives PCM chunks as they are rendered. It reaches first audio sooner than a request per sentence. The speech server has no cancel message, so stopping in the middle of a sentence drops the connection, and it is reopened next time.

## Consequences

A barge-in costs one reconnect. Do not reuse a connection after a stop in the middle of a sentence.
