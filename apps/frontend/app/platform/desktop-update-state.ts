import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createExternalStore } from "../lib/utils/external-store";
import { CADENCE_VERSION } from "../lib/constants/app-info";
import { API_BASE_URL } from "../lib/env";
import type { AvailableAppUpdate } from "./runtime";

const UPDATING_KEY = "cadence:updating-to";
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
    prerelease: boolean;
}

function parseSemver(raw: string): ParsedSemver | null {
    const match = SEMVER_RE.exec(raw.trim());
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: Boolean(match[4]),
    };
}

/** True when `current` is strictly older than `minimum`. Invalid versions fail open (`false`). */
export function isVersionBelow(current: string, minimum: string): boolean {
    const cur = parseSemver(current);
    const min = parseSemver(minimum);
    if (!cur || !min) return false;
    if (cur.major !== min.major) return cur.major < min.major;
    if (cur.minor !== min.minor) return cur.minor < min.minor;
    if (cur.patch !== min.patch) return cur.patch < min.patch;
    return cur.prerelease && !min.prerelease;
}

/** Reads the backend's minimum desktop version from the public `/health` route; returns null offline or on error. */
export async function fetchMinDesktopVersion(): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/health`, { cache: "no-store" });
        if (!response.ok) return null;
        const body = (await response.json()) as { data?: { minDesktopVersion?: unknown } };
        const value = body.data?.minDesktopVersion;
        return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
}

/** Remembers the version being installed so the relaunched app can confirm it landed. */
export function markUpdating(version: string | null) {
    try {
        if (version) localStorage.setItem(UPDATING_KEY, version);
        else localStorage.removeItem(UPDATING_KEY);
    } catch {
        /* storage blocked: the confirmation is a nicety */
    }
}

/** After an update restart, says once that it worked. */
export function confirmDesktopUpdate(openChangelog: () => void) {
    let target: string | null = null;
    try {
        target = localStorage.getItem(UPDATING_KEY);
        localStorage.removeItem(UPDATING_KEY);
    } catch {
        return;
    }
    if (target !== CADENCE_VERSION) return;
    toast.success(`Cadence updated to ${CADENCE_VERSION}.`, {
        action: { label: "What’s new", onClick: openChangelog },
    });
}

const updateStore = createExternalStore<AvailableAppUpdate | null>(null);
const lastCheckedStore = createExternalStore<Date | null>(null);
const requiredVersionStore = createExternalStore<string | null>(null);
const checkingStore = createExternalStore<boolean>(false);

/** Records the result of a completed update check (`null` = up to date) and stamps when it finished. */
export function publishAvailableDesktopUpdate(update: AvailableAppUpdate | null) {
    updateStore.set(update);
    lastCheckedStore.set(new Date());
}

/** Sets the minimum required desktop version when the running build is below it, or null when satisfied. */
export function publishRequiredDesktopVersion(version: string | null) {
    requiredVersionStore.set(version);
}

/** Tracks whether an update check is currently in flight (used by the required-update screen). */
export function setCheckingDesktopUpdate(checking: boolean) {
    checkingStore.set(checking);
}

/** The one nudge for a found update; the details live in Settings > About. */
export function announceDesktopUpdate(update: AvailableAppUpdate) {
    toast.info(`Cadence ${update.version} is ready to install.`, {
        description: "Open Settings > About Cadence to review release notes and apply the update.",
    });
}

export function useAvailableDesktopUpdate() {
    return useSyncExternalStore(updateStore.subscribe, updateStore.get, () => null);
}

export function useLastUpdateCheck() {
    return useSyncExternalStore(lastCheckedStore.subscribe, lastCheckedStore.get, () => null);
}

export function useRequiredDesktopVersion() {
    return useSyncExternalStore(requiredVersionStore.subscribe, requiredVersionStore.get, () => null);
}

export function useCheckingDesktopUpdate() {
    return useSyncExternalStore(checkingStore.subscribe, checkingStore.get, () => false);
}
