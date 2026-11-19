# gate.changes-are-off-by-default

## Input

[gate.changes-are-off-by-default.json](gate.changes-are-off-by-default.json)

## Output

# gate.changes-are-off-by-default

With the write switch off, write tools are not offered, and a model that names one anyway is told changes are off.

## chat: "Comment done on TLK-1"

- tool: Tasks · ticket-comment-add id=TLK-1 body=Done  (not done, waiting)
- result: tasks__ticket-comment-add error {"error":"Changes are switched off; you can only look things up."}
- reply (answered): I can only look things up right now.

## What reached Tasks

Nothing.
