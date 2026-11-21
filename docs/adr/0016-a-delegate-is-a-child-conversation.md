# 16. A delegate is a child conversation that cannot delegate or ask for a yes

## Context

One agent can hand work to another. The delegate must behave like the same agent the person could talk to directly, and it must not be able to make dangerous changes out of the person's sight.

## Decision

- In `src/ext/agents.ts` the delegate runs as a durable subagent: a child conversation owned by the tool call, with that agent's own role, apps, model and signature.
- The child is configured by the same rule as any chat (`src/engine.ts`): the extensions of the apps its agent may use, no write tools while writes are off, and its model. An agent is the same agent whether the person talks to it or another agent hands it work.
- Stopping the call stops the delegate. The parent is busy until the child is done. A rerun after a crash finds the same child and the same submission (`src/ext/subagent.ts`).
- A delegate cannot delegate further.
- A delegate cannot ask the person for a yes. A dangerous change comes back refused, for the agent the person is talking to to make itself.

## Consequences

Do not give a delegate a way to confirm dangerous changes. Do not configure child conversations by a separate rule. Do not allow nested delegation without a depth limit and a reason.
