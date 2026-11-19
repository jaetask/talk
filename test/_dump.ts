import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { createModels } from "@earendil-works/pi-ai";
import { openBunSqlite } from "../src/storage/bun-sqlite.ts";
const h = await Harness.open(await SqliteStorage.open(openBunSqlite(process.argv[2])), { models: createModels(), registry: createRegistry(), readOnly: true } as never, ctx);
import { TalkIndex } from "../src/chat.ts";
const idx = await h.snapshot(TalkIndex, ctx);
const ids = Object.values(idx?.chats ?? {}).map((c: any) => c.conversation).sort((a, b) => a - b);
const pick = process.argv[3] ?? "-1";
const conv = (await h.conversation((Number(pick) < 0 ? ids[ids.length + Number(pick)] : Number(pick)) as never, ctx))!;
const page = await conv.entries({ order: "ascending" } as never, 200, undefined, ctx);
for (const e of page.items) {
  const m: any = (e as any).model?.[0];
  if (e.kind === "pi.system") { const t = JSON.stringify(m ?? e.data); console.log(`#${e.id} system ${t.length} chars; tools+ ${(m?.toolsAdded ?? []).length}: ${(m?.toolsAdded ?? []).map((t: any) => t.name + ":" + JSON.stringify(t).length).join(" ")}`);
    if (process.argv[4]) console.log(typeof m?.content === "string" ? m.content : JSON.stringify(m?.sections ?? m?.content).slice(0, 30000)); }
  else console.log(`#${e.id} ${e.kind} ${JSON.stringify(m?.content ?? e.data).slice(0, Number(process.env.W ?? 600))} ${m?.usage ? JSON.stringify({ i: m.usage.input, o: m.usage.output }) : ""}`);
}
await h.close(ctx);
