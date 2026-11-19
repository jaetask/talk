# research.nothing-read-means-nothing-reported

## Input

[research.nothing-read-means-nothing-reported.json](research.nothing-read-means-nothing-reported.json)

## Output

# research.nothing-read-means-nothing-reported

A researcher that answers without reading a page reports nothing: the tool returns an error the model must say plainly.

## "Research nothing at all"

- tool: Web · research topic=nothing at all
- result: web_research error {"error":"The researcher couldn't read any page on that. Say so plainly; don't answer from memory."}
- reply (answered): I couldn't find anything on that.

## What the research tool gave the model

```json
{
  "error": "The researcher couldn't read any page on that. Say so plainly; don't answer from memory."
}
```
