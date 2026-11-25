import { and, eq, isNotNull, sql } from "drizzle-orm";
import { FOCUS_VIEW_PRESETS } from "@cadence/nlp/focus-views";
import { FOCUS_PRESET_COLORS, FOCUS_VIEW_ICONS, type FocusViewIcon } from "@cadence/contracts/settings";
import { savedFocusViews } from "../../db/schema";
import type { Tx } from "../../types/db";

const asIcon = (name: string) =>
    (FOCUS_VIEW_ICONS as readonly string[]).includes(name) ? (name as FocusViewIcon) : null;

/**
 * Every account starts with the built-in presets as its own rows, so they rename, recolour, pin and delete like
 * any view. Only keys never written are added: a deleted one stays hidden, and a preset added later still arrives.
 */
export async function ensureFocusPresets(tx: Tx, userId: string) {
    const have = await tx
        .select({ key: savedFocusViews.presetKey })
        .from(savedFocusViews)
        .where(and(eq(savedFocusViews.userId, userId), isNotNull(savedFocusViews.presetKey)));
    const known = new Set(have.map((row) => row.key));
    const missing = FOCUS_VIEW_PRESETS.map((preset, index) => ({ preset, index })).filter(
        ({ preset }) => !known.has(preset.id),
    );
    if (missing.length === 0) return;
    await tx
        .insert(savedFocusViews)
        .values(
            missing.map(({ preset, index }) => ({
                userId,
                presetKey: preset.id,
                name: preset.name,
                definition: { ...preset.definition },
                icon: asIcon(preset.icon),
                color: FOCUS_PRESET_COLORS[preset.id] ?? null,
                source: "preset" as const,
                orderIndex: index,
            })),
        )
        .onConflictDoNothing();
}

/** A built-in preset is hidden, so it never comes back on the next read; any other view is deleted. */
export async function hideOrDeleteFocusView(tx: Tx, userId: string, id: string) {
    const hidden = await tx
        .update(savedFocusViews)
        .set({ isHidden: true, isPinned: false, updatedAt: sql`NOW()` })
        .where(
            and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId), isNotNull(savedFocusViews.presetKey)),
        )
        .returning();
    if (hidden.length > 0) return hidden;
    return tx
        .delete(savedFocusViews)
        .where(and(eq(savedFocusViews.id, id), eq(savedFocusViews.userId, userId)))
        .returning();
}
