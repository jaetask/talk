# 33. The Trajectory reads every stored tool name, and never shows an unknown cost as zero

## Context

Tool calls are stored with their tool's name. Since 11 Nov 2026 the name is the app, two underscores, then the tool (`tasks__ticket-read`); calls stored before then use one underscore (`tasks_get-task`). A turn on a plan has no per-call price, so its cost is not known.

## Decision

The page's Trajectory splits a stored name on two underscores when it has them, and on the first underscore otherwise. A cost that is not known is said to be unknown, never shown as zero, and a chat total says how many turns it leaves out.

## Consequences

Old conversations still show their app and tool in the log. The usage line can read "no cost" or name the turns it could not price, so a total is never smaller than it looks.
