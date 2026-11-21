# Glossary

The words Talk uses. Code, tests, docs and conversation use these words and no synonyms.

## Language

**Bot**: A role, a voice and the apps it may use. You talk to it in its chat. In the code a bot is an agent.
_Avoid_: assistant, persona, character

**Main bot**: The bot shown first in the sidebar, with a star. It cannot be deleted while it is the main one.
_Avoid_: primary, default bot

**Chat**: A bot's conversation on screen. Starting a new conversation keeps the old one under Earlier conversations.
_Avoid_: thread, session, room

**Turn**: What you said, and everything the bot did about it until it answered.
_Avoid_: request, exchange, message

**Step**: One thing a bot did in an app during a turn: a lookup or a change.
_Avoid_: tool call, action, operation

**Lookup**: A step that only reads. It runs at once.
_Avoid_: query, read, fetch

**Change**: A step that writes. The app records which bot made it.
_Avoid_: write, mutation, action

**Dangerous change**: A change that deletes, archives, sends or pays. It waits for your yes.
_Avoid_: destructive action, risky call

**Card**: What a step showed in the chat: a list, a table, sources, what a change did, or a dangerous change waiting for your yes.
_Avoid_: widget, panel, result

**App**: A program your bots can use, reached over MCP and listed in the apps file.
_Avoid_: integration, service, tool, plugin

**Skill**: A how-to a bot reads when a job calls for it. One file per app in the skills folder.
_Avoid_: prompt, instructions file

**Voice call**: Talking to a bot out loud. It answers one sentence at a time and stops when you talk over it.
_Avoid_: voice mode, conversation mode

**Dictation**: Speaking into the message box. The words are typed for you to send.
_Avoid_: speech input, transcription

**Trajectory**: A chat as a timeline and a list of steps, with timings.
_Avoid_: trace, log, history

**Task**: A long job a bot is doing, or a dangerous change waiting for your yes. All of them are listed under Tasks.
_Avoid_: job, todo, ticket

**Test mode**: Changes are accepted and logged, never made.
_Avoid_: dry run, sandbox
