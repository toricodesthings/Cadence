import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { NEON_AUTH_URL } from "./env";
import { REQUEST_TIMEOUT_MS } from "./api/request-deadline";

const createAuthClient = (url: string) =>
    BetterAuthReactAdapter({ fetchOptions: { timeout: REQUEST_TIMEOUT_MS } })(url, undefined).getBetterAuthInstance();

export const authClient = createAuthClient(NEON_AUTH_URL);

export const redirectlessAuthClient = createAuthClient(NEON_AUTH_URL);

export function authError(call: Promise<{ error: unknown }>): Promise<{ message?: string } | null> {
    return call.then(
        (res) => res.error as { message?: string } | null,
        (err: unknown) => err as { message?: string },
    );
}
