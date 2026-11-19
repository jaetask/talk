# turn.lookup-then-answer

## Input

[turn.lookup-then-answer.json](turn.lookup-then-answer.json)

## Output

# turn.lookup-then-answer

A question that needs a lookup: the model calls the tool, then answers from the result.

## chat: "What's the status of TLK-1?"

- tool: Tasks · ticket-read id=TLK-1
- result: tasks__ticket-read ok
- reply (answered): It's being worked on.

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
