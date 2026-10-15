import "dotenv/config";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
const source = process.env.DATABASE_PATH || "database.sqlite";
const directory = process.env.BACKUP_DIR || "backups";
mkdirSync(directory, { recursive: true });
const destination = path.resolve(
  directory,
  `rl-tracker-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
const db = new Database(source, { readonly: true });
try {
  // VACUUM INTO produces a consistent independent database, including WAL state.
  db.query("VACUUM INTO ?").run(destination);
  const copy = new Database(destination, { readonly: true });
  try {
    const check = copy.query("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (check.integrity_check !== "ok")
      throw new Error("Backup integrity check failed");
  } finally {
    copy.close();
  }
  console.log(destination);
} finally {
  db.close();
}
