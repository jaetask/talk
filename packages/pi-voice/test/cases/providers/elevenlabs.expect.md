# elevenlabs

## Input

[elevenlabs.json](elevenlabs.json)

## Output

# elevenlabs

ElevenLabs: the streaming endpoint for one of the account's voices, raw PCM at 24 kHz.

Provider elevenlabs at 24000 Hz returned 4800 bytes of PCM.

## Request

```json
{
  "method": "POST",
  "url": "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=pcm_24000",
  "headers": {
    "content-type": "application/json",
    "xi-api-key": "<key>"
  },
  "body": {
    "text": "Hello there.",
    "model_id": "eleven_multilingual_v2"
  }
}
```
