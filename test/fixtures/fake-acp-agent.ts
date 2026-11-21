const mode = process.env.FAKE_ACP ?? "";
const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
let cwd = process.cwd();
let lastId = 100;
const waiting = new Map<number, (r: any) => void>();
const ask = (toolCall: object) =>
	new Promise<any>((resolve) => {
		const id = ++lastId;
		waiting.set(id, resolve);
		send({ jsonrpc: "2.0", id, method: "session/request_permission", params: { sessionId: "s1", toolCall, options: [{ optionId: "yes", kind: "allow_once" }, { optionId: "no", kind: "reject_once" }] } });
	});
const update = (u: object) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update: u } });

async function prompt(id: number) {
	update({ sessionUpdate: "plan", entries: [{ content: "Find the export button" }, { content: "Fix it" }, { content: "Run the tests" }] });
	const edit = await ask({ kind: "edit", title: "Edit export.ts", locations: [{ path: mode === "outside" ? "/etc/hosts" : `${cwd}/export.ts` }] });
	update({ sessionUpdate: "tool_call", toolCallId: "t1", kind: "edit", title: "Edit export.ts", status: "completed" });
	const cmd = mode === "force" ? "git push --force origin main" : "npm test";
	const run = await ask({ kind: "execute", title: cmd, rawInput: { command: cmd } });
	update({ sessionUpdate: "tool_call", toolCallId: "t2", kind: "execute", title: cmd, status: "completed" });
	const ok = (r: any) => r?.outcome?.outcome === "selected" && r.outcome.optionId === "yes";
	update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: ok(edit) ? "I fixed the export button. " : "I couldn't edit the file. " } });
	update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: ok(run) ? "The tests pass and the pull request is open." : "I wasn't allowed to run the tests, so they are not run." } });
	send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
}

let buffer = "";
for await (const chunk of process.stdin) {
	buffer += new TextDecoder().decode(chunk);
	for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
		const line = buffer.slice(0, nl);
		buffer = buffer.slice(nl + 1);
		if (!line.trim()) continue;
		const m = JSON.parse(line);
		if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "fake" } } });
		else if (m.method === "session/new") {
			cwd = m.params.cwd;
			send({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s1" } });
		} else if (m.method === "session/prompt") void prompt(m.id);
		else if (m.method === "session/cancel") process.exit(0);
		else if (m.id !== undefined && waiting.has(m.id)) {
			waiting.get(m.id)!(m.result);
			waiting.delete(m.id);
		}
	}
}

export {};
