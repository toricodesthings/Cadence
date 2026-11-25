import type { Context } from "hono";
import type { LiveChange } from "@cadence/contracts/live";
import type { ListRole } from "@cadence/contracts/sharing";
import { withCallerRls } from "./caller-rls";
import { noteAudience, noteChange, requireOwner, type ShareWhat } from "./list-access";
import type { AuthVariables } from "./auth";
import type { Tx } from "../types/db";
import type { Env } from "../types/env";

type RouteContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * An owner-only change to who is in a shared resource: checked and run in one transaction, then everyone who was in it
 * (read first, so a removed person hears too) is told to refresh.
 */
export async function ownerChange<A extends { audience: string[]; role: ListRole }, T>(
    c: RouteContext,
    resolve: (tx: Tx, userId: string) => Promise<A>,
    change: (tx: Tx, userId: string, access: A) => Promise<T>,
    liveChange: LiveChange,
    what: ShareWhat = "list",
) {
    const { result, access } = await withCallerRls(c, async (tx, userId) => {
        const access = await resolve(tx, userId);
        requireOwner(access, what);
        return { result: await change(tx, userId, access), access };
    });
    noteAudience(c, access);
    noteChange(c, liveChange);
    return { result, access };
}
