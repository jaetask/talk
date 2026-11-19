# only-the-short-list-and-found-tools-are-shown

## Input

[only-the-short-list-and-found-tools-are-shown.json](only-the-short-list-and-found-tools-are-shown.json)

## Output

# only-the-short-list-and-found-tools-are-shown

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
      "content": "Archive TLK-2 and add a step"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "function": {
            "name": "tool_search",
            "arguments": {
              "query": "archive"
            }
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "{\"found\":[{\"name\":\"tasks__ticket-archive\",\"description\":\"Archive a ticket\"}]}",
      "tool_name": "tool_search"
    }
  ],
  "stream": true,
  "think": false,
  "keep_alive": "3h",
  "options": {
    "num_ctx": 24576,
    "temperature": 0.6,
    "num_predict": 1024
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "tasks__ticket-read",
        "description": "tasks__ticket-read",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "tasks__ticket-archive",
        "description": "tasks__ticket-archive",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "tool_search",
        "description": "tool_search",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    }
  ]
}
```

## Events

- start
- text_start
- text_delta "Okay."
- text_end
- done

## Final message

```json
{
  "stopReason": "stop",
  "content": [
    {
      "type": "text",
      "text": "Okay."
    }
  ],
  "usage": {
    "input": 50,
    "output": 2
  }
}
```
