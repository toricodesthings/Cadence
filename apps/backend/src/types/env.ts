export type DeploymentStage = "production" | "staging" | "development";

export interface Env {
    HYPERDRIVE: Hyperdrive;

    NEON_AUTH_JWKS_URL: string;
    JWT_ISSUER?: string;

    DEPLOYMENT_STAGE?: string;
    MIN_DESKTOP_VERSION?: string;
    ALLOWED_ORIGINS?: string;

    ENABLE_DEBUG_ROUTES?: string;
    ADMIN_USER_IDS?: string;
    ADMIN_EMAILS?: string;

    USER_ASSETS?: R2Bucket;

    NEON_API_KEY?: string;
    NEON_PROJECT_ID?: string;
    NEON_BRANCH_ID?: string;

    EMAIL?: SendEmail;

    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    REMINDER_CLOCK?: DurableObjectNamespace<import("../domains/push/reminder-clock").ReminderClock>;

    LIST_PRESENCE?: DurableObjectNamespace<import("../domains/sharing/list-presence").ListPresence>;
    NOTE_COLLAB?: DurableObjectNamespace<import("../domains/notes/note-collab").NoteCollab>;

    LOADER?: WorkerLoader;
    CODE_MODE?: DurableObjectNamespace<import("../domains/mcp/code-mode").CodeModeHost>;

    MEMORY_QUEUE?: Queue<import("../domains/ai/memory/queue").MemoryMessage>;

    OAUTH_KV?: KVNamespace;
    MCP_ORIGIN?: string;
    APP_ORIGIN?: string;

    RATE_LIMITER: RateLimit;
    RATE_LIMITER_READ: RateLimit;
    RATE_LIMITER_WRITE: RateLimit;
    RATE_LIMITER_ADMIN: RateLimit;
    RATE_LIMITER_AI?: RateLimit;
    RATE_LIMITER_CODE?: RateLimit;

    OPENROUTER_API_KEY?: string;
    AI_CHAT_MODEL?: string;
    AI_CHAT_MODEL_BASIC?: string;
    TOOL_APPROVAL_SECRET?: string;
    AI_TITLE_MODEL?: string;
    AI_DECISION_MODEL?: string;
    AI_EMBEDDING_MODEL?: string;

    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;

    AI_RL_REQUESTS_5H?: string;
    AI_RL_TOKENS_5H?: string;
    AI_RL_REQUESTS_7D?: string;
    AI_RL_TOKENS_7D?: string;
    AI_RL_MAX_CONCURRENT?: string;
    AI_RL_RESERVE_TOKENS?: string;
    AI_RL_IMAGES_24H?: string;
    AI_IMAGES_PER_MESSAGE?: string;
    AI_IMAGES_MAX_PENDING?: string;
    AI_RATE_LIMIT_FAIL_MODE?: string;
    AI_DAILY_SPEND_CAP_USD?: string;
}

export function getDeploymentStage(env: Env): DeploymentStage {
    const raw = env.DEPLOYMENT_STAGE?.trim().toLowerCase();
    if (raw === "development" || raw === "staging") return raw;
    return "production";
}

export function getAllowedOrigins(env: Env): string[] {
    if (!env.ALLOWED_ORIGINS) return [];
    return env.ALLOWED_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean);
}

export const appOrigin = (env: Env) => (env.APP_ORIGIN ?? "https://dashboard.cadenceapp.cloud").replace(/\/$/, "");
