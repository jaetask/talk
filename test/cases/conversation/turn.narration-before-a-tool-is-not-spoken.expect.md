# turn.narration-before-a-tool-is-not-spoken

## Input

[turn.narration-before-a-tool-is-not-spoken.json](turn.narration-before-a-tool-is-not-spoken.json)

## Output

# turn.narration-before-a-tool-is-not-spoken

What the model says on the way to a tool call is narration, so it is left out of the reply.

## chat: "What's on the board?"

- tool: Tasks · board-read
- result: tasks__board-read ok
- reply (answered): Two tickets: one in progress and one to do.

## What reached Tasks

```json
[
  {
    "tool": "board-read",
    "args": {}
  }
]
```
