import { readFileSync } from "node:fs";
import { db } from "../lib/db";
const sql = db();
for (const statement of readFileSync("scripts/schema.sql", "utf8")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean))
  await sql.query(statement);
const constraints =
  await sql`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public_records'::regclass AND contype='p'`;
if (!constraints[0] || constraints[0].definition === "PRIMARY KEY (id)") {
  await sql.transaction([
    sql.query(
      "ALTER TABLE public_records DROP CONSTRAINT IF EXISTS public_records_pkey",
    ),
    sql.query("ALTER TABLE public_records ADD PRIMARY KEY(kind,id)"),
  ]);
}
console.log("Database schema applied");
