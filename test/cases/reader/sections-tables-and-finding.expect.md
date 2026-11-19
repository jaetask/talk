# sections-tables-and-finding

## Input

[sections-tables-and-finding.json](sections-tables-and-finding.json)

## Output

# sections-tables-and-finding

## Sections

| order | level | title | under | id |
| --- | --- | --- | --- | --- |
| 0 | 1 | Introduction |  | 00-introduction |
| 1 | 1 | Agent review |  | 01-agent-review |
| 2 | 2 | 1. What it is | Agent review | 02-1-what-it-is |
| 3 | 3 | Overview | 1. What it is | 03-overview |
| 4 | 2 | 2. Tools | Agent review | 04-2-tools |
| 5 | 3 | Overview | 2. Tools | 05-overview |
| 6 | 2 | 3. Sandboxing and safety | Agent review | 06-3-sandboxing-and-safety |

## What is read aloud

- [0] Introduction.
- [0] Intro before any heading.
- [1] Agent review.
- [1] A bold claim with a link and code.
- [2] 1. What it is.
- [2] It is an agent.
- [3] Overview.
- [3] Small.
- [4] 2. Tools.
- [4] read file. Needs a yes: No. What it does: Reads a file.  (highlights: read_file No Reads a file.)
- [4] delete file. Needs a yes: Yes. What it does: Deletes a file.  (highlights: delete_file Yes Deletes a file.)
- [5] Overview.
- [5] Many.
- [6] 3. Sandboxing and safety.
- [6] Tools run in a sandbox.

## Finding a section

| asked for | found |
| --- | --- |
| 2 | 2. Tools |
| six | nothing |
| section three | 3. Sandboxing and safety |
| the third section | 3. Sandboxing and safety |
| tools | 2. Tools |
| overview | ambiguous: Overview / Overview |
| safety | 3. Sandboxing and safety |
| what it is | 1. What it is |
| sandbox | 3. Sandboxing and safety |
| pricing | nothing |

## Finding a file

| asked for | found |
| --- | --- |
| the orca deep dive | orca-deep-dive |
| orca | ambiguous: lessons-for-talk-from-orca / orca-deep-dive |
| the lessons one | nothing |
| openbot | openbot-deep-dive |
| lantern | lantern-notes |
| hermes | nothing |
