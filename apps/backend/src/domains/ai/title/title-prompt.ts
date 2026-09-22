/**
 * Title-prompt storage + caching for the conversation auto-titler.
 *
 * Mirrors the prompt-cache philosophy (doc 04) INCLUDING code-canonical
 * seed-sync: the template below is the authoring surface; on the first titled
 * turn of an isolate it is version-diffed against `ai_title_prompts` and
 * upserted when newer, so an edit in code propagates on the next deploy.
 * To change the prompt: edit DEFAULT_TITLE_PROMPT and bump
 * DEFAULT_TITLE_PROMPT_VERSION. An admin PATCH bumps the DB version past the
 * code default, so a live hot-patch wins until code ships a higher version.
 * The compiled-in constant is otherwise ONLY the outage floor.
 *
 * Reads hit GLOBAL config (no userId) → they run OUTSIDE withRls, just
 * getDbClient(env) directly. A short in-isolate TTL cache bounds DB round-trips;
 * an admin edit propagates within the TTL (a prompt edit is not latency-critical).
 */
import { and, eq, lt } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { logger } from "../../../platform/log";
import { aiTitlePrompts } from "../../../db/schema";
import type { Env } from "../../../types/env";

/**
 * Compiled-in canonical template (en). Seeded/synced into `ai_title_prompts` by
 * version; also the floor when the DB has no active row or is unreachable.
 */
const DEFAULT_TITLE_PROMPT = `You generate a short, human title for a conversation from the user's first message.

Rules:
- 3 to 6 words, in Title Case.
- Capture the core intent or topic of the message.
- No surrounding quotes, no trailing punctuation, no emojis.
- Do not answer, greet, or add commentary. Output ONLY the title text.`;

/** Bump together with any edit to DEFAULT_TITLE_PROMPT (the sync trigger). */
const DEFAULT_TITLE_PROMPT_VERSION = 1;

const TITLE_PROMPT_TTL_MS = 60_000;

/** Per-isolate soft cache, keyed by locale. Pure perf — correctness never depends on it. */
const cache = new Map<string, { value: string; expiresAt: number }>();

/** Whether we've already logged a load failure this isolate (avoid log spam). */
let loadFailureLogged = false;

/** One code→DB sync attempt per isolate (success OR failure — never hammer). */
let seedSyncAttempted = false;

/**
 * Version-diff the compiled-in template against the 'en' row and upsert when the
 * code default is newer (or the row is missing). One version-guarded upsert, so admin edits with a
 * higher version win.
 */
async function ensureTitlePromptSeeded(env: Env): Promise<boolean> {
    if (seedSyncAttempted) return false;
    seedSyncAttempted = true;

    const seed = {
        template: DEFAULT_TITLE_PROMPT,
        version: DEFAULT_TITLE_PROMPT_VERSION,
        isActive: true,
        notes: "seeded from code default",
    };
    const written = await getDbClient(env)
        .insert(aiTitlePrompts)
        .values({ locale: "en", ...seed })
        .onConflictDoUpdate({
            target: aiTitlePrompts.locale,
            set: seed,
            setWhere: lt(aiTitlePrompts.version, DEFAULT_TITLE_PROMPT_VERSION),
        })
        .returning({ id: aiTitlePrompts.id });
    if (written.length === 0) return false;
    logger.info("ai", "title_prompt_seeded", {});
    return true;
}

/**
 * Resolve the active title-generation system prompt for a locale, falling back to
 * 'en' and then the compiled-in default. Never throws.
 *
 * The locale is CLIENT-SUPPLIED: it is normalized to a bare primary language
 * subtag before use, and the cache is size-capped, so a caller cycling crafted
 * locale strings can neither grow the map unboundedly nor smuggle odd keys.
 */
export async function getTitlePrompt(env: Env, locale = "en"): Promise<string> {
    const normalized = locale.toLowerCase().split("-")[0].slice(0, 10) || "en";
    const now = Date.now();
    const hit = cache.get(normalized);
    if (hit && hit.expiresAt > now) return hit.value;

    let value = DEFAULT_TITLE_PROMPT;
    try {
        await ensureTitlePromptSeeded(env);
        value = (await loadActiveTitlePrompt(env, normalized)) ?? DEFAULT_TITLE_PROMPT;
    } catch (error) {
        if (!loadFailureLogged) {
            loadFailureLogged = true;
            logger.warn("ai", "title_prompt_load_failed", {
                reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error",
            });
        }
    }

    if (cache.size > 50) cache.clear(); // bound the per-isolate footprint
    cache.set(normalized, { value, expiresAt: now + TITLE_PROMPT_TTL_MS });
    return value;
}

/** Load the active template for the locale, falling back to 'en'. Returns null when absent. */
async function loadActiveTitlePrompt(env: Env, locale: string): Promise<string | null> {
    const db = getDbClient(env);

    const pick = async (loc: string) => {
        const [row] = await db
            .select({ template: aiTitlePrompts.template })
            .from(aiTitlePrompts)
            .where(and(eq(aiTitlePrompts.isActive, true), eq(aiTitlePrompts.locale, loc)))
            .limit(1);
        const t = row?.template?.trim();
        return t ? t : null;
    };

    return (await pick(locale)) ?? (locale !== "en" ? await pick("en") : null);
}
