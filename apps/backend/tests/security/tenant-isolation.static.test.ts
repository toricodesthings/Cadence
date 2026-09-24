/**
 * Tenant Isolation Tripwire (static analysis)
 *
 * The backend isolates tenants with TWO layers: Postgres RLS policies AND an
 * explicit `eq(<table>.userId, userId)` predicate on every user-scoped query.
 * The cron path scans cross-tenant by design, which means the DB connection
 * role can bypass RLS — so the explicit `userId` predicate is load-bearing, not
 * merely defense in depth. If future code forgets it, RLS may not catch the leak.
 *
 * This test fails when an UPDATE or DELETE against a user-scoped table anywhere
 * in `src/` is missing a `userId` predicate. UPDATE/DELETE are the catastrophic
 * vectors (cross-tenant tampering / deletion); reads carry less blast radius
 * and are additionally covered by RLS.
 *
 * A small allowlist covers operations that are safe by construction. Each entry
 * says WHY. Adding a new userId-less write means consciously adding it here
 * (with a justification) — that is the ratchet.
 *
 * Raw `tx.execute(sql`...`)` statements are out of scope; the one such write
 * (tasks reorder) is reviewed to include `AND user_id = ${userId}`.
 */
import { expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(fileURLToPath(import.meta.url), "../../../src");

/** Tables that carry per-user data and must be scoped by `userId`. */
const USER_SCOPED_TABLES = [
    "users", "userMetrics", "aiMemories", "aiConversations", "aiMessages", "taskSections",
    "projects", "tasks", "tags", "taskTags", "inboxItems", "inboxSections", "habits",
    "habitTags", "habitLogs", "subtasks", "taskNotes", "taskMetrics", "usageEvents",
    "notificationState", "suggestions", "mutationDedup", "taskNlpMetadata",
    "taskNlpMetadataHistory", "savedFocusViews",
];

/**
 * Statement fragments that are safe despite lacking a direct `userId`
 * predicate. Each must stay justified.
 */
const ALLOWED_WITHOUT_USERID: Array<{ fragment: string; reason: string }> = [
    { fragment: "eq(taskTags.taskId", reason: "task_tags has no userId column; scoped by a task verified as owned earlier in the tx" },
    { fragment: "inArray(taskTags.taskId, taskIds", reason: "task_tags has no userId column; every id was verified owned by updateTask earlier in the tx" },
    { fragment: "eq(habitLogs.id, existing.id", reason: "`existing` was fetched via a userId-scoped select in the same tx" },
    { fragment: "eq(habits.id, habit.id", reason: "`habit` was fetched via a userId-scoped select in the same tx" },
    { fragment: "eq(habitTags.habitId, id", reason: "`id` is verified as an owned habit (update + throwIfNotFound) before tag sync" },
    { fragment: "eq(inboxItems.id, id", reason: "inbox item ownership verified earlier in the same tx (process route)" },
    { fragment: "eq(taskMetrics.id, existing[0].id", reason: "`existing` was fetched via a userId-scoped select in the same tx" },
    { fragment: "lt(mutationDedup.createdAt, cutoff", reason: "cron TTL prune; sweeps every user's expired dedup keys by design" },
    { fragment: "inArray(aiMemories.id, idsToDelete", reason: "cron prune; ids come from a deliberate cross-tenant EPHEMERAL/expired select" },
];

function collectSourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(full);
        return entry.name.endsWith(".ts") ? [full] : [];
    });
}

/** The chained statement text from an UPDATE/DELETE call to its terminator. */
function statementFrom(source: string, opIndex: number): string {
    const rest = source.slice(opIndex);
    // End at the first terminator so long `.set({...})` blocks never hide the
    // trailing `.where()`; fall back to a generous window when there is none.
    const ends = [rest.indexOf(".returning("), rest.indexOf(";")].filter((i) => i >= 0);
    return rest.slice(0, ends.length > 0 ? Math.min(...ends) : 1500);
}

const writeOp = new RegExp(`\\.(update|delete)\\(\\s*(${USER_SCOPED_TABLES.join("|")})\\s*\\)`, "g");

function findUnscopedWrites() {
    const writes: string[] = [];
    const violations: string[] = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(writeOp)) {
            const [, verb, table] = match;
            const where = `src/${relative(SRC_DIR, file)}:${source.slice(0, match.index).split("\n").length}`;
            const stmt = statementFrom(source, match.index!);
            writes.push(where);
            if (/userId/.test(stmt) || ALLOWED_WITHOUT_USERID.some((a) => stmt.includes(a.fragment))) continue;
            violations.push(`${where} ${verb}(${table}) has no userId predicate:\n${stmt.trim()}`);
        }
    }
    return { writes, violations };
}

it("every UPDATE/DELETE on a user-scoped table in src/ filters by userId", () => {
    const { writes, violations } = findUnscopedWrites();

    // Guards the scanner itself: a broken regex or path would otherwise pass vacuously.
    expect(writes.length).toBeGreaterThan(50);
    expect(
        violations,
        "Add eq(<table>.userId, userId) to the WHERE clause, or — if safe by construction — add an annotated entry to ALLOWED_WITHOUT_USERID.",
    ).toEqual([]);
});
