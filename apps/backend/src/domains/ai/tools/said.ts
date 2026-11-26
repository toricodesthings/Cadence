import { z } from "zod";

const quote = z.string().max(80);

export const saidSchema = z
    .object({ priority: quote.optional(), effort: quote.optional() })
    .optional()
    .describe(
        "Exact words they typed that set priority or effort, ≤80 characters each. No quote, no value. Words read from a photo or PDF go in `fromImage`, not here.",
    );

const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CUES = {
    priority:
        /\b(?:asap|urgent(?:ly)?|important|priority|prio|p[1-4]|matters?|critical|crucial|essential|rush|wait|whenever|later|someday|eventually|right away|immediately|now|soon|top|low|high|medium)\b|!!/i,
    effort: /\b(?:quick(?:ly)?|easy|easily|simple|small|tiny|light|short|big|huge|large|hard|heavy|tough|long|massive|difficult|draining|effort|minutes?|hours?|all day|low|medium|high|lot of work)\b/i,
};

function quoted(field: keyof typeof CUES, quote: string | undefined, texts: string[], answered: boolean): boolean {
    const q = quote ? fold(quote) : "";
    if (!q) return false;
    if (answered && texts.at(-1) === q) return true;
    if (!CUES[field].test(q)) return false;
    const words = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(q)}(?:$|[^\\p{L}\\p{N}])`, "u");
    return texts.some((t) => words.test(t));
}

export function checkSaid<T extends { priority?: number | null; effort?: number | null }>(
    fields: T,
    said: z.infer<typeof saidSchema>,
    { userTexts, answeredField }: { userTexts?: string[]; answeredField?: "priority" | "effort" },
    imagePriority = false,
): { fields: T; effortOrigin?: "manual"; ignored?: string[] } {
    if (!userTexts) return { fields };
    const texts = userTexts.map(fold);
    const out = { ...fields };
    const ignored: string[] = [];
    if (out.priority && !imagePriority && !quoted("priority", said?.priority, texts, answeredField === "priority")) {
        delete out.priority;
        ignored.push("priority: not in their words (words from a photo or PDF go in fromImage on create_tasks)");
    }
    let effortOrigin: "manual" | undefined;
    if (out.effort) {
        if (quoted("effort", said?.effort, texts, answeredField === "effort")) effortOrigin = "manual";
        else {
            delete out.effort;
            ignored.push("effort: not in their words");
        }
    }
    return { fields: out, effortOrigin, ...(ignored.length && { ignored }) };
}
