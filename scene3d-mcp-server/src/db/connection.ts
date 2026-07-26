import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../config.js";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const config = loadConfig();
  const dbPath = resolve(config.scene3d.databasePath);
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    dbInstance = new SQL.Database(buffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Enable WAL mode for better concurrent read performance
  dbInstance.run("PRAGMA journal_mode=WAL;");

  return dbInstance;
}

/** Persist the in-memory database to disk. */
export function saveDb(): void {
  if (!dbInstance) return;
  const config = loadConfig();
  const dbPath = resolve(config.scene3d.databasePath);
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

/** Call saveDb periodically. Returns an interval ref you can clearInterval(). */
export function startAutoSave(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(saveDb, intervalMs);
}

/** Close the database and release resources. */
export function closeDb(): void {
  if (dbInstance) {
    try { dbInstance.close(); } catch {}
    dbInstance = null;
  }
}
