import type { Context } from "hono";
import { getDbClient } from "./db";
import { withRls } from "./rls";
import type { AuthVariables } from "./auth";
import type { Env } from "../types/env";
import type { Tx } from "../types/db";

/** `withRls` for the signed-in caller of a route: opens the database and runs `fn` as that user. */
export function withCallerRls<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c: Context<{ Bindings: Env; Variables: AuthVariables }, any, any>,
    fn: (tx: Tx, userId: string) => Promise<T>,
): Promise<T> {
    const userId = c.get("userId");
    return withRls(getDbClient(c.env), userId, (tx) => fn(tx, userId));
}
