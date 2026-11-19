# gate.dangerous-call-waits-for-yes

## Input

[gate.dangerous-call-waits-for-yes.json](gate.dangerous-call-waits-for-yes.json)

## Output

# gate.dangerous-call-waits-for-yes

Archiving is dangerous. The call is parked, the server asks its own question, and it runs only on an explicit yes, signed with the agent's actor.

## chat: "Archive the sidebar ticket"

- tool: Tasks · board-read
- result: tasks__board-read ok
- tool: tool search archive ticket
- result: tool_search ok
- tool: Tasks · ticket-archive id=TLK-2  (waiting for your yes)
- ask: Archive the Tidy the sidebar ticket in Tasks?
- reply (asked): Archive the Tidy the sidebar ticket in Tasks?

## chat: "Yes, go ahead"

- tool: Tasks · ticket-archive id=TLK-2  ✓ confirmed
- result: tasks__ticket-archive ok
- reply (answered): Archived.

## What reached Tasks

```json
[
  {
    "tool": "board-read",
    "args": {}
  },
  {
    "tool": "ticket-archive",
    "args": {
      "id": "TLK-2",
      "by": "heart",
      "requestId": "heart-<uuid>"
    }
  }
]
```
