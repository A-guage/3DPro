import { getDb } from "./connection.js";
import { CREATE_TABLES_SQL } from "./schema.js";

// Columns to add if they don't exist (schema upgrades)
const ALTER_TABLES: Array<{ table: string; column: string; type: string }> = [
  { table: "scene3d_object_records", column: "width_cm", type: "REAL" },
  { table: "scene3d_object_records", column: "height_cm", type: "REAL" },
  { table: "scene3d_object_records", column: "depth_cm", type: "REAL" },
  { table: "scene3d_object_records", column: "file_size_bytes", type: "INTEGER" },
  { table: "scene3d_object_records", column: "format", type: "TEXT" },
  { table: "scene3d_assets", column: "source", type: "TEXT" },
  { table: "scene3d_assets", column: "source_id", type: "TEXT" },
  { table: "scene3d_assets", column: "source_url", type: "TEXT" },
  { table: "scene3d_assets", column: "author", type: "TEXT" },
  { table: "scene3d_assets", column: "tags_csv", type: "TEXT" },
];

function columnExists(db: any, table: string, column: string): boolean {
  try {
    const rows = db.exec(`PRAGMA table_info(${table})`);
    if (rows.length === 0) return false;
    const colNameIdx = rows[0].columns.indexOf("name");
    return rows[0].values.some((row: any[]) => row[colNameIdx] === column);
  } catch {
    return false;
  }
}

export async function migrate(): Promise<void> {
  const db = await getDb();
  db.run("BEGIN TRANSACTION;");
  try {
    for (const sql of CREATE_TABLES_SQL) {
      db.run(sql);
    }
    // Add missing columns for schema upgrades
    for (const { table, column, type } of ALTER_TABLES) {
      if (!columnExists(db, table, column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
    db.run("COMMIT;");
  } catch (err) {
    db.run("ROLLBACK;");
    throw err;
  }
}
