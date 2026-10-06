/**
 * Pure presentation logic for the AI usage budget (GET /ai/usage).
 *
 * The backend enforces rolling 5h/7d request+token windows and only tells the
 * client about them at rejection time (429) unless we surface them earlier.
 * `describeUsage` turns the usage payload into either `null` (plenty left —
 * show nothing, no meter anxiety) or one calm line for the composer footer,
 * e.g. "≈ 3 messages left · resets in 2h".
 */
import type { AiUsage, AiUsageWindow } from "@cadence/contracts/ai";
import { formatShortDateLabel, formatTime, dayOfInstant } from "../utils/date-format";

/** Show the hint when ≤ this fraction of a window's requests remain… */
const LOW_REQUEST_FRACTION = 0.2;
/** …or when the absolute remaining-request count dips to this floor. */
const LOW_REQUEST_FLOOR = 3;
/** Token budget is a secondary signal; warn only when nearly drained. */
const LOW_TOKEN_FRACTION = 0.1;

interface WindowStatus {
    remainingRequests: number;
    lowRequests: boolean;
    lowTokens: boolean;
    low: boolean;
    resetEpoch: number | null;
}

function assessWindow(window: AiUsageWindow): WindowStatus {
    const remainingRequests = Math.max(0, window.requests.limit - window.requests.used);
    const remainingTokens = Math.max(0, window.tokens.limit - window.tokens.used);
    const lowRequests =
        window.requests.limit > 0 &&
        (remainingRequests <= LOW_REQUEST_FLOOR ||
            remainingRequests / window.requests.limit <= LOW_REQUEST_FRACTION);
    const lowTokens =
        window.tokens.limit > 0 && remainingTokens / window.tokens.limit <= LOW_TOKEN_FRACTION;
    return {
        remainingRequests,
        lowRequests,
        lowTokens,
        low: lowRequests || lowTokens,
        resetEpoch: window.resetEpoch,
    };
}

