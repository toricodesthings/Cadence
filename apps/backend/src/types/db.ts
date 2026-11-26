import type { DbClient } from "../platform/db";

export type { DbClient };

export type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
