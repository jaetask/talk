# xai

## Input

[xai.json](xai.json)

## Output

# xai

xAI text to speech: POST /v1/tts with a Grok voice, PCM back.

Provider xai at 24000 Hz returned 4800 bytes of PCM.

## Request

```json
{
  "method": "POST",
  "url": "https://api.x.ai/v1/tts",
  "headers": {
    "content-type": "application/json",
    "authorization": "Bearer <key>"
  },
  "body": {
    "text": "Hello there.",
    "voice_id": "ara",
    "language": "en",
    "output_format": {
      "codec": "pcm",
      "sample_rate": 24000
    },
    "speed": 1.1
  }
}
```
