# 31. Skills, personalities and agent settings are read fresh each turn

## Context

Skills and personalities are plain text files that are edited often. Agent settings are changed from the page. A restart to apply an edit would interrupt chats and calls.

## Decision

`src/apps/skills.ts` reads skill and personality files at every use, so an edit applies without a restart. `src/engine.ts` copies the agent's settings into the chat as they are at the start of each turn, so a change in Settings applies from the next turn.

## Consequences

Do not cache these files or settings across turns. A broken edit takes effect on the next turn, so the readers must tolerate a missing or malformed file.
