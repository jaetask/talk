# apps.a-misspelled-tool-name-is-corrected

## Input

[apps.a-misspelled-tool-name-is-corrected.json](apps.a-misspelled-tool-name-is-corrected.json)

## Output

# apps.a-misspelled-tool-name-is-corrected

A tool name spelled with underscores in place of hyphens is not a dead end: the error gives the exact name.

## chat: "Add a step to TLK-1: test it"

- tool: Tasks · ticket-step-add id=TLK-1 title=Test it  (not done, waiting)
- result: tasks__ticket_step_add error {"error":"The tool is named tasks__ticket-step-add. Call it again by that exact name with the same arguments."}
- tool: Tasks · ticket-step-add id=TLK-1 title=Test it
- result: tasks__ticket-step-add ok
- reply (answered): Added the step.

## What reached Tasks

```json
[
  {
    "tool": "ticket-step-add",
    "args": {
      "id": "TLK-1",
      "title": "Test it",
      "by": "heart"
    }
  }
]
```
