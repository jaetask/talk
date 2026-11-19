# a-chat-with-a-lookup-a-change-and-a-held-call

## Input

[a-chat-with-a-lookup-a-change-and-a-held-call.json](a-chat-with-a-lookup-a-change-and-a-held-call.json)

## Output

# a-chat-with-a-lookup-a-change-and-a-held-call

Three turns: a lookup, an ordinary change (in test mode) and a dangerous one that waits for a yes. Then everything a screen is given: the timeline, the messages with their stored cards, the export, a draft test.

## Timeline (what the Trajectory is given)

```json
[
  {
    "id": 20,
    "idx": 0,
    "at": "<when>",
    "source": "typed",
    "user_text": "What's on the board?",
    "reply": "Two tickets: Fix the reader is in progress and Tidy the sidebar is to do.",
    "model": "scripted",
    "harness": "pi-durable",
    "route_how": "pi-durable",
    "timings": "<timings>",
    "interrupted": false,
    "error": null,
    "tool_calls": [
      {
        "seq": 1,
        "name": "tasks__board-read",
        "kind": "read",
        "args": {},
        "outcome": "ok",
        "result": "{\"total\":2,\"tickets\":[{\"id\":\"TLK-1\",\"title\":\"Fix the reader\",\"status\":\"Doing\",\"owner\":\"Cooper\",\"where\":\"board\"},{\"id\":\"TLK-2\",\"title\":\"Tidy the sidebar\",\"status\":\"To do\",\"owner\":\"Cooper\",\"where\":\"board\"}]}",
        "start_s": "<n>",
        "duration_s": "<n>",
        "agent_id": "cooper",
        "card": {
          "v": 1,
          "name": "tasks__board-read",
          "app": "tasks",
          "app_label": "Tasks",
          "tool": "board-read",
          "kind": "read",
          "outcome": "ok",
          "args": {},
          "at": "<when>",
          "view": "tickets",
          "data": {
            "rows": [
              {
                "id": "TLK-1",
                "title": "Fix the reader",
                "status": "Doing",
                "owner": "Cooper",
                "where": "board"
              },
              {
                "id": "TLK-2",
                "title": "Tidy the sidebar",
                "status": "To do",
                "owner": "Cooper",
                "where": "board"
              }
            ],
            "total": 2
          }
        }
      }
    ],
    "agent_id": "cooper",
    "redacted": false,
    "redacted_at": null,
    "tokens_in": 0,
    "tokens_out": 24,
    "tokens_cached": 0,
    "cost": 0,
    "cost_basis": "local",
    "stop": "answered",
    "spans": "llm, llm"
  },
  {
    "id": 30,
    "idx": 1,
    "at": "<when>",
    "source": "typed",
    "user_text": "Comment on TLK-1 that you looked at it",
    "reply": "I've left a comment on Fix the reader.",
    "model": "scripted",
    "harness": "pi-durable",
    "route_how": "pi-durable",
    "timings": "<timings>",
    "interrupted": false,
    "error": null,
    "tool_calls": [
      {
        "seq": 1,
        "name": "tasks__ticket-comment-add",
        "kind": "write",
        "args": {
          "id": "TLK-1",
          "body": "Looked at it",
          "by": "a-cooper"
        },
        "outcome": "pretend",
        "result": "{\"ok\":true,\"pretend\":true,\"tool\":\"ticket-comment-add\",\"args\":{\"id\":\"TLK-1\",\"body\":\"Looked at it\",\"by\":\"a-cooper\",\"requestId\":\"cooper-<uuid>\"},\"note\":\"Test mode: the change was accepted but no ticket ID exists, so don't state one.\"}",
        "start_s": "<n>",
        "duration_s": "<n>",
        "agent_id": "cooper",
        "card": {
          "v": 1,
          "name": "tasks__ticket-comment-add",
          "app": "tasks",
          "app_label": "Tasks",
          "tool": "ticket-comment-add",
          "kind": "write",
          "outcome": "ok",
          "args": {
            "id": "TLK-1",
            "body": "Looked at it",
            "by": "a-cooper"
          },
          "at": "<when>",
          "view": "change",
          "data": {
            "target": "TLK-1",
            "changes": [
              {
                "field": "body",
                "to": "Looked at it"
              }
            ],
            "pretend": true
          }
        }
      }
    ],
    "agent_id": "cooper",
    "redacted": false,
    "redacted_at": null,
    "tokens_in": 0,
    "tokens_out": 26,
    "tokens_cached": 0,
    "cost": 0,
    "cost_basis": "local",
    "stop": "answered",
    "spans": "llm, llm"
  },
  {
    "id": 41,
    "idx": 2,
    "at": "<when>",
    "source": "typed",
    "user_text": "Archive the sidebar ticket",
    "reply": "Archive the Tidy the sidebar ticket in Tasks?",
    "model": "scripted",
    "harness": "pi-durable",
    "route_how": "pi-durable",
    "timings": "<timings>",
    "interrupted": false,
    "error": null,
    "tool_calls": [
      {
        "seq": 1,
        "name": "tasks__board-read",
        "kind": "read",
        "args": {},
        "outcome": "ok",
        "result": "{\"total\":2,\"tickets\":[{\"id\":\"TLK-1\",\"title\":\"Fix the reader\",\"status\":\"Doing\",\"owner\":\"Cooper\",\"where\":\"board\"},{\"id\":\"TLK-2\",\"title\":\"Tidy the sidebar\",\"status\":\"To do\",\"owner\":\"Cooper\",\"where\":\"board\"}]}",
        "start_s": "<n>",
        "duration_s": "<n>",
        "agent_id": "cooper",
        "card": {
          "v": 1,
          "name": "tasks__board-read",
          "app": "tasks",
          "app_label": "Tasks",
          "tool": "board-read",
          "kind": "read",
          "outcome": "ok",
          "args": {},
          "at": "<when>",
          "view": "tickets",
          "data": {
            "rows": [
              {
                "id": "TLK-1",
                "title": "Fix the reader",
                "status": "Doing",
                "owner": "Cooper",
                "where": "board"
              },
              {
                "id": "TLK-2",
                "title": "Tidy the sidebar",
                "status": "To do",
                "owner": "Cooper",
                "where": "board"
              }
            ],
            "total": 2
          }
        }
      }
    ],
    "agent_id": "cooper",
    "redacted": false,
    "redacted_at": null,
    "tokens_in": 0,
    "tokens_out": 14,
    "tokens_cached": 0,
    "cost": 0,
    "cost_basis": "local",
    "stop": "asked",
    "spans": "llm, llm"
  },
  {
    "id": 48,
    "idx": 3,
    "at": "<when>",
    "source": "typed",
    "user_text": "yes",
    "reply": "I've archived Tidy the sidebar.",
    "model": "scripted",
    "harness": "pi-durable",
    "route_how": "pi-durable",
    "timings": "<timings>",
    "interrupted": false,
    "error": null,
    "tool_calls": [
      {
        "seq": 1,
        "name": "tasks__ticket-archive",
        "kind": "danger",
        "args": {
          "id": "TLK-2",
          "by": "a-cooper"
        },
        "outcome": "pretend",
        "result": "{\"ok\":true,\"pretend\":true,\"tool\":\"ticket-archive\",\"args\":{\"id\":\"TLK-2\",\"by\":\"a-cooper\",\"requestId\":\"cooper-<uuid>\"},\"note\":\"Test mode: the change was accepted but no ticket ID exists, so don't state one.\"}",
        "start_s": "<n>",
        "duration_s": "<n>",
        "agent_id": "cooper",
        "card": {
          "v": 1,
          "name": "tasks__ticket-archive",
          "app": "tasks",
          "app_label": "Tasks",
          "tool": "ticket-archive",
          "kind": "danger",
          "outcome": "ok",
          "args": {
            "id": "TLK-2",
            "by": "a-cooper"
          },
          "at": "<when>",
          "view": "change",
          "data": {
            "target": "TLK-2",
            "changes": [],
            "pretend": true
          }
        }
      }
    ],
    "agent_id": "cooper",
    "redacted": false,
    "redacted_at": null,
    "tokens_in": 0,
    "tokens_out": 8,
    "tokens_cached": 0,
    "cost": 0,
    "cost_basis": "local",
    "stop": "answered",
    "spans": "llm"
  }
]
```

