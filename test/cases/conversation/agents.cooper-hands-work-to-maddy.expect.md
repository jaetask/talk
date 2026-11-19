# agents.cooper-hands-work-to-maddy

## Input

[agents.cooper-hands-work-to-maddy.json](agents.cooper-hands-work-to-maddy.json)

## Output

# agents.cooper-hands-work-to-maddy

Delegation: Cooper hands a task to Maddy, who runs as a subagent with her own apps and signs her own change. Cooper gets her answer back.

## chat: "Ask Maddy to note on TLK-1 that the launch post is drafted"

- tool: agent ask agent=maddy task=Comment on TLK-1 that the launch post is drafted.
- result: agent_ask ok
- reply (answered): Maddy has left the comment on Fix the reader.

## What reached Tasks

```json
[
  {
    "tool": "ticket-comment-add",
    "args": {
      "id": "TLK-1",
      "body": "The launch post is drafted.",
      "by": "a-maddy",
      "requestId": "maddy-<uuid>"
    }
  }
]
```

## What reached Money

Nothing.
