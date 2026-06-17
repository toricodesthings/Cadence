import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { userMetrics } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute } from "./index";

export const metricTools = (env: Env, userId: string, _ctx?: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_user_metrics: tool({
        description:
            "READ-ONLY. Fetch the user's current adaptive-state metrics: burnout index, reschedule " +
            "velocity, completion ratio, overdue carry load, habit adherence, and schedule density. " +
            "Use these to plan protectively (avoid overloading a stressed user).",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_user_metrics", userId, async () => {
                const db = getDbClient(env);
                const result = await withRls(db, userId, async (tx) => {
                    const [row] = await tx
                        .select({
                            rescheduleVelocity: userMetrics.rescheduleVelocity,
                            currentBurnoutIndex: userMetrics.currentBurnoutIndex,
                            completionRatio: userMetrics.completionRatio,
                            overdueCarryLoad: userMetrics.overdueCarryLoad,
                            habitAdherenceRate: userMetrics.habitAdherenceRate,
                            scheduleDensity: userMetrics.scheduleDensity,
                        })
                        .from(userMetrics)
                        .where(eq(userMetrics.userId, userId))
                        .limit(1);
                    return row;
                });
                return { metrics: result ?? null };
            }),
    }),
});
