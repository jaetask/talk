import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import type { PermissionRequest, Update } from "./acp.ts";

const AUTO_KINDS = new Set(["read", "search", "think", "edit", "move", "delete", "switch_mode"]);
const TASKS_TOOL = /^mcp__tasks__(?<tool>[\w-]+)$/;
const TASKS_AUTO = /^(get|list|search|read)[\w-]*$|^(ticket|board|catalog)-(read|find)$|^ticket-comment-(add|reply-to|react)$/;
const REFUSE_CMD =
	/\bsudo\b|\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)|\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b|\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s(origin\s+)?(main|master)\b)|\bgh\s+pr\s+merge\b|\bgit\s+reset\s+--hard\b|\bchmod\s+777\b|\bgit\s+(checkout|switch)\s+(main|master)\b.*\bgit\s+push\b/i;

const real = (p: string): string => {
	let rest = "";
	for (let at = p; ; ) {
		try {
			return join(realpathSync(at), rest);
		} catch {
			const parent = dirname(at);
			if (parent === at) return p;
			rest = join(basename(at), rest);
			at = parent;
		}
	}
};

export function inside(path: string, root: string): boolean {
	const r = real(root);
	const p = real(isAbsolute(path) ? path : join(r, path));
	return p === r || p.startsWith(r + sep);
}

function paths(request: PermissionRequest): string[] {
	const tc = request.toolCall ?? {};
	const out: string[] = (tc.locations ?? []).map((l: { path?: string }) => l.path).filter(Boolean);
	for (const k of ["file_path", "path", "notebook_path", "cwd"]) if (typeof tc.rawInput?.[k] === "string") out.push(tc.rawInput[k]);
	for (const c of tc.content ?? []) if (c?.type === "diff" && c.path) out.push(c.path);
	return out;
}

export function splitCommands(cmd: string): string[] {
	const parts: string[] = [];
	let cur = "";
	let quote: string | undefined;
	for (let i = 0; i < cmd.length; i++) {
		const ch = cmd[i];
		if (quote) {
			cur += ch;
			if (ch === quote) quote = undefined;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			cur += ch;
		} else if (cmd.startsWith("&&", i) || cmd.startsWith("||", i)) {
			parts.push(cur);
			cur = "";
			i++;
		} else if (";|\n".includes(ch)) {
			parts.push(cur);
			cur = "";
		} else cur += ch;
	}
	parts.push(cur);
	return parts.map((p) => p.split(/\s+/).filter(Boolean).join(" ")).filter(Boolean);
}

export function commandName(command: string): string {
	const words = command.split(" ").filter((w) => !w.split("/")[0].includes("=") || w.startsWith("-") || w.startsWith("/"));
	if (!words.length) return command.slice(0, 30);
	const head = words[0].split("/").pop()!;
	if (["git", "gh", "npm", "pnpm", "uv", "docker", "cargo", "go", "bun"].includes(head) && words.length > 1)
		return [head, ...words.slice(1).filter((w) => !w.startsWith("-")).slice(0, head === "gh" ? 2 : 1)].join(" ");
	if (head.startsWith("python") && words.length > 1) return `python ${words[1].startsWith("-") ? words[1] : words[1].split("/").pop()}`;
	return head;
}

function spokenCommands(cmd: string): string {
	const cmds = splitCommands(cmd);
	if (cmds.length === 1 && cmds[0].length <= 70) return `run ${cmds[0]}`;
	const names = cmds.map(commandName);
	return `run ${cmds.length} command${cmds.length === 1 ? "" : "s"}: ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}`;
}

export type PermissionDecision = { action: "allow" | "ask" | "reject"; option?: string; reject?: string; question: string; why: string };

