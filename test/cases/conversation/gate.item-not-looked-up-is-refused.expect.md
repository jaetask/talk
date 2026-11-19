# gate.item-not-looked-up-is-refused

## Input

[gate.item-not-looked-up-is-refused.json](gate.item-not-looked-up-is-refused.json)

## Output

# gate.item-not-looked-up-is-refused

A dangerous call must point at an item a lookup returned. Without one it is refused, with a result the model can act on.

## chat: "Archive TLK-9"

- tool: tool search archive ticket
- result: tool_search ok
- tool: Tasks · ticket-archive id=TLK-9  (not done, waiting)
- result: tasks__ticket-archive error <harness> [error] Tool call blocked: Not done. Look it up first: call a list or get tool that returns the item, then call ticket-archive again with its exact id or name. You haven't looked it up yet. After the lookup, call the tool again straight away; don't a
- reply (failed): I can't find that ticket.

## What reached Tasks

Nothing.
