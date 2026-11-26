import { eq } from "drizzle-orm";
import {
    deepMerge,
    SETTINGS_DEFAULTS,
    type DeepPartial,
    type LocationMode,
    type SettingsView,
    type UserSettings,
} from "@cadence/contracts/settings";
import { isZone } from "@cadence/domain/time";
import { users } from "../../db/schema";
import type { Tx } from "../../types/db";
import { sanitizeBackgroundPatch } from "./background-image";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
function isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lift the location fields that used to live under `calendar.holidays`
 * (`usePreciseLocation`, `locationMode`, `countryCode`, `subdivisionCode`,
 * `promptDismissedAt`) into `location`. Runs on stored settings before they are
 * merged over defaults. The legacy keys are left in place so older clients keep
 * reading them; the parsers ignore them.
 */
export function migrateLegacySettings<T>(stored: T): T {
    if (!isPlainObject(stored) || stored.location !== undefined) return stored;
    const holidays = isPlainObject(stored.calendar) ? stored.calendar.holidays : undefined;
    if (!isPlainObject(holidays)) return stored;

    const mode: LocationMode =
        holidays.locationMode === "manual"
            ? "manual"
            : holidays.usePreciseLocation === true
              ? "precise"
              : "approximate";

    return {
        ...stored,
        location: {
            mode,
            countryCode: typeof holidays.countryCode === "string" ? holidays.countryCode : null,
            subdivisionCode: typeof holidays.subdivisionCode === "string" ? holidays.subdivisionCode : null,
            city: null,
            promptDismissedAt: typeof holidays.promptDismissedAt === "string" ? holidays.promptDismissedAt : null,
        },
    };
}

/**
 * Normalize stored settings against canonical defaults.
 * - Merges in missing sections/keys from defaults
 * - Migrates legacy `preferredView` into `tasks.defaultView`
 * - Migrates legacy `calendar.holidays` location fields into `location`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export function normalizeSettings(stored: Record<string, any>): SettingsView {
    const merged = deepMerge<SettingsView>(SETTINGS_DEFAULTS, migrateLegacySettings(stored));

    // Migrate legacy preferredView → tasks.defaultView
    if (stored.preferredView && !stored.tasks?.defaultView) {
        merged.tasks = { ...merged.tasks, defaultView: stored.preferredView };
    }

    return merged;
}

/**
 * Merge a settings patch into the user's stored settings: row lock, normalize, background sanitizing,
 * and the zone pin. The route and the assistant's `update_settings` both write through this.
 * Returns the settings before and after (both normalized).
 */
export async function patchSettings(
    tx: Tx,
    userId: string,
    patch: DeepPartial<UserSettings>,
): Promise<{ before: SettingsView; after: SettingsView }> {
    const [user] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for("update"); // concurrent patches (and assistant event writes) must not drop each other's change

    // Normalize stored settings first, then merge in patch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const before = normalizeSettings((user?.settings || {}) as Record<string, any>);
    const merged = deepMerge<SettingsView>(before, sanitizeBackgroundPatch(before, patch));
    if (JSON.stringify(merged) === JSON.stringify(before)) return { before, after: before }; // nothing changes: nothing is written

    const [updated] = await tx
        .update(users)
        .set({
            settings: merged,
            // Pinning a zone makes it the user's zone at once, while "device" waits for the client's next sync.
            ...(isZone(merged.dateTime?.timezone) && { timeZone: merged.dateTime.timezone }),
        })
        .where(eq(users.id, userId))
        .returning({ settings: users.settings });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return { before, after: normalizeSettings((updated?.settings ?? {}) as Record<string, any>) };
}
