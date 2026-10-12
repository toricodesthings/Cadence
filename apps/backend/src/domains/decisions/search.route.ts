import { Hono } from "hono";
import { didYouMeanQuerySchema } from "@cadence/contracts/search";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { didYouMean } from "./did-you-mean";

export const searchRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // POST so the query never lands in a URL log.
    .post("/did-you-mean", apiValidator("json", didYouMeanQuerySchema), async (c) => {
        const { query } = c.req.valid("json");
        const task = await didYouMean(c.env, c.get("userId"), query, "search");
        return c.json({ data: { task } });
    });
