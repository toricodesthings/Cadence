import type { AiUsage, AiUsageWindow } from "@cadence/contracts/ai";
import { formatShortDateLabel, formatTime, dayOfInstant } from "../utils/date-format";

const LOW_REQUEST_FRACTION = 0.2;
const LOW_REQUEST_FLOOR = 3;
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
        (remainingRequests <= LOW_REQUEST_FLOOR || remainingRequests / window.requests.limit <= LOW_REQUEST_FRACTION);
    const lowTokens = window.tokens.limit > 0 && remainingTokens / window.tokens.limit <= LOW_TOKEN_FRACTION;
    return {
        remainingRequests,
        lowRequests,
        lowTokens,
        low: lowRequests || lowTokens,
        resetEpoch: window.resetEpoch,
    };
}

export function formatReset(resetEpoch: number | null, nowMs: number): string | null {
    if (resetEpoch === null) return null;
    const deltaS = Math.max(0, resetEpoch - Math.floor(nowMs / 1000));
    if (deltaS < 90) return "in a minute";
    if (deltaS < 3600) return `in ${Math.round(deltaS / 60)}m`;
    if (deltaS < 48 * 3600) return `in ${Math.round(deltaS / 3600)}h`;
    return `in ${Math.round(deltaS / 86400)}d`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

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
    fraction: number;
    headline: string;
    caption: string;
    reset: string | null;
    full: boolean;
}

function windowMeter(id: "5h" | "7d", label: string, window: AiUsageWindow, nowMs: number): UsageMeter {
    const share = ({ used, limit }: { used: number; limit: number }) => (limit > 0 ? Math.min(1, used / limit) : 0);
    const requests = share(window.requests);
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

export function describeUsageMeters(usage: AiUsage | undefined, nowMs: number): UsageMeter[] | null {
    if (!usage?.enabled) return null;
    const { images } = usage;
    return [
        windowMeter("5h", "5-hour limit", usage.windows["5h"], nowMs),
        windowMeter("7d", "Weekly limit", usage.windows["7d"], nowMs),
        {
            id: "images",
            label: "Photos and PDFs today",
            fraction: images.limit > 0 ? Math.min(1, images.used / images.limit) : 0,
            headline: `${images.used} of ${images.limit}`,
            caption: `Up to ${images.perMessage} per message`,
            reset: images.used > 0 && images.resetEpoch !== null ? formatResetDetail(images.resetEpoch, nowMs) : null,
            full: images.used >= images.limit,
        },
    ];
}

const LOW_IMAGES = 5;

export interface ImageAllowance {
    left: number;
    blocked: boolean;
    label: string;
}

export function describeImageAllowance(usage: AiUsage | undefined, nowMs: number): ImageAllowance {
    const images = usage?.enabled ? usage.images : undefined;
    if (!images) return { left: Infinity, blocked: false, label: "Attach a photo or PDF" };
    const left = Math.max(0, images.limit - images.used);
    const reset = formatReset(images.resetEpoch, nowMs);
    const suffix = reset ? ` · resets ${reset}` : "";
    if (left === 0) return { left, blocked: true, label: `File limit reached${suffix}` };
    if (left <= LOW_IMAGES)
        return { left, blocked: false, label: `${left} file${left === 1 ? "" : "s"} left${suffix}` };
    return { left, blocked: false, label: "Attach a photo or PDF" };
}

export function describeUsage(usage: AiUsage | undefined, nowMs: number): string | null {
    if (!usage?.enabled) return null;

    const windows = [assessWindow(usage.windows["5h"]), assessWindow(usage.windows["7d"])];
    const low = windows.filter((w) => w.low);
    if (low.length === 0) return null;

    const tightest = low.reduce((a, b) => (a.remainingRequests <= b.remainingRequests ? a : b));
    const reset = formatReset(tightest.resetEpoch, nowMs);
    const left = !tightest.lowRequests
        ? "Running low on AI capacity"
        : tightest.remainingRequests === 0
          ? "No messages left"
          : `≈ ${tightest.remainingRequests} message${tightest.remainingRequests === 1 ? "" : "s"} left`;
    return reset ? `${left} · resets ${reset}` : left;
}

export type AssistantLink = "checking" | "active" | "offline" | "error";

export function describeAssistantLink(
    online: boolean,
    usage: { isSuccess: boolean; isError: boolean; error: unknown },
): AssistantLink {
    if (!online) return "offline";
    if (usage.isError) return usage.error instanceof TypeError ? "offline" : "error";
    return usage.isSuccess ? "active" : "checking";
}
