# the-model-drives-the-reader

## Input

[the-model-drives-the-reader.json](the-model-drives-the-reader.json)

## Output

# the-model-drives-the-reader

The model drives the reader with tools instead of retelling the text: it opens a file and reads a section by number, and the reading starts once its few words have been said. A question about the file is answered from the file's text, which is in its context.

## Over the websocket

```
> {"type":"config","agent":"cooper","session_id":"reader-chat"}
> {"type":"text","text":"Open the Lantern notes"}
tool: "🔧 Reader · open file=lantern"
says: Opening Lantern notes.
done (answered)
open_file: "lantern-notes"
article: lantern-notes at section 0, not reading
> {"type":"text","text":"Read section three"}
tool: "🔧 Reader · goto section=3"
says: Reading the safety section.
done (answered)
article: lantern-notes at section 3, reading
  reads [3.0] Safety.
  reads [3.1] Dangerous tools wait for a yes.
article: lantern-notes at section 3, not reading (finished)
> {"type":"text","text":"Read the pricing section"}
tool: "🔧 Reader · goto section=pricing"
says: There's no section on pricing.
done (answered)
```

Audio was sent for what was read.
