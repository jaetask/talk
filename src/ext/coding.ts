import { join } from "node:path";
import { defineExtension, defineTool, section, type Extension } from "@earendil-works/pi-durable";
import type { JsonObject } from "../apps/classify.ts";
import type { Registry } from "../apps/registry.ts";
import { readSkill } from "../apps/skills.ts";
import { initialChat, TalkChat } from "../chat.ts";
import { AcpError, AcpSession, CLAUDE_ADAPTER, makeWorktree, type Budget } from "../coding/acp.ts";
import { decide, describe, repoFor, summary, taskPrompt, textOf } from "../coding/policy.ts";
import { askJae, type Parked } from "./gate.ts";

export type CodingOptions = {
  registry: Registry;
  parked: Parked;
  appsRoot: string;
  defaultRepo: string;
  worktrees: string;
  command?: string[];
  makeWorktree?: (repo: string) => string;
  budget?: Budget;
};

type Running = { session?: AcpSession; task: string; status: string; conversation: unknown };

export function codingExtension(opts: CodingOptions): Extension {
  let running: Running | undefined;
  let last: { task: string; final: string; stop: string } | undefined;
  const text = (t: string) => [{ type: "text" as const, text: t }];
  const json = (o: object, isError = false) => ({ output: text(JSON.stringify(o)), isError });

  return defineExtension({
    name: "talk-coding",
    sections: [
      section(
        "coding",
        () => {
          const skill = readSkill("claude-code");
          const must =
            "Coding work starts only when you call start_coding_session in this reply: saying you will start it starts nothing. The system asks Jae to confirm; don't ask him yourself.";
          return skill ? `Skill claude-code:\n${skill.body}\n${must}` : must;
        },
        { tag: false },
      ),
    ],
    tools: [
      defineTool({
        name: "start_coding_session",
        description:
          "Hand a coding task to Claude Code, a separate coding agent that works in a scratch copy of the repo and opens a pull request (never merges). Give a Tasks " +
          "ticket ID when there is one. Call it as soon as Jae asks for coding work: the system asks Jae to confirm, so don't ask first. Never say a session is running " +
          'unless this or coding_status says so. Example: {"task": "Fix the Safari export button", "ticket": "TLK-480"}',
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description:
                "What Claude Code should do, in Jae's words. That's enough: it reads the repo and works out the details",
            },
            ticket: { type: "string", description: "Optional Tasks ticket ID, e.g. TLK-480" },
            project: {
              type: "string",
              description:
                "Optional Tasks project name whose repo to work in, e.g. tasks (defaults to the ticket's project, else talk)",
            },
          },
          required: ["task"],
        },
        execute: async (args: any, api, context) => {
          const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
          if (running)
            return json(
              { error: "A Claude Code session is already running. Stop it first or wait." },
              true,
            );
          const task = String(args.task ?? "").trim();
          const tid = String(args.ticket ?? "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "-");
          const tasks = opts.registry.apps.get("tasks");
          let ticket: { id: string; title?: string; body?: string; projectId?: string } | undefined;
          if (tid) {
            if (chat.fixtures?.["tasks__ticket-read"])
              ticket = (chat.fixtures["tasks__ticket-read"] as any)?.ticket;
            else if (tasks?.online) {
              try {
                ticket = JSON.parse(
                  (await tasks.call("ticket-read", { id: tid })).full ?? "{}",
                ).ticket;
              } catch {
                ticket = undefined;
              }
            }
            if (!ticket?.id) return json({ error: `No ticket ${tid} in Tasks.` }, true);
          }
          if (!task && !ticket) return json({ error: "Say what Claude Code should do." }, true);
          const project =
            String(args.project ?? "").trim() ||
            (ticket ? tasks?.catalog.name(ticket.projectId) : undefined);
          const repo = repoFor(project, opts.appsRoot, opts.defaultRepo);
          const repoName = repo.split("/").pop()!;
          if (
            project &&
            project.toLowerCase() !== opts.defaultRepo.split("/").pop() &&
            repo === opts.defaultRepo
          )
            return json(
              { error: `There's no local repo for the ${project} project under ${opts.appsRoot}.` },
              true,
            );
          if (chat.noConfirm)
            return json(
              {
                error:
                  "Starting Claude Code needs Jae's yes and there's no way to ask right now, so it wasn't started.",
              },
              true,
            );

          const what = ticket ? `${ticket.id}, ${ticket.title ?? ""}` : task;
          const start = await askJae(opts.parked, api, context, {
            key: api.callId,
            name: "start_coding_session",
            args: args as JsonObject,
            question: `Start Claude Code on ${what}, in a scratch copy of ${repoName}?`,
            item: what,
          });
          if (!start.yes)
            return json({
              status: "not started",
              instruction: `Jae didn't say yes, so Claude Code was not started. He said: "${start.said.slice(0, 200)}". If that is a no, acknowledge in a few words; otherwise handle what he said.`,
            });
          if (chat.pretend)
            return json({
              status: "started (test mode)",
              repo: repoName,
              note: "Test mode: no session was really started.",
            });

          const state: Running = {
            task: what,
            status: `Claude Code is starting on ${what}.`,
            conversation: api.conversationId,
          };
          running = state;
          const said: string[] = [];
          let asks = 0;
          let stop = "error";
          let error: string | undefined;
          let worktree = "";
          const setStatus = async (status: string) => {
            state.status = status;
            await api.commit(async (tx) => {
              const doc = await tx.doc(TalkChat, api.conversationId);
              if (doc.working) doc.working.status = status;
            }, context);
          };
          try {
            worktree = (opts.makeWorktree ?? ((r: string) => makeWorktree(r, opts.worktrees)))(
              repo,
            );
            await api.commit(async (tx) => {
              (await tx.doc(TalkChat, api.conversationId)).working = {
                callId: api.callId,
                started: `Claude Code has started on ${what}. I'll tell you when it's done.`,
                status: state.status,
              };
            }, context);
            const mcp = tasks?.online
              ? [{ type: "http", name: "tasks", url: tasks.url, headers: [] }]
              : [];
            state.session = await AcpSession.start(opts.command ?? CLAUDE_ADAPTER, worktree, mcp);
            stop = await state.session.prompt(
              taskPrompt(task, ticket),
              {
                onUpdate: async (update) => {
                  if (update.sessionUpdate === "agent_message_chunk") said.push(textOf(update));
                  const line = describe(update);
                  if (line) {
                    api.output(`${line}\n`);
                    await setStatus(
                      `Claude Code is still working on ${what}. Latest: ${line.replace(/^Claude Code · /, "")}`,
                    );
                  }
                },
                onPermission: async (request) => {
                  const d = decide(request, worktree);
                  if (d.action === "allow") return d.option ?? "cancelled";
                  if (d.action === "reject") return d.reject ?? "cancelled";
                  const answer = await askJae(opts.parked, api, context, {
                    key: `${api.callId}/ask-${++asks}`,
                    name: "start_coding_session",
                    args: { step: d.why },
                    question: d.question,
                    item: d.why,
                  });
                  return answer.yes ? (d.option ?? "cancelled") : (d.reject ?? "cancelled");
                },
              },
              opts.budget,
            );
          } catch (e) {
            error =
              e instanceof AcpError
                ? e.message.slice(0, 200)
                : `${(e as Error).name}: ${String((e as Error).message).slice(0, 160)}`;
          } finally {
            await state.session?.close();
            running = undefined;
            await api.commit(async (tx) => {
              (await tx.doc(TalkChat, api.conversationId)).working = null;
            }, context);
          }
          const reply = said.join("").split(/\s+/).filter(Boolean).join(" ");
          last = { task: what, final: reply.slice(-600), stop };
          const details = {
            worktree,
            branch: worktree.split("/").pop() ?? "",
            stop,
            error: error ?? null,
          } as never;
          if (error)
            return {
              ...json({ error: `The coding session failed: ${error}. Say so plainly.` }, true),
              details,
            };
          return {
            ...json({
              status: stop === "end_turn" ? "finished" : `stopped (${stop})`,
              summary: summary(reply, stop),
              instruction:
                "Tell Jae how it went in one or two spoken sentences. Don't add anything Claude Code didn't say.",
            }),
            details,
          };
        },
      }),
      defineTool({
        name: "coding_status",
        description:
          "Whether a Claude Code session is running and its latest news, plus what the last finished session did. Example: {}",
        parameters: { type: "object", properties: {} },
        replay: "safe",
        execute: async () =>
          json({
            running: Boolean(running),
            latest: running?.status ?? null,
            last_session: last
              ? { task: last.task, final_message: last.final.slice(-300), stop: last.stop }
              : null,
          }),
      }),
      defineTool({
        name: "stop_coding_session",
        description: "Stop the running Claude Code session. Example: {}",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          if (!running) return json({ status: "nothing is running" });
          await running.session?.cancel();
          return json({ status: "stopping" });
        },
      }),
    ],
  });
}

export const defaultWorktrees = (data: string): string => join(data, "worktrees");
