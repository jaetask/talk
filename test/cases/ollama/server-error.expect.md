# server-error

## Input

[server-error.json](server-error.json)

## Output

# server-error

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
      "content": "Hello"
    }
  ],
  "stream": true,
  "think": false,
  "keep_alive": "3h",
  "options": {
    "num_ctx": 24576,
    "temperature": 0.6,
    "num_predict": 1024
  }
}
```

## Events

- error

## Final message

```json
{
  "stopReason": "error",
  "content": [],
  "usage": {
    "input": 0,
    "output": 0
  },
  "errorMessage": "Ollama answered 500: {\"error\":\"model not found\"}\n"
}
```
