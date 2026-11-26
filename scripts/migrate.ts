import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL before running the migration.");
const sql = neon(databaseUrl);
const migrationPath = fileURLToPath(new URL("../migrations/001_init.sql", import.meta.url));
const statements = (await readFile(migrationPath, "utf8"))
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
console.log(`Applied ${statements.length} schema statements.`);
