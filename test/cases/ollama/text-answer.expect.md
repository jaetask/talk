# text-answer

## Input

[text-answer.json](text-answer.json)

## Output

# text-answer

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

- start
- text_start
- text_delta "Morning"
- text_delta ", Jae."
- text_end
- done

## Final message

```json
{
  "stopReason": "stop",
  "content": [
    {
      "type": "text",
      "text": "Morning, Jae."
    }
  ],
  "usage": {
    "input": 12,
    "output": 4
  }
}
```
