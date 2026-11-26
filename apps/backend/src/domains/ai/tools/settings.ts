import { tool } from "ai";
import { z } from "zod";
import { ASSISTANT_SETTING_PATHS, assistantSettingsPatchSchema } from "@cadence/contracts/settings";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import { normalizeSettings, patchSettings } from "../../settings/settings.service";
import { users } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { safeExecute, once } from "./index";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const getPath = (source: unknown, path: string) =>
    path.split(".").reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), source);

function setPath(target: Json, path: string, value: unknown) {
    const keys = path.split(".");
    const last = keys.pop()!;
    const parent = keys.reduce<Json>((node, key) => (node[key] = isObject(node[key]) ? node[key] : {}) as Json, target);
    parent[last] = value;
}

/** The leaves of a patch as dotted paths. Arrays and null are leaves. */
function leafPaths(patch: unknown, prefix = ""): string[] {
    if (!isObject(patch)) return [prefix];
    return Object.entries(patch).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
}

/**
 * What a patch actually changed: each leaf whose value differs, with its old and new value, and the
 * `from` values as a patch that puts them back (what the card's Undo sends).
 */
export function diffSettings(before: unknown, after: unknown, patch: unknown) {
    const changed: { key: string; from: unknown; to: unknown }[] = [];
    const undo: Json = {};
    for (const key of leafPaths(patch)) {
        const from = getPath(before, key) ?? null;
        const to = getPath(after, key) ?? null;
        if (JSON.stringify(from) === JSON.stringify(to)) continue;
        changed.push({ key, from, to });
        setPath(undo, key, from);
    }
    return { changed, undo };
}

const CHANGEABLE =
    "Task defaults and smart features (tasks.*), every reminder setting (notifications.*, but not email or browser), and the assistant's own name, voice, emoji and suggestions (assistant.*). Everything else (privacy, sign-in, memory, custom instructions, appearance, time zone, location, connected assistants) lives in Settings.";

export const settingsTools = (env: Env, userId: string) => ({
    get_settings: tool({
        description: `The settings the assistant can change, with their current values: ${CHANGEABLE}`,
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_settings", userId, async () => {
                const [row] = await withRls(getDbClient(env), userId, (tx) =>
                    tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1),
                );
                const settings = normalizeSettings((row?.settings ?? {}) as Json);
                const out: Json = {};
                for (const path of ASSISTANT_SETTING_PATHS) setPath(out, path, getPath(settings, path) ?? null);
                return { settings: out };
            }),
    }),

    update_settings: tool({
        description: `Changes settings the user asked for. Send only what changes. ${CHANGEABLE} Returns changed (key, from, to) and undo, the patch that restores the old values; changed is empty when nothing differed.`,
        inputSchema: z.object({ patch: assistantSettingsPatchSchema }),
        execute: async ({ patch }, { toolCallId }) =>
            safeExecute("update_settings", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const { before, after } = await patchSettings(tx, userId, patch);
                        return { result: diffSettings(before, after, patch), id: userId };
                    }),
                ),
            ),
    }),
});
