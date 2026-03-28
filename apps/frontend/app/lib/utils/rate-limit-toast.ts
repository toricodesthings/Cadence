import { toast } from "sonner";

const RATE_LIMIT_TOAST_COOLDOWN_MS = 4_000;

let lastShownAt = 0;
let lastMessage = "";

export function showRateLimitToast(
    message = "You're doing that too fast — please wait a moment and try again.",
) {
    const now = Date.now();

    if (message === lastMessage && now - lastShownAt < RATE_LIMIT_TOAST_COOLDOWN_MS) {
        return;
    }

    lastShownAt = now;
    lastMessage = message;
    toast.error(message);
}

export function resetRateLimitToastState() {
    lastShownAt = 0;
    lastMessage = "";
}
