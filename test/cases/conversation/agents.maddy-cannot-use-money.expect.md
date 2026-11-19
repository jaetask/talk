# agents.maddy-cannot-use-money

## Input

[agents.maddy-cannot-use-money.json](agents.maddy-cannot-use-money.json)

## Output

# agents.maddy-cannot-use-money

Maddy has Marketing and Tasks only. Money's tools are not hers, and naming one gets a plain refusal.

## chat: "What bills do we have?"

- tool: Money · list-items
- result: money__list-items error {"error":"Money isn't something Maddy can use. Say so plainly and suggest asking Cooper."}
- reply (answered): Money isn't something I can see. Cooper can.

## chat: "And the board?"

- tool: Tasks · board-read
- result: tasks__board-read ok
- reply (answered): Two tickets.

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

Nothing.
