# 19. The model drives the file reader with tools, and reading follows what is heard

## Context

Talk can read a Markdown file aloud beside a chat. A model asked to "read section three" would otherwise retell it in its own words. The reader and the reply share one voice, and audio is queued at the page ahead of what the person hears.

## Decision

- `src/ext/reader.ts` gives the model tools to read a section, go to the next or previous one, pause, resume and open a file. The model never retells a section to read it, and it answers questions about the open file from the file's own text.
- A reader tool does not start audio itself. It leaves an action in the chat state, and the server carries it out after the reply has been spoken (`src/chat.ts`, `src/store.ts`, `src/server.ts`).
- A new turn stops the reading. Asking to carry on resumes from where it was heard.
- The reader keeps about 1.5 seconds of audio queued at the page. The reading position follows what has been heard, not what has been sent.
- A new section is shown once the last one has been heard, and a section change or the end is shown after the last sentence's cue has fired.
- When reading is stopped midway, the saved position is the sentence that was being heard.
- A heading is read as one sentence however it is punctuated, so "2. Tools" is not split into "two" and "tools" (`src/reader/articles.ts`).

## Consequences

Do not save the position from what was sent; it runs ahead of the listener. Do not start reading from inside a tool call; the reply would overlap it. Keep the cue ordering, or the page highlights a section before its last sentence is heard.
