# 4. Real changes need a switch file; test mode only needs the case to ask

## Context

Talk can change real data in the apps it connects to. A fresh install, a test run or an experiment should not be able to do that by accident.

## Decision

`src/config.ts` defines a switch file (by default `data/writes.enabled`). Writes are off unless that file exists. `src/server.ts` applies it per chat: a real chat gets writes only when the file exists and the chat has not turned them off. In test mode (pretend writes) changes are accepted and logged but never sent to an app, so a test case only needs to ask for writes; the file is not required. While writes are off, the gate refuses every change and the model is told it can only look things up.

## Consequences

Do not default writes to on. Do not let a request field alone enable real writes. Pretend mode must never reach an app's change tool.
