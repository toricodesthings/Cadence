/**
 * "Never invent priority" as a server check: a chat draft's priority and effort must come
 * with a quote of the person's own words (`said`), found in their recent messages.
 * Without `userTexts` (MCP) nothing is checked and nothing becomes evidence.
 */
import { z } from "zod";

const quote = z.string().max(80);

export const saidSchema = z
    .object({ priority: quote.optional(), effort: quote.optional() })
    .optional()
    .describe("Exact words of theirs that set priority or effort, ≤80 characters each. No quote, no value.");

const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** The draft's priority and effort once checked: what is kept, the effort's origin, and what was dropped. */
export function checkSaid<T extends { priority?: number | null; effort?: number | null }>(
    fields: T,
    said: z.infer<typeof saidSchema>,
    userTexts: string[] | undefined,
    /** An image's own quote (`fromImage`) keeps its trust. */
    imagePriority = false,
): { fields: T; effortOrigin?: "manual"; ignored?: string[] } {
    if (!userTexts) return { fields };
    const texts = userTexts.map(fold);
    const said_ = (q?: string) => !!q && fold(q).length > 0 && texts.some((t) => t.includes(fold(q)));
    const out = { ...fields };
    const ignored: string[] = [];
    if (out.priority && !imagePriority && !said_(said?.priority)) {
        delete out.priority;
        ignored.push("priority: not in their words");
    }
    let effortOrigin: "manual" | undefined;
    if (out.effort) {
        if (said_(said?.effort)) effortOrigin = "manual";
        else {
            delete out.effort;
            ignored.push("effort: not in their words");
        }
    }
    return { fields: out, effortOrigin, ...(ignored.length && { ignored }) };
}
