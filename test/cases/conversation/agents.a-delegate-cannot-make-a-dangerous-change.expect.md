# agents.a-delegate-cannot-make-a-dangerous-change

## Input

[agents.a-delegate-cannot-make-a-dangerous-change.json](agents.a-delegate-cannot-make-a-dangerous-change.json)

## Output

# agents.a-delegate-cannot-make-a-dangerous-change

A delegate cannot ask Jae for a yes, so a dangerous change comes back refused instead of being made.

## chat: "Get Maddy to archive the sidebar ticket"

- tool: agent ask agent=maddy task=Archive the Tidy the sidebar ticket.
- result: agent_ask ok
- reply (answered): Maddy couldn't archive it, because that needs your yes. Shall I do it?

## What reached Tasks

```json
[
  {
    "tool": "board-read",
    "args": {}
  }
]
```
