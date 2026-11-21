# AGENTS.md

Talk: a voice-first agent service on pi and Pi Durable. Read [README.md](README.md) first.

- **Checks**: `bun run check` (types) and `bun run test` (approved-output tests; `bun run test:update`, then read every new `.expect.md`).
- **Branches**: push a branch, never main. `auto-pr` opens a pull request to main and it merges itself when the `ci` check passes; the pre-push hook refuses main.
- **No code comments**: code is law. Say it in the code, a name or a test; a decision goes in `docs/adr`. `check-comments` (part of `bun run check`) fails any new comment; the delete-comment skill removes them.
