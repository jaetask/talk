// Where Talk lives and what it talks to. Every value can be set from the environment.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const NEXT = resolve(dirname(new URL(import.meta.url).pathname), "..");
/** The repository root: skills, personalities, files and the apps list live here. */
export const REPO = NEXT;
export const DATA = process.env.TALK_NEXT_DATA ?? join(NEXT, "data");
export const PORT = Number(process.env.TALK_NEXT_PORT ?? 3911);
export const OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const SEARXNG = process.env.SEARXNG_URL ?? "http://127.0.0.1:8890";
export const VOICESTUDIO = process.env.VOICESTUDIO_URL ?? "http://127.0.0.1:3900";
/** Where the apps' own checkouts live (an app's `.env` there holds its MCP token; Claude Code is started in one of them). */
export const APPS_ROOT = (process.env.APPS_ROOT ?? "~/develop").replace(/^~/, homedir());
/** The list of apps: a JSON file of { name, label, url, about }. See apps.example.json. */
export const APPS_FILE = process.env.TALK_APPS_FILE ?? join(REPO, "apps.json");
export const SKILLS_DIR = process.env.TALK_SKILLS_DIR ?? join(REPO, "skills");
export const PERSONAS_DIR = process.env.TALK_PERSONAS_DIR ?? join(REPO, "personalities");
export const FILES_DIR = process.env.TALK_FILES_DIR ?? join(REPO, "data", "files");
/** The built page (web/, built with `bun run build`). */
export const WEB_DIST = join(NEXT, "web", "dist");
export const UI_DIST = process.env.TALK_UI_DIST ?? WEB_DIST;
export const PRONUNCIATIONS = process.env.TALK_PRONUNCIATIONS ?? join(REPO, "pronunciations.txt");

/** The brain: a model id on Ollama. */
export const MODEL = process.env.TALK_MODEL ?? "gemma4:26b-a4b-it-qat";
export const NUM_CTX = Number(process.env.TALK_NUM_CTX ?? 24576);
export const MAX_REPLY_TOKENS = Number(process.env.TALK_MAX_REPLY_TOKENS ?? 1024);
/** Greedy decoding with a fixed seed: the same words give the same answer (for scoring runs). */
export const DETERMINISTIC = Boolean(process.env.TALK_DETERMINISTIC);
export const PRETEND_WRITES = Boolean(process.env.TALK_PRETEND_WRITES);

/** Writes are off unless this file exists. */
export const WRITES_FLAG = process.env.TALK_WRITES_FLAG ?? join(REPO, "data", "writes.enabled");
export const writesEnabled = (): boolean => existsSync(WRITES_FLAG);

/** Characters of a model step held back in case it is narration before a tool call. The local model never narrates
 *  (0 of 104 tool steps in the Dojo), so its words are spoken as they come. */
export const HOLD_CHARS = Number(process.env.TALK_NEXT_HOLD_CHARS ?? 0);
