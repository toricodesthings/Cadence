import { Hono } from "hono";
import { uuidParamSchema } from "@cadence/contracts/common";
import { listMemberParamSchema } from "@cadence/contracts/sharing";
import { withCallerRls } from "../../platform/caller-rls";
import { eventAccess, noteAudience, noteChange, requireOwner } from "../../platform/list-access";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import type { Env } from "../../types/env";
import {
    assertCanRemoveMember,
    createInvite,
    eventPeople,
    inviteCreated,
    peopleResponse,
    removeEventMember,
    resetInvitesResponse,
    stopSharingEvent,
    stopSharingResponse,
} from "../sharing/sharing.service";

export const personalEventSharingRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Create ──
    .post("/:id/invites", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { token, expiresAt } = await withCallerRls(c, async (tx, userId) => {
            requireOwner(await eventAccess(tx, userId, id), "event");
            return createInvite(tx, userId, { eventId: id }, "edit");
        });
        return inviteCreated(c, token, expiresAt);
    })

    // ── Read ──
    .get("/:id/people", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return peopleResponse(c, async (tx, userId) => {
            await eventAccess(tx, userId, id);
            return eventPeople(tx, id);
        });
    })

    // ── Delete ──
    .delete("/:id/invites", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return resetInvitesResponse(c, (tx, userId) => eventAccess(tx, userId, id), { eventId: id }, "event");
    })
    .delete("/:id/members/:userId", apiValidator("param", listMemberParamSchema), async (c) => {
        const { id, userId: memberId } = c.req.valid("param");
        const access = await withCallerRls(c, async (tx, userId) => {
            const access = await eventAccess(tx, userId, id);
            assertCanRemoveMember(access, userId, memberId, "event");
            await removeEventMember(tx, access, memberId);
            return access;
        });
        noteAudience(c, access);
        noteChange(c, { type: "event" });
        return c.json({ data: { success: true } });
    })
    .delete("/:id/members", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        return stopSharingResponse(
            c,
            (tx, userId) => eventAccess(tx, userId, id),
            (tx, userId, access) => stopSharingEvent(tx, userId, access),
            { type: "event" },
            "event",
        );
    });
