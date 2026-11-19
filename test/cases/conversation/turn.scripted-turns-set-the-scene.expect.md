# turn.scripted-turns-set-the-scene

## Input

[turn.scripted-turns-set-the-scene.json](turn.scripted-turns-set-the-scene.json)

## Output

# turn.scripted-turns-set-the-scene

Turns can be written into a chat as given, with no model call, so a test's context is the same on every run. The model then sees them as what was said before.

## Written into the chat, no model call: 1 turn

- "Which ticket is in progress?" answered "Fix the reader is in progress."

## chat: "Which one was that again?"

- reply (answered): It was Fix the reader.
- what the model had in front of it:
  - user: Which ticket is in progress?
  - assistant: Fix the reader is in progress.
  - user: Which one was that again?
  - assistant: It was Fix the reader.

## What reached Tasks

Nothing.
