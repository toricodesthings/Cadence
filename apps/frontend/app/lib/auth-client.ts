import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { NEON_AUTH_URL } from "./env";

export const authClient = createAuthClient(
    NEON_AUTH_URL,
    {
        adapter: BetterAuthReactAdapter(),
    }
);
