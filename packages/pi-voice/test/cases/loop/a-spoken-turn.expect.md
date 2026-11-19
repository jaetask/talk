# a-spoken-turn

## Input

[a-spoken-turn.json](a-spoken-turn.json)

## Output

# a-spoken-turn

One turn, hands free: the question is heard, the reply is spoken sentence by sentence as it is written, and the loop goes back to listening. Times are milliseconds of microphone audio.

```
         microphone: question.wav
  640 ms  state: hearing
 2336 ms  state: thinking
 2336 ms  heard: what's on the Tasks board today
 2464 ms  sentence ready: Two tickets.
 2496 ms  state: speaking
 2528 ms  sentence ready: One is in review.
 2656 ms  sentence ready: Anything else?
 2976 ms  done: "Two tickets. One is in review. Anything else?"; 2470 ms of audio sent so far
 2976 ms  state: listening
         microphone: 3000 ms of silence
```
