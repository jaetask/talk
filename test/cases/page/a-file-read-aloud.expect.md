# a-file-read-aloud

## Input

[a-file-read-aloud.json](a-file-read-aloud.json)

## Output

# a-file-read-aloud

The reader over the websocket, as the page drives it: open a file, play, and each sentence is announced as it is heard (a table row is one sentence). The position moves with the reading.

## Over the websocket

```
> {"type":"config","agent":"cooper","session_id":"file-chat"}
> {"type":"article_open","slug":"orca-deep-dive"}
article: orca-deep-dive at section 0, not reading
> {"type":"article_play"}
article: orca-deep-dive at section 0, reading
  reads [0.0] Orca: deep dive.
  reads [0.1] Orca is another agent.
article: orca-deep-dive at section 1, reading
  reads [1.0] Overview.
  reads [1.1] It is larger.
article: orca-deep-dive at section 1, not reading (finished)
> {"type":"article_open","slug":"lantern-notes"}
article: lantern-notes at section 0, not reading
> {"type":"article_goto","index":2}
article: lantern-notes at section 2, reading
  reads [2.0] Tools.
  reads [2.1] read_file No Reads a file.
  reads [2.2] delete_file Yes Deletes a file.
article: lantern-notes at section 3, reading
  reads [3.0] Safety.
  reads [3.1] Dangerous tools wait for a yes.
article: lantern-notes at section 3, not reading (finished)
```

Audio was sent for what was read.

## GET /api/articles (position)

200

```json
[
  3,
  1
]
```
