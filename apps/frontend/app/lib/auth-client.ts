import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { NEON_AUTH_URL } from "./env";

const authClientOptions = {
    adapter: BetterAuthReactAdapter(),
};

export const authClient = createAuthClient(NEON_AUTH_URL, authClientOptions);

export const redirectlessAuthClient = createAuthClient(
    NEON_AUTH_URL,
    {
        ...authClientOptions,
        disableDefaultFetchPlugins: true,
    } as Parameters<typeof createAuthClient>[1],
);