Chat total: 0 tokens in, 72 out over 4 turns.

## Messages (what the chat is given)

```json
[
  {
    "id": "t20-u",
    "role": "user",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "What's on the board?"
      }
    ]
  },
  {
    "id": "t20-c1",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "widget",
        "widget": {
          "id": "t20-c1",
          "kind": "talk.tool-card",
          "title": "Tasks · board-read",
          "data": {
            "v": 1,
            "name": "tasks__board-read",
            "app": "tasks",
            "app_label": "Tasks",
            "tool": "board-read",
            "kind": "read",
            "outcome": "ok",
            "args": {},
            "at": "<when>",
            "view": "tickets",
            "data": {
              "rows": [
                {
                  "id": "TLK-1",
                  "title": "Fix the reader",
                  "status": "Doing",
                  "owner": "Cooper",
                  "where": "board"
                },
                {
                  "id": "TLK-2",
                  "title": "Tidy the sidebar",
                  "status": "To do",
                  "owner": "Cooper",
                  "where": "board"
                }
              ],
              "total": 2
            }
          }
        }
      }
    ]
  },
  {
    "id": "t20-a",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "Two tickets: Fix the reader is in progress and Tidy the sidebar is to do."
      }
    ]
  },
  {
    "id": "t30-u",
    "role": "user",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "Comment on TLK-1 that you looked at it"
      }
    ]
  },
  {
    "id": "t30-c1",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "widget",
        "widget": {
          "id": "t30-c1",
          "kind": "talk.tool-card",
          "title": "Tasks · ticket-comment-add",
          "data": {
            "v": 1,
            "name": "tasks__ticket-comment-add",
            "app": "tasks",
            "app_label": "Tasks",
            "tool": "ticket-comment-add",
            "kind": "write",
            "outcome": "ok",
            "args": {
              "id": "TLK-1",
              "body": "Looked at it",
              "by": "a-cooper"
            },
            "at": "<when>",
            "view": "change",
            "data": {
              "target": "TLK-1",
              "changes": [
                {
                  "field": "body",
                  "to": "Looked at it"
                }
              ],
              "pretend": true
            }
          }
        }
      }
    ]
  },
  {
    "id": "t30-a",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "I've left a comment on Fix the reader."
      }
    ]
  },
  {
    "id": "t41-u",
    "role": "user",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "Archive the sidebar ticket"
      }
    ]
  },
  {
    "id": "t41-c1",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "widget",
        "widget": {
          "id": "t41-c1",
          "kind": "talk.tool-card",
          "title": "Tasks · board-read",
          "data": {
            "v": 1,
            "name": "tasks__board-read",
            "app": "tasks",
            "app_label": "Tasks",
            "tool": "board-read",
            "kind": "read",
            "outcome": "ok",
            "args": {},
            "at": "<when>",
            "view": "tickets",
            "data": {
              "rows": [
                {
                  "id": "TLK-1",
                  "title": "Fix the reader",
                  "status": "Doing",
                  "owner": "Cooper",
                  "where": "board"
                },
                {
                  "id": "TLK-2",
                  "title": "Tidy the sidebar",
                  "status": "To do",
                  "owner": "Cooper",
                  "where": "board"
                }
              ],
              "total": 2
            }
          }
        }
      }
    ]
  },
  {
    "id": "t41-a",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "Archive the Tidy the sidebar ticket in Tasks?"
      }
    ]
  },
  {
    "id": "t48-u",
    "role": "user",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "yes"
      }
    ]
  },
  {
    "id": "t48-c1",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "widget",
        "widget": {
          "id": "t48-c1",
          "kind": "talk.tool-card",
          "title": "Tasks · ticket-archive",
          "data": {
            "v": 1,
            "name": "tasks__ticket-archive",
            "app": "tasks",
            "app_label": "Tasks",
            "tool": "ticket-archive",
            "kind": "danger",
            "outcome": "ok",
            "args": {
              "id": "TLK-2",
              "by": "a-cooper"
            },
            "at": "<when>",
            "view": "change",
            "data": {
              "target": "TLK-2",
              "changes": [],
              "pretend": true
            }
          }
        }
      }
    ]
  },
  {
    "id": "t48-a",
    "role": "assistant",
    "createdAt": "<when>",
    "status": "complete",
    "parts": [
      {
        "type": "text",
        "text": "I've archived Tidy the sidebar."
      }
    ]
  }
]
```