export function decide(request: PermissionRequest, worktree: string): PermissionDecision {
	const tc = request.toolCall ?? {};
	const kind: string = tc.kind ?? "other";
	const title = String(tc.title ?? kind).split(/\s+/).filter(Boolean).join(" ").slice(0, 120);
	const option = (kinds: string[]) => (request.options ?? []).find((o) => kinds.includes(o.kind))?.optionId;
	const allowOnce = option(["allow_once"]);
	const reject = option(["reject_once", "reject_always"]);
	if (paths(request).some((p) => !inside(p, worktree)))
		return { action: "ask", option: allowOnce, reject, why: "outside the worktree", question: `Claude Code wants to ${title.toLowerCase()}, outside its scratch copy. Allow it once?` };
	if (AUTO_KINDS.has(kind) && allowOnce) return { action: "allow", option: allowOnce, reject, why: `${kind} inside the worktree`, question: "" };
	const tasks = String(tc.title ?? tc.name ?? "").trim().match(TASKS_TOOL)?.groups?.tool;
	if (tasks && allowOnce) {
		if (TASKS_AUTO.test(tasks)) return { action: "allow", option: allowOnce, reject, why: `Tasks ${tasks}`, question: "" };
		return { action: "ask", option: allowOnce, reject, why: `Tasks ${tasks} changes a ticket`, question: `Claude Code wants to ${tasks.replace(/-/g, " ")} in Tasks. Allow it once?` };
	}
	const cmd: string = tc.rawInput?.command ?? "";
	if (cmd && REFUSE_CMD.test(cmd)) return { action: "reject", reject, why: "refused command in the chain", question: "" };
	if (!allowOnce) return { action: "reject", reject, why: "no allow-once option offered", question: "" };
	return { action: "ask", option: allowOnce, reject, why: `${kind} needs Jae`, question: `Claude Code wants to ${cmd ? spokenCommands(cmd) : title.toLowerCase()}. Allow it once?` };
}

export function describe(update: Update): string | undefined {
	if (update.sessionUpdate === "plan") {
		const steps = (update.entries ?? []).map((e: { content?: string }) => e.content ?? "").filter(Boolean);
		return steps.length ? `Claude Code's plan: ${steps.slice(0, 6).join("; ")}` : undefined;
	}
	if (update.sessionUpdate === "tool_call") return `Claude Code · ${update.kind ?? "tool"} · ${update.title ?? ""}`.trim();
	return undefined;
}

export const textOf = (update: Update): string => (update.content && typeof update.content === "object" ? (update.content.text ?? "") : "");

export function summary(reply: string, stop: string): string {
	const sentences = reply.replace(/\(Stopped: [^)]*\)\.?/g, "").split(/\s+/).filter(Boolean).join(" ").split(/(?<=[.!?])\s+/);
	const last = sentences.slice(-2).filter(Boolean).join(" ").slice(0, 400);
	return (stop === "end_turn" ? `Claude Code is done. ${last}` : `Claude Code stopped (${stop.replace(/_/g, " ")}). ${last}`).trim();
}

export function repoFor(project: string | undefined, appsRoot: string, fallback: string): string {
	if (project) {
		const cand = join(appsRoot, project.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-"));
		if (existsSync(join(cand, ".git"))) return cand;
	}
	return fallback;
}

const SAFE_RUN = "Don't start, stop or restart any servers or running services (other agents run this app's live server); run tests in this worktree only.";

export function taskPrompt(task: string, ticket?: { id: string; title?: string; body?: string }): string {
	const tail = `Make the change, run the relevant tests, commit, push the branch and open a pull request. Don't merge it. Finish with a two-sentence summary of what you did.\n\n${SAFE_RUN}`;
	if (ticket)
		return `Work on Tasks ticket ${ticket.id}: ${ticket.title ?? ""}.\n\n${(ticket.body ?? "").trim().slice(0, 4000)}\n\nYou're in a fresh git worktree on a scratch branch. Use the tasks MCP server to read the ticket and its discussion and to comment on meaningful progress. ${tail}`;
	return `${task}\n\nYou're in a fresh git worktree on a scratch branch. ${tail}`;
}
