# frontmatter

## Input

[frontmatter.json](frontmatter.json)

## Output

# frontmatter

```json
{
  "description": "Jae's tickets.",
  "tools": [
    "ticket_read",
    "ticket_comment_add"
  ],
  "topics": [
    {
      "words": [
        "step",
        "checklist"
      ],
      "tools": [
        "ticket_step_add",
        "ticket_step_check"
      ]
    },
    {
      "words": [
        "archive"
      ],
      "tools": [
        "ticket_archive"
      ]
    }
  ],
  "builders": false
}
```

## Body with changes switched off

```
Read a ticket with ticket-read before you talk about it.

## Finding tickets
- Say the title, not the id.
```
