import { Hono } from "hono";
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
    eventAccess,
    listAccess,
    noteAudience,
    noteChange,
    requireOwner,
    routineAccess,
} from "../../platform/list-access";
import { ownerChange } from "../../platform/owner-change";
import { assertRowRoom } from "../../platform/storage-ceiling";
import { userZone } from "../../platform/user-zone";
import { todayIn } from "@cadence/domain/time";
import { reorderTurns, turnHabitFrom } from "../habits/habits.service";
import { AppError } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import { appOrigin, type Env } from "../../types/env";
import { replanReminders } from "../push/reminder-clock";
import { evictFromPresence } from "./list-presence";
import { evictFromNoteCollab } from "../notes/note-collab";
import { assertCanRemoveMember, peopleResponse, resetInvitesResponse } from "./sharing-route-helpers";
import {
    createInvite,
    joinInvite,
    listPeople,
    previewInvite,
    removeMember,
    setMemberRole,
    stopSharing,
    transferList,
} from "./sharing.service";

export const sharingRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/join", apiValidator("json", joinListSchema), async (c) => {
        const { token } = c.req.valid("json");
        const { joined, access } = await withCallerRls(c, async (tx, userId) => {
            const joined = await joinInvite(tx, userId, token);
            // Read after joining, so the audience includes the new person.
            if (joined.kind === "list") {
                return { joined, access: await listAccess(tx, userId, joined.listId) };
            }
            if (joined.kind === "event") {
                return { joined, access: await eventAccess(tx, userId, joined.eventId) };
            }
            const access = await routineAccess(tx, userId, joined.routineId);
            if (access.shareMode === "turns" && access.role === "edit") {
                const zone = await userZone(tx, access.ownerId);
                const today = todayIn(zone);
                const oldParticipants = access.participants.filter((id) => id !== userId);
                await reorderTurns(
                    tx,
                    turnHabitFrom(access),
                    oldParticipants.length > 0 ? oldParticipants : access.participants,
                    access.participants,
                    today,
                    zone,
                );
            }
            return { joined, access };
        });
        noteAudience(c, access);
        if (joined.kind === "list") {
            noteChange(c, { type: "list", listId: joined.listId });
        } else if (joined.kind === "event") {
            noteChange(c, { type: "event" });
        } else {
            noteChange(c, { type: "routine" });
        }
        return c.json({ data: joined });
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
                return createInvite(tx, userId, { listId: id }, role);
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

            await ownerChange(
                c,
                (tx, userId) => listAccess(tx, userId, id),
                (tx) => transferList(tx, id, toUserId),
                { type: "list", listId: id },
            );
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
            const {
                result: { member, taskIds },
            } = await ownerChange(
                c,
                (tx, userId) => listAccess(tx, userId, id),
                async (tx, userId) => {
                    const updated = await setMemberRole(tx, userId, id, memberId, role);
                    const rows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id));
                    return { member: updated, taskIds: rows.map((r) => r.id) };
                },
                { type: "list", listId: id },
            );
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
        return peopleResponse(c, async (tx, userId) => {
            await listAccess(tx, userId, id); // 404 unless the caller is in the list
            return listPeople(tx, id);
        });
    })
    .delete("/:id/invites", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return resetInvitesResponse(c, (tx, userId) => listAccess(tx, userId, id), { listId: id }, "list");
    })
    .delete("/:id/members/:userId", apiValidator("param", listMemberParamSchema), async (c) => {
        const { id, userId: memberId } = c.req.valid("param");
        const { access, taskIds } = await withCallerRls(c, async (tx, userId) => {
            // Read first: the person removed hears of it too.
            const access = await listAccess(tx, userId, id);
            assertCanRemoveMember(access, userId, memberId, "list");
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
        const { result: taskIds } = await ownerChange(
            c,
            (tx, userId) => listAccess(tx, userId, id),
            async (tx, userId, access) => {
                const rows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id));
                await stopSharing(tx, userId, access);
                return rows.map((r) => r.id);
            },
            { type: "list", listId: id },
        );
        c.executionCtx.waitUntil(evictFromPresence(c.env, id));
        c.executionCtx.waitUntil(evictFromNoteCollab(c.env, taskIds));
        return c.json({ data: { success: true } });
    });
