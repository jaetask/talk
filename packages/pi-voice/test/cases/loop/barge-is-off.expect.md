# barge-is-off

## Input

[barge-is-off.json](barge-is-off.json)

## Output

# barge-is-off

With the interrupt level set to 1, talking over the reply never stops it: the words are not even heard as a turn while it plays.

```
         microphone: question.wav
  640 ms  state: hearing
 2336 ms  state: thinking
 2336 ms  heard: tell me everything
 2400 ms  sentence ready: Here is a very long answer that goes on.
 2432 ms  state: speaking
 2496 ms  sentence ready: And on and on, with a second sentence.
 2816 ms  done: "Here is a very long answer that goes on. And on and on, with a second sentence."; 3620 ms of audio sent so far
 2848 ms  state: listening
         microphone: stop.wav
```