## Export

5 lines: the session, then one per turn. First line: `{ "session": { "id": "chat", "agent_id": "cooper", "brain": "scripted", "personality": "3-cooper", "voice": "af_heart", "usage": { "tokens_in": 0, "tokens_out": 72, "tokens_cached": 0, "cost": 0, "turns_counted": 4, "turns_unpriced": 0 }, "agent_name": "Cooper", "agent_color": "#d97757", "system_note": "You are Cooper, Jae's chief of staff. Speak in one or two short sentences.\n\nAbout Jae: his messages come through speech recognition, which can't hear spelling. His name is spelled Jae (J-A-E), never Jay. When a transcript says Jay, he means his own name, so always write Jae: in replies, titles, tickets, comments and anything you save.\n\n(Plus the conduct and write rules, the app list and each app's skill, added by the engine as prompt sections.)" } }`

## Make test (a draft Dojo case from the last turn)

```json
{
  "name": "golden.yes",
  "case": {
    "brain": "smart",
    "config": {
      "agent": "cooper",
      "writes": true,
      "fixtures": {
        "tasks__board-read": {
          "total": 2,
          "tickets": [
            {
              "id": "TLK-1",
              "title": "Fix the reader",
              "status": "Doing",
              "owner": "Cooper",
              "where": "board"
            },
            {
              "id": "TLK-2",
              "title": "Tidy the sidebar",
              "status": "To do",
              "owner": "Cooper",
              "where": "board"
            }
          ]
        }
      }
    },
    "turns": [
      {
        "say": "What's on the board?"
      },
      {
        "say": "Comment on TLK-1 that you looked at it"
      },
      {
        "say": "Archive the sidebar ticket"
      },
      {
        "say": "yes",
        "checks": {
          "wrote": "ticket-archive",
          "no_uuid": true,
          "no_claim_without_tool": true
        }
      }
    ],
    "runs": 3
  }
}
```

## The chat in the list

```json
[
  {
    "id": "chat",
    "agent_id": "cooper",
    "first": "What's on the board?",
    "title": null,
    "last_at": "<when>",
    "started_at": "<when>",
    "turns": 4,
    "pinned_at": null,
    "test": 1
  }
]
```
