# a-chat-remembers-after-a-restart

## Input

[a-chat-remembers-after-a-restart.json](a-chat-remembers-after-a-restart.json)

## Output

# a-chat-remembers-after-a-restart

The transcript is in SQLite, so a restart keeps the chat: the second service answers in the same conversation.

## The service starts

### "What's the status of TLK-1?"

- tool: Tasks · ticket-read id=TLK-1
- result: tasks__ticket-read ok
- reply (answered): It's being worked on.

## The service starts

### "Which one was that again?"

- reply (answered): Still the reader fix.

## What reached Tasks

```json
[
  {
    "tool": "ticket-read",
    "args": {
      "id": "TLK-1"
    }
  }
]
```
