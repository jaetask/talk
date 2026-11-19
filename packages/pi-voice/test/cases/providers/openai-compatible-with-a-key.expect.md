# openai-compatible-with-a-key

## Input

[openai-compatible-with-a-key.json](openai-compatible-with-a-key.json)

## Output

# openai-compatible-with-a-key

Any OpenAI-compatible speech server, with a key.

Provider openai-speech at 24000 Hz returned 4800 bytes of PCM.

## Request

```json
{
  "method": "POST",
  "url": "https://speech.example/v1/audio/speech",
  "headers": {
    "content-type": "application/json",
    "authorization": "Bearer <key>"
  },
  "body": {
    "model": "tts-1",
    "voice": "alloy",
    "input": "Hello there.",
    "response_format": "pcm",
    "speed": 1
  }
}
```
