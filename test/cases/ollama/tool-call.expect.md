# tool-call

## Input

[tool-call.json](tool-call.json)

## Output

# tool-call

## Request sent to /api/chat

```json
{
  "model": "test-model",
  "messages": [
    {
      "role": "system",
      "content": "You are Cooper."
    },
    {
      "role": "user",
      "content": "Status of TLK-1?"
    }
  ],
  "stream": true,
  "think": false,
  "keep_alive": "3h",
  "options": {
    "num_ctx": 24576,
    "temperature": 0,
    "num_predict": 1024,
    "seed": 42
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "tasks__ticket-read",
        "description": "Read one ticket",
        "parameters": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            }
          }
        }
      }
    }
  ]
}
```

## Events

- start
- toolcall_start
- toolcall_end tasks__ticket-read {"id":"TLK-1"}
- done

## Final message

```json
{
  "stopReason": "toolUse",
  "content": [
    {
      "type": "toolCall",
      "id": "<id>",
      "name": "tasks__ticket-read",
      "arguments": {
        "id": "TLK-1"
      }
    }
  ],
  "usage": {
    "input": 40,
    "output": 9
  }
}
```
