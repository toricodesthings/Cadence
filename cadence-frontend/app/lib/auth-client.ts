import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const authClient = createAuthClient(
    import.meta.env.VITE_NEON_AUTH_URL || "https://ep-green-forest-aeushytt.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth",
    {
        adapter: BetterAuthReactAdapter(),
    }
);
