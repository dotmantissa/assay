import { readFileSync } from "node:fs";
import { db } from "../lib/db";
const sql = db();
for (const statement of readFileSync("scripts/schema.sql", "utf8")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean))
  await sql.query(statement);
console.log("Database schema applied");
