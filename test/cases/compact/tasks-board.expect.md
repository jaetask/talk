# tasks-board

## Input

[tasks-board.json](tasks-board.json)

## Output

# tasks-board

What the model sees of tasks's board-read (301 characters):

```json
{
  "total": 2,
  "by_project": {
    "Money": 1,
    "Talk": 1
  },
  "tickets": [
    {
      "id": "TLK-1",
      "title": "Fix the reader",
      "status": "Doing",
      "priority": "high",
      "owner": "Cooper",
      "feature": "Voice",
      "where": "board",
      "project": "Talk"
    },
    {
      "id": "MNY-7",
      "title": "Bills view",
      "status": "To do",
      "where": "board",
      "tags": [
        "ui"
      ],
      "project": "Money"
    }
  ]
}
```

The names for the prompt:

```
How Tasks' project names are spelled, for tool arguments (speech recognition mishears names: use the closest one and say which you mean): Talk (TLK-…), Money (MNY-…). Ticket owners: Cooper. This is not the list of what Jae has: for which projects exist or what one is about, call catalog-read.
```
