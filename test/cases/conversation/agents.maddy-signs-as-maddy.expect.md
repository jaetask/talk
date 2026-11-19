# agents.maddy-signs-as-maddy

## Input

[agents.maddy-signs-as-maddy.json](agents.maddy-signs-as-maddy.json)

## Output

# agents.maddy-signs-as-maddy

Each agent's writes carry its own actor, and each agent has its own chat.

## maddy-chat: "Comment on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=From Maddy
- result: tasks__ticket-comment-add ok
- reply (answered): Done.

## cooper-chat: "Comment on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=From Cooper
- result: tasks__ticket-comment-add ok
- reply (answered): Done.

## What reached Tasks

```json
[
  {
    "tool": "ticket-comment-add",
    "args": {
      "id": "TLK-1",
      "body": "From Maddy",
      "by": "a-maddy",
      "requestId": "maddy-<uuid>"
    }
  },
  {
    "tool": "ticket-comment-add",
    "args": {
      "id": "TLK-1",
      "body": "From Cooper",
      "by": "a-cooper",
      "requestId": "cooper-<uuid>"
    }
  }
]
```
