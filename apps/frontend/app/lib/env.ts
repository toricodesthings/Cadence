const DEV_API_BASE_URL = "http://localhost:8787";
const DEV_NEON_AUTH_URL = "https://ep-green-forest-aeushytt.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth";
const DEV_WEB_APP_BASE_URL = "http://localhost:8788";
const PROD_WEB_APP_BASE_URL = "https://dashboard.cadenceapp.cloud";
const DEFAULT_RUNTIME_TARGET = "web";
const DEFAULT_PUBLIC_APP_VERSION = "v0.5 Beta";

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
export const PUBLIC_APP_VERSION =
    (import.meta.env.VITE_PUBLIC_APP_VERSION as string | undefined)
    ?? DEFAULT_PUBLIC_APP_VERSION;
export const WEB_APP_BASE_URL =
    (import.meta.env.VITE_WEB_APP_BASE_URL as string | undefined)
    ?? (import.meta.env.DEV ? DEV_WEB_APP_BASE_URL : PROD_WEB_APP_BASE_URL);
export const RUNTIME_TARGET =
    (import.meta.env.VITE_RUNTIME_TARGET as string | undefined) === "desktop"
        ? "desktop"
        : DEFAULT_RUNTIME_TARGET;

// Dev-time health check: warn loudly if the API root is unreachable
if (import.meta.env.DEV && typeof window !== "undefined") {
    fetch(`${API_BASE_URL}/api/v1/health`, { method: "GET" }).then((res) => {
        // Health is protected in development; 401 means the API is reachable.
        if (res.status === 401) {
            return;
        }
        if (!res.ok) {
            console.error(
                `[cadence:dev] API health check returned ${res.status}. ` +
                `Backend may not be running or VITE_API_BASE_URL (${API_BASE_URL}) is misconfigured.`,
            );
        }
    }).catch(() => {
        console.error(
            `[cadence:dev] Cannot reach API at ${API_BASE_URL}. ` +
            `Start the backend or fix VITE_API_BASE_URL in .env.`,
        );
    });
}
