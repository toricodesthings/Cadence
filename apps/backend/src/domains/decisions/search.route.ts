import { eq } from "drizzle-orm";
import { searchTerms, noteHeadings } from "@cadence/search/terms";
import type { SearchNote } from "@cadence/contracts/search";
import { taskNotes } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { Hono } from "hono";
import { didYouMeanQuerySchema } from "@cadence/contracts/search";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { didYouMean } from "./did-you-mean";

export const searchRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/task-notes", async (c) => {
        const userId = c.get("userId");
        const notes = await withRls(getDbClient(c.env), userId, (tx) => tx
            .select({ taskId: taskNotes.taskId, body: taskNotes.body }).from(taskNotes)
            .where(eq(taskNotes.userId, userId)));
        const data: SearchNote[] = notes.map(({ taskId, body }) => ({ taskId, terms: searchTerms(body), headings: noteHeadings(body) }));
        return c.json({ data });
    })
    // POST so the query never lands in a URL log.
    .post("/did-you-mean", apiValidator("json", didYouMeanQuerySchema), async (c) => {
        const { query } = c.req.valid("json");
        const task = await didYouMean(c.env, c.get("userId"), query, "search");
        return c.json({ data: { task } });
    });
