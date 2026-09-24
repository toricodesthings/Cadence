import { and, eq } from "drizzle-orm";
import type { InsertProject } from "@cadence/contracts/project";
import { projects } from "../../db/schema";
import { checkIdempotency, recordMutation } from "../../platform/idempotency";
import type { Tx } from "../../types/db";

/** Create a project. A replayed idempotency key returns the first one. */
export async function createProject(tx: Tx, userId: string, body: InsertProject, idempotencyKey?: string) {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await tx.select().from(projects).where(and(eq(projects.id, existingId), eq(projects.userId, userId)));
        if (existing) return existing;
    }

    const [row] = await tx
        .insert(projects)
        .values({ ...body, userId })
        .returning();

    await recordMutation(tx, userId, idempotencyKey, row.id);
    return row;
}
