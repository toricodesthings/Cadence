import { z } from "zod";

/**
 * The apps a task or routine can open. Stable ids only: labels, initials and destinations live in the frontend
 * catalogue. Retired ids stay here so a saved choice still copies, converts and undoes.
 */
export const APP_LINK_IDS = ["myfitnesspal", "gmail", "outlook", "google-calendar", "google-maps", "spotify", "notion", "youtube"] as const;

export const linkedAppIdSchema = z.enum(APP_LINK_IDS);
export type LinkedAppId = z.infer<typeof linkedAppIdSchema>;
