# xai-refused

## Input

[xai-refused.json](xai-refused.json)

## Output

# xai-refused

A refusal from the service is an error that says who refused and why.

Error: xai answered 401: {"error":"invalid api key"}

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
    "voice_id": "eve",
    "language": "en",
    "output_format": {
      "codec": "pcm",
      "sample_rate": 24000
    }
  }
}
```
