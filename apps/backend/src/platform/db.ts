import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import type { Env } from "../types/env";

export function getDbClient(env: Env) {
    const client = postgres(env.HYPERDRIVE.connectionString, {
        prepare: true,
        fetch_types: false,
        max: 5,
    });
    return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof getDbClient>;
