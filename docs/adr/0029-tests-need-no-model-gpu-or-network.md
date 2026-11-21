# 29. Tests run without a model, a GPU or the network

## Context

Talk depends on a local model, speech services and other apps. Tests that need them cannot run in CI and give different output on each run.

## Decision

- In `test/run.ts` and `test/support.ts` the model is scripted and the apps are fakes in the test process. Nothing touches the model server, the real apps or the network beyond loopback.
- In `packages/pi-voice/test/run.ts` audio comes from recorded fixtures and the speech services are stand-ins in the process.
- `test/env.ts` points tests at their own small skills and personalities, so an edit to the real ones never changes a test.
- The web tests use a fake site on loopback. The address check would refuse it, so the test allows that one host and nothing else.
- "Make test" in `src/views.ts` drafts a case from a real turn. It records the lookups the turn made as fixtures, so the case does not drift with live data. A golden case checks the same tools and writes again and that no ids are spoken. A regression case, from a turn that went wrong, carries only the safety checks, for a person to add what must not recur.

## Consequences

Do not add a test that needs a live model, a speech server or a real app. Do not widen the loopback exception beyond the test's own host. Read every new approved output before committing it.
