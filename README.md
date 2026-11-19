# Talk

A voice-first agent service on [pi](https://pi.dev) and [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable), with a page to talk to it from.

- **Durable chats.** Every chat is a Pi Durable conversation in one SQLite file. A turn, a tool call waiting on a yes, and a long job all survive a restart.
- **Apps over MCP.** Each app is an MCP server; Talk makes one extension per app. Tools are classified as lookups, changes or dangerous changes from their names and annotations.
- **Ask before delete.** A dangerous change (delete, archive, send, pay) is parked by a hook until you say yes. The item must be one a lookup just returned. Anything but a yes stops the run, and what you said instead is the next turn.
- **Agents.** An agent is a role, a voice and the apps it may use. One agent can ask another, which runs as a child conversation.
- **Voice.** `packages/pi-voice` is a voice loop in front of any Pi Durable conversation: turn detection, sentence-by-sentence speech, barge-in, swappable voices (Kokoro, xAI, ElevenLabs, any OpenAI-compatible speech server). It imports nothing from Talk.
- **The page** (`web/`): each agent is a bot with one conversation on screen. You see the steps a turn takes, the card each call stored, and the gate as a card with buttons. A Trajectory tab shows each turn as model steps, lookups and changes with timings. Voice calls and dictation use the same loop.

It is built for a local model (Gemma on Ollama) and local speech (Whisper and Kokoro over HTTP). Nothing leaves the machine unless you configure a hosted voice.

## Run

```sh
bun install
(cd web && bun install && bun run build)
cp apps.example.json apps.json     # the MCP servers your agents may use; optional
bun src/server.ts                  # http://127.0.0.1:3911
```

It needs Ollama on 11434 with the model, and for voice a speech server with Whisper and Kokoro (`VOICESTUDIO_URL`, an OpenAI-compatible `/v1/audio` API plus Kokoro's streaming websocket).

| Setting | Default | What it does |
|---|---|---|
| `TALK_NEXT_PORT` | 3911 | The port (loopback only) |
| `TALK_NEXT_DATA` | `data` | Where the store, the web cache and scratch worktrees go |
| `TALK_MODEL` | `gemma4:26b-a4b-it-qat` | The model id on Ollama |
| `TALK_APPS_FILE` | `apps.json` | The apps: `[{ "name", "label", "url", "about" }]` |
| `TALK_SKILLS_DIR`, `TALK_PERSONAS_DIR` | `skills`, `personalities` | Plain-text skills (one per app) and roles, read fresh each turn |
| `TALK_NEXT_TTS` | `kokoro` | The voice provider: `kokoro`, `kokoro-http`, `xai` (needs `XAI_API_KEY`), `elevenlabs` (needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE`) |
| `TALK_PRETEND_WRITES` | off | Test mode: changes are accepted and logged, never made |

Real changes also need a switch file: `data/writes.enabled`.

## Tests

```sh
bun test/run.ts                              # the service: 61 expect tests
(cd packages/pi-voice && bun test/run.ts)    # the voice loop: 29
```

Expect tests with [`@jaetask/snap`](https://www.npmjs.com/package/@jaetask/snap): each case is an input file with its approved output beside it. The model is scripted and the apps are fakes in the test process, so nothing needs a GPU. `--update` approves new output; read the diff first.

## How it is put together

```
src/server.ts        the page, its HTTP API and the websocket
src/engine.ts        a chat is a Pi Durable conversation; a turn follows its run
src/bots.ts          the page's API: agents as bots, rows from the transcript, one event stream
src/ext/             extensions: one per app (MCP), the gate, agents and delegation, the web and research,
                     Claude Code over ACP, the file reader
src/apps/            how app tools are classified, shown to the model, compacted and drawn as cards
src/views.ts         what the screens are given: turns, cards, export, a draft test from a turn
src/model/ollama.ts  Ollama's own chat API as a pi-ai API
packages/pi-voice/   the voice loop
web/                 the page (React, built with bun)
```

## Where it came from

Talk began as a private Python service; this is its rewrite on pi. Comments that mention "Python Talk" refer to that predecessor, and some code still knows the shapes of the apps it grew up with (a ticket board, for one).

The page began as [grokbot-clone](https://github.com/nickvasilescu/grokbot-clone)'s web app (MIT, `web/LICENSE.grokbot-clone`). Its artwork is not used here: the avatars are drawn from formulas in `web/src/avatar/shapes.ts` and the icons are Lucide.

## Licence

MIT.
