import { Hono } from "hono";
import { resetSuggestionsRequestSchema } from "@cadence/contracts/planning";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { resetSuggestions } from "./reset";

export const decisionRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>().post(
    "/reset",
    apiValidator("json", resetSuggestionsRequestSchema),
    async (c) => {
        const suggestions = await resetSuggestions(c.env, c.get("userId"), c.req.valid("json"));
        return c.json({ data: { suggestions } });
    },
);
