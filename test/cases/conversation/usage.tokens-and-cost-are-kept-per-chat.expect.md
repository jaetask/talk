# usage.tokens-and-cost-are-kept-per-chat

## Input

[usage.tokens-and-cost-are-kept-per-chat.json](usage.tokens-and-cost-are-kept-per-chat.json)

## Output

# usage.tokens-and-cost-are-kept-per-chat

Every model call's tokens and cost are stored with the chat.

## chat: "What's the status of TLK-1?"

- tool: Tasks · ticket-read id=TLK-1
- result: tasks__ticket-read ok
- reply (answered): It's being worked on.
- usage: model calls so far 2, cost 0

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
