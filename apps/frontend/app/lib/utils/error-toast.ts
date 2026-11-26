import { toast } from "sonner";
import { ApiErrorResponse, isNetworkFailure } from "../../types/api";
import { errorRef, log } from "../log";

function isNetworkError(error: unknown) {
    return navigator.onLine === false || isNetworkFailure(error);
}

export function reason(error: unknown): string {
    if (isNetworkError(error)) return "This needs a connection. Try again once you're back online.";
    if (!(error instanceof ApiErrorResponse) || error.status >= 500 || error.code === "UNPARSEABLE_ERROR") {
        return "Something went wrong on our end. Try again.";
    }
    if (error.status === 409) return "It was changed somewhere else. Showing the latest version.";
    if (error.status === 404) return "It may have been deleted.";
    if (error.code === "VIEW_ONLY") return "This list is view-only for you. Its owner can let you edit.";
    if (error.status === 403) return "You don't have access to that.";
    if (error.status === 401) return "Your session ended. Sign in again.";
    return "Check the details and try again.";
}

export function toastError(error: unknown, title: string) {
    if (error instanceof ApiErrorResponse && error.isRateLimited) {
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
            onClick: () =>
                void navigator.clipboard
                    ?.writeText(ref)
                    .then(() => toast.success("Details copied"))
                    .catch(() => undefined),
        },
    });
}
