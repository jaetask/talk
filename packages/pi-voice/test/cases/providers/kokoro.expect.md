# kokoro

## Input

[kokoro.json](kokoro.json)

## Output

# kokoro

Kokoro, the local default: OpenAI's speech endpoint on the speech server already on this machine, raw PCM, no key.

Provider kokoro at 24000 Hz returned 4800 bytes of PCM.

## Request

```json
{
  "method": "POST",
  "url": "http://127.0.0.1:3900/v1/audio/speech",
  "headers": {
    "content-type": "application/json"
  },
  "body": {
    "model": "mlx-audio",
    "voice": "af_bella",
    "input": "Hello there.",
    "response_format": "pcm",
    "speed": 0.94
  }
}
```
