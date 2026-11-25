import type { Context } from "hono";
import { withCallerRls } from "../../platform/caller-rls";
import { AppError } from "../../platform/errors";
import { requireOwner, type ListRole, type ShareWhat } from "../../platform/list-access";
import type { AuthVariables } from "../../platform/auth";
import type { Tx } from "../../types/db";
import { appOrigin, type Env } from "../../types/env";
import { replanReminders } from "../push/reminder-clock";
import { resetInvites, type InviteTarget } from "./sharing.service";

type AppCtx = Context<{ Bindings: Env; Variables: AuthVariables }>;

export function inviteCreated(c: AppCtx, token: string, expiresAt: string) {
    return c.json({ data: { url: `${appOrigin(c.env)}/join/${token}`, expiresAt } }, 201);
}

export function replanAudience(c: AppCtx, audience: readonly string[]) {
    for (const uid of audience) c.executionCtx.waitUntil(replanReminders(c.env, uid));
}

export function assertCanRemoveMember(access: { role: ListRole }, callerId: string, memberId: string, what: ShareWhat) {
    if (memberId !== callerId) requireOwner(access, what);
    else if (access.role === "owner") throw new AppError(403, "OWNER_ONLY", "The owner can stop sharing, not leave.");
}

export async function peopleResponse<T>(c: AppCtx, load: (tx: Tx, userId: string) => Promise<T>) {
    const people = await withCallerRls(c, load);
    c.header("Cache-Control", "private, no-store");
    return c.json({ data: people });
}

import type { LiveChange } from "@cadence/contracts/live";
import { ownerChange } from "../../platform/owner-change";

export async function stopSharingResponse<A extends { role: ListRole; audience: string[] }>(
    c: AppCtx,
    loadAccess: (tx: Tx, userId: string) => Promise<A>,
    stop: (tx: Tx, userId: string, access: A) => Promise<unknown>,
    change: LiveChange,
    what: ShareWhat,
) {
    const { access } = await ownerChange(c, loadAccess, stop, change, what);
    replanAudience(c, access.audience);
    return c.json({ data: { success: true } });
}

export async function resetInvitesResponse(
    c: AppCtx,
    loadAccess: (tx: Tx, userId: string) => Promise<{ role: ListRole }>,
    target: InviteTarget,
    what: ShareWhat,
) {
    await withCallerRls(c, async (tx, userId) => {
        requireOwner(await loadAccess(tx, userId), what);
        await resetInvites(tx, userId, target);
    });
    return c.json({ data: { success: true } });
}
