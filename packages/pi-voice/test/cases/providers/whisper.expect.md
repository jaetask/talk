# whisper

## Input

[whisper.json](whisper.json)

## Output

# whisper

Speech to text: a WAV of the utterance to OpenAI's transcription endpoint, primed with likely words.

Heard: "what's on the board today?"

## Request

```json
{
  "method": "POST",
  "url": "http://127.0.0.1:3900/v1/audio/transcriptions",
  "headers": {},
  "body": {
    "file": "<audio/wav, 6444 bytes>",
    "model": "whisper-1",
    "response_format": "json",
    "language": "en",
    "prompt": "Jae is talking to Cooper. Tasks, Marketing, Money."
  }
}
```
