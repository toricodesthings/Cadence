import { toast } from "sonner";
import { ApiErrorResponse } from "../../types/api";
import { errorRef, log } from "../log";

function isNetworkError(error: unknown) {
    // Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError …".
    return navigator.onLine === false
        || (error instanceof TypeError && /fetch|load failed|network/i.test(error.message));
}

/** Why it failed, in plain words from the kind of failure, never the raw server or browser text. */
function reason(error: unknown): string {
    if (isNetworkError(error)) return "Check your connection and try again.";
    if (!(error instanceof ApiErrorResponse) || error.status >= 500 || error.code === "UNPARSEABLE_ERROR") {
        return "Something went wrong on our end. Try again.";
    }
    if (error.status === 409) return "It was changed somewhere else. Showing the latest version.";
    if (error.status === 404) return "It may have been deleted.";
    if (error.status === 403) return "You don't have access to that.";
    if (error.status === 401) return "Your session ended. Sign in again.";
    return "Check the details and try again.";
}

/**
 * The toast for a failed action: `title` says what didn't happen ("Couldn't create task"),
 * the description says why in plain words, and Copy details hands the user an `errorRef`
 * to send to support.
 */
export function toastError(error: unknown, title: string) {
    if (error instanceof ApiErrorResponse && error.isRateLimited) {
        // One toast per burst: repeats replace it instead of stacking.
        toast.error("You're doing that too fast. Wait a moment and try again.", { id: "rate-limit" });
        return;
    }
    const ref = errorRef(error);
    if (isNetworkError(error)) log.warn("action", title, error);
    else log.error("action", title, error);
    toast.error(title, {
        description: reason(error),
        action: {
            label: "Copy details",
            onClick: () => void navigator.clipboard?.writeText(ref).then(() => toast.success("Details copied")).catch(() => undefined),
        },
    });
}
