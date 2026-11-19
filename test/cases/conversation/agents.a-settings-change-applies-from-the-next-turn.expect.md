# agents.a-settings-change-applies-from-the-next-turn

## Input

[agents.a-settings-change-applies-from-the-next-turn.json](agents.a-settings-change-applies-from-the-next-turn.json)

## Output

# agents.a-settings-change-applies-from-the-next-turn

An agent's settings live in the store. Changing Maddy's apps changes what she can use from her next turn, in the same chat.

## chat: "What bills do we have?"

- tool: Money · list-items
- result: money__list-items error {"error":"Money isn't something Maddy can use. Say so plainly and suggest asking Cooper."}
- reply (answered): I can't see Money.

## Settings: Maddy is changed

```json
{
  "id": "maddy",
  "name": "Maddy",
  "about": "the marketer: plans, drafts and replies in Marketing, and the tickets behind them",
  "persona": "4-maddy",
  "instructions": "You also keep an eye on the bills.",
  "voice": "af_bella",
  "apps": [
    "marketing",
    "tasks",
    "money"
  ],
  "model": ""
}
```

## chat: "What bills do we have?"

- tool: Money · list-items
- result: money__list-items ok
- reply (answered): Two bills: Tesco Mobile and the gym.

## What reached Tasks

Nothing.

## What reached Money

```json
[
  {
    "tool": "list-items",
    "args": {}
  }
]
```
