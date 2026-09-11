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
