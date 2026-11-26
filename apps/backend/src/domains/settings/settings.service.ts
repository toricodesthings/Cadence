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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export function normalizeSettings(stored: Record<string, any>): SettingsView {
    const merged = deepMerge<SettingsView>(SETTINGS_DEFAULTS, migrateLegacySettings(stored));

    if (stored.preferredView && !stored.tasks?.defaultView) {
        merged.tasks = { ...merged.tasks, defaultView: stored.preferredView };
    }

    return merged;
}

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
        .for("update");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const before = normalizeSettings((user?.settings || {}) as Record<string, any>);
    const merged = deepMerge<SettingsView>(before, sanitizeBackgroundPatch(before, patch));
    if (JSON.stringify(merged) === JSON.stringify(before)) return { before, after: before };

    const [updated] = await tx
        .update(users)
        .set({
            settings: merged,
            ...(isZone(merged.dateTime?.timezone) && { timeZone: merged.dateTime.timezone }),
        })
        .where(eq(users.id, userId))
        .returning({ settings: users.settings });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return { before, after: normalizeSettings((updated?.settings ?? {}) as Record<string, any>) };
}
