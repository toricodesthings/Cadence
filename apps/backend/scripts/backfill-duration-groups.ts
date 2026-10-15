// One-off for 0.34.1: moves duration reports to the v2 groups (`groupOfTask`), using the matched task's title.
// Reports with no task keep their old group. Safe to re-run.
//   pnpm backfill:duration-groups [--apply]     (prints the changes; --apply writes them)
// Connects with PROD_MANAGEMENT_DATABASE_URL from .dev.vars (the owner connection drizzle migrates prod with),
// or DATABASE_URL when set.
import postgres from "postgres";
import { groupOfTask } from "../src/domains/ai/memory/signals";

const url = process.env.DATABASE_URL ?? process.env.PROD_MANAGEMENT_DATABASE_URL;
if (!url) throw new Error("Set PROD_MANAGEMENT_DATABASE_URL in .dev.vars (or DATABASE_URL): an owner connection, since the script reads every person's reports");
const apply = process.argv.includes("--apply");
const sql = postgres(url, { max: 1 });

const rows = await sql<{ id: string; subject: string | null; task_id: string; title: string; recurrence_rule: string | null }[]>`
    SELECT s.id, s.subject, s.task_id, t.title, t.recurrence_rule
    FROM ai_memory_signals s JOIN tasks t ON t.id = s.task_id
    WHERE s.kind = 'duration'`;

let changed = 0;
for (const row of rows) {
    const group = groupOfTask({ id: row.task_id, title: row.title, recurrenceRule: row.recurrence_rule });
    if (group === row.subject) continue;
    changed++;
    console.log(`${row.subject ?? "(none)"} -> ${group}`);
    if (apply) await sql`UPDATE ai_memory_signals SET subject = ${group} WHERE id = ${row.id}`;
}
console.log(`${changed} of ${rows.length} reports ${apply ? "updated" : "would change (run with --apply)"}`);
await sql.end();
