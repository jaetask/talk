# the-api-the-page-calls

## Input

[the-api-the-page-calls.json](the-api-the-page-calls.json)

## Output

# the-api-the-page-calls

The endpoints the page calls, answered from the engine and the durable store, in Python Talk's shapes.

## GET /api/agents (id)

200

```json
[
  "cooper",
  "maddy"
]
```

## GET /api/brain (harnesses)

200

```json
[
  {
    "id": "pi-durable",
    "name": "Pi Durable",
    "note": "Talk's engine on pi + Pi Durable: durable chats, apps over MCP, the ask-before-delete gate.",
    "available": true
  }
]
```

## Over the websocket

```
> {"type":"config","agent":"cooper","session_id":"chat-1"}
> {"type":"text","text":"What's on the board?"}
tool: "🔧 Tasks · board-read"
card: ""
says: Two tickets.
done (answered)
```

No audio was sent.

## GET /api/agents/cooper/sessions

200

```json
[
  {
    "id": "chat-1",
    "first": "What's on the board?",
    "last_at": "<when>",
    "turns": 1
  }
]
```

## GET /api/sessions/chat-1/timeline (turns.reply)

200

```json
[
  "Two tickets."
]
```

## GET /api/sessions/chat-1/timeline (session.agent_name)

200

```json
"Cooper"
```

## POST /api/sessions/chat-1/rename {"title":"The board"}

200

```json
{
  "ok": true
}
```

## POST /api/sessions/chat-1/pin {"pinned":true}

200

```json
{
  "ok": true
}
```

## GET /api/pinned

200

```json
[
  {
    "id": "chat-1",
    "agent_id": "cooper",
    "pinned_at": "<when>",
    "title": "The board",
    "first": "What's on the board?"
  }
]
```

## GET /api/sessions/chat-1/log.jsonl

200

```json
"application/x-ndjson: 2 lines"
```

## GET /api/tools/tasks__ticket-archive/schema (kind)

200

```json
"danger"
```

## GET /api/articles (title)

200

```json
[
  "Lantern notes",
  "Orca: deep dive"
]
```

## POST /api/sessions/chat-1/clear

200

```json
{
  "ok": true
}
```

## GET /api/sessions/chat-1/timeline (turns.redacted)

200

```json
[
  true
]
```

## GET /api/sessions/nope/timeline

404

```json
{
  "error": "no such session"
}
```

## GET /api/arena

501

```json
{
  "error": "The Model Arena stays on Python Talk (port 3910): it scores any Talk from outside."
}
```
