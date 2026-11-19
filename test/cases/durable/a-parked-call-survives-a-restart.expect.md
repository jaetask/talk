# a-parked-call-survives-a-restart

## Input

[a-parked-call-survives-a-restart.json](a-parked-call-survives-a-restart.json)

## Output

# a-parked-call-survives-a-restart

A dangerous call is parked, the service stops, and it starts again on the same file. The question is still open, and a yes runs the call once.

## The service starts

### "Archive the sidebar ticket"

- tool: Tasks · board-read
- result: tasks__board-read ok
- tool: tool search archive ticket
- result: tool_search ok
- tool: Tasks · ticket-archive id=TLK-2  (waiting for your yes)
- ask: Archive the Tidy the sidebar ticket in Tasks?
- reply (asked): Archive the Tidy the sidebar ticket in Tasks?

## The service starts

### "yes"

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
