/**
 * Tenant Isolation Tripwire (static analysis)
 *
 * The backend isolates tenants with TWO layers: Postgres RLS policies AND an
 * explicit `eq(<table>.userId, userId)` predicate on every user-scoped query.
 * The cron path scans cross-tenant by design, which means the DB connection
 * role can bypass RLS — so the explicit `userId` predicate is load-bearing, not
 * merely defense in depth. If a future handler forgets it, RLS may not catch
 * the leak.
 *
 * This test fails the build when a route-level UPDATE or DELETE against a
 * user-scoped table is missing a `userId` predicate. UPDATE/DELETE are the
 * catastrophic vectors (cross-tenant tampering / deletion); reads carry less
 * blast radius and are additionally covered by RLS.
 *
 * A small allowlist covers operations that are safe by construction: they key
 * off a parent row whose ownership was verified earlier in the same
 * transaction, or a join table that has no `userId` column of its own. Each
 * entry is annotated with WHY it is safe. Adding a new userId-less write means
 * consciously adding it here (with a justification) — that is the ratchet.
 *
 * Raw `tx.execute(sql`...`)` statements are intentionally out of scope; the one
 * such write (tasks reorder) is reviewed to include `AND user_id = ${userId}`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DOMAINS_DIR = join(fileURLToPath(import.meta.url), "../../../src/domains");

/** Tables that carry per-user data and must be scoped by `userId`. */
const USER_SCOPED_TABLES = [
    "users", "userMetrics", "aiMemories", "taskSections", "projects", "tasks",
    "tags", "taskTags", "inboxItems", "inboxSections", "habits", "habitTags",
    "habitLogs", "subtasks", "taskNotes", "taskMetrics", "usageEvents",
    "notificationState", "suggestions", "mutationDedup", "taskNlpMetadata",
    "taskNlpMetadataHistory", "savedFocusViews",
];

/**
 * Where-clause fragments that are safe despite lacking a direct `userId`
 * predicate. Each must stay justified.
 */
const ALLOWED_WITHOUT_USERID: Array<{ fragment: string; reason: string }> = [
    { fragment: "eq(taskTags.taskId", reason: "task_tags has no userId column; scoped by a task verified as owned earlier in the tx" },
    { fragment: "eq(habitLogs.id, existing.id", reason: "`existing` was fetched via a userId-scoped select in the same tx" },
    { fragment: "eq(habits.id, habit.id", reason: "`habit` was fetched via a userId-scoped select in the same tx" },
    { fragment: "eq(habitTags.habitId, id", reason: "`id` is verified as an owned habit (update + throwIfNotFound) before tag sync" },
    { fragment: "eq(inboxItems.id, id", reason: "inbox item ownership verified earlier in the same tx (process route)" },
];

function collectRouteFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectRouteFiles(full));
        else if (entry.name.endsWith(".route.ts") || entry.name === "debug-seed.ts") out.push(full);
    }
    return out;
}

/** Extract the chained statement text starting at an UPDATE/DELETE call. */
function statementFrom(source: string, opIndex: number): string {
    const rest = source.slice(opIndex);
    const returningIdx = rest.indexOf(".returning(");
    const semicolonIdx = rest.indexOf(";");
    const candidates = [returningIdx, semicolonIdx].filter((i) => i >= 0);
    // End at the statement terminator (.returning() or ;). Only fall back to a
    // generous fixed window when neither is found, so long .set({...}) blocks
    // never hide the trailing .where() clause.
    const end = candidates.length > 0 ? Math.min(...candidates) : 1500;
    return rest.slice(0, end);
}

const tableUnion = USER_SCOPED_TABLES.join("|");
const writeOpRegex = new RegExp(`\\.(update|delete)\\(\\s*(${tableUnion})\\s*\\)`, "g");

describe("Tenant isolation: every route-level write filters by userId", () => {
    const files = collectRouteFiles(DOMAINS_DIR);

    it("discovers route files to scan", () => {
        expect(files.length).toBeGreaterThan(5);
    });

    for (const file of files) {
        const source = readFileSync(file, "utf8");
        const shortName = file.slice(file.indexOf("/domains/"));

        let match: RegExpExecArray | null;
        const regex = new RegExp(writeOpRegex.source, "g");
        while ((match = regex.exec(source)) !== null) {
            const verb = match[1];
            const table = match[2];
            const op = `${verb}(${table})`;
            const stmt = statementFrom(source, match.index);
            const line = source.slice(0, match.index).split("\n").length;
            const hasUserId = /userId/.test(stmt);
            const allowed = ALLOWED_WITHOUT_USERID.find((a) => stmt.includes(a.fragment));

            it(`${shortName}:${line} — ${op} is tenant-scoped`, () => {
                if (hasUserId || allowed) {
                    expect(true).toBe(true);
                    return;
                }
                throw new Error(
                    `${shortName}:${line} performs ${op} without a userId predicate and is not in the ` +
                    `allowlist.\nStatement:\n${stmt.trim()}\n\n` +
                    `Either add eq(${table}.userId, userId) to the WHERE clause, or — if it is ` +
                    `safe by construction — add an annotated entry to ALLOWED_WITHOUT_USERID.`,
                );
            });
        }
    }
});
