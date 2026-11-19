import { Database } from "bun:sqlite";
import type { SqliteDatabase, SqliteExecutor, SqliteValue } from "@earendil-works/chord/sqlite";
class Exec implements SqliteExecutor {
  constructor(protected db: Database, protected ok: () => boolean = () => true) {}
  protected guard() { if (!this.ok()) throw new Error("SQLite transaction handle is no longer active"); }
  async exec(sql: string) { this.guard(); this.db.exec(sql); }
  async run(sql: string, ...p: SqliteValue[]) { this.guard(); this.db.query(sql).run(...(p as any[])); }
  async runCounted(sql: string, ...p: SqliteValue[]) { this.guard(); return Number(this.db.query(sql).run(...(p as any[])).changes); }
  async get<T extends object>(sql: string, ...p: SqliteValue[]) { this.guard(); return (this.db.query(sql).get(...(p as any[])) ?? undefined) as T | undefined; }
  async all<T extends object>(sql: string, ...p: SqliteValue[]) { this.guard(); return this.db.query(sql).all(...(p as any[])) as T[]; }
}
export class BunSqliteDatabase extends Exec implements SqliteDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  private q<T>(op: () => Promise<T>): Promise<T> { const r = this.tail.then(op, op); this.tail = r.then(() => {}, () => {}); return r; }
  override exec(sql: string) { return this.q(() => super.exec(sql)); }
  override run(sql: string, ...p: SqliteValue[]) { return this.q(() => super.run(sql, ...p)); }
  override runCounted(sql: string, ...p: SqliteValue[]) { return this.q(() => super.runCounted(sql, ...p)); }
  override get<T extends object>(sql: string, ...p: SqliteValue[]) { return this.q(() => super.get<T>(sql, ...p)); }
  override all<T extends object>(sql: string, ...p: SqliteValue[]) { return this.q(() => super.all<T>(sql, ...p)); }
  transaction<T>(cb: (tx: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.q(async () => {
      this.db.exec("BEGIN IMMEDIATE");
      let active = true;
      try { const r = await cb(new Exec(this.db, () => active)); active = false; this.db.exec("COMMIT"); return r; }
      catch (e) { active = false; try { this.db.exec("ROLLBACK"); } catch (r) { throw new AggregateError([e, r], "SQLite transaction failed and rollback failed"); } throw e; }
    });
  }
  close() { return this.q(async () => { try { this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } finally { this.db.close(); } }); }
}
export function openBunSqlite(path: string) {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  return new BunSqliteDatabase(db);
}
