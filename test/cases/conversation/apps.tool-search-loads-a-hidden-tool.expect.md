# apps.tool-search-loads-a-hidden-tool

## Input

[apps.tool-search-loads-a-hidden-tool.json](apps.tool-search-loads-a-hidden-tool.json)

## Output

# apps.tool-search-loads-a-hidden-tool

A tool the skill doesn't list is found with tool search, then called like any other.

## chat: "Add a step to TLK-1: test it"

- tool: tool search checklist step
- result: tool_search ok
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