/** "in 3m" / "in 2h" / "in 3d" — coarse on purpose; this is a hint, not a timer. */
export function formatReset(resetEpoch: number | null, nowMs: number): string | null {
    if (resetEpoch === null) return null;
    const deltaS = Math.max(0, resetEpoch - Math.floor(nowMs / 1000));
    if (deltaS < 90) return "in a minute";
    if (deltaS < 3600) return `in ${Math.round(deltaS / 60)}m`;
    if (deltaS < 48 * 3600) return `in ${Math.round(deltaS / 3600)}h`;
    return `in ${Math.round(deltaS / 86400)}d`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * "Resets in 2 days 5 hours (on Sat, Sep 28, 3:00 PM)" — the exact countdown and
 * moment for the usage view (the footer hint keeps the coarse `formatReset`).
 */
export function formatResetDetail(resetEpoch: number, nowMs: number): string {
    const totalMin = Math.max(0, Math.floor((resetEpoch * 1000 - nowMs) / 60_000));
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    const countdown =
        totalMin < 1
            ? "under a minute"
            : days > 0
              ? [plural(days, "day"), hours > 0 && plural(hours, "hour")].filter(Boolean).join(" ")
              : hours > 0
                ? [plural(hours, "hour"), minutes > 0 && plural(minutes, "minute")].filter(Boolean).join(" ")
                : plural(minutes, "minute");
    const at = new Date(resetEpoch * 1000).toISOString();
    return `Resets in ${countdown} (on ${formatShortDateLabel(dayOfInstant(at))}, ${formatTime(at)})`;
}

export interface UsageMeter {
    id: "5h" | "7d" | "images";
    label: string;
    /** 0–1, how full the bar is. */
    fraction: number;
    headline: string;
    /** What's left, in plain words. */
    caption: string;
    /** Countdown + date of the reset, or null when nothing has started the window. */
    reset: string | null;
    full: boolean;
}

function windowMeter(id: "5h" | "7d", label: string, window: AiUsageWindow, nowMs: number): UsageMeter {
    const share = ({ used, limit }: { used: number; limit: number }) => (limit > 0 ? Math.min(1, used / limit) : 0);
    const requests = share(window.requests);
    // The tighter dimension decides when the server refuses, so it fills the bar.
    const fraction = Math.max(requests, share(window.tokens));
    const full = fraction >= 1;
    const left = Math.max(0, window.requests.limit - window.requests.used);
    const caption =
        window.resetEpoch === null
            ? "Starts with your next message"
            : full
              ? "Nothing left until it resets"
              : requests >= fraction
                ? `About ${plural(left, "message")} left`
                : "Long replies use it up faster";
    return {
        id,
        label,
        fraction,
        headline: full ? "Limit reached" : `${Math.round(fraction * 100)}% used`,
        caption,
        reset: window.resetEpoch === null ? null : formatResetDetail(window.resetEpoch, nowMs),
        full,
    };
}

/** The usage view's three meters, or null when the budget isn't available. */
export function describeUsageMeters(usage: AiUsage | undefined, nowMs: number): UsageMeter[] | null {
    if (!usage?.enabled) return null;
    const { images } = usage;
    return [
        windowMeter("5h", "5-hour limit", usage.windows["5h"], nowMs),
        windowMeter("7d", "Weekly limit", usage.windows["7d"], nowMs),
        {
            id: "images",
            label: "Photos today",
            fraction: images.limit > 0 ? Math.min(1, images.used / images.limit) : 0,
            headline: `${images.used} of ${images.limit}`,
            caption: `Up to ${images.perMessage} per message`,
            reset: images.used > 0 && images.resetEpoch !== null ? formatResetDetail(images.resetEpoch, nowMs) : null,
            full: images.used >= images.limit,
        },
    ];
}

/** Show the remaining image count once this few are left. */
const LOW_IMAGES = 5;

export interface ImageAllowance {
    /** Images that can still be sent in this 24h window. */
    left: number;
    /** At the cap: attaching is off until the window resets. */
    blocked: boolean;
    /** The attach button's tooltip. */
    label: string;
}

/**
 * The attach button's state. Quiet while there's plenty; the count and reset
 * appear only near the cap, and at the cap attaching is blocked (never older
 * images deleted to make room).
 */
export function describeImageAllowance(usage: AiUsage | undefined, nowMs: number): ImageAllowance {
    const images = usage?.enabled ? usage.images : undefined;
    if (!images) return { left: Infinity, blocked: false, label: "Attach an image" };
    const left = Math.max(0, images.limit - images.used);
    const reset = formatReset(images.resetEpoch, nowMs);
    const suffix = reset ? ` · resets ${reset}` : "";
    if (left === 0) return { left, blocked: true, label: `Image limit reached${suffix}` };
    if (left <= LOW_IMAGES) return { left, blocked: false, label: `${left} image${left === 1 ? "" : "s"} left${suffix}` };
    return { left, blocked: false, label: "Attach an image" };
}

/**
 * One calm footer line when the budget is running low, else null. The tighter
 * of the two windows wins (fewest remaining requests among the low ones).
 */
export function describeUsage(usage: AiUsage | undefined, nowMs: number): string | null {
    if (!usage?.enabled) return null;

    const windows = [assessWindow(usage.windows["5h"]), assessWindow(usage.windows["7d"])];
    const low = windows.filter((w) => w.low);
    if (low.length === 0) return null;

    const tightest = low.reduce((a, b) => (a.remainingRequests <= b.remainingRequests ? a : b));
    const reset = formatReset(tightest.resetEpoch, nowMs);
    // When only the TOKEN budget is draining, a request count would mislead —
    // use a generic capacity line instead.
    const left = !tightest.lowRequests
        ? "Running low on AI capacity"
        : tightest.remainingRequests === 0
          ? "No messages left"
          : `≈ ${tightest.remainingRequests} message${tightest.remainingRequests === 1 ? "" : "s"} left`;
    return reset ? `${left} · resets ${reset}` : left;
}
