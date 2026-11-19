# typed-turn-with-a-pretend-write

## Input

[typed-turn-with-a-pretend-write.json](typed-turn-with-a-pretend-write.json)

## Output

# typed-turn-with-a-pretend-write

What Python Talk's Pi Durable harness and the Dojo's cases send, and what comes back: tokens, tool lines, one call record per tool, done, and the pretend-write log.

## sent {"type":"config","agent":"cooper","writes":true,"pretend_writes":true,"new_session":true}

## sent {"type":"text","text":"Comment on TLK-1 that you looked at it"}

- agent: {"type":"agent","agent":{"id":"cooper","name":"Cooper","about":"the lead: every app, and the one to ask when unsure","persona":"3-cooper","instructions":"","voice":"af_heart","apps":[],"model":""},"session_id":"cooper-<uuid>"}
- tool: "🔧 Tasks · ticket-read id=TLK-1"
- call: tasks__ticket-read (read) ok {"id":"TLK-1"}
- card: tasks__ticket-read drawn as tickets
- tool: "🔧 Tasks · ticket-comment-add id=TLK-1 body=Looked at it"
- call: tasks__ticket-comment-add (write) pretend {"id":"TLK-1","body":"Looked at it","by":"a-cooper"}
- card: tasks__ticket-comment-add drawn as change
- token: "I've left a comment on Fix the reader."
- done: stop answered, harness pi-durable, model scripted, call_end false, timings first_token+total, usage cost+input+output

## sent {"type":"pretend_log"}

- pretend_log: [{"app":"tasks","tool":"ticket-comment-add","args":{"id":"TLK-1","body":"Looked at it","by":"a-cooper","requestId":"cooper-<uuid>"}}]
