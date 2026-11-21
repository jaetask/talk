# 5. Parked work survives a restart and resumes only after the apps' tools are installed

## Context

A call waiting on a yes, and a long job, can outlive the process. After a restart the app connections and their tools do not exist until the apps have been reached again.

## Decision

- Calls parked in a process are held in memory by conversation and call id (`src/ext/gate.ts`). The pending question and each decision are also written to the chat document, so a restart finds a recorded decision and nothing is asked twice.
- Stopping the answer or closing the service ends the wait without deciding. The call stays undecided.
- `src/engine.ts` resumes unfinished work only in the step that connects the apps and installs their tools. A call parked before a restart would otherwise wake to find its tool missing.

## Consequences

Do not resume the harness before the app extensions are installed. Do not treat an aborted wait as a no. The in-memory map is a shortcut for the live process only; the chat document is the record.
