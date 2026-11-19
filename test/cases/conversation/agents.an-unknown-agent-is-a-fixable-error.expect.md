# agents.an-unknown-agent-is-a-fixable-error

## Input

[agents.an-unknown-agent-is-a-fixable-error.json](agents.an-unknown-agent-is-a-fixable-error.json)

## Output

# agents.an-unknown-agent-is-a-fixable-error

Asking an agent that doesn't exist gets an error that lists the ones that do.

## chat: "Ask Bob to say hello"

- tool: agent ask agent=bob task=Say hello.
- result: agent_ask error {"error":"There is no agent \"bob\" to hand work to. The agents are: maddy."}
- reply (answered): There's no Bob. I can ask Maddy.

## What reached Tasks

Nothing.
