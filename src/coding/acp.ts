import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const CLAUDE_ADAPTER = ["npx", "-y", "@agentclientprotocol/claude-agent-acp@0.106.0"];
const PROTOCOL_VERSION = 1;
const SECRET = /("(?:value|token|authorization|apiKey|api_key|password)"\s*:\s*)"[^"]*"/gi;
export const redact = (text: string): string => text.replace(SECRET, '$1"[redacted]"');

export class AcpError extends Error {}

export type Update = Record<string, any>;
export type PermissionRequest = {
  toolCall?: Record<string, any>;
  options?: { optionId: string; kind: string }[];
};

export function makeWorktree(
  repo: string,
  root: string,
  base = "origin/main",
  label = "acp",
): string {
  repo = resolve(repo);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const path = join(root, `${basename(repo)}-${label}-${id}`);
  mkdirSync(root, { recursive: true });
  spawnSync("git", ["-C", repo, "fetch", "-q", "origin", "main"], {
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const r = spawnSync(
    "git",
    ["-C", repo, "worktree", "add", "-q", "-b", `talk/${label}-${id}`, path, base],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0)
    throw new AcpError(
      `couldn't make a worktree: ${String(r.stderr ?? "")
        .trim()
        .slice(0, 200)}`,
    );
  return path;
}

export function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([k, v]) =>
        v !== undefined &&
        !(
          k.startsWith("CLAUDE_CODE_") ||
          k.startsWith("CLAUDE_AGENT_") ||
          ["CLAUDECODE", "ANTHROPIC_BASE_URL", "CLAUDE_PID"].includes(k)
        ),
    ),
  ) as Record<string, string>;
}

export type Budget = { seconds: number; toolCalls: number };

export class AcpSession {
  sessionId = "";
  agent: Record<string, any> = {};
  stderrTail: string[] = [];
  private next = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private onUpdate?: (u: Update) => void | Promise<void>;
  private onPermission?: (r: PermissionRequest) => Promise<string>;
  private toolCalls = 0;
  private exited = false;
  private readonly ended: Promise<void>;
  private constructor(private readonly proc: ChildProcessWithoutNullStreams) {
    this.ended = new Promise((resolve) => proc.once("close", () => resolve()));
    proc.on("error", () => {});
    proc.stdin.on("error", () => {});
  }

  static async start(
    cmd: string[],
    cwd: string,
    mcpServers: object[] = [],
    env: Record<string, string> = cleanEnv(),
    initTimeoutMs = 120_000,
  ): Promise<AcpSession> {
    const proc = spawn(cmd[0], cmd.slice(1), { cwd, env, stdio: "pipe" });
    const s = new AcpSession(proc);
    void s.read();
    void s.drainStderr();
    try {
      s.agent = await s.request(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: { name: "talk", title: "Talk", version: "0.1" },
        },
        initTimeoutMs,
      );
      if (s.agent.protocolVersion !== PROTOCOL_VERSION)
        throw new AcpError(
          `agent speaks ACP v${s.agent.protocolVersion}, Talk speaks v${PROTOCOL_VERSION}`,
        );
      const made = await s.request("session/new", { cwd: resolve(cwd), mcpServers }, initTimeoutMs);
      s.sessionId = made.sessionId;
      const modes = made.modes?.availableModes ?? [];
      if (modes.some((m: { id: string }) => m.id === "default"))
        await s.request("session/set_mode", { sessionId: s.sessionId, modeId: "default" }, 30_000);
    } catch (e) {
      await s.close();
      throw e;
    }
    return s;
  }

  async prompt(
    text: string,
    handlers: {
      onUpdate?: (u: Update) => void | Promise<void>;
      onPermission?: (r: PermissionRequest) => Promise<string>;
    },
    budget: Budget = { seconds: 900, toolCalls: 80 },
  ): Promise<string> {
    this.onUpdate = handlers.onUpdate;
    this.onPermission = handlers.onPermission;
    this.toolCalls = 0;
    const turn = this.send("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
    });
    const deadline = Date.now() + budget.seconds * 1000;
    for (;;) {
      const tick = await Promise.race([
        turn.then((r) => ({ r })),
        new Promise<undefined>((res) => setTimeout(() => res(undefined), 250)),
      ]);
      if (tick) return tick.r?.stopReason ?? "end_turn";
      const over =
        Date.now() > deadline
          ? "timeout"
          : this.toolCalls > budget.toolCalls
            ? "budget"
            : undefined;
      if (over) {
        await this.cancel();
        await Promise.race([turn.catch(() => {}), new Promise((res) => setTimeout(res, 15_000))]);
        return over;
      }
    }
  }

  async cancel(): Promise<void> {
    if (this.sessionId)
      this.write({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: this.sessionId },
      });
  }

  async close(): Promise<void> {
    if (!this.exited) {
      this.proc.kill();
      await Promise.race([this.ended, new Promise((res) => setTimeout(res, 5000))]);
      if (!this.exited) this.proc.kill("SIGKILL");
    }
    for (const p of this.pending.values()) p.reject(new AcpError("session closed"));
    this.pending.clear();
  }

  private send(method: string, params: object): Promise<any> {
    const id = ++this.next;
    const done = new Promise<any>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.write({ jsonrpc: "2.0", id, method, params });
    return done;
  }

  private async request(method: string, params: object, timeoutMs = 60_000): Promise<any> {
    const done = this.send(method, params);
    const id = this.next;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.pending.delete(id);
        reject(new AcpError(`${method}: no answer in ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs),
    );
    return Promise.race([done, timeout]);
  }

  private write(msg: object): void {
    try {
      this.proc.stdin.write(`${JSON.stringify(msg)}\n`);
    } catch {}
  }

  private async drainStderr(): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of this.proc.stderr)
      this.stderrTail = [
        ...this.stderrTail,
        ...redact(decoder.decode(chunk)).split("\n").filter(Boolean),
      ].slice(-40);
  }

  private async read(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of this.proc.stdout) {
        buffer += decoder.decode(chunk, { stream: true });
        for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          await this.take(line);
        }
      }
    } finally {
      this.exited = true;
      for (const p of this.pending.values()) p.reject(new AcpError("agent process ended"));
      this.pending.clear();
    }
  }

  private async take(line: string): Promise<void> {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if ("id" in msg && ("result" in msg || "error" in msg) && !("method" in msg)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p?.reject(new AcpError(`${msg.error.message ?? "error"} (${msg.error.code})`));
      else p?.resolve(msg.result ?? {});
    } else if (msg.method === "session/update") {
      const update = msg.params?.update ?? {};
      if (update.sessionUpdate === "tool_call") this.toolCalls++;
      try {
        await this.onUpdate?.(update);
      } catch {}
    } else if (msg.method === "session/request_permission" && "id" in msg) {
      void (async () => {
        let choice = "cancelled";
        try {
          choice = (await this.onPermission?.(msg.params ?? {})) ?? "cancelled";
        } catch {
          choice = "cancelled";
        }
        const valid = new Set(
          (msg.params?.options ?? []).map((o: { optionId: string }) => o.optionId),
        );
        this.write({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            outcome: valid.has(choice)
              ? { outcome: "selected", optionId: choice }
              : { outcome: "cancelled" },
          },
        });
      })();
    } else if ("id" in msg && msg.method) {
      this.write({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `${msg.method} isn't supported by Talk` },
      });
    }
  }
}
