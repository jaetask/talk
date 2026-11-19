# apps.ordinary-write-runs-and-is-signed

## Input

[apps.ordinary-write-runs-and-is-signed.json](apps.ordinary-write-runs-and-is-signed.json)

## Output

# apps.ordinary-write-runs-and-is-signed

An ordinary change runs without a question. Talk adds the author (the agent's own actor in Tasks) and a retry key; the model never sets them.

## chat: "Comment done on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=Done
- result: tasks__ticket-comment-add ok
- reply (answered): I've added the comment.

## What reached Tasks

```json
[
  {
    "tool": "ticket-comment-add",
    "args": {
      "id": "TLK-1",
      "body": "Done",
      "by": "heart",
      "requestId": "heart-<uuid>"
    }
  }
]
```
