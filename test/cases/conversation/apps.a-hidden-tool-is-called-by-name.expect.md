# apps.a-hidden-tool-is-called-by-name

## Input

[apps.a-hidden-tool-is-called-by-name.json](apps.a-hidden-tool-is-called-by-name.json)

## Output

# apps.a-hidden-tool-is-called-by-name

A tool that isn't on the short list can still be called by name in one step: the skill's topic list tells the model it exists.

## chat: "Add a step to TLK-1: test it"

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
