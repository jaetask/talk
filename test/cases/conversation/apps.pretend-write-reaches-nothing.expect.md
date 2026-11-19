# apps.pretend-write-reaches-nothing

## Input

[apps.pretend-write-reaches-nothing.json](apps.pretend-write-reaches-nothing.json)

## Output

# apps.pretend-write-reaches-nothing

Test mode: a change is accepted and logged, and nothing reaches the app.

## chat: "Comment done on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=Done
- result: tasks__ticket-comment-add pretend
- reply (answered): I've added the comment.

## What reached Tasks

Nothing.

## Pretend writes

```json
[
  {
    "app": "tasks",
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
