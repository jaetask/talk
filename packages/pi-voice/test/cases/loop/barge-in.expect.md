# barge-in

## Input

[barge-in.json](barge-in.json)

## Output

# barge-in

Barge-in: the reply is still playing at the listener's end when the person says "stop". The reply is stopped at once and the new words are heard as the next turn.

```
         microphone: question.wav
  640 ms  state: hearing
 2336 ms  state: thinking
 2336 ms  heard: tell me everything
 2400 ms  sentence ready: Here is a very long answer that goes on.
 2432 ms  state: speaking
 2464 ms  sentence ready: And on and on, with a second sentence.
 2592 ms  sentence ready: And a third one too.
 2976 ms  done: "Here is a very long answer that goes on. And on and on, with a second sentence. And a third one too."; 4670 ms of audio sent so far
 2976 ms  state: listening
         microphone: stop.wav
 3552 ms  BARGE: the reply is stopped
 3552 ms  state: hearing
 4576 ms  state: thinking
 4576 ms  heard: stop
 4672 ms  sentence ready: Okay.
 4704 ms  state: speaking
 4832 ms  done: "Okay."; 5120 ms of audio sent so far
 4832 ms  state: listening
         microphone: 2000 ms of silence
```
