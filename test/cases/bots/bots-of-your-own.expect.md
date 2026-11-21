# bots-of-your-own

## Input

[bots-of-your-own.json](bots-of-your-own.json)

## Output

# bots-of-your-own

Making, changing and removing a bot (an agent), a new conversation and going back to an earlier one, a turn spoken on a call landing in the same transcript, and the small endpoints the details panel reads.

## POST /bots {"name":"Scout","avatarShape":"star","avatarColor":"green","mode":"personal"} (bot)

200

```json
{
  "id": "scout",
  "name": "Scout",
  "label": "",
  "description": "",
  "instructions": "",
  "avatarShape": "star",
  "avatarColor": "green",
  "mode": "personal",
  "isPrimary": false,
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

The stream:

- roster

## PATCH /bots/scout {"description":"finds things out","instructions":"Be brief.","voice":"bf_emma","voiceSpeed":1.1,"avatarColor":"blue"} (bot)

200

```json
{
  "id": "scout",
  "name": "Scout",
  "label": "",
  "description": "finds things out",
  "instructions": "Be brief.",
  "avatarShape": "star",
  "avatarColor": "blue",
  "mode": "personal",
  "isPrimary": false,
  "kind": "agent",
  "pinned": false,
  "effort": "medium",
  "voice": "bf_emma",
  "voiceSpeed": 1.1,
  "voiceLanguage": "en",
  "generation": 1,
  "unread": 0,
  "lastPreview": null,
  "lastActivityAt": "<n>",
  "createdAt": "<n>"
}
```

The stream:

- bot: scout, last "", unread 0, conversation 1

## scout is told: Hi Scout

200, and the row it answers with: 1000 message: user: Hi Scout

The stream:

- rows: 1000 message: user: Hi Scout
- live: running, thinking
- rows: 1999 message: assistant, streaming: Hello! What shall we do?
- rows (replacing 1000 on): 1000 message: user: Hi Scout
- rows (replacing 1000 on): 1999 message: assistant: Hello! What shall we do?
- live: idle
- bot: scout, last "Hello! What shall we do?", unread 1, conversation 1
- tasks: scout

## POST /bots/scout/read

200

```json
{
  "ok": true
}
```

The stream:

- bot: scout, last "Hello! What shall we do?", unread 0, conversation 1

## GET /bots/scout/timeline (session.agent_color)

200

```json
"#1E86FC"
```

## PATCH /bots/scout {"avatarColor":"violet"} (bot.avatarColor)

200

```json
"violet"
```

The stream:

- bot: scout, last "Hello! What shall we do?", unread 0, conversation 1

## GET /bots/scout/timeline (agents.scout)

200

```json
{
  "name": "Scout",
  "color": "#8F59F9"
}
```

## scout is told on its call's socket: What day is it?

The stream:

- rows: 2000 message: user: What day is it?
- live: running, thinking
- rows: 2999 message: assistant, streaming: It's Thursday.
- rows (replacing 1000 on): 1000 message: user: Hi Scout
- rows (replacing 1000 on): 1999 message: assistant: Hello! What shall we do?
- rows (replacing 1000 on): 2000 message: user: What day is it?
- rows (replacing 1000 on): 2999 message: assistant: It's Thursday.
- live: idle
- bot: scout, last "It's Thursday.", unread 0, conversation 1
- tasks: scout

## Reload scout

- 1000 message: user: Hi Scout
- 1999 message: assistant: Hello! What shall we do?
- 2000 message: user: What day is it?
- 2999 message: assistant: It's Thursday.

The 4 rows the stream built are the rows a reload fetches.

## POST /bots/scout/fresh

200

```json
{
  "ok": true
}
```

The stream:

- live: idle
- cleared: scout, conversation 2
- bot: scout, last "", unread 0, conversation 2

## Reload scout


The 0 rows the stream built are the rows a reload fetches.

## scout is told: And again

200, and the row it answers with: 1000 message: user: And again

The stream:

- rows: 1000 message: user: And again
- live: running, thinking
- rows: 1999 message: assistant, streaming: Again it is.
- rows (replacing 1000 on): 1000 message: user: And again
- rows (replacing 1000 on): 1999 message: assistant: Again it is.
- live: idle
- bot: scout, last "Again it is.", unread 0, conversation 2
- tasks: scout

## scout's conversations, and the earlier one opened again

- "And again", 1 turn, on screen
- "Hi Scout", 2 turns

200

The stream:

- live: idle
- cleared: scout, conversation 3
- rows: 1000 message: user: Hi Scout
- rows: 1999 message: assistant: Hello! What shall we do?
- rows: 2000 message: user: What day is it?
- rows: 2999 message: assistant: It's Thursday.
- bot: scout, last "It's Thursday.", unread 0, conversation 3

## Reload scout

- 1000 message: user: Hi Scout
- 1999 message: assistant: Hello! What shall we do?
- 2000 message: user: What day is it?
- 2999 message: assistant: It's Thursday.

The 4 rows the stream built are the rows a reload fetches.

## GET /bots/scout/settings (skills.name)

200

```json
[
  "tasks",
  "web-research"
]
```

## GET /bots/scout/files (files.name)

200

```json
[
  "lantern-notes.md",
  "orca-deep-dive.md"
]
```

## GET /voice/options (voices.id)

200

```json
[
  "af_heart",
  "bf_emma"
]
```

## POST /voice/session {"botId":"scout"} (voice)

200

```json
"bf_emma"
```

## POST /bots/scout/primary

200

```json
{
  "ok": true
}
```

The stream:

- roster

## DELETE /bots/scout

409

```json
{
  "error": "Make another bot the main one first."
}
```

## DELETE /bots/maddy

200

```json
{
  "ok": true
}
```

The stream:

- roster

## GET /bots (bots.id)

200

```json
[
  "cooper",
  "scout"
]
```

## GET /rooms/x/members

501

```json
{
  "error": "Group chats aren't part of Talk yet."
}
```
