# agents.cooper-uses-every-app

## Input

[agents.cooper-uses-every-app.json](agents.cooper-uses-every-app.json)

## Output

# agents.cooper-uses-every-app

Cooper may use every connected app.

## chat: "What's on the board, and what bills do we have?"

- tool: Tasks · board-read
- tool: Money · list-items
- result: tasks__board-read ok
- result: money__list-items ok
- reply (answered): Two tickets and two bills.

## What reached Tasks

```json
[
  {
    "tool": "board-read",
    "args": {}
  }
]
```

## What reached Money

```json
[
  {
    "tool": "list-items",
    "args": {}
  }
]
```
