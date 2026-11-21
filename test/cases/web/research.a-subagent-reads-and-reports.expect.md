# research.a-subagent-reads-and-reports

## Input

[research.a-subagent-reads-and-reports.json](research.a-subagent-reads-and-reports.json)

## Output

# research.a-subagent-reads-and-reports

Research is delegated to a subagent with only the web tools. Its report is checked against the pages it read: a citation to a page that doesn't exist and a quote that isn't on any page are dropped.

## "Look into Lantern Agent's pricing"

- tool: Web · research topic=Lantern Agent's pricing
- result: web_research ok
- reply (answered): Lantern has a Solo plan at twelve dollars and a Team plan at forty a seat.

## What the research tool gave the model

```json
{
  "say": "Lantern Agent has two plans. The Team plan costs forty dollars a seat each month. Reviewers found it good value. Sources: 127.0.0.1.",
  "key_points": [
    "The Solo plan costs twelve dollars a month [1]",
    "Audit logs were slow to load [2]"
  ],
  "sources": [
    "[1] Lantern Agent pricing (127.0.0.1)",
    "[2] Lantern Agent, reviewed (127.0.0.1)"
  ],
  "instruction": "Tell Jae what was found in a few spoken sentences, naming the sites. Don't add anything the research didn't find."
}
```
