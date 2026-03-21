import type { DbClient } from "../../../platform/db";

type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export interface Scenario {
    /** Human-readable name shown in seed response */
    name: string;
    /** Semver of the fixture data shape */
    version: string;
    /** Execute the seed against an RLS-scoped transaction */
    seed: (db: Tx, userId: string) => Promise<void>;
}

// ── Registry ─────────────────────────────────────────────────────────

import * as activePowerUser from "./active-power-user";

export const scenarios: Record<string, Scenario> = {
    "active-power-user": {
        name: "Active Power User",
        version: activePowerUser.SCENARIO_VERSION,
        seed: activePowerUser.seed,
    },
};

export const DEFAULT_SCENARIO = "active-power-user";
