# a-lookup-a-change-and-a-yes

## Input

[a-lookup-a-change-and-a-yes.json](a-lookup-a-change-and-a-yes.json)

## Output

# a-lookup-a-change-and-a-yes

The bots page against a scripted engine: the roster, a typed turn with a lookup (its step, its card, the reply streaming in), a dangerous change that waits on the card's button, a reload that must show the same rows, the Trajectory's turns, and a turn made into a test and then cleared.

## GET /auth/me (user.name)

200

```json
"Jae"
```

## GET /bots (bots.name)

200

```json
[
  "Cooper",
  "Maddy"
]
```

## GET /bots/cooper (bot)

200

```json
{
  "id": "cooper",
  "name": "Cooper",
  "label": "",
  "description": "the lead: every app, and the one to ask when unsure",
  "instructions": "",
  "avatarShape": "blob",
  "avatarColor": "orange",
  "mode": "personal",
  "isPrimary": true,
  "kind": "agent",
  "pinned": false,
  "effort": "medium",
  "voice": "af_heart",
  "voiceSpeed": 0.94,
  "voiceLanguage": "en",
  "generation": 1,
  "unread": 0,
  "lastPreview": null,
  "lastActivityAt": "<n>",
  "createdAt": "<n>"
}
```

## GET /apps (apps)

200

```json
[
  {
    "slug": "tasks",
    "name": "Tasks",
    "description": "3 lookups and 3 changes, over its MCP server",
    "categories": [],
    "managedAuth": false,
    "noAuth": true,
    "connected": true
  }
]
```

## cooper is told: What's on the board?

200, and the row it answers with: 1000 message: user: What's on the board?

The stream:

- rows: 1000 message: user: What's on the board?
- live: running, thinking
- rows: 1010 tool-call: Tasks · board-read [running]
- live: running, connecting_service (Tasks)
- rows: 1010 tool-call: Tasks · board-read [done]
- rows: 1011 card: Tasks · board-read [tickets]
- live: running, thinking
- rows: 1999 message: assistant, streaming: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.
- rows (replacing 1000 on): 1000 message: user: What's on the board?
- rows (replacing 1000 on): 1010 tool-call: Tasks · board-read [done]
- rows (replacing 1000 on): 1011 card: Tasks · board-read [tickets]
- rows (replacing 1000 on): 1999 message: assistant: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.
- live: idle
- bot: cooper, last "Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.", unread 1, conversation 1
- tasks: cooper

## Reload cooper

- 1000 message: user: What's on the board?
- 1010 tool-call: Tasks · board-read [done]
- 1011 card: Tasks · board-read [tickets]
- 1999 message: assistant: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.

The 4 rows the stream built are the rows a reload fetches.

## cooper is told: Archive the sidebar ticket

200, and the row it answers with: 2000 message: user: Archive the sidebar ticket

The stream:

- rows: 2000 message: user: Archive the sidebar ticket
- live: running, thinking
- rows: 2010 tool-call: Tasks · ticket-archive id=TLK-2 [awaiting-approval]
- live: running, connecting_service (Tasks)
- rows: 2999 message: assistant, streaming: Archive the Tidy the sidebar ticket in Tasks?
- rows (replacing 1000 on): 1000 message: user: What's on the board?
- rows (replacing 1000 on): 1010 tool-call: Tasks · board-read [done]
- rows (replacing 1000 on): 1011 card: Tasks · board-read [tickets]
- rows (replacing 1000 on): 1999 message: assistant: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.
- rows (replacing 1000 on): 2000 message: user: Archive the sidebar ticket
- rows (replacing 1000 on): 2990 card: approval [pending] "Archive the Tidy the sidebar ticket in Tasks?" for Tasks · ticket-archive id=TLK-2
- live: waiting for your yes
- bot: cooper, last "Archive the Tidy the sidebar ticket in Tasks?", unread 1, conversation 1
- tasks: cooper

## GET /tasks (tasks.title)

200

```json
[
  "Archive the Tidy the sidebar ticket in Tasks?"
]
```

## Reload cooper

