/**
 * Frontend settings view types.
 *
 * The canonical schema + defaults live in @cadence/contracts/settings. The
 * backend normalizes on read, so the frontend always receives the full shape —
 * which is why `UserSettings` here is the fully-required view, derived from the
 * sparse storage schema (not `typeof SETTINGS_DEFAULTS`, whose `as const`
 * literals break `=== true/false` comparisons).
 */
import type { UserSettings as StoredUserSettings } from "@cadence/contracts/settings";

export { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
export type { DeepPartial, PersonalEvent } from "@cadence/contracts/settings";

/** Every field required, recursively — the inverse of `DeepPartial`. */
type DeepRequired<T> = T extends Array<infer U>
    ? Array<DeepRequired<U>>
    : T extends object
        ? { [K in keyof T]-?: DeepRequired<T[K]> }
        : T;

export type UserSettings = DeepRequired<Omit<StoredUserSettings, "preferredView">> & {
    /** @deprecated — migrated to tasks.defaultView by the backend */
    preferredView?: StoredUserSettings["preferredView"];
};
