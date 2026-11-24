import { Hono, type Context } from "hono";
import { count, eq } from "drizzle-orm";
import { uuidParamSchema } from "@cadence/contracts/common";
import {
    createInviteSchema,
    invitePreviewQuerySchema,
    joinListSchema,
    listMemberParamSchema,
    setMemberRoleSchema,
    transferListSchema,
} from "@cadence/contracts/sharing";
import { tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import {
    assertListRoom,
    listAccess,
    noteAudience,
    noteChange,
    requireOwner,
    type ListAccess,
} from "../../platform/list-access";
import { assertRowRoom } from "../../platform/storage-ceiling";
import type { Tx } from "../../types/db";
import { AppError } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import { appOrigin, type Env } from "../../types/env";
import { replanReminders } from "../push/reminder-clock";
import { evictFromPresence } from "./list-presence";
import { evictFromNoteCollab } from "../notes/note-collab";
import {
    createInvite,
    joinList,
    listPeople,
    previewInvite,
    removeMember,
    resetInvites,
    setMemberRole,
    stopSharing,
    transferList,
} from "./sharing.service";

type RouteContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * An owner-only change to who is in a list: checked and run in one transaction, then everyone who was in the list
 * (read first, so the person removed hears too) is told to refresh it.
 */
async function ownerChange<T>(
    c: RouteContext,
    listId: string,
    change: (tx: Tx, userId: string, access: ListAccess) => Promise<T>,
) {
    const { result, access } = await withCallerRls(c, async (tx, userId) => {
        const access = await listAccess(tx, userId, listId);
        requireOwner(access);
        return { result: await change(tx, userId, access), access };
    });
    noteAudience(c, access);
    noteChange(c, { type: "list", listId });
    return result;
}

export const sharingRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/join", apiValidator("json", joinListSchema), async (c) => {
        const { token } = c.req.valid("json");
        const { listId, access } = await withCallerRls(c, async (tx, userId) => {
            const listId = await joinList(tx, userId, token);
            // Read after joining, so the audience includes the new person.
            return { listId, access: await listAccess(tx, userId, listId) };
        });
        noteAudience(c, access);
        noteChange(c, { type: "list", listId });
        return c.json({ data: { listId } });
    })
    .post(
        "/:id/invites",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", createInviteSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { role } = c.req.valid("json");
            // No Idempotency-Key: a retry mints another link, which is harmless and capped.
            const { token, expiresAt } = await withCallerRls(c, async (tx, userId) => {
                requireOwner(await listAccess(tx, userId, id));
                return createInvite(tx, userId, id, role);
            });
            return c.json({ data: { url: `${appOrigin(c.env)}/join/${token}`, expiresAt } }, 201);
        },
    )
    .post(
        "/:id/transfer",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", transferListSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { userId: toUserId } = c.req.valid("json");
            const callerId = c.get("userId");
            const db = getDbClient(c.env);

            // Check owner, membership and list size first.
            const { taskCount } = await withRls(db, callerId, async (tx) => {
                const access = await listAccess(tx, callerId, id);
                requireOwner(access);
                if (toUserId === callerId || !access.audience.includes(toUserId)) {
                    throw new AppError(404, "NOT_FOUND", "Person not found in this list");
                }
                await assertListRoom(tx, id, 0);
                const [{ n }] = await tx.select({ n: count() }).from(tasks).where(eq(tasks.projectId, id));
                return { taskCount: n };
            });

            // Check the new owner's account ceilings under their own RLS.
            await withRls(db, toUserId, async (tx) => {
                await assertRowRoom(tx, toUserId, "lists", 1);
                if (taskCount > 0) await assertRowRoom(tx, toUserId, "tasks", taskCount);
            });

            await ownerChange(c, id, (tx) => transferList(tx, id, toUserId));
            const transferTaskIds = await withCallerRls(c, (tx) =>
                tx
                    .select({ id: tasks.id })
                    .from(tasks)
                    .where(eq(tasks.projectId, id))
                    .then((rows) => rows.map((r) => r.id)),
            );
            c.executionCtx.waitUntil(replanReminders(c.env, toUserId));
            c.executionCtx.waitUntil(evictFromNoteCollab(c.env, transferTaskIds));
            return c.json({ data: { listId: id } });
        },
    )
    .patch(
        "/:id/members/:userId",
        apiValidator("param", listMemberParamSchema),
        apiValidator("json", setMemberRoleSchema),
        async (c) => {
            const { id, userId: memberId } = c.req.valid("param");
            const { role } = c.req.valid("json");
            const { member, taskIds } = await ownerChange(c, id, async (tx, userId) => {
                const updated = await setMemberRole(tx, userId, id, memberId, role);
                const rows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id));
                return { member: updated, taskIds: rows.map((r) => r.id) };
            });
            c.executionCtx.waitUntil(evictFromNoteCollab(c.env, taskIds, memberId));
            return c.json({ data: member });
        },
    )
    .get("/invite-preview", apiValidator("query", invitePreviewQuerySchema), async (c) => {
        const { token } = c.req.valid("query");
        const preview = await withCallerRls(c, (tx) => previewInvite(tx, token));
        c.header("Cache-Control", "private, no-store");
        return c.json({ data: preview });
    })
    .get("/:id/people", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        const people = await withCallerRls(c, async (tx, userId) => {
            await listAccess(tx, userId, id); // 404 unless the caller is in the list
            return listPeople(tx, id);
        });
        c.header("Cache-Control", "private, no-store");
        return c.json({ data: people });
    })
    .delete("/:id/invites", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        await withCallerRls(c, async (tx, userId) => {
            requireOwner(await listAccess(tx, userId, id));
            await resetInvites(tx, userId, id);
        });
        return c.json({ data: { success: true } });
    })
    .delete("/:id/members/:userId", apiValidator("param", listMemberParamSchema), async (c) => {
        const { id, userId: memberId } = c.req.valid("param");
        const { access, taskIds } = await withCallerRls(c, async (tx, userId) => {
            // Read first: the person removed hears of it too.
            const access = await listAccess(tx, userId, id);
            if (memberId !== userId) requireOwner(access);
            else if (access.role === "owner")
                throw new AppError(403, "OWNER_ONLY", "The owner can stop sharing, not leave.");
            const rows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id));
            await removeMember(tx, access, memberId);
            return { access, taskIds: rows.map((r) => r.id) };
        });
        noteAudience(c, access);
        noteChange(c, { type: "list", listId: id });
        c.executionCtx.waitUntil(evictFromPresence(c.env, id, memberId));
        c.executionCtx.waitUntil(evictFromNoteCollab(c.env, taskIds, memberId));
        return c.json({ data: { success: true } });
    })
    .delete("/:id/members", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        const taskIds = await ownerChange(c, id, async (tx, userId, access) => {
            const rows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id));
            await stopSharing(tx, userId, access);
            return rows.map((r) => r.id);
        });
        c.executionCtx.waitUntil(evictFromPresence(c.env, id));
        c.executionCtx.waitUntil(evictFromNoteCollab(c.env, taskIds));
        return c.json({ data: { success: true } });
    });
