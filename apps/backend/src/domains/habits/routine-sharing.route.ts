import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { uuidParamSchema } from "@cadence/contracts/common";
import { cheerSchema, setShareModeSchema, setTurnOrderSchema } from "@cadence/contracts/habit";
import { createRoutineInviteSchema, listMemberParamSchema } from "@cadence/contracts/sharing";
import { todayIn } from "@cadence/domain/time";
import { habits, routineCheers } from "../../db/schema";
import { withCallerRls } from "../../platform/caller-rls";
import { AppError } from "../../platform/errors";
import { noteAudience, noteChange, requireOwner, routineAccess } from "../../platform/list-access";
import { ownerChange } from "../../platform/owner-change";
import { userZone } from "../../platform/user-zone";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import type { Env } from "../../types/env";
import {
    assertCanRemoveMember,
    createInvite,
    inviteCreated,
    peopleResponse,
    removeRoutineMember,
    resetInvitesResponse,
    routinePeople,
    stopSharingResponse,
    stopSharingRoutine,
} from "../sharing/sharing.service";
import { reorderTurns, turnHabitFrom } from "./routine-turns";

export const routineSharingRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Create ──
    .post(
        "/:id/invites",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", createRoutineInviteSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { way } = c.req.valid("json");
            const { token, expiresAt } = await withCallerRls(c, async (tx, userId) => {
                const access = await routineAccess(tx, userId, id);
                requireOwner(access, "routine");
                if (way === "cheering") return createInvite(tx, userId, { routineId: id }, "view");
                if (access.shareMode && access.shareMode !== way) {
                    const current = access.shareMode === "turns" ? "take turns" : "do together";
                    throw new AppError(409, "MODE_SET", `This routine is shared to ${current}. Switch it first.`);
                }
                if (!access.shareMode) {
                    const today = todayIn(await userZone(tx, userId));
                    await tx
                        .update(habits)
                        .set({
                            shareMode: way,
                            ...(way === "turns" ? { turnOrder: [userId], turnsFrom: today } : {}),
                        })
                        .where(and(eq(habits.id, id), eq(habits.userId, userId)));
                }
                return createInvite(tx, userId, { routineId: id }, "edit");
            });
            return inviteCreated(c, token, expiresAt);
        },
    )
    .post("/:id/cheers", apiValidator("param", uuidParamSchema), apiValidator("json", cheerSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { targetDate } = c.req.valid("json");
        const access = await withCallerRls(c, async (tx, userId) => {
            const access = await routineAccess(tx, userId, id);
            const recipients = access.participants.filter((uid) => uid !== userId);
            if (recipients.length > 0) {
                await tx
                    .insert(routineCheers)
                    .values(recipients.map((toUserId) => ({ habitId: id, fromUserId: userId, toUserId, targetDate })))
                    .onConflictDoNothing();
            }
            return access;
        });
        noteAudience(c, access);
        noteChange(c, { type: "routine" });
        return c.body(null, 204);
    })

    // ── Update ──
    .patch("/:id/mode", apiValidator("param", uuidParamSchema), apiValidator("json", setShareModeSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { mode } = c.req.valid("json");
        await ownerChange(
            c,
            (tx, userId) => routineAccess(tx, userId, id),
            async (tx, userId, access) => {
                const zone = await userZone(tx, userId);
                await tx
                    .update(habits)
                    .set({ shareMode: mode })
                    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
                if (mode === "turns") {
                    await reorderTurns(
                        tx,
                        turnHabitFrom(access),
                        access.participants,
                        access.participants,
                        todayIn(zone),
                        zone,
                    );
                }
                return { mode };
            },
            { type: "routine" },
            "routine",
        );
        return c.json({ data: { mode } });
    })
    .put("/:id/turns", apiValidator("param", uuidParamSchema), apiValidator("json", setTurnOrderSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { order } = c.req.valid("json");
        await ownerChange(
            c,
            (tx, userId) => routineAccess(tx, userId, id),
            async (tx, userId, access) => {
                const expected = new Set(access.participants);
                const unique = new Set(order);
                if (
                    unique.size !== order.length ||
                    unique.size !== expected.size ||
                    order.some((u) => !expected.has(u))
                ) {
                    throw new AppError(400, "VALIDATION_ERROR", "Turn order must match the routine's participants.");
                }
                const today = todayIn(await userZone(tx, userId));
                await tx
                    .update(habits)
                    .set({ turnOrder: order, turnsFrom: today })
                    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
                return { order };
            },
            { type: "routine" },
            "routine",
        );
        return c.json({ data: { order } });
    })

    // ── Read ──
    .get("/:id/people", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return peopleResponse(c, async (tx, userId) => {
            await routineAccess(tx, userId, id);
            return routinePeople(tx, id);
        });
    })

    // ── Delete ──
    .delete("/:id/invites", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return resetInvitesResponse(c, (tx, userId) => routineAccess(tx, userId, id), { routineId: id }, "routine");
    })
    .delete("/:id/members/:userId", apiValidator("param", listMemberParamSchema), async (c) => {
        const { id, userId: memberId } = c.req.valid("param");
        const access = await withCallerRls(c, async (tx, userId) => {
            const access = await routineAccess(tx, userId, id);
            assertCanRemoveMember(access, userId, memberId, "routine");
            // Reorder first: someone leaving loses their RLS update on `habits` once their row is gone.
            if (access.shareMode === "turns" && access.participants.includes(memberId)) {
                const zone = await userZone(tx, access.ownerId);
                const remaining = access.participants.filter((uid) => uid !== memberId);
                await reorderTurns(tx, turnHabitFrom(access), access.participants, remaining, todayIn(zone), zone);
            }
            await removeRoutineMember(tx, access, memberId);
            return access;
        });
        noteAudience(c, access);
        noteChange(c, { type: "routine" });
        return c.json({ data: { success: true } });
    })
    .delete("/:id/members", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return stopSharingResponse(
            c,
            (tx, userId) => routineAccess(tx, userId, id),
            (tx, userId, access) => stopSharingRoutine(tx, userId, access),
            { type: "routine" },
            "routine",
        );
    });
