# 9. Ollama is called through its own chat API

## Context

Ollama offers an OpenAI-compatible route and its own `/api/chat`. The model runs with a set context size on one machine, and other clients may use the same loaded model.

## Decision

`src/model/ollama.ts` implements Ollama's own chat API as a model API for the harness. The OpenAI-compatible route cannot carry `num_ctx`. A request through it makes Ollama reload the model with another context size, and the next request with the configured size reloads it back. Every request sends the same context size, sampling, keep-alive and thinking off.

## Consequences

Do not switch to the OpenAI-compatible route for convenience. Any client that shares the Ollama server should send the same context size, or each switch costs a model reload.
