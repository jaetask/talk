# apps.a-change-that-breaks-mid-call-is-outcome-unknown

## Input

[apps.a-change-that-breaks-mid-call-is-outcome-unknown.json](apps.a-change-that-breaks-mid-call-is-outcome-unknown.json)

## Output

# apps.a-change-that-breaks-mid-call-is-outcome-unknown

A change that breaks mid-call (the app falls over) is never reported as done, and never sent twice: the model is told the outcome is unknown.

## chat: "Comment on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=BREAK
- result: tasks__ticket-comment-add unknown {"outcome":"unknown","instruction":"The change may or may not have happened (the app didn't confirm). Don't say it worked. Check with a read tool if you can, otherwise tell Jae it's unconfirmed."}
- reply (answered): I couldn't confirm the comment was added.

## What reached Tasks

```json
[
  {
    "tool": "ticket-comment-add",
    "args": {
      "id": "TLK-1",
      "body": "BREAK",
      "by": "heart",
      "requestId": "heart-<uuid>"
    }
  }
]
```
