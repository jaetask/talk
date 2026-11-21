# 17. A coding session runs in a scratch worktree, and its risky steps come back as questions

## Context

Talk can hand a coding task to a separate coding agent over the Agent Client Protocol. That agent can edit files and run commands, and a session can take a long time.

## Decision

In `src/coding/acp.ts`:

- Talk advertises no file or terminal capabilities. The agent uses its own tools and reports them, and every risky step comes back as a permission request.
- A session works in a fresh worktree on a new scratch branch, never in the owner's working copy.
- The agent's environment is the owner's, minus the variables of another running coding-agent session. Those would hijack the new one.
- A problem while displaying an update must not stop the session.

In `src/coding/policy.ts`:

- Each step runs without asking, is asked about, or is refused outright. Approval never depends on the agent's own wording.
- On a ticket, looking things up and commenting run without asking. Changing the ticket is the person's call.
- Some commands are refused whatever else is in the chain, because no confirmation could make them right here: sudo, recursive removal of root or home, piping a download into a shell, force pushes, pushes to the main branch, merging a pull request, hard resets, and world-writable permissions.
- Paths are compared by their real path, following links as far as the path exists, so a link cannot lead a step outside the session's folder.

In `src/ext/coding.ts` and `src/engine.ts`:

- Starting a session asks the person first, with the server's own question.
- The tool call then parks until the session finishes, and its result returns to the model as the tool's result.
- The chat's turn ends as soon as the session has started. The session holds the chat's run and reports when it is done. A turn spoken meanwhile is answered with where the session has got to.

## Consequences

Do not advertise file or terminal capabilities to the agent; that would move its work past the permission requests. Do not shorten the refused command list without thinking through each entry. Do not start a session in a working copy someone uses.