- 1000 message: user: What's on the board?
- 1010 tool-call: Tasks · board-read [done]
- 1011 card: Tasks · board-read [tickets]
- 1999 message: assistant: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.
- 2000 message: user: Archive the sidebar ticket
- 2990 card: approval [pending] "Archive the Tidy the sidebar ticket in Tasks?" for Tasks · ticket-archive id=TLK-2

The 6 rows the stream built are the rows a reload fetches.

## The card's button: allow

200

The stream:

- live: running, thinking
- rows: 3010 tool-call: Tasks · ticket-archive id=TLK-2 [running]
- live: running, connecting_service (Tasks)
- rows: 3010 tool-call: Tasks · ticket-archive id=TLK-2 [done] pretend
- rows: 3011 card: Tasks · ticket-archive [change]
- live: running, thinking
- rows: 3999 message: assistant, streaming: I've archived Tidy the sidebar.
- rows (replacing 2000 on): 2000 message: user: Archive the sidebar ticket
- rows (replacing 2000 on): 2990 card: approval [allowed] "Archive the Tidy the sidebar ticket in Tasks?"
- rows (replacing 2000 on): 3010 tool-call: Tasks · ticket-archive id=TLK-2 [done] pretend
- rows (replacing 2000 on): 3011 card: Tasks · ticket-archive [change]
- rows (replacing 2000 on): 3999 message: assistant: I've archived Tidy the sidebar.
- live: idle
- bot: cooper, last "I've archived Tidy the sidebar.", unread 1, conversation 1
- tasks: cooper

## Reload cooper

- 1000 message: user: What's on the board?
- 1010 tool-call: Tasks · board-read [done]
- 1011 card: Tasks · board-read [tickets]
- 1999 message: assistant: Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.
- 2000 message: user: Archive the sidebar ticket
- 2990 card: approval [allowed] "Archive the Tidy the sidebar ticket in Tasks?"
- 3010 tool-call: Tasks · ticket-archive id=TLK-2 [done] pretend
- 3011 card: Tasks · ticket-archive [change]
- 3999 message: assistant: I've archived Tidy the sidebar.

The 9 rows the stream built are the rows a reload fetches.

## GET /bots/cooper/export

200

```json
"application/x-ndjson: 4 lines"
```

## GET /bots/cooper/trajectory (turns.said)

200

```json
[
  "What's on the board?",
  "Archive the sidebar ticket",
  "yes"
]
```

## Turn 1: case

200

```json
{
  "saved": "expect/cases/golden.what-s-on-the-board.json",
  "case": {
    "brain": "smart",
    "config": {
      "agent": "cooper",
      "writes": false,
      "fixtures": [
        "tasks__board-read"
      ]
    },
    "turns": [
      {
        "say": "What's on the board?",
        "checks": {
          "tool": [
            "Tasks · board-read"
          ],
          "no_write": true,
          "no_uuid": true,
          "no_claim_without_tool": true
        }
      }
    ],
    "runs": 3
  }
}
```

## Turn 1: redact

200

```json
{
  "ok": true
}
```

The stream:

- cleared: cooper, conversation 1
- rows: 2000 message: user: Archive the sidebar ticket
- rows: 2990 card: approval [allowed] "Archive the Tidy the sidebar ticket in Tasks?"
- rows: 3010 tool-call: Tasks · ticket-archive id=TLK-2 [done] pretend
- rows: 3011 card: Tasks · ticket-archive [change]
- rows: 3999 message: assistant: I've archived Tidy the sidebar.
- bot: cooper, last "I've archived Tidy the sidebar.", unread 1, conversation 1

## Reload cooper

- 2000 message: user: Archive the sidebar ticket
- 2990 card: approval [allowed] "Archive the Tidy the sidebar ticket in Tasks?"
- 3010 tool-call: Tasks · ticket-archive id=TLK-2 [done] pretend
- 3011 card: Tasks · ticket-archive [change]
- 3999 message: assistant: I've archived Tidy the sidebar.

The 5 rows the stream built are the rows a reload fetches.
