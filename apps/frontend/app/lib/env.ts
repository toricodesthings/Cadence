const DEV_API_BASE_URL = "http://localhost:8787";
const DEV_NEON_AUTH_URL = "https://ep-green-forest-aeushytt.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth";

function requirePublicEnv(name: "VITE_API_BASE_URL" | "VITE_NEON_AUTH_URL", devFallback: string) {
    const configured = (import.meta.env as Record<string, string | undefined>)[name];

    if (configured) {
        return configured;
    }

    if (import.meta.env.DEV) {
        return devFallback;
    }

    throw new Error(
        `Missing ${name}. Set it in the frontend build environment before creating a production bundle.`,
    );
}

export const API_BASE_URL = requirePublicEnv("VITE_API_BASE_URL", DEV_API_BASE_URL);
export const NEON_AUTH_URL = requirePublicEnv("VITE_NEON_AUTH_URL", DEV_NEON_AUTH_URL);