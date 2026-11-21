# AGENTS.md

Talk: a voice-first agent service on pi and Pi Durable, with a page built on @jaetask/toolkit. TypeScript, Node 22.19+, ESM, run with tsx. Read [README.md](README.md) first.

- **Checks**: `npm run typecheck`, `lint`, `format:check`, `test`, `build`. `npm run test:update` approves new output; read every new `.expect.md` before committing. `npm run format` fixes formatting.
- **Pages**: the page is in `page/`, built from [@jaetask/toolkit](https://github.com/jaetask/toolkit) and its ux-flow skill: the app shell with no top bar, working pages (`WorkPage`, three bands, actions as icons), names edited in place, the rest in a row's "...", short forms in a centred dialog, and settings with their own sidebar. `toolkit-guard` (part of `lint`) fails a hand-built shell or kit part, a raw browser control, a literal colour or a focus ring. A missing piece goes into the toolkit.
- **Toasts**: only for a delete or an error.
- **Read is a separate app**: the file reader and the Library are not part of Talk.
- **Branches**: push a branch, never main. `auto-pr` opens a pull request to main and it merges itself when the `ci` check passes; the pre-push hook refuses main.
- **No code comments**: code is law. Say it in the code, a name or a test; a decision goes in `docs/adr`. `check-comments` (part of `typecheck`) fails any new comment; the delete-comment skill removes them.
- **Plain, literal language**: no slogans, hype or dramatic phrasing.
- Log friction and decisions with the trail skill. When corrected, or when the same friction repeats, use the pave skill.
