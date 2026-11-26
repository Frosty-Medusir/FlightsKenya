import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL before running the migration.");
const sql = neon(databaseUrl);
const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const migrations = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

for (const migration of migrations) {
  const migrationPath = fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url));
  const statements = (await readFile(migrationPath, "utf8"))
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  console.log(`Applied ${statements.length} statements from ${migration}.`);
}
